import test from "node:test";
import assert from "node:assert/strict";
import {
  rosterImportReview,
  readRosterUpload,
} from "../../server/roster-import";
import { freshWorkspace } from "../../lib/store";
import { rosterExample } from "../../lib/roster-import";
import { serializeCsv } from "../../lib/csv";
import type { DataStore } from "../../server/ports/data";
import type { User } from "../../lib/types";
const input = serializeCsv(rosterExample());
const admin: User = {
  id: "admin",
  name: "Owner",
  email: "owner@example.test",
  active: true,
  role: "admin",
  groups: [],
};
function provider(
  options: {
    changed?: boolean;
    revoked?: boolean;
    deleted?: boolean;
    tombstone?: boolean;
  } = {},
) {
  const d = freshWorkspace();
  d.users = [admin];
  const calls: string[] = [];
  let configReads = 0;
  const methods = {
    async readConfiguration() {
      calls.push("config");
      configReads++;
      return {
        settings: d.settings,
        groups: d.groups,
        teams: d.teams,
        curricula: d.curricula,
        revision: options.changed && configReads > 1 ? 11 : 10,
        governance_revision: 10,
      };
    },
    async readAdminPeopleSnapshot() {
      calls.push("people");
      return {
        revision: 10,
        teams: d.teams,
        groups: d.groups,
        curricula: d.curricula,
        users: [
          {
            ...admin,
            auth_user_id: "subject",
            role: options.revoked ? "learner" : "admin",
          },
        ],
        pending: [],
        progress: [],
      };
    },
    async listPublishedAssignmentContent() {
      calls.push("published");
      return d.content
        .filter((c) => c.status === "published")
        .map((published) => ({
          id: published.id,
          published,
          published_revision: 1,
          revision: 1,
        }));
    },
    async listDeletedProfileEmails() {
      calls.push("deleted emails");
      return options.tombstone ? ["avery@example.test"] : [];
    },
    async listProfiles() {
      calls.push("profiles");
      return options.deleted
        ? [
            {
              id: "deleted",
              email: "avery@example.test",
              deleted_at: "2026-09-01",
            },
          ]
        : [];
    },
  };
  const store = new Proxy(methods, {
    get(target, key) {
      if (!(key in target))
        throw Error("Unexpected data operation: " + String(key));
      return target[key as keyof typeof methods];
    },
  }) as unknown as DataStore;
  return { store, calls };
}
test("admin review derives consequences from current server inputs using read operations only", async () => {
  const { store, calls } = provider();
  const result = await rosterImportReview(admin, input, store);
  assert.equal(result.valid, true);
  assert.equal(result.people.length, 5);
  assert.equal(result.governanceRevision, 10);
  assert.deepEqual(
    calls.sort(),
    [
      "config",
      "config",
      "people",
      "profiles",
      "published",
      "deleted emails",
    ].sort(),
  );
});
test("signed-out, inactive, learner, contributor and manager requests fail before roster reads", async () => {
  for (const user of [
    null,
    { ...admin, active: false },
    ...(["learner", "manager", "contributor"] as const).map((role) => ({
      ...admin,
      role,
    })),
  ]) {
    const { store, calls } = provider();
    await assert.rejects(
      rosterImportReview(user, input, store),
      /access|required|Sign in/,
    );
    assert.deepEqual(calls, []);
  }
});
test("revoked authoritative access and changed snapshots cannot return a review", async () => {
  await assert.rejects(
    rosterImportReview(admin, input, provider({ revoked: true }).store),
    /access changed/,
  );
  await assert.rejects(
    rosterImportReview(admin, input, provider({ changed: true }).store),
    /organization changed/,
  );
});
test("deleted email conflicts are checked without returning deleted profiles or course bodies", async () => {
  const result = await rosterImportReview(
    admin,
    input,
    provider({ deleted: true }).store,
  );
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((i) => i.code === "deleted-person"));
  assert.ok(!JSON.stringify(result).includes('"deleted_at"'));
  assert.ok(!JSON.stringify(result).includes('"body"'));
});
const request = (body: unknown) =>
  new Request("https://example.test/api/admin/roster-import/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
test("the HTTP input is bounded UTF-8 CSV and rejects client-selected IDs, proposals or totals", async () => {
  assert.equal(await readRosterUpload(request({ csv: input })), input);
  for (const body of [
    null,
    [],
    { csv: input, people: [] },
    { csv: input, actorId: "other" },
    { csv: 1 },
  ])
    await assert.rejects(readRosterUpload(request(body)), /valid UTF-8 CSV/);
  await assert.rejects(
    readRosterUpload(request({ csv: "x".repeat(2 * 1024 * 1024 + 1) })),
    /smaller than 2 MB/,
  );
  await assert.rejects(
    readRosterUpload(
      new Request("https://example.test", { method: "POST", body: "bad" }),
    ),
    /Choose a CSV/,
  );
});

test("a pending-deletion identity stays blocked after its profile has been removed", async () => {
  const { store } = provider({ tombstone: true });
  const result = await rosterImportReview(admin, input, store);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some((issue) => issue.code === "deleted-person"));
});
