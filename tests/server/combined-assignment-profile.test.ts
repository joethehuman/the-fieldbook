import test from "node:test";
import assert from "node:assert/strict";
import { profile } from "../../server/auth";
import type { ProfileRecord } from "../../server/ports/identity";
const assignment = {
  episodeId: "episode",
  contentId: "course",
  version: 1,
  assignedAt: "2026-01-01T00:00:00Z",
  dueDate: "2026-04-01",
  catchUpDays: 7,
  sourceGroups: [],
  sourceAudiences: [{ kind: "team" as const, id: "org" }],
};
const row: ProfileRecord = {
  id: "person",
  name: "Person",
  email: "person@example.test",
  role: "learner",
  active: true,
  auth_user_id: "login",
  groups: [],
  team_id: null,
  effective_group_joined_at: { stale: "2026-01-01" },
  assignment_context: {
    learning_assignments: [assignment],
    assignment_teams: [
      {
        id: "org",
        name: "Organization",
        learningItems: [{ kind: "course", id: "course" }],
      },
    ],
    effective_group_ids: ["current"],
  },
};
test("authorized computed learning context survives profile mapping without granting reporting authority", () => {
  const user = profile(row);
  assert.equal(user.teamId, undefined);
  assert.deepEqual(user.learningAssignments, [
    { ...assignment, onboardingEnd: undefined },
  ]);
  assert.deepEqual(
    user.assignmentTeams,
    row.assignment_context!.assignment_teams,
  );
  assert.deepEqual(user.effectiveGroupIds, ["current"]);
  assert.equal(user.role, "learner");
});
test("legacy episode projections still filter ended obligations and preserve pending-person identity", () => {
  const user = profile({
    ...row,
    auth_user_id: null,
    assignment_context: undefined,
    learning_assignments: [
      assignment,
      { ...assignment, episodeId: "ended", ended_at: "2026-02-01" },
    ],
  });
  assert.equal(user.registered, false);
  assert.equal(user.learningAssignments!.length, 1);
  assert.deepEqual(user.effectiveGroupIds, ["stale"]);
});
