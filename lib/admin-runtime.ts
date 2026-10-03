import { canPublish, canOpenPublishingScope } from "./permissions";
import type { AdminScope } from "./admin-scope";
import { request, createWorkspaceSaver, RequestError } from "./workspace-save";
import type { UploadMedia } from "@/components/MarkdownEditor";
import type { BulkRequest, BulkResult } from "./bulk-actions";
import type { LearningAction } from "./learning";
import type { Workspace } from "./store";
import type { Content, User } from "./types";
import type { SaveIntent } from "./draft-save-queue";
import { mergeSavedContent } from "./content-save";
import { SaveRecoveryError } from "./save-recovery";
import { uploadMediaFile } from "./upload-media";
import { createSettingsSaver } from "./settings-save";
import type { SiteSettings } from "./settings";
export type AdminRuntime = {
  save: (before: Workspace, after: Workspace) => Promise<Workspace>;
  saveSettings: (before: Workspace, settings: SiteSettings) => Promise<Workspace>;
  saveContent: (content: Content, intent: SaveIntent) => Promise<Content>;
  publishedContent: (id: string) => Promise<Content>;
  refresh: () => Promise<Workspace>;
  reviewDeadlines: (
    token?: string,
  ) => Promise<import("./assignment-episodes").DeadlineReview>;
  manageLearning: (action: LearningAction) => Promise<Workspace>;
  upload: UploadMedia;
  admin: {
    bulk: (
      action: BulkRequest,
    ) => Promise<{ data: Workspace; results: BulkResult[] }>;
    prefetch: () => void;
    prepare: (scope: AdminScope, userId?: string) => Promise<Workspace>;
    prepareAssignments: () => Promise<Workspace>;
    edit: (id: string) => Promise<{ data: Workspace; item: Content }>;
    unpublish: (id: string) => Promise<Workspace>;
  };
};
export function createAdminRuntime(initial: {
  data: Workspace;
  user: User;
}): AdminRuntime {
  let scope: AdminScope = "content";
  let personId: string | undefined;
  let openItem: string | null = null;
  const cached = new Map<AdminScope, Workspace>([["content", initial.data]]);
  const pending = new Map<AdminScope, Promise<Workspace>>();
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
  async function fresh(target = scope): Promise<Workspace> {
    if (!canOpenPublishingScope(initial.user, target))
      throw new RequestError(
        "Administrator access is required for this section.",
        403,
      );
    const version = cacheVersion;
    const state = await request(
      `/api/admin/snapshot?scope=${target}${target === "person" ? `&userId=${encodeURIComponent(personId || "")}` : ""}`,
    );
    if (
      !state.user ||
      state.user.id !== initial.user.id ||
      state.user.role !== initial.user.role ||
      !canPublish(state.user)
    )
      throw new RequestError("Publishing access changed. Sign in again.", 401);
    let data = state.data as Workspace;
    if (
      openItem &&
      (target === "content" || target === "people" || target === "governance") &&
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
    cached.set(target, data);
    return data;
  }
  function prepared(target: AdminScope) {
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
  const settingsSaver = createSettingsSaver(request, fresh);
  return {
    upload: uploadMediaFile,
    saveSettings: (before, settings) => mutate(async () => {
      const saved = await settingsSaver(before, settings);
      clearCached();
      cached.set(scope, saved);
      return saved;
    }),
    publishedContent: (id) => request(`/api/content?id=${encodeURIComponent(id)}&snapshot=published`),
    saveContent: (content, intent) =>
      mutate(async () => {
        if (contentSaveInFlight)
          throw new Error("Wait for the current save to finish.");
        if (contentRecoveryRequired)
          throw new SaveRecoveryError(
            "Saving is paused. Retry saving to check the saved draft. Your changes remain open.",
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
            cached.get("content") || initial.data,
            saved,
          );
          clearCached();
          cached.set("content", updated);
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
              "Your changes remain open. Retry saving to check the saved draft.",
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
          const complete = await fresh("people");
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
          if (error instanceof SaveRecoveryError)
            contentRecoveryRequired = true;
          throw error;
        }
        clearCached();
        cached.set(scope, saved);
        return saved;
      }),
    refresh: () =>
      mutate(async () => {
        if (contentSaveInFlight)
          throw new Error("Wait for the current save to finish.");
        const latest = await saver.refresh();
        contentRecoveryRequired = false;
        clearCached();
        cached.set(scope, latest);
        return latest;
      }),
    reviewDeadlines: (token) =>
      mutate(async () => {
        const review = await request("/api/admin/deadlines", { token });
        if (token) clearCached();
        return review;
      }),
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
        // Warm the lightweight first-visit sections after Content has painted. A tab
        // click shares the same in-flight read instead of starting another.
        void Promise.allSettled([
          ...(initial.user.role === "admin" ? [prepared("people")] : []),
          prepared("feedback"),
        ]);
      },
      prepareAssignments: async () => {
        const data = await prepared("governance");
        scope = "governance";
        // Audience selection belongs to the open editor; retain its full-draft refresh.
        return data;
      },
      prepare: async (next, userId) => {
        const previousPerson = personId;
        const changingPerson = next === "person" && personId !== userId;
        if (changingPerson) {
          clearCached();
          personId = userId;
        }
        try {
          const data = await prepared(next);
          scope = next;
          openItem = null;
          return data;
        } catch (error) {
          if (changingPerson) {
            personId = previousPerson;
            clearCached();
          }
          throw error;
        }
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
