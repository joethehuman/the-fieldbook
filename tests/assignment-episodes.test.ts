import test from "node:test";
import assert from "node:assert/strict";
import {
  rosterDatabase,
  migrate,
  episodeMigration,
  saveRoster,
  value,
} from "./helpers/roster-database";
import { addDays, learningTarget, learningStage } from "../lib/learning";
import {
  assignmentDeadline,
  reviewDeadlines,
  recalculateDeadlines,
  assignmentImpact,
} from "../lib/assignment-episodes";
import { freshWorkspace } from "../lib/store";
import { reconcileLearning } from "../lib/learning-groups";
import { effectiveGroups, assignedCourses } from "../lib/types";
import type { User } from "../lib/types";
const admin = "00000000-0000-4000-8000-000000000001",
  person = "00000000-0000-4000-8000-000000000002",
  login = "00000000-0000-4000-8000-000000000003",
  course = "00000000-0000-4000-8000-000000000004";
const hire = "2026-01-01";
const learner: User = {
  id: person,
  name: "Person",
  email: "person@example.test",
  role: "learner",
  active: true,
  groups: [],
  hireDate: hire,
  onboardingDays: 90,
};
test("90/7 deadlines use the later onboarding end or seven days from assignment, in UTC", () => {
  const dueDays = [
    [60, 90],
    [83, 90],
    [84, 91],
    [89, 96],
    [90, 97],
    [91, 98],
  ];
  for (const [day, due] of dueDays)
    assert.equal(
      assignmentDeadline(addDays(hire, day), learner, 7),
      addDays(hire, due),
    );
  assert.equal(
    learningStage(learner, undefined, addDays(hire, 90)),
    "New user",
  );
  assert.equal(
    learningStage(learner, undefined, addDays(hire, 91)),
    "Existing user",
  );
});
test("demo projects subtree assignments to readers and clears them after a team move", () => {
  const data = freshWorkspace(),
    c = data.content.find((c) => c.kind === "course")!;
  data.content = [c];
  data.publishedContent = [c];
  data.groups = [
    {
      id: "a",
      name: "A",
      teamIds: ["root"],
      teamLinkScope: "subtree",
      learningItems: [{ kind: "course", id: c.id }],
    },
  ];
  data.teams = [
    { id: "root", name: "Root" },
    { id: "child", name: "Child", parentId: "root" },
  ];
  data.users = [{ ...learner, teamId: "child" }];
  const next = reconcileLearning({ ...data, users: [] }, data, hire);
  assert.equal(next.users[0].learningAssignments!.length, 1);
  assert.equal(
    assignedCourses(next.publishedContent!, next.users[0], next.groups).length,
    1,
  );
  const moved = reconcileLearning(
    next,
    { ...next, users: next.users.map((u) => ({ ...u, teamId: undefined })) },
    addDays(hire, 1),
  );
  assert.equal(moved.users[0].learningAssignments!.length, 0);
  assert.equal(
    assignedCourses(moved.publishedContent!, moved.users[0], moved.groups)
      .length,
    0,
  );
});
test("demo preserves one continuous obligation across overlapping sources; removal/rejoin and new versions create new episodes", () => {
  const data = freshWorkspace();
  data.settings!.catchUpDays = 7;
  const c = data.content.find((c) => c.kind === "course")!;
  c.groups = ["a", "b"];
  c.assignments = [
    { groupId: "a", assignedAt: hire, due: { type: "none" } },
    { groupId: "b", assignedAt: hire, due: { type: "none" } },
  ];
  data.content = [c];
  data.publishedContent = [c];
  data.users = [{ ...learner, groups: ["a", "b"] }];
  data.groups = [
    { id: "a", name: "A", learningItems: [{ kind: "course", id: c.id }] },
    { id: "b", name: "B", learningItems: [{ kind: "course", id: c.id }] },
  ];
  let next = reconcileLearning(
    { ...data, users: [] },
    data,
    addDays(hire, 60) + "T00:00:00.000Z",
  );
  const first = next.users[0].learningAssignments![0];
  assert.equal(first.dueDate, addDays(hire, 90));
  next = reconcileLearning(
    next,
    {
      ...next,
      settings: { ...next.settings!, catchUpDays: 30, onboardingDays: 180 },
      users: next.users.map((u) => ({ ...u, groups: ["b"] })),
    },
    addDays(hire, 84) + "T00:00:00.000Z",
  );
  assert.equal(
    next.users[0].learningAssignments![0].episodeId,
    first.episodeId,
  );
  assert.equal(
    learningTarget(c, next.users[0], next.groups, next.settings),
    first.dueDate,
  );
  assert.equal(next.users[0].learningAssignments![0].sourceGroups.length, 1);
  const off = reconcileLearning(
    next,
    { ...next, users: next.users.map((u) => ({ ...u, groups: [] })) },
    addDays(hire, 85) + "T00:00:00.000Z",
  );
  assert.equal(off.users[0].learningAssignments!.length, 0);
  const joined = reconcileLearning(
    off,
    { ...off, users: off.users.map((u) => ({ ...u, groups: ["b"] })) },
    addDays(hire, 91) + "T00:00:00.000Z",
  );
  assert.notEqual(
    joined.users[0].learningAssignments![0].episodeId,
    first.episodeId,
  );
  assert.equal(
    joined.users[0].learningAssignments![0].dueDate,
    addDays(hire, 121),
  );
  const changed = { ...c, version: 2 };
  const version = reconcileLearning(
    joined,
    { ...joined, content: [changed], publishedContent: [changed] },
    addDays(hire, 92) + "T00:00:00.000Z",
  );
  assert.equal(version.users[0].learningAssignments![0].version, 2);
  const disabled = { ...joined.settings!, dueDatesEnabled: false };
  assert.equal(
    learningTarget(c, joined.users[0], joined.groups, disabled),
    undefined,
  );
  const review = reviewDeadlines(next);
  assert.ok(review.clocks.length);
  assert.ok(review.courses.length);
  assert.throws(
    () => recalculateDeadlines({ ...next, revision: 22 }, review.token),
    /changed/,
  );
  const recalculated = recalculateDeadlines(next, review.token);
  assert.equal(recalculated.users[0].onboardingDays, 180);
  assert.equal(
    recalculated.users[0].learningAssignments![0].assignedAt,
    first.assignedAt,
  );
});

test("Postgres backfill, explicit subtree activation, stable deadlines, revision review, pending login and 50,000 obligations", async (t) => {
  const pg = await rosterDatabase();
  try {
    await pg.exec(`insert into auth.users values('${admin}'),('${login}');
      insert into public.fb_profiles(id,auth_user_id,name,email,role) values('${admin}','${admin}','Admin','admin@example.test','admin');
      update public.fb_config set settings=settings||'{"catchUpDays":7,"onboardingDays":90}',groups='[{"id":"a","name":"A","learningItems":[{"kind":"course","id":"${course}"}],"requiredCourseIds":["${course}"],"teamIds":["root"]},{"id":"b","name":"B","learningItems":[{"kind":"course","id":"${course}"}],"requiredCourseIds":["${course}"],"teamIds":[]}]',teams='[{"id":"root","name":"Root"},{"id":"child","name":"Child","parentId":"root"},{"id":"outside","name":"Outside"}]' where id;
      insert into public.fb_profiles(id,name,email,groups,team_id,hire_date,group_joined_at,effective_group_joined_at) values('${person}','Person','person@example.test','["a","b"]','child','2026-01-01','{"a":"2026-01-02T00:00:00Z","b":"2026-02-02T00:00:00Z"}','{"a":"2026-01-02T00:00:00Z","b":"2026-02-02T00:00:00Z"}');
      insert into public.fb_documents(id,draft,published,revision,published_revision) values('${course}','{"id":"${course}","kind":"course","title":"Course","status":"published","version":1,"lessons":[]}','{"id":"${course}","kind":"course","title":"Course","status":"published","version":1,"lessons":[]}',1,1);
      alter table public.fb_documents disable trigger fb_assignment_guard;
      update public.fb_documents set published=jsonb_set(published,'{assignments}','[{"groupId":"a","assignedAt":"2026-01-01T00:00:00Z","due":{"type":"none"}},{"groupId":"b","assignedAt":"2026-03-01T00:00:00Z","due":{"type":"none"}}]');
      alter table public.fb_documents enable trigger fb_assignment_guard;`);
    await migrate(pg, episodeMigration);
    const active = () =>
      value(pg, "select public.fb_person_assignments($1) as value", [person]);
    const first = (await active())[0];
    assert.equal(first.assignedAt, "2026-01-02T00:00:00.000Z");
    assert.equal(first.dueDate, "2026-04-01");
    assert.equal(first.baseline, true);
    for (const [day, due] of [
      [60, 90],
      [83, 90],
      [84, 91],
      [89, 96],
      [90, 97],
    ])
      assert.equal(
        await value(
          pg,
          "select public.fb_assignment_due($1,'2026-01-01',90,7)::text as value",
          [addDays(hire, day) + "T23:59:59Z"],
        ),
        addDays(hire, due),
      );
    await t.test(
      "overlap, last source, rejoin and version preserve completion",
      async () => {
        await saveRoster(pg, admin, (d) => {
          d.users.find((p: any) => p.id === person).groups = ["b"];
        });
        assert.equal((await active())[0].episodeId, first.episodeId);
        assert.equal((await active())[0].dueDate, first.dueDate);
        await saveRoster(pg, admin, (d) => {
          d.users.find((p: any) => p.id === person).groups = [];
        });
        assert.equal((await active()).length, 0);
        assert.equal(
          await value(
            pg,
            "select count(*)::int as value from public.fb_assignment_episodes where user_id=$1 and ended_at is not null",
            [person],
          ),
          1,
        );
        await pg.exec(
          `insert into public.fb_progress(user_id,content_id,version,lessons,passed) values('${person}','${course}',1,'[]',true);`,
        );
        await saveRoster(pg, admin, (d) => {
          d.users.find((p: any) => p.id === person).groups = ["b"];
        });
        const rejoined = (await active())[0];
        assert.notEqual(rejoined.episodeId, first.episodeId);
        assert.equal(rejoined.dueDate, addDays(rejoined.assignedAt, 7));
        assert.equal(
          await value(
            pg,
            "select passed as value from public.fb_progress where user_id=$1 and content_id=$2 and version=1",
            [person, course],
          ),
          true,
        );
        await pg.exec(
          `update public.fb_documents set published=jsonb_set(published,'{version}','2'),draft=jsonb_set(draft,'{version}','2') where id='${course}';`,
        );
        assert.equal((await active())[0].version, 2);
      },
    );
    await t.test(
      "legacy reach remains limited until a reviewed expansion; descendants follow branch moves",
      async () => {
        await saveRoster(pg, admin, (d) => {
          d.users.find((p: any) => p.id === person).groups = [];
        });
        assert.equal((await active()).length, 0);
        await saveRoster(pg, admin, (d) => {
          d.groups[0].teamLinkScope = "subtree";
        });
        assert.equal((await active()).length, 1);
        const stored = (await active())[0];
        await saveRoster(pg, admin, (d) => {
          d.users.find((p: any) => p.id === person).groups = ["b"];
          d.teams.find((x: any) => x.id === "child").parentId = "outside";
        });
        assert.equal(
          (await active())[0].episodeId,
          stored.episodeId,
          "membership and hierarchy changes reconcile atomically without briefly dropping coverage",
        );
        await saveRoster(pg, admin, (d) => {
          d.users.find((p: any) => p.id === person).groups = [];
        });
        assert.equal((await active()).length, 0);
        await saveRoster(pg, admin, (d) => {
          d.teams.find((x: any) => x.id === "child").parentId = "root";
        });
        assert.equal((await active()).length, 1);
        await assert.rejects(
          saveRoster(pg, admin, (d) => {
            d.teams[0].parentId = "child";
          }),
          /cycle/i,
        );
        await assert.rejects(
          saveRoster(pg, admin, (d) => {
            d.teams[1].name = "Root";
          }),
          /unique/i,
        );
        await assert.rejects(
          saveRoster(pg, admin, (d) => {
            d.groups[0].name = "B";
          }),
          /unique/i,
        );
      },
    );
    await t.test(
      "future defaults and deadline toggle never reset saved obligations; recalc is reviewed and stale-safe",
      async () => {
        const stored = (await active())[0];
        await pg.exec(
          `update public.fb_config set settings=settings||'{"onboardingDays":180,"catchUpDays":30,"dueDatesEnabled":false}',revision=revision+1 where id;`,
        );
        assert.equal((await active())[0].dueDate, stored.dueDate);
        const review = await value(
          pg,
          "select public.fb_review_deadlines($1) as value",
          [admin],
        );
        assert.ok(review.clocks.length);
        assert.ok(review.courses.length);
        await pg.exec(
          `update public.fb_config set revision=revision+1 where id;`,
        );
        await assert.rejects(
          pg.query("select public.fb_review_deadlines($1,true,$2)", [
            admin,
            review.token,
          ]),
          /changed/,
        );
        assert.equal((await active())[0].dueDate, stored.dueDate);
        const fresh = await value(
          pg,
          "select public.fb_review_deadlines($1) as value",
          [admin],
        );
        await pg.query("select public.fb_review_deadlines($1,true,$2)", [
          admin,
          fresh.token,
        ]);
        assert.equal((await active())[0].assignedAt, stored.assignedAt);
        assert.equal((await active())[0].catchUpDays, 30);
        assert.equal(
          await value(
            pg,
            "select onboarding_days as value from public.fb_profiles where id=$1",
            [person],
          ),
          180,
        );
        await assert.rejects(
          pg.query("select public.fb_review_deadlines($1)", [person]),
          /Administrator/,
        );
        assert.equal(
          await value(
            pg,
            "select has_table_privilege('authenticated','public.fb_assignment_episodes','select') as value",
          ),
          false,
        );
        assert.equal(
          await value(
            pg,
            "select has_function_privilege('authenticated','public.fb_review_deadlines(uuid,boolean,text)','execute') as value",
          ),
          false,
        );
      },
    );
    await t.test(
      "completion invalidates a review and completed deadlines remain fixed",
      async () => {
        const before = (await active())[0];
        await pg.exec(
          `update public.fb_config set settings=settings||'{"onboardingDays":210,"catchUpDays":120}',revision=revision+1 where id;`,
        );
        const old = await value(
          pg,
          "select public.fb_review_deadlines($1) as value",
          [admin],
        );
        assert.ok(old.courses.some((c: any) => c.personId === person));
        await pg.exec(
          `insert into public.fb_progress(user_id,content_id,version,lessons,passed) values('${person}','${course}',2,'[]',true);`,
        );
        await assert.rejects(
          pg.query("select public.fb_review_deadlines($1,true,$2)", [
            admin,
            old.token,
          ]),
          /changed/,
        );
        const fresh = await value(
          pg,
          "select public.fb_review_deadlines($1) as value",
          [admin],
        );
        assert.ok(!fresh.courses.some((c: any) => c.personId === person));
        await pg.query("select public.fb_review_deadlines($1,true,$2)", [
          admin,
          fresh.token,
        ]);
        assert.deepEqual((await active())[0], before);
        assert.equal(
          await value(
            pg,
            "select passed as value from public.fb_progress where user_id=$1 and content_id=$2 and version=2",
            [person, course],
          ),
          true,
        );
      },
    );
    await t.test(
      "first verified login attaches to the pending person without resetting assignments",
      async () => {
        const before = (await active())[0];
        const activation = await value(
          pg,
          "select public.fb_register_profile($1,'person@example.test','Login Name',false) as value",
          [login],
        );
        assert.equal(
          activation.learning_assignments[0].episodeId,
          before.episodeId,
        );
        assert.equal((await active())[0].episodeId, before.episodeId);
        assert.equal((await active())[0].dueDate, before.dueDate);
        const full = await value(
          pg,
          "select public.fb_governance_snapshot($1) as value",
          [admin],
        );
        assert.equal(
          full.users.find((p: any) => p.id === person).learning_assignments
            .length,
          1,
        );
        const compact = await value(
          pg,
          "select public.fb_admin_people_snapshot($1) as value",
          [admin],
        );
        assert.equal(
          compact.users.find((p: any) => p.id === person).learning_assignments,
          undefined,
          "People stays compact",
        );
      },
    );
    await t.test(
      "500 people and 100 courses reconcile into 50,000 deduplicated obligations",
      async () => {
        await pg.exec(`select set_config('fieldbook.learning_batch','on',true);
        update public.fb_profiles set groups='[]',team_id=null;
        insert into public.fb_profiles(id,name,email,groups) select gen_random_uuid(),'Synthetic person '||n,'synthetic-'||n||'@example.test','["scale"]' from generate_series(1,500) n;
        insert into public.fb_documents(id,draft,published,revision,published_revision)
        select gen_random_uuid(),jsonb_build_object('kind','course','title','Scale course '||n,'status','published','version',1,'lessons','[]'::jsonb),jsonb_build_object('kind','course','title','Scale course '||n,'status','published','version',1,'lessons','[]'::jsonb),1,1 from generate_series(1,100) n;
        update public.fb_config set groups=jsonb_build_array(jsonb_build_object('id','scale','name','Scale','teamIds','[]'::jsonb,'teamLinkScope','subtree','learningItems',(select jsonb_agg(jsonb_build_object('kind','course','id',id)) from public.fb_documents where published->>'title' like 'Scale course %'))) where id;
        select public.fb_sync_learning(); select set_config('fieldbook.learning_batch','',true);`);
        assert.equal(
          await value(
            pg,
            "select count(*)::int as value from public.fb_assignment_episodes where ended_at is null",
          ),
          50000,
        );
        await pg.exec("select public.fb_reconcile_assignments();");
        assert.equal(
          await value(
            pg,
            "select count(*)::int as value from public.fb_assignment_episodes where ended_at is null",
          ),
          50000,
        );
        const result = await value(
          pg,
          "select public.fb_admin_people_snapshot($1) as value",
          [admin],
        );
        assert.equal(result.users.length, 502);
        assert.equal(result.progress.length, 0);
      },
    );
  } finally {
    await pg.close();
  }
});
