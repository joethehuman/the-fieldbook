import { createBrowserClient } from "@supabase/ssr";
import { request, createWorkspaceSaver, RequestError } from "./workspace-save";
import type { UploadMedia } from "@/components/MarkdownEditor";
import type { BulkRequest, BulkResult } from "./bulk-actions";
import type { LearningAction } from "./learning";
import type { Workspace } from "./store";
import type { Content, User } from "./types";
import type { SaveIntent } from "./draft-save-queue";
import { mergeSavedContent } from "./content-save";
import { SaveRecoveryError } from "./save-recovery";
import { equalJson } from "./equal-json";
export type AdminRuntime = {
  snapshot: () => Workspace;
  adoptSnapshot: (data: Workspace) => Workspace;
  save: (before: Workspace, after: Workspace) => Promise<Workspace>;
  saveContent: (content: Content, intent: SaveIntent) => Promise<Content>;
  refresh: () => Promise<Workspace>;
  manageLearning: (action: LearningAction) => Promise<Workspace>;
  upload: UploadMedia;
  admin: {
    bulk: (
      action: BulkRequest,
    ) => Promise<{ data: Workspace; results: BulkResult[] }>;
    prepare: (
      scope: "content" | "governance" | "feedback" | "deleted",
    ) => Promise<Workspace>;
    edit: (id: string) => Promise<{ data: Workspace; item: Content }>;
    unpublish: (id: string) => Promise<Workspace>;
  };
};
export function mergeAdminSnapshot(
  current: Workspace,
  incoming: Workspace,
  openItem: string | null = null,
) {
  let data = incoming;
  if (incoming.revision !== undefined && current.revision !== undefined &&
      incoming.revision < current.revision) {
    data = { ...data, settings: current.settings, revision: current.revision };
  }
  if (incoming.governanceRevision !== undefined && current.governanceRevision !== undefined &&
      incoming.governanceRevision < current.governanceRevision) {
    data = {
      ...data,
      governanceRevision: current.governanceRevision,
      users: current.users,
      groups: current.groups,
      teams: current.teams,
      pendingUsers: current.pendingUsers,
      curricula: current.curricula,
    };
  }
  // A section RSC refresh contains the compact index. Keep the complete
  // confirmed open draft when that index has not advanced its revision.
  const open = openItem && current.content.find((item) => item.id === openItem);
  const item = open && data.content.find((entry) => entry.id === open.id);
  if (open && item && item !== open && (item.revision || 0) <= (open.revision || 0)) {
    data = {
      ...data,
      content: data.content.map((entry) => entry.id === open.id ? open : entry),
    };
  }
  return data;
}
async function upload(file: File) {
  const sign = await request("/api/upload", {
    name: file.name,
    size: file.size,
    type: file.type,
  });
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
  const { error } = await supabase.storage
    .from("fieldbook-media")
    .uploadToSignedUrl(sign.path, sign.token, file, {
      contentType: file.type,
      upsert: false,
    });
  if (error)
    throw new Error("Upload failed. Check the file size and your connection.");
  return (await request("/api/upload", { complete: sign.id })).url;
}
export function createAdminRuntime(initial: {
  data: Workspace;
  user: User;
  scope?: "content" | "governance" | "feedback" | "deleted";
}): AdminRuntime {
  let scope: "content" | "governance" | "feedback" | "deleted" = initial.scope ?? "content";
  let current = initial.data;
  let openItem: string | null = null;
  const cached = new Map<"content" | "governance" | "feedback" | "deleted", Workspace>([
    [scope, initial.data],
  ]);
  const pending = new Map<
    "content" | "governance" | "feedback" | "deleted",
    Promise<Workspace>
  >();
  let cacheVersion = 0;
  let contentRecoveryRequired = false;
  let contentSaveInFlight = false;
  let mutationTail = Promise.resolve();
  async function mutate<T>(operation: () => Promise<T>): Promise<T> {
    const previous = mutationTail;
    let finish!: () => void;
    mutationTail = new Promise<void>((resolve) => {
      finish = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      finish();
    }
  }
  function clearCached() {
    cacheVersion++;
    cached.clear();
    pending.clear();
  }
  function remember(data: Workspace, target = scope) {
    current = data;
    cached.set(target, data);
    return data;
  }
  async function fresh(target = scope): Promise<Workspace> {
    const version = cacheVersion;
    const state = await request(`/api/admin/snapshot?scope=${target}`);
    if (
      !state.user ||
      state.user.id !== initial.user.id ||
      state.user.role !== "admin"
    )
      throw new RequestError(
        "Administrator access changed. Sign in again.",
        401,
      );
    let data = state.data as Workspace;
    if (
      openItem &&
      target === "content" &&
      data.content.some((entry) => entry.id === openItem)
    ) {
      const item = await request(
        `/api/content?id=${encodeURIComponent(openItem)}&draft=true`,
      );
      data = {
        ...data,
        content: data.content.map((entry) =>
          entry.id === openItem ? item : entry,
        ),
      };
    }
    if (version !== cacheVersion) return fresh(target);
    return remember(data, target);
  }
  function prepared(target: "content" | "governance" | "feedback" | "deleted") {
    const available = cached.get(target);
    if (available) return Promise.resolve(available);
    const running = pending.get(target);
    if (running) return running;
    const load = fresh(target).finally(() => {
      if (pending.get(target) === load) pending.delete(target);
    });
    pending.set(target, load);
    return load;
  }
  const saver = createWorkspaceSaver(request, fresh);
  return {
    snapshot: () => current,
    adoptSnapshot: (data) => {
      if (current === data) return current;
      data = mergeAdminSnapshot(current, data, openItem);
      clearCached();
      return remember(data);
    },
    upload,
    saveContent: (content, intent) =>
      mutate(async () => {
        if (contentSaveInFlight)
          throw new Error("Wait for the current save to finish.");
        if (contentRecoveryRequired)
          throw new SaveRecoveryError(
            "Refresh and review the saved copy before saving again. Your edits remain open.",
          );
        contentSaveInFlight = true;
        openItem = content.id;
        try {
          const { publishedSignature, ...draft } = content;
          const saved = (await request("/api/content", {
            content: draft,
            expected: content.revision || 0,
            publish: intent === "published",
          })) as Content;
          const updated = mergeSavedContent(
            cached.get("content") || current,
            saved,
          );
          clearCached();
          remember(updated, "content");
          return saved;
        } catch (error) {
          contentRecoveryRequired = true;
          clearCached();
          let snapshot: Workspace | undefined;
          // A new draft may not exist when the request was rejected. Read the
          // collection first, rather than letting that missing item hide recovery.
          openItem = null;
          try {
            snapshot = await fresh("content");
          } catch {
            /* retain local text */
          }
          openItem = content.id;
          const rejected =
            error instanceof RequestError &&
            error.status >= 400 &&
            error.status < 500;
          throw new SaveRecoveryError(
            (error instanceof RequestError
              ? error.message
              : "The connection failed.") +
              " " +
              (rejected
                ? "This change was not saved. "
                : "This change may have been saved. ") +
              (snapshot
                ? "The latest saved state is available. "
                : "The latest saved state is unavailable. ") +
              "Refresh and review before retrying. Your edits remain open.",
            snapshot,
          );
        } finally {
          contentSaveInFlight = false;
        }
      }),
    save: (before, after) =>
      mutate(async () => {
        if (contentRecoveryRequired)
          throw new SaveRecoveryError(
            "Refresh and review the saved copy before applying more changes. Your edits remain open.",
          );
        const created = after.content.find(
          (item) => !before.content.some((previous) => previous.id === item.id),
        );
        if (created) openItem = created.id;
        if (
          scope === "content" &&
          ["groups", "curricula", "teams", "users", "pendingUsers"].some(
            (key) =>
              JSON.stringify(before[key as keyof Workspace]) !==
              JSON.stringify(after[key as keyof Workspace]),
          )
        ) {
          const complete = await fresh("governance");
          if (complete.governanceRevision !== before.governanceRevision)
            throw new Error(
              "Organization data changed. Refresh before applying these changes.",
            );
          const prior = before;
          before = {
            ...before,
            users: complete.users,
            teams: complete.teams,
            pendingUsers: complete.pendingUsers,
          };
          after = {
            ...after,
            users:
              JSON.stringify(prior.users) === JSON.stringify(after.users)
                ? complete.users
                : after.users,
            teams:
              JSON.stringify(prior.teams) === JSON.stringify(after.teams)
                ? complete.teams
                : after.teams,
            pendingUsers:
              JSON.stringify(prior.pendingUsers) ===
              JSON.stringify(after.pendingUsers)
                ? complete.pendingUsers
                : after.pendingUsers,
          };
        }
        let saved: Workspace;
        try {
          saved = await saver(before, after);
        } catch (error) {
          // Settings/report recovery belongs to the workspace saver. Preserve
          // the explicit saved-copy gate when an open editor/queued autosave or
          // a content mutation can depend on the uncertain workspace state.
          if (error instanceof SaveRecoveryError && (openItem || !equalJson(before.content, after.content)))
            contentRecoveryRequired = true;
          throw error;
        }
        clearCached();
        remember(saved);
        return saved;
      }),
    refresh: () =>
      mutate(async () => {
        if (contentSaveInFlight)
          throw new Error("Wait for the current save to finish.");
        const latest = await saver.refresh();
        contentRecoveryRequired = false;
        clearCached();
        remember(latest);
        return latest;
      }),
    manageLearning: async (action) => {
      await request("/api/assignments", action);
      clearCached();
      return fresh();
    },
    admin: {
      bulk: async (action) => {
        const results: import("@/lib/bulk-actions").BulkResult[] = [];
        let latest = cached.get(scope) || current;
        openItem = null;
        for (let start = 0; start < action.items.length; start += 100) {
          const items = action.items.slice(start, start + 100);
          try {
            const response = await request("/api/admin/bulk", {
              ...action,
              items,
              governanceExpected: start
                ? latest.governanceRevision
                : action.governanceExpected,
            });
            results.push(...response.results);
          } catch (error) {
            results.push(
              ...action.items.slice(start).map((item) => ({
                id: item.id,
                status: "failed" as const,
                message: `Could not confirm this batch. Refresh and review before retrying. ${(error as Error).message}`,
              })),
            );
            clearCached();
            latest = await fresh();
            break;
          }
          clearCached();
          latest = await fresh();
        }
        return { data: latest, results };
      },
      prepare: async (next) => {
        const data = await prepared(next);
        scope = next;
        openItem = null;
        return remember(data, next);
      },
      edit: async (id) => {
        const item = await request(
          `/api/content?id=${encodeURIComponent(id)}&draft=true`,
        );
        openItem = id;
        const data = {
          ...(cached.get(scope) || current),
          content: (cached.get(scope) || current).content.map((entry) =>
            entry.id === id ? item : entry,
          ),
        };
        remember(data);
        return { data, item };
      },
      unpublish: async (id) => {
        const item = await request(
          `/api/content?id=${encodeURIComponent(id)}&draft=true`,
        );
        await request("/api/content", {
          content: item,
          expected: item.revision,
          unpublish: true,
        });
        openItem = null;
        clearCached();
        return fresh();
      },
    },
  };
}
