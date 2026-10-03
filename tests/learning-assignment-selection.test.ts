import test from "node:test";
import assert from "node:assert/strict";
import { freshWorkspace } from "../lib/store";
import {
  applyLearningSelection,
  learningSelectionOptions,
} from "../lib/learning-assignment-selection";
import { learningAudienceReview } from "../lib/learning-audience-review";
import { reconcileLearning } from "../lib/learning-groups";
import {
  contentRelationshipCommands,
  curriculumGroupCommands,
} from "../components/bulk-relationships";

function fixture() {
  const data = freshWorkspace();
  data.content = data.content.filter((c) => c.kind === "course").slice(0, 2);
  data.publishedContent = structuredClone(data.content);
  const items = data.content.map((c) => ({
    kind: "course" as const,
    id: c.id,
  }));
  data.groups = [
    { id: "a", name: "Audience", learningItems: [items[0]] },
    { id: "b", name: "Other", learningItems: [] },
  ];
  data.teams = [{ id: "t", name: "Team", learningItems: [items[0]] }];
  data.curricula = [
    {
      id: "p",
      name: "Playlist",
      status: "published",
      description: "",
      courseIds: [items[0].id],
    },
  ];
  data.users = [
    {
      ...data.users[0],
      groups: ["a"],
      teamId: "t",
      learningAssignments: [],
      effectiveGroupIds: undefined,
    },
  ];
  return { data, items };
}
test("bulk Add/Remove preserves distinct existing audiences, order, published content and progress", () => {
  const { data, items } = fixture();
  const next = applyLearningSelection(
    data,
    { kind: "items", items, mode: "add" },
    ["group:b"],
  );
  assert.deepEqual(next.groups[1].learningItems, items);
  assert.deepEqual(next.groups[0], data.groups[0]);
  assert.deepEqual(next.teams, data.teams);
  const removed = applyLearningSelection(
    next,
    { kind: "items", items, mode: "remove" },
    ["group:b"],
  );
  assert.deepEqual(removed.groups[1].learningItems, []);
  assert.deepEqual(removed.groups[0], data.groups[0]);
  assert.deepEqual(removed.teams, data.teams);
  assert.deepEqual(removed.publishedContent, data.publishedContent);
  assert.deepEqual(removed.progress, data.progress);
});
test("group-context removal retains curriculum coverage, completion and the continuous saved deadline", () => {
  const { data, items } = fixture();
  data.groups[0].learningItems!.push({ kind: "curriculum", id: "p" });
  const before = reconcileLearning(data, data, "2026-09-01T00:00:00Z");
  const next = applyLearningSelection(
    before,
    { kind: "audiences", keys: ["group:a"], mode: "remove" },
    [`course:${items[0].id}`],
  );
  assert.deepEqual(next.groups[0].learningItems, [
    { kind: "curriculum", id: "p" },
  ]);
  assert.deepEqual(next.teams, before.teams);
  const impact = learningAudienceReview(
    before,
    next,
    items[0],
    "2026-10-02T00:00:00Z",
  );
  assert.equal(impact.lost, 0);
  assert.equal(impact.retained, 1);
  const after = reconcileLearning(before, next, "2026-10-02T00:00:00Z");
  assert.equal(
    after.users[0].learningAssignments![0].episodeId,
    before.users[0].learningAssignments![0].episodeId,
  );
  assert.equal(
    after.users[0].learningAssignments![0].dueDate,
    before.users[0].learningAssignments![0].dueDate,
  );
  assert.deepEqual(after.progress, before.progress);
});
test("mixed course/curriculum review deduplicates overlapping course recipients", () => {
  const { data, items } = fixture();
  data.groups[0].learningItems = [];
  data.teams![0].learningItems = [];
  const target = {
    kind: "audiences" as const,
    keys: ["group:a"],
    mode: "add" as const,
  };
  const values = [`course:${items[0].id}`, "curriculum:p"];
  const next = applyLearningSelection(data, target, values);
  const impact = learningAudienceReview(
    data,
    next,
    [items[0], { kind: "curriculum", id: "p" }],
    "2026-10-02T00:00:00Z",
  );
  assert.equal(impact.rows.length, 1);
  assert.equal(impact.gained, 1);
});
test("stale audiences/publications are rejected and unavailable direct links remain removable", () => {
  const { data, items } = fixture();
  const target = {
    kind: "audiences" as const,
    keys: ["group:a"],
    mode: "add" as const,
  };
  assert.throws(
    () =>
      applyLearningSelection(data, { ...target, keys: ["group:gone"] }, [
        `course:${items[1].id}`,
      ]),
    /changed/,
  );
  data.publishedContent![1].status = "draft";
  assert.throws(
    () => applyLearningSelection(data, target, [`course:${items[1].id}`]),
    /changed/,
  );
  data.groups[0].learningItems!.push({ kind: "course", id: "gone" });
  const remove = { ...target, mode: "remove" as const };
  assert(
    learningSelectionOptions(data, remove).some(
      (option) => option.id === "course:gone",
    ),
  );
  assert(
    !applyLearningSelection(data, remove, [
      "course:gone",
    ]).groups[0].learningItems!.some((item) => item.id === "gone"),
  );
});
test("course/curriculum bulk menus delegate to the shared workflow without generic options", async () => {
  const { data, items } = fixture();
  const requests: unknown[] = [];
  const open = async (target: unknown) => {
    requests.push(target);
  };
  const courses = contentRelationshipCommands(
    data,
    items.map((item) => item.id),
    () => {
      throw new Error("Must use picker");
    },
    async () => {},
    open,
  );
  const curricula = curriculumGroupCommands(
    data,
    ["p"],
    () => {
      throw new Error("Must use picker");
    },
    open,
  );
  for (const commands of [courses.slice(0, 2), curricula])
    for (const command of commands) {
      assert.equal(command.externalReview, true);
      assert.equal(command.options, undefined);
      await command.apply([]);
    }
  assert.deepEqual(requests, [
    { kind: "items", items, mode: "add" },
    { kind: "items", items, mode: "remove" },
    { kind: "items", items: [{ kind: "curriculum", id: "p" }], mode: "add" },
    { kind: "items", items: [{ kind: "curriculum", id: "p" }], mode: "remove" },
  ]);
});
