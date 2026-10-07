import assert from "node:assert/strict";
import test from "node:test";
import {
  learningStage,
  learningState,
  onboardingClockTarget,
} from "../lib/learning";
import { defaultSettings } from "../lib/settings";
import type { User } from "../lib/types";
import { database, seedProfile } from "./helpers/database.mjs";

const admin = "00000000-0000-4000-8000-000000000001";
const learner = "00000000-0000-4000-8000-000000000002";
const login = "00000000-0000-4000-8000-000000000003";
const course = "00000000-0000-4000-8000-000000000004";
test("onboarding stage expires after the applied window, independent of due dates or login", () => {
  const user: User = {
    id: learner,
    name: "Learner",
    email: "learner@example.test",
    role: "learner",
    active: true,
    groups: [],
    registered: false,
    hireDate: "2026-01-01",
    onboardingDays: 45,
  };
  assert.equal(onboardingClockTarget(user), "2026-02-15");
  assert.equal(learningStage(user, defaultSettings, "2026-02-15"), "New user");
  assert.equal(
    learningStage(user, defaultSettings, "2026-02-16"),
    "Existing user",
  );
  const changed = {
    ...defaultSettings,
    onboardingDays: 90,
    dueDatesEnabled: false,
  };
  assert.equal(learningStage(user, changed, "2026-02-16"), "Existing user");
  assert.equal(onboardingClockTarget(user, changed), "2026-02-15");
  assert.equal(
    learningStage({ ...user, hireDate: undefined }, changed),
    "Existing user",
  );
  assert.equal(
    onboardingClockTarget({
      ...user,
      hireDate: undefined,
      onboardingStart: "2026-01-01",
    }),
    "2026-02-15",
  );
  assert.equal(learningState([], user, [], [], changed).onboarding, false);
  assert.equal(onboardingClockTarget({ ...user, id: "guest" }), undefined);
});

test("preregistered login retains its stable profile, role, onboarding clock and saved progress", async () => {
  const pg = await database();
  try {
    const admin = crypto.randomUUID(),
      pending = crypto.randomUUID(),
      login = crypto.randomUUID(),
      course = crypto.randomUUID();
    await seedProfile(pg, admin, { role: "admin" });
    await seedProfile(pg, pending, {
      registered: false,
      role: "manager",
      email: "pending@example.test",
      name: "Roster name",
    });
    await pg.query(
      "update fb_profiles set hire_date='2026-01-01',onboarding_days=45 where id=$1",
      [pending],
    );
    await pg.query(
      "insert into fb_documents(id,draft,published,published_revision) values($1,$2,$2,1)",
      [
        course,
        {
          kind: "course",
          title: "Course",
          version: 1,
          lessons: [{ id: "one" }],
        },
      ],
    );
    await pg.query(
      "insert into fb_progress(user_id,content_id,version,lessons,passed) values($1,$2,1,'[\"one\"]',true)",
      [pending, course],
    );
    await pg.exec(
      'update fb_config set settings=settings||\'{"registration":"closed"}\'',
    );
    await pg.query("insert into auth.users(id) values($1)", [login]);
    const joined = (
      await pg.query<{ person: any }>(
        "select to_jsonb(fb_register_profile($1,'PENDING@example.test','Google name',false)) person",
        [login],
      )
    ).rows[0].person;
    assert.equal(joined.id, pending);
    assert.equal(joined.auth_user_id, login);
    assert.equal(joined.role, "manager");
    assert.equal(joined.name, "Roster name");
    assert.equal(joined.onboarding_days, 45);
    assert.equal(joined.hire_date, "2026-01-01");
    assert.equal(
      (
        await pg.query<{ passed: boolean }>(
          "select passed from fb_progress where user_id=$1",
          [pending],
        )
      ).rows[0].passed,
      true,
    );
    const other = crypto.randomUUID();
    await pg.query("insert into auth.users(id) values($1)", [other]);
    await assert.rejects(
      pg.query(
        "select fb_register_profile($1,'unknown@example.test','Unknown',false)",
        [other],
      ),
      /registration is closed/,
    );
  } finally {
    await pg.close();
  }
});

test("normalized account email uniqueness rejects duplicate identities without overwriting saved profiles", async () => {
  const pg = await database();
  try {
    const first = crypto.randomUUID();
    await seedProfile(pg, first, {
      registered: false,
      email: "person@example.test",
      name: "Saved name",
    });
    await assert.rejects(
      seedProfile(pg, crypto.randomUUID(), {
        registered: false,
        email: "PERSON@example.test",
        name: "Another name",
      }),
      /duplicate key/,
    );
    assert.equal(
      (
        await pg.query<{ name: string }>(
          "select name from fb_profiles where id=$1",
          [first],
        )
      ).rows[0].name,
      "Saved name",
    );
  } finally {
    await pg.close();
  }
});
