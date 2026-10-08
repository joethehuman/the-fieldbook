import assert from "node:assert/strict";
import { test } from "node:test";
import {
  completionPercent,
  learningTarget,
  requiredSequence,
} from "../lib/learning";
import {
  groupItems,
  reconcileLearning,
  updatesForUser,
} from "../lib/learning-groups";
import { assignedCourses, effectiveGroups, isComplete } from "../lib/types";
import { governanceSchema } from "../server/governance-schema";
import { legacyWorkspace as freshWorkspace } from "./fixtures/legacy-workspace";

test("demo learning groups combine live teams, curriculum order and direct assignments without duplicate progress", () => {
  const original = freshWorkspace();
  const next = structuredClone(original);
  const courses = original.content.filter(
    (c) => c.kind === "course" && c.groups.includes("sales"),
  );
  const [a, b, c] = courses;
  next.curricula = [
    {
      id: "start",
      name: "Getting started",
      description: "",
      status: "published",
      courseIds: [b.id, a.id],
    },
  ];
  next.groups = [
    {
      id: "all",
      name: "Everyone",
      teamIds: ["sales-team"],
      learningItems: [{ kind: "course", id: a.id }],
    },
    {
      id: "sales",
      name: "Sales",
      teamIds: ["sales-team"],
      learningItems: [
        { kind: "curriculum", id: "start" },
        { kind: "course", id: c.id },
      ],
    },
  ];
  next.users[0].groups = [];
  const saved = reconcileLearning(original, next, "2026-09-20T00:00:00.000Z");
  const user = saved.users[0];
  assert.deepEqual([...effectiveGroups(user, saved.groups)], ["all", "sales"]);
  assert.deepEqual(
    requiredSequence(saved.content, user, saved.groups).map((c) => c.id),
    [a.id, b.id, c.id],
  );
  assert.equal(assignedCourses(saved.content, user, saved.groups).length, 3);
  assert.equal(
    isComplete(
      saved.content.find((x) => x.id === a.id)!,
      saved.progress[user.id],
    ),
    true,
  );
  const leave = structuredClone(saved);
  leave.users[0].teamId = undefined;
  const left = reconcileLearning(saved, leave, "2026-10-01T00:00:00.000Z");
  assert.equal(
    assignedCourses(left.content, left.users[0], left.groups).length,
    0,
  );
  assert.deepEqual(left.progress, saved.progress);
  assert.equal(left.content.length, original.content.length);
  const rejoin = structuredClone(left);
  rejoin.users[0].teamId = "sales-team";
  assert.equal(
    reconcileLearning(left, rejoin, "2026-10-02T00:00:00.000Z").users[0]
      .effectiveGroupJoinedAt?.sales,
    "2026-10-02T00:00:00.000Z",
  );
  const reordered = structuredClone(saved);
  reordered.curricula![0].courseIds.reverse();
  const result = reconcileLearning(
    saved,
    reordered,
    "2026-10-03T00:00:00.000Z",
  );
  assert.equal(
    learningTarget(
      saved.content.find((x) => x.id === a.id)!,
      user,
      saved.groups,
    ),
    learningTarget(
      result.content.find((x) => x.id === a.id)!,
      result.users[0],
      result.groups,
    ),
  );
  assert.deepEqual(
    groupItems({ id: "sales", name: "Sales" }, original.content).map(
      (i) => i.id,
    ),
    courses.sort((a, b) => a.title.localeCompare(b.title)).map((c) => c.id),
  );
});

test("Updates split once into relevant and other updates, independent of learning progress", () => {
  const data = freshWorkspace();
  const base = data.content.find((c) => c.kind === "brief")!;
  const content = [
    { ...base, id: "old", groups: ["parent"], updatedAt: "2026-09-01" },
    { ...base, id: "new", groups: ["sales"], updatedAt: "2026-09-20" },
    { ...base, id: "other", groups: [], updatedAt: "2026-09-21" },
    { ...base, id: "draft", status: "draft" as const, groups: ["sales"] },
  ];
  const result = updatesForUser(
    content,
    { ...data.users[0], groups: ["sales", "parent"] },
    [
      { id: "parent", name: "Everyone" },
      { id: "sales", name: "Sales" },
    ],
  );
  assert.deepEqual(
    result.forYou.map((c) => c.id),
    ["new", "old"],
  );
  assert.deepEqual(
    result.other.map((c) => c.id),
    ["other"],
  );
  const guest = updatesForUser(
    content,
    { ...data.users[0], groups: [], teamId: undefined },
    data.groups,
  );
  assert.equal(guest.forYou.length, 0);
  assert.equal(guest.other.length, 3);
});

test("Update recommendations feature at most two recent audience matches and retain every other published update", () => {
  const data = freshWorkspace();
  const base = data.content.find((c) => c.kind === "brief")!;
  const many = Array.from({ length: 24 }, (_, index) => ({
    ...base,
    id: `update-${String(index).padStart(2, "0")}`,
    groups: index === 23 ? ["parent"] : index % 3 === 0 ? ["sales"] : [],
    updatedAt: `2026-09-${String(23 - index).padStart(2, "0")}T12:00:00.000Z`,
  }));
  const result = updatesForUser(many, data.users[0], [
    { id: "parent", name: "Everyone" },
    { id: "sales", name: "Sales" },
  ]);
  assert.deepEqual(
    result.forYou.map((item) => item.id),
    ["update-00", "update-03"],
  );
  assert.equal(result.other.length, 22);
  assert.ok(result.other.some((item) => item.id === "update-23"));
  assert.equal(
    new Set([...result.forYou, ...result.other].map((item) => item.id)).size,
    24,
  );
  assert.deepEqual(
    [...result.other].map((item) => item.id),
    many
      .filter((item) => item.id !== "update-00" && item.id !== "update-03")
      .map((item) => item.id),
  );
});

test("Update feed handles zero, one, two, draft-only edits, duplicate IDs and invalid dates deterministically", () => {
  const data = freshWorkspace();
  const base = data.content.find((c) => c.kind === "brief")!;
  const group = [{ id: "sales", name: "Sales" }];
  const make = (id: string, patch: Partial<typeof base> = {}) => ({
    ...base,
    id,
    groups: ["sales"],
    ...patch,
  });
  for (const count of [0, 1, 2]) {
    const result = updatesForUser(
      Array.from({ length: count }, (_, i) => make(`item-${i}`)),
      data.users[0],
      group,
    );
    assert.equal(result.forYou.length, count);
    assert.equal(result.other.length, 0);
  }

  const result = updatesForUser(
    [
      make("valid", { updatedAt: "2026-09-20T00:00:00.000Z" }),
      make("created-fallback", {
        updatedAt: "invalid",
        createdAt: "2026-09-21T00:00:00.000Z",
      }),
      make("undated-b", { updatedAt: "invalid", createdAt: undefined }),
      make("undated-a", { updatedAt: "", createdAt: undefined }),
      make("draft", {
        status: "draft",
        updatedAt: "2026-09-30T00:00:00.000Z",
      }),
      make("valid", { updatedAt: "2026-09-01T00:00:00.000Z" }),
    ],
    data.users[0],
    group,
  );
  assert.deepEqual(
    result.forYou.map((item) => item.id),
    ["created-fallback", "valid"],
  );
  assert.deepEqual(
    result.other.map((item) => item.id),
    ["undated-a", "undated-b"],
  );
});

test("narrow reader rows and full demo content share Update fallback dates, ties, deduplication and audiences", () => {
  const data = freshWorkspace();
  const base = data.content.find((c) => c.kind === "brief")!;
  const groups = [{ id: "sales", name: "Sales" }];
  const teams = [{ id: "west", name: "West" }];
  const make = (id: string, patch: Partial<typeof base> = {}) => ({
    ...base,
    id,
    groups: ["sales"],
    updateTeams: [],
    feedAt: undefined,
    updatedAt: "2026-10-02T00:00:00Z",
    createdAt: undefined,
    ...patch,
  });
  const content = [
    make("fallback", { feedAt: "invalid", updatedAt: "2026-10-03T00:00:00Z" }),
    make("team", {
      groups: [],
      updateTeams: ["west"],
      feedAt: "2026-10-04T00:00:00Z",
    }),
    make("all", { groups: [], updatedAt: "2026-10-05T00:00:00Z" }),
    make("tie-b"),
    make("tie-a", { updatedAt: "invalid", createdAt: "2026-10-02T00:00:00Z" }),
    make("undated-b", { updatedAt: "invalid" }),
    make("undated-a", { updatedAt: "" }),
    make("fallback", { updatedAt: "2026-10-09T00:00:00Z" }),
    make("draft", { status: "draft" }),
    make("doc", { kind: "doc" }),
  ];
  const narrow = content.map(
    ({
      id,
      kind,
      status,
      groups,
      updateTeams,
      feedAt,
      updatedAt,
      createdAt,
    }) => ({
      id,
      kind,
      status,
      groups,
      updateTeams,
      feedAt,
      updatedAt,
      createdAt,
      marker: `preserved-${id}`,
    }),
  );
  const before = structuredClone(narrow);
  for (const guest of [false, true]) {
    const user = {
      ...data.users[0],
      id: guest ? "guest" : "member",
      groups: ["sales"],
      teamId: "west",
    };
    const fullResult = updatesForUser(content, user, groups, teams);
    const narrowResult = updatesForUser(narrow, user, groups, teams);
    const ids = (result: typeof fullResult | typeof narrowResult) => ({
      forYou: result.forYou.map((item) => item.id),
      other: result.other.map((item) => item.id),
    });
    assert.deepEqual(ids(narrowResult), ids(fullResult));
    assert.deepEqual(
      ids(narrowResult),
      guest
        ? {
            forYou: ["fallback", "tie-a"],
            other: ["all", "team", "tie-b", "undated-a", "undated-b"],
          }
        : {
            forYou: ["team", "fallback"],
            other: ["all", "tie-a", "tie-b", "undated-a", "undated-b"],
          },
    );
    for (const item of [...narrowResult.forYou, ...narrowResult.other]) {
      assert.equal(item.marker, `preserved-${item.id}`);
      assert.equal("body" in item, false);
    }
  }
  assert.deepEqual(
    narrow,
    before,
    "Selection must not mutate the reader index",
  );
});

test("learning governance rejects bad team links, duplicate items and unpublished curricula", () => {
  const cid = "00000000-0000-4000-8000-000000000010";
  const input = {
    expected: 1,
    users: [],
    teams: [
      { id: "organization", name: "Organization", system: "organization" },
      { id: "t", name: "Team", parentId: "organization" },
    ],
    groups: [
      {
        id: "g",
        name: "Group",
        teamIds: ["t"],
        learningItems: [{ kind: "curriculum", id: "c" }],
      },
    ],
    curricula: [
      {
        id: "c",
        name: "Curriculum",
        description: "",
        status: "published",
        courseIds: [cid],
      },
    ],
  };
  assert.equal(governanceSchema.safeParse(input).success, true);
  for (const bad of [
    { ...input, groups: [{ ...input.groups[0], parentId: "g" }] },
    { ...input, groups: [{ ...input.groups[0], teamLinkScope: "direct" }] },
    { ...input, groups: [{ ...input.groups[0], legacyDirectTeamIds: ["t"] }] },
    {
      ...input,
      groups: [{ ...input.groups[0], legacyDirectTeamIds: ["missing"] }],
    },
    { ...input, teams: [] },
    { ...input, curricula: [{ ...input.curricula[0], status: "draft" }] },
    { ...input, curricula: [{ ...input.curricula[0], courseIds: [cid, cid] }] },
    {
      ...input,
      groups: [
        {
          ...input.groups[0],
          learningItems: [
            ...input.groups[0].learningItems,
            ...input.groups[0].learningItems,
          ],
        },
      ],
    },
  ])
    assert.equal(governanceSchema.safeParse(bad).success, false);
});

test("100 percent means every designated course is complete", () => {
  assert.equal(completionPercent(199, 200), 99);
  assert.equal(completionPercent(200, 200), 100);
  assert.equal(completionPercent(6, 8), 75);
  assert.equal(completionPercent(0, 0), 0);
});
