import test from "node:test";
import assert from "node:assert/strict";
import {
  DEMO_PROFILE_IDS,
  freshWorkspace,
  loadWorkspace,
  saveWorkspace,
} from "../lib/store";
import { withPublishedSnapshots } from "../lib/demo-publication";
import { reconcileLearning } from "../lib/learning-groups";
import {
  assignedCourses,
  isComplete,
  reportTeamIds,
  reportingTeamId,
} from "../lib/types";
import { validateOrganizationTeams } from "../lib/organization-team";
import { learningState } from "../lib/learning";
import { gradeQuiz, optionIds } from "../lib/course-quiz";

const ready = () => {
  const data = withPublishedSnapshots(freshWorkspace());
  return reconcileLearning(data, data, "2026-10-02T12:00:00.000Z");
};

test("Hooli has a valid fixed organization and four selectable profiles", () => {
  const data = ready(),
    teams = data.teams!;
  assert.equal(data.users.length, 200);
  assert.equal(teams.length, 50);
  assert.equal(data.groups.length, 6);
  assert.equal(data.curricula!.length, 4);
  assert.equal(new Set(data.users.map((user) => user.id)).size, 200);
  assert.equal(new Set(data.users.map((user) => user.email)).size, 200);
  validateOrganizationTeams(teams, data.settings!.organizationTeamId);
  assert.deepEqual(
    DEMO_PROFILE_IDS.map(
      (id) => data.users.find((user) => user.id === id)!.role,
    ),
    ["learner", "manager", "contributor", "admin"],
  );
  const root = teams.find((team) => team.system === "organization")!;
  assert.deepEqual(
    teams.filter((team) => team.parentId === root.id).map((team) => team.name),
    ["Sales", "Marketing", "Customer Success", "Solutions Engineering"],
  );
  for (const team of teams) {
    const manager = data.users.find((user) => user.id === team.managerId)!;
    assert.ok(
      manager && manager.active && manager.role !== "learner",
      team.name,
    );
    if (teams.some((child) => child.parentId === team.id)) continue;
    const employees = data.users.filter(
      (user) => user.teamId === team.id && user.id !== manager.id,
    );
    assert.ok(employees.length >= 3 && employees.length <= 6, team.name);
  }
  for (const user of data.users) {
    assert.ok(
      teams.some((team) => team.id === reportingTeamId(user.teamId, teams)),
    );
    assert.ok(user.hireDate);
  }
  assert.equal(
    data.users.filter((user) => user.registered === false).length,
    10,
  );
  const manager = data.users.find((user) => user.id === "demo-manager")!;
  const scope = reportTeamIds(manager, teams);
  assert.equal(scope.size, 13);
  assert.ok(scope.has("sales-team-us-startups"));
  assert.ok(scope.has("sales-team-emea-enterprise"));
  assert.ok(!scope.has("marketing-team"));
  assert.equal(
    reportTeamIds(
      data.users.find((user) => user.id === "demo-contributor")!,
      teams,
    ).size,
    0,
  );
});

test("team-first assignments and cross-team groups deduplicate real demo learning", () => {
  const data = ready();
  assert.ok(
    !data.groups.some(
      (group) => group.name.toLowerCase() === "account executives",
    ),
  );
  for (const id of [
    "startup-learning",
    "emea-learning",
    "customer-facing-learning",
  ]) {
    assert.ok(
      data.groups.find((group) => group.id === id)!.teamIds!.length > 1,
    );
    assert.ok(data.users.every((user) => !user.groups.includes(id)));
  }
  assert.ok(
    data.users.every((user) => !user.groups.includes("guest-recommendations")),
  );
  const alex = data.users.find((user) => user.id === "demo-learner")!;
  const assigned = assignedCourses(data.publishedContent!, alex, data.groups);
  assert.equal(
    assigned.filter((course) => course.id === "course-11").length,
    1,
  );
  const episode = alex.learningAssignments!.find(
    (item) => item.contentId === "course-11",
  )!;
  assert.ok(
    episode.sourceAudiences!.some(
      (source) => source.kind === "team" && source.id === "sales-team",
    ),
  );
  assert.ok(
    episode.sourceAudiences!.some(
      (source) =>
        source.kind === "group" && source.id === "customer-facing-learning",
    ),
  );
  const changed = structuredClone(data);
  changed.groups.find(
    (group) => group.id === "customer-facing-learning",
  )!.learningItems = [];
  const saved = reconcileLearning(data, changed, "2026-10-03T12:00:00.000Z");
  assert.equal(
    saved.users
      .find((user) => user.id === alex.id)!
      .learningAssignments!.find((item) => item.contentId === "course-11")!
      .episodeId,
    episode.episodeId,
  );
  assert.deepEqual(saved.progress[alex.id], data.progress[alex.id]);
});

test("sample histories reference valid lessons and quiz answers with coherent dates", (t) => {
  t.mock.timers.enable({
    apis: ["Date"],
    now: Date.parse("2026-10-02T12:00:00.000Z"),
  });
  const data = ready(),
    statuses = new Set<string>();
  let completions = 0,
    retries = 0,
    optionalInProgress = 0;
  for (const user of data.users) {
    const assigned = assignedCourses(data.publishedContent!, user, data.groups);
    assert.equal(
      new Set(user.learningAssignments!.map((episode) => episode.contentId))
        .size,
      user.learningAssignments!.length,
    );
    assert.equal(assigned.length, user.learningAssignments!.length);
    statuses.add(
      learningState(
        data.publishedContent!,
        user,
        data.groups,
        data.progress[user.id] || [],
        data.settings,
      ).status,
    );
    for (const record of data.progress[user.id] || []) {
      const course = data.publishedContent!.find(
        (item) => item.id === record.content_id,
      )!;
      assert.ok(course && course.version === record.version);
      assert.ok(
        record.lessons.every((id) =>
          course.lessons.some((lesson) => lesson.id === id),
        ),
      );
      const episode = user.learningAssignments!.find(
        (item) => item.contentId === course.id,
      );
      let previous = "";
      for (const attempt of record.attempts || []) {
        assert.ok(attempt.at >= previous);
        assert.ok(attempt.at.slice(0, 10) >= user.hireDate!);
        assert.ok(attempt.at >= course.createdAt!);
        if (episode) assert.ok(attempt.at >= episode.assignedAt);
        assert.ok(attempt.at <= "2026-10-02T23:59:59.999Z");
        const selections = course.questions.map((question) => {
          const answer = attempt.answers!.find(
            (item) => item.questionId === question.id,
          )!;
          assert.ok(answer);
          return answer.optionIds.map((id) => optionIds(question).indexOf(id));
        });
        assert.equal(gradeQuiz(course, selections).passed, attempt.passed);
        previous = attempt.at;
      }
      if (record.passed) {
        assert.ok(isComplete(course, [record]));
        assert.ok(record.attempts?.some((attempt) => attempt.passed));
        completions++;
      }
      if (record.attempts && record.attempts.length > 1) retries++;
      if (!episode && record.lessons.length && !record.passed)
        optionalInProgress++;
    }
  }
  assert.deepEqual([...statuses].sort(), [
    "Complete",
    "Getting started",
    "Needs attention",
    "On track",
  ]);
  assert.ok(completions > 500 && retries > 0 && optionalInProgress > 0);
});

test("new demo storage loads fixed records, retains visitor edits, and resets explicitly", () => {
  const oldStorage = Object.getOwnPropertyDescriptor(
    globalThis,
    "localStorage",
  );
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  try {
    const first = loadWorkspace();
    const original = structuredClone(first);
    assert.deepEqual(
      first.users.map((user) => user.learningAssignments),
      freshWorkspace().users.map((user) => user.learningAssignments),
    );
    assert.deepEqual(loadWorkspace(), first);
    first.users[0].name = "Visitor's sample name";
    saveWorkspace(first);
    assert.equal(loadWorkspace().users[0].name, "Visitor's sample name");
    values.clear();
    assert.deepEqual(loadWorkspace(), original);
    const one = freshWorkspace(),
      two = freshWorkspace();
    one.users[0].name = "Changed copy";
    assert.equal(two.users[0].name, "Alex Edwards");
  } finally {
    if (oldStorage)
      Object.defineProperty(globalThis, "localStorage", oldStorage);
    else delete (globalThis as { localStorage?: Storage }).localStorage;
  }
});
