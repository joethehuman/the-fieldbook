import assert from "node:assert/strict";
import test from "node:test";
import { reportingImpact } from "../lib/assignment-episodes";
import { flattenLearningGroups } from "../lib/group-conversion";
import { groupMembershipSources } from "../lib/group-hierarchy";
import { guestRecommendations } from "../lib/guest-recommendations";
import { requiredSequence } from "../lib/learning";
import { freshWorkspace, type Workspace } from "../lib/store";
import { teamDeletionBlockers } from "../lib/team-hierarchy";
import {
  assignedCourses,
  effectiveGroups,
  groupIncludesTeam,
  groupTeamLinks,
} from "../lib/types";

const admin = "00000000-0000-4000-8000-000000000001";
const person = "00000000-0000-4000-8000-000000000002";
const legacy = "00000000-0000-4000-8000-000000000003";
const branchPerson = "00000000-0000-4000-8000-000000000004";
const individual = "00000000-0000-4000-8000-000000000005";
const course = "00000000-0000-4000-8000-000000000011";
const childCourse = "00000000-0000-4000-8000-000000000012";
const update = "00000000-0000-4000-8000-000000000013";

function fixture(): Workspace {
  const data = freshWorkspace();
  const base = data.content.find((c) => c.kind === "course")!;
  data.settings!.access = "public";
  data.settings!.guestGroupId = "child";
  data.groups = [
    {
      id: "child",
      name: "A child",
      parentId: "parent",
      teamIds: ["branch"],
      teamLinkScope: "subtree",
      learningItems: [{ kind: "course", id: childCourse }],
      requiredCourseIds: [childCourse],
    },
    {
      id: "parent",
      name: "Z parent",
      teamIds: ["legacy"],
      teamLinkScope: "direct",
      learningItems: [{ kind: "course", id: course }],
      requiredCourseIds: [course],
    },
  ];
  data.teams = [
    { id: "branch", name: "Branch" },
    { id: "leaf", name: "Leaf", parentId: "branch" },
    { id: "legacy", name: "Legacy" },
    { id: "legacy-leaf", name: "Legacy leaf", parentId: "legacy" },
  ];
  data.content = [
    {
      ...base,
      id: course,
      title: "Foundation",
      groups: ["parent"],
      assignments: [
        {
          groupId: "parent",
          assignedAt: "2026-01-01T00:00:00Z",
          due: { type: "none" },
        },
      ],
    },
    {
      ...base,
      id: childCourse,
      title: "Child learning",
      groups: ["child"],
      assignments: [
        {
          groupId: "child",
          assignedAt: "2026-01-02T00:00:00Z",
          due: { type: "none" },
        },
      ],
    },
    {
      ...base,
      kind: "brief",
      id: update,
      title: "Foundation update",
      groups: ["parent"],
      assignments: [],
    },
  ];
  data.publishedContent = structuredClone(data.content);
  const user = data.users[0];
  data.users = [
    {
      ...user,
      id: person,
      groups: ["child"],
      teamId: "leaf",
      groupJoinedAt: { child: "2026-02-01T00:00:00Z" },
      effectiveGroupJoinedAt: {
        child: "2026-02-01T00:00:00Z",
        parent: "2026-02-01T00:00:00Z",
      },
      learningAssignments: [
        {
          episodeId: "fixed",
          contentId: course,
          version: base.version,
          assignedAt: "2026-02-01T00:00:00Z",
          dueDate: "2026-05-01",
          catchUpDays: 7,
          sourceGroups: ["parent"],
        },
      ],
    },
    {
      ...user,
      id: legacy,
      groups: [],
      teamId: "legacy",
      learningAssignments: [],
    },
    {
      ...user,
      id: branchPerson,
      groups: [],
      teamId: "legacy-leaf",
      learningAssignments: [],
    },
  ];
  data.progress = {
    [person]: [
      { content_id: course, version: base.version, lessons: [], passed: true },
    ],
  };
  return data;
}

test("flat conversion preserves people and dynamic mixed-scope team sources without broadening legacy links", () => {
  const before = fixture();
  const next = flattenLearningGroups(before);
  assert.deepEqual(
    next.groups.map((g) => g.id),
    ["parent", "child"],
  );
  assert.ok(next.groups.every((g) => !g.parentId && !g.teamLinkScope));
  assert.deepEqual(groupTeamLinks(next.groups[0]), [
    { teamId: "legacy", scope: "direct" },
    { teamId: "branch", scope: "subtree" },
  ]);
  assert.equal(
    groupIncludesTeam(next.groups[0], "legacy-leaf", next.teams),
    false,
  );
  assert.deepEqual(next.users[0].groups, ["child", "parent"]);
  assert.deepEqual(
    [...effectiveGroups(next.users[0], next.groups, next.teams)].sort(),
    ["child", "parent"],
  );
  assert.deepEqual(
    next.users[0].learningAssignments!.find((a) => a.episodeId === "fixed")
      ?.dueDate,
    "2026-05-01",
  );
  assert.deepEqual(next.progress, before.progress);
  assert.deepEqual(
    requiredSequence(next.content, next.users[0], next.groups).map((c) => c.id),
    [course, childCourse],
  );
  assert.equal(flattenLearningGroups(next), next);
  const fresh = {
    ...next.users[0],
    id: "new",
    groups: ["child"],
    teamId: undefined,
    effectiveGroupIds: undefined,
  };
  assert.deepEqual(
    [...effectiveGroups(fresh, next.groups, next.teams)],
    ["child"],
  );
  const future = { ...fresh, groups: [], teamId: "new-leaf" };
  assert.deepEqual(
    [
      ...effectiveGroups(future, next.groups, [
        ...next.teams!,
        { id: "new-leaf", name: "New leaf", parentId: "branch" },
      ]),
    ],
    ["parent", "child"],
  );
  assert.equal(teamDeletionBlockers(next, "legacy").groups.length, 1);
});
test("chosen guest recommendations become explicit and flat source explanations identify removable sources", () => {
  const next = flattenLearningGroups(fixture());
  const guest = guestRecommendations(next);
  assert.deepEqual(
    requiredSequence(guest.content, guest.user, guest.groups).map((c) => c.id),
    [course, childCourse],
  );
  assert.equal(guest.content.find((c) => c.id === update)?.groups.length, 1);
  const person = { ...next.users[0], groups: ["parent"] };
  assert.deepEqual(groupMembershipSources(person, "parent", next), [
    "Individually added",
    "Branch (includes subteams)",
  ]);
  next.groups[0].teamIds!.push("leaf");
  assert.deepEqual(groupMembershipSources(person, "parent", next), [
    "Individually added",
    "Branch (includes subteams)",
    "Branch / Leaf (includes subteams)",
  ]);
  assert.equal(
    assignedCourses(next.content, person, next.groups).filter(
      (c) => c.id === course,
    ).length,
    1,
  );
});

test("contributor team reporting participates in organization review without learning groups granting scope", () => {
  const before = flattenLearningGroups(fixture());
  before.users[0].role = "contributor";
  before.users[0].registered = true;
  before.teams!.find((t) => t.id === "branch")!.managerId = before.users[0].id;
  const after = structuredClone(before);
  after.teams!.find((t) => t.id === "legacy")!.parentId = "branch";
  const rows = reportingImpact(before, after);
  assert.equal(
    rows.filter(
      (r) =>
        r.manager.id === before.users[0].id &&
        r.change === "Reporting access added",
    ).length,
    2,
  );
  const groupsOnly = structuredClone(before);
  groupsOnly.users[0].groups.push("parent");
  assert.deepEqual(reportingImpact(before, groupsOnly), []);
});
