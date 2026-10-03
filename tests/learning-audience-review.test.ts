import test from "node:test";
import assert from "node:assert/strict";
import { freshWorkspace } from "../lib/store";
import { assignLearningToAudiences } from "../lib/assignment-audiences";
import { reconcileLearning } from "../lib/learning-groups";
import { learningAudienceReview } from "../lib/learning-audience-review";
function fixture() {
  const data = freshWorkspace(),
    course = data.content.find((c) => c.kind === "course")!;
  data.content = [course];
  data.publishedContent = structuredClone(data.content);
  data.curricula = [];
  data.groups = [{ id: "members", name: "Members", learningItems: [] }];
  data.teams = [
    {
      id: "org",
      name: "Organization",
      system: "organization",
      learningItems: [],
    },
  ];
  data.users = data.users
    .slice(0, 2)
    .map((u, i) => ({
      ...u,
      id: `p${i}`,
      active: true,
      groups: i === 0 ? ["members"] : [],
      teamId: undefined,
      onboardingStart: undefined,
      hireDate: undefined,
      assignmentTeams: [],
      learningAssignments: [],
    }));
  return { data, item: { kind: "course" as const, id: course.id } };
}
test("review predicts Organization fallback from current plan, despite old projected assignment teams", () => {
  const { data, item } = fixture();
  const next = assignLearningToAudiences(data, [item], ["team:org"]);
  const impact = learningAudienceReview(
    data,
    next,
    item,
    "2026-10-02T00:00:00Z",
  );
  assert.equal(impact.gained, 2);
  assert.equal(impact.total, 2);
  assert(impact.rows.every((r) => r.due === "2026-11-01"));
  assert.deepEqual(data.teams![0].learningItems, []);
});
test("source-only edits preserve curriculum recipients and their saved deadlines", () => {
  const { data, item } = fixture();
  data.curricula = [
    {
      id: "curr",
      name: "Leadership",
      status: "published",
      description: "",
      courseIds: [item.id],
    },
  ];
  data.groups[0].learningItems = [{ kind: "curriculum", id: "curr" }, item];
  const before = reconcileLearning(data, data, "2026-09-01T00:00:00Z");
  const saved = before.users[0].learningAssignments![0].dueDate;
  const after = assignLearningToAudiences(before, [item], []);
  const impact = learningAudienceReview(
    before,
    after,
    item,
    "2026-10-02T00:00:00Z",
  );
  assert.equal(impact.gained, 0);
  assert.equal(impact.lost, 0);
  assert.equal(impact.retained, 1);
  assert.equal(impact.rows[0].due, saved);
  assert.equal(impact.rows[0].saved, true);
});
test("configured guest group includes registered members, never anonymous people or disabled dates", () => {
  const { data, item } = fixture();
  data.settings = {
    ...data.settings!,
    access: "public",
    guestGroupId: "members",
    dueDatesEnabled: false,
  };
  const impact = learningAudienceReview(
    data,
    assignLearningToAudiences(data, [item], ["group:members"]),
    item,
    "2026-10-02T00:00:00Z",
  );
  assert.equal(impact.gained, 1);
  assert.equal(impact.total, 1);
  assert(impact.rows.every((r) => r.due === undefined));
  assert.equal(impact.dueDates, false);
});
