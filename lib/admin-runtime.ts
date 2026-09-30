import { createBrowserClient } from "@supabase/ssr";
import { request, createWorkspaceSaver, RequestError } from "./workspace-save";
import type { UploadMedia } from "@/components/MarkdownEditor";
import type { BulkRequest, BulkResult } from "./bulk-actions";
import type { LearningAction } from "./learning";
import type { Workspace } from "./store";
import type { Content, User } from "./types";
export type AdminRuntime = {
  save: (before: Workspace, after: Workspace) => Promise<Workspace>;
  refresh: () => Promise<Workspace>;
  manageLearning: (action: LearningAction) => Promise<Workspace>;
  upload: UploadMedia;
  admin: {
    bulk: (
      action: BulkRequest,
    ) => Promise<{ data: Workspace; results: BulkResult[] }>;
    prefetch: () => void;
    prepare: (
      scope: "content" | "governance" | "feedback",
    ) => Promise<Workspace>;
    edit: (id: string) => Promise<{ data: Workspace; item: Content }>;
    unpublish: (id: string) => Promise<Workspace>;
  };
};
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
}): AdminRuntime {
  let scope: "content" | "governance" | "feedback" = "content";
  let openItem: string | null = null;
  const cached = new Map<"content" | "governance" | "feedback", Workspace>([
    ["content", initial.data],
  ]);
  const pending = new Map<
    "content" | "governance" | "feedback",
    Promise<Workspace>
  >();
  let cacheVersion = 0;
  function clearCached() {
    cacheVersion++;
    cached.clear();
    pending.clear();
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
    if (openItem && target === "content") {
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
    cached.set(target, data);
    return data;
  }
  function prepared(target: "content" | "governance" | "feedback") {
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
    upload,
    save: async (before, after) => {
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
      const saved = await saver(before, after);
      clearCached();
      cached.set(scope, saved);
      return saved;
    },
    refresh: async () => {
      const latest = await saver.refresh();
      clearCached();
      cached.set(scope, latest);
      return latest;
    },
    manageLearning: async (action) => {
      await request("/api/assignments", action);
      clearCached();
      return fresh();
    },
    admin: {
      bulk: async (action) => {
        const results: import("@/lib/bulk-actions").BulkResult[] = [];
        let latest = cached.get(scope) || initial.data;
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
      prefetch: () => {
        // Warm the two first-visit sections after Content has painted. A tab
        // click shares the same in-flight read instead of starting another.
        void Promise.allSettled([prepared("governance"), prepared("feedback")]);
      },
      prepare: async (next) => {
        scope = next;
        openItem = null;
        return prepared(next);
      },
      edit: async (id) => {
        const item = await request(
          `/api/content?id=${encodeURIComponent(id)}&draft=true`,
        );
        openItem = id;
        const data = {
          ...(cached.get(scope) || initial.data),
          content: (cached.get(scope) || initial.data).content.map((entry) =>
            entry.id === id ? item : entry,
          ),
        };
        cached.set(scope, data);
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
