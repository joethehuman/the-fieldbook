import type { Workspace } from "./store";
import { SaveRecoveryError } from "./save-recovery";

export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function request(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json();
  if (!response.ok) {
    const reference =
      typeof data.requestId === "string" &&
      /^[a-f0-9-]{36}$/.test(data.requestId)
        ? ` Reference: ${data.requestId}.`
        : "";
    throw new RequestError(
      (data.error || "Request failed.") + reference,
      response.status,
    );
  }
  return data;
}

type Send = (path: string, body: unknown) => Promise<unknown>;
export function createWorkspaceSaver(
  send: Send,
  load: () => Promise<Workspace>,
) {
  let recoveryRequired = false;
  let inFlight = false;
  const save = async (
    before: Workspace,
    after: Workspace,
  ): Promise<Workspace> => {
    if (inFlight) throw new Error("A save is already in progress.");
    inFlight = true;
    try {
      if (recoveryRequired) {
        let snapshot: Workspace;
        try {
          snapshot = await load();
        } catch {
          throw new SaveRecoveryError(
            "The latest saved state is still unavailable. Your edits remain open. Try refreshing again before saving.",
          );
        }
        recoveryRequired = false;
        throw new SaveRecoveryError(
          "The latest saved state is available. Review it before saving again; no changes were resent.",
          snapshot,
        );
      }
      const operations: [string, unknown][] = [];
      const enqueue = (path: string, body: unknown) => {
        operations.push([path, body]);
      };
      if (JSON.stringify(before.settings) !== JSON.stringify(after.settings))
        enqueue("/api/settings", {
          settings: after.settings,
          expected: before.revision,
        });
      for (const c of after.content) {
        const old = before.content.find((x) => x.id === c.id);
        if (JSON.stringify(c) !== JSON.stringify(old))
          enqueue("/api/content", {
            content: c,
            expected: old?.revision || 0,
            publish: c.status === "published",
          });
      }
      for (const c of before.content.filter(
        (c) => !after.content.some((x) => x.id === c.id),
      ))
        enqueue("/api/content", {
          content: { ...c, status: "draft" },
          expected: c.revision,
          unpublish: true,
        });
      for (const rating of after.feedback || []) {
        if (
          JSON.stringify(rating) !==
          JSON.stringify(before.feedback?.find((x) => x.id === rating.id))
        )
          enqueue("/api/feedback", rating);
      }
      if (
        JSON.stringify(before.users) !== JSON.stringify(after.users) ||
        JSON.stringify(before.groups) !== JSON.stringify(after.groups) ||
        JSON.stringify(before.teams) !== JSON.stringify(after.teams) ||
        JSON.stringify(before.curricula) !== JSON.stringify(after.curricula)
      )
        enqueue("/api/governance", {
          expected: before.governanceRevision,
          users: after.users,
          groups: after.groups,
          teams: after.teams || [],
          curricula: after.curricula || [],
        });
      const pendingBefore = before.pendingUsers || [],
        pendingAfter = after.pendingUsers || [];
      const changed = pendingAfter.filter(
        (p) =>
          JSON.stringify(p) !==
          JSON.stringify(pendingBefore.find((x) => x.email === p.email)),
      );
      const removed = pendingBefore.filter(
        (p) => !pendingAfter.some((x) => x.email === p.email),
      );

      for (const p of changed)
        enqueue("/api/governance", {
          operation: "pending",
          expected: before.governanceRevision,
          ...p,
        });
      for (const p of removed)
        enqueue("/api/governance", {
          operation: "pending",
          expected: before.governanceRevision,
          ...p,
          revoke: true,
        });

      let completed = 0;
      try {
        let governanceRevision = before.governanceRevision;
        for (const [path, body] of operations) {
          if (path === "/api/governance")
            (body as { expected: number | undefined }).expected =
              governanceRevision;
          const response = await send(path, body);
          if (path === "/api/governance")
            governanceRevision =
              (response as { revision?: number } | undefined)?.revision ??
              governanceRevision! + 1;
          completed++;
        }
      } catch (error) {
        let snapshot: Workspace | undefined;
        let refreshMessage = "";
        try {
          snapshot = await load();
        } catch (refreshError) {
          recoveryRequired = true;
          if (refreshError instanceof RequestError)
            refreshMessage = ` ${refreshError.message}`;
        }
        const rejected =
          error instanceof RequestError &&
          error.status >= 400 &&
          error.status < 500;
        const detail =
          error instanceof RequestError
            ? error.message
            : "The connection failed.";
        throw new SaveRecoveryError(
          `${completed} of ${operations.length} changes confirmed saved. ${detail} ` +
            (rejected
              ? "The rejected change was not saved. "
              : "The last change may have been saved. ") +
            (snapshot
              ? "Latest saved state refreshed. Review before retrying."
              : "Latest saved state could not be refreshed. Refresh before retrying.") +
            " Your edits remain open." +
            refreshMessage,
          snapshot,
        );
      }
      try {
        return await load();
      } catch (error) {
        recoveryRequired = true;
        throw new SaveRecoveryError(
          "Changes saved, but the latest state could not be refreshed. Your edits remain open. Refresh before saving again." +
            (error instanceof RequestError ? ` ${error.message}` : ""),
        );
      }
    } finally {
      inFlight = false;
    }
  };
  return Object.assign(save, {
    refresh: async () => {
      if (inFlight) throw new Error("Wait for the current save to finish.");
      const snapshot = await load();
      recoveryRequired = false;
      return snapshot;
    },
  });
}
