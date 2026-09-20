import test from "node:test";
import assert from "node:assert/strict";
import {
  ancestorIds,
  assignedCourses,
  canParent,
  reportTeamIds,
  isComplete,
} from "../lib/types";
import { DEMO_PROFILE_IDS, freshWorkspace, updateProgress } from "../lib/store";
import { learningTarget } from "../lib/learning";
import { videoSource } from "../lib/video";

test("demo presents three personas and a five-rep manager team with varied completion", () => {
  const d = freshWorkspace();
  assert.deepEqual(DEMO_PROFILE_IDS, ["demo-learner", "demo-manager", "demo-admin"]);
  const manager = d.users.find((u) => u.id === "demo-manager")!;
  const teamIds = reportTeamIds(manager, d.teams || []);
  const reps = d.users.filter((u) => u.role === "learner" && u.teamId && teamIds.has(u.teamId));
  assert.equal(reps.length, 5);
  assert.deepEqual(
    reps.map((u) => assignedCourses(d.content, u, d.groups).filter((c) => isComplete(c, d.progress[u.id] || [])).length).sort(),
    [0, 1, 1, 2, 3],
  );
  assert.ok(reps.every((u) => assignedCourses(d.content, u, d.groups).length === 3));
});

test("nested memberships inherit assignments once and preserve full library access", () => {
  const d = freshWorkspace();
  const u = { ...d.users[0], groups: ["startup", "sales"] };
  const groups = [
    ...d.groups,
    { id: "startup", name: "Startup", parentId: "sales" },
  ];
  assert.equal(assignedCourses(d.content, u, groups).length, 3);
  assert.equal(
    assignedCourses(d.content, { ...u, groups: ["startup"] }, groups).length,
    3,
  );
  assert.equal(
    d.content.filter((c) => c.kind === "course" && c.status === "published")
      .length,
    6,
  );
});
test("catch-up starts at the later membership or group requirement date, using the earliest continuing source", () => {
  const d = freshWorkspace();
  const c = {
    ...d.content.find((c) => c.id === "course-1")!,
    assignments: [
      {
        groupId: "sales",
        assignedAt: "2026-09-01T12:00:00Z",
        due: { type: "none" as const },
      },
      {
        groupId: "startup",
        assignedAt: "2026-09-15T12:00:00Z",
        due: { type: "none" as const },
      },
    ],
  };
  const groups = [
    ...d.groups,
    { id: "startup", name: "Startup", parentId: "sales" },
  ];
  const u = {
    ...d.users[0],
    onboardingStart: undefined,
    groups: ["startup"],
    groupJoinedAt: { startup: "2026-09-10T12:00:00Z" },
  };
  assert.equal(learningTarget(c, u, groups), "2026-10-10");
  assert.equal(
    learningTarget({ ...c, assignments: c.assignments.slice(1) }, u, groups),
    "2026-10-15",
  );
  assert.equal(learningTarget(c, { ...u, groups: [] }, groups), undefined);
});
test("team manager can report on descendants, not siblings or ancestors", () => {
  const d = freshWorkspace();
  const u = { ...d.users[0], role: "manager" as const };
  const teams = [
    { id: "root", name: "Root" },
    { id: "a", name: "A", parentId: "root", managerId: u.id },
    { id: "b", name: "B", parentId: "root" },
    { id: "a1", name: "A1", parentId: "a" },
  ];
  assert.deepEqual([...reportTeamIds(u, teams)].sort(), ["a", "a1"]);
  assert.deepEqual([...reportTeamIds({ ...u, id: "outsider" }, teams)], []);
  assert.equal(reportTeamIds({ ...u, role: "admin" }, teams).size, 4);
  assert.equal(canParent("a", "a1", teams), false);
  assert.equal(canParent("a", "b", teams), true);
  assert.deepEqual(
    [
      ...ancestorIds("a", [
        { id: "a", parentId: "b" },
        { id: "b", parentId: "a" },
      ]),
    ],
    ["a", "b"],
  );
});
test("retakes record attempts without revoking completion", () => {
  let d = freshWorkspace();
  const c = d.content.find((c) => c.id === "course-1")!;
  const u = d.users[0];
  d = updateProgress(d, u.id, c, undefined, [99, 99]);
  assert.equal(isComplete(c, d.progress[u.id]), true);
  assert.equal(d.progress[u.id][0].attempts?.[0].passed, false);
  assert.equal(d.progress[u.id][0].attempts?.length, 1);
});
test("video embeds accept recognized providers and reject unsafe or arbitrary iframe URLs", () => {
  assert.deepEqual(videoSource("https://youtu.be/dQw4w9WgXcQ"), {
    type: "embed",
    url: "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  });
  assert.equal(
    videoSource("https://vimeo.com/123456789")?.url,
    "https://player.vimeo.com/video/123456789",
  );
  assert.equal(
    videoSource("https://example.com/lesson.mp4?signature=abc")?.type,
    "file",
  );
  assert.equal(videoSource("javascript:alert(1)"), null);
  assert.equal(
    videoSource("https://youtube.com.attacker.test/embed/dQw4w9WgXcQ"),
    null,
  );
  assert.equal(videoSource("https://example.com/page"), null);
});
