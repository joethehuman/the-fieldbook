import test from "node:test";
import assert from "node:assert/strict";
import { guestFixture } from "./guest-fixture";
import { guestRecommendations } from "../lib/guest-recommendations";
import { assignedCourses, effectiveGroups } from "../lib/types";
import {
  requiredSequence,
  learningState,
  learningTarget,
  completionPercent,
} from "../lib/learning";
import { assignedLearningCards } from "../lib/learning-cards";
import { updatesForUser, reconcileLearning } from "../lib/learning-groups";
import { settingsSchema } from "../production/lib/schemas";
import { publicSettings } from "../lib/settings";

test("anonymous recommendations inherit parents, expand curricula and deduplicate without membership or deadlines", () => {
  const data = guestFixture(),
    before = JSON.stringify(data),
    p = guestRecommendations(data);
  assert.equal(requiredSequence(p.content, p.user, p.groups).length, 2);
  assert.equal(assignedCourses(p.content, p.user, p.groups).length, 2);
  assert.equal(
    assignedLearningCards(
      p.content.filter((c) =>
        assignedCourses(p.content, p.user, p.groups).includes(c),
      ),
      p.curricula,
      p.user,
      p.groups,
    )[0].kind,
    "curriculum",
  );
  assert.deepEqual(
    updatesForUser(p.content, p.user, p.groups).forYou.map((c) => c.title),
    ["Recommended update"],
  );
  assert.equal(p.content.length, 5);
  const course = assignedCourses(p.content, p.user, p.groups)[0];
  const progress = [
    {
      content_id: course.id,
      version: course.version,
      lessons: ["lesson"],
      passed: true,
    },
  ];
  const state = learningState(
    p.content,
    p.user,
    p.groups,
    progress,
    data.settings,
  );
  assert.equal(state.required.length, 2);
  assert.equal(state.remaining.length, 1);
  assert.equal(completionPercent(1, 2), 50);
  assert.deepEqual(state.overdue, []);
  assert.equal(state.target, undefined);
  assert.equal(
    learningTarget(
      course,
      { ...p.user, onboardingStart: "2020-01-01" },
      p.groups,
      data.settings,
    ),
    undefined,
  );
  assert.equal(JSON.stringify(data), before);
  const serialized = JSON.stringify(p);
  for (const secret of [
    "Broader learning group",
    '"visitors"',
    '"foundation"',
    "sales-team",
    "groupJoinedAt",
    "assignedAt",
    "guestGroupId",
  ])
    assert.ok(!serialized.includes(secret), secret);
  assert.equal(
    data.users.some((u) => u.id === "guest"),
    false,
  );
  const account = data.users[0];
  assert.deepEqual([...effectiveGroups(account, data.groups)], ["account"]);
  assert.deepEqual(
    assignedCourses(data.content, account, data.groups).map((c) => c.title),
    ["Optional course"],
  );
});
test("old public settings, missing groups and private mode never substitute the catalog as For you", () => {
  const data = guestFixture();
  for (const id of [undefined, null, "deleted"]) {
    data.settings!.guestGroupId = id;
    const p = guestRecommendations(data);
    assert.equal(p.content.length, 5);
    assert.equal(p.groups.length, 0);
    assert.equal(assignedCourses(p.content, p.user, p.groups).length, 0);
    assert.equal(updatesForUser(p.content, p.user, p.groups).forYou.length, 0);
  }
  delete data.settings!.guestGroupId;
  assert.equal(settingsSchema.safeParse(data.settings).success, true);
  data.settings!.guestGroupId = "visitors";
  data.settings!.access = "private";
  assert.equal(guestRecommendations(data).content.length, 0);
  assert.equal(guestRecommendations(data).groups.length, 0);
  assert.equal(publicSettings(data.settings!).guestGroupId, undefined);
  data.settings!.access = "public";
  assert.equal(guestRecommendations(data).groups.length, 1);
});
test("publication, removal, curriculum and hierarchy changes recalculate without touching people or reports", () => {
  const before = guestFixture(),
    data = structuredClone(before);
  data.content[1].status = "draft";
  let p = guestRecommendations(data);
  assert.equal(assignedCourses(p.content, p.user, p.groups).length, 1);
  assert.equal(p.curricula[0].courseIds.length, 1);
  data.content = data.content.filter((c) => c.kind !== "brief");
  assert.equal(
    updatesForUser(guestRecommendations(data).content, p.user, p.groups).forYou
      .length,
    0,
  );
  data.curricula![0].status = "draft";
  const saved = reconcileLearning(before, data);
  p = guestRecommendations(saved);
  assert.equal(p.curricula.length, 0);
  assert.equal(assignedCourses(p.content, p.user, p.groups).length, 1);
  data.groups = data.groups.filter((g) => g.id !== "visitors");
  assert.equal(guestRecommendations(data).groups.length, 0);
  assert.deepEqual(data.users, before.users);
  assert.deepEqual(data.progress, before.progress);
});
