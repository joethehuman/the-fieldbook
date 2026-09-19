import test from "node:test";
import assert from "node:assert/strict";
import {
  ancestorIds,
  assignedCourses,
  assignmentInfo,
  canParent,
  reportTeamIds,
  isComplete,
} from "../lib/types";
import { freshWorkspace, updateProgress } from "../lib/store";
import { videoSource } from "../lib/video";

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
test("earliest deadline wins and relative deadlines start when membership or assignment begins", () => {
  const d = freshWorkspace();
  const c = {
    ...d.content.find((c) => c.id === "course-1")!,
    assignments: [
      {
        groupId: "sales",
        assignedAt: "2026-09-01T12:00:00Z",
        due: { type: "days" as const, days: 7 },
      },
      {
        groupId: "startup",
        assignedAt: "2026-09-01T12:00:00Z",
        due: { type: "date" as const, date: "2026-09-12" },
      },
    ],
  };
  const groups = [
    ...d.groups,
    { id: "startup", name: "Startup", parentId: "sales" },
  ];
  const u = {
    ...d.users[0],
    groups: ["startup"],
    groupJoinedAt: { startup: "2026-09-10T12:00:00Z" },
  };
  assert.equal(assignmentInfo(c, u, groups).dueDate, "2026-09-12");
  assert.equal(
    assignmentInfo({ ...c, assignments: c.assignments.slice(0, 1) }, u, groups)
      .dueDate,
    "2026-09-17",
  );
  assert.equal(
    assignmentInfo(c, { ...u, groups: [] }, groups).dueDate,
    undefined,
  );
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
