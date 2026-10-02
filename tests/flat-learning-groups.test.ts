import test from "node:test";
import assert from "node:assert/strict";
import { freshWorkspace, type Workspace } from "../lib/store";
import { flattenLearningGroups } from "../lib/group-conversion";
import {
  effectiveGroups,
  groupIncludesTeam,
  groupTeamLinks,
  assignedCourses,
} from "../lib/types";
import { groupMembershipSources } from "../lib/group-hierarchy";
import { teamDeletionBlockers } from "../lib/team-hierarchy";
import { reportingImpact } from "../lib/assignment-episodes";
import { requiredSequence } from "../lib/learning";
import { guestRecommendations } from "../lib/guest-recommendations";
import {
  rosterDatabase,
  migrate,
  episodeMigration,
  contributorMigration,
  flatGroupMigration,
  saveRoster,
  value,
} from "./helpers/roster-database";

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

test("Postgres atomic flattening preserves coverage, deadlines, relevance, recovery and scoped access; future groups are independent", async (t) => {
  const pg = await rosterDatabase();
  try {
    await pg.exec(`insert into auth.users values('${admin}');
      insert into public.fb_profiles(id,auth_user_id,name,email,role) values('${admin}','${admin}','Admin','admin@example.test','admin');
      update public.fb_config set settings=settings||'{"catchUpDays":7,"onboardingDays":90,"guestGroupId":"child","access":"public"}',
       groups='[{"id":"child","name":"A child","parentId":"parent","teamIds":["branch"],"learningItems":[{"kind":"course","id":"${childCourse}"}],"requiredCourseIds":["${childCourse}"]},{"id":"parent","name":"Z parent","teamIds":["legacy","unused"],"learningItems":[{"kind":"course","id":"${course}"}],"requiredCourseIds":["${course}"]}]',
       teams='[{"id":"branch","name":"Branch"},{"id":"leaf","name":"Leaf","parentId":"branch"},{"id":"legacy","name":"Legacy"},{"id":"legacy-leaf","name":"Legacy leaf","parentId":"legacy"},{"id":"unused","name":"Unused linked team"}]' where id;
      insert into public.fb_profiles(id,name,email,groups,team_id,group_joined_at,effective_group_joined_at) values
       ('${person}','Child member','child@example.test','["child"]','leaf','{"child":"2026-02-01T00:00:00Z"}','{"child":"2026-02-01T00:00:00Z","parent":"2026-02-01T00:00:00Z"}'),
       ('${legacy}','Direct member','direct@example.test','[]','legacy','{}','{"parent":"2026-02-01T00:00:00Z"}'),
       ('${branchPerson}','Legacy subteam','subteam@example.test','[]','legacy-leaf','{}','{}');
      insert into public.fb_documents(id,draft,published,revision,published_revision) values
       ('${course}','{"id":"${course}","kind":"course","title":"Foundation","version":1,"status":"published","lessons":[]}','{"id":"${course}","kind":"course","title":"Foundation","version":1,"status":"published","lessons":[]}',1,1),
       ('${childCourse}','{"id":"${childCourse}","kind":"course","title":"Child","version":1,"status":"published","lessons":[]}','{"id":"${childCourse}","kind":"course","title":"Child","version":1,"status":"published","lessons":[]}',1,1),
       ('${update}','{"id":"${update}","kind":"brief","title":"Update","version":1,"status":"published","groups":["parent"]}','{"id":"${update}","kind":"brief","title":"Update","version":1,"status":"published","groups":["parent"]}',1,1);
      insert into public.fb_progress(user_id,content_id,version,passed) values('${person}','${course}',1,true);
      insert into public.fb_deleted_items(entity,id,name,revision,deleted_by,snapshot) values('user','${individual}','Deleted',1, '${admin}', '{"groups":["child"],"group_joined_at":{"child":"2026-01-01T00:00:00Z"},"effective_group_joined_at":{"child":"2026-01-01T00:00:00Z","parent":"2026-01-01T00:00:00Z"}}');`);
    await migrate(pg, episodeMigration);
    await saveRoster(pg, admin, (d) => {
      d.groups.find((g: any) => g.id === "child").teamLinkScope = "subtree";
    });
    const episodes = await pg.query(
      "select id,started_at,due_date,ended_at from public.fb_assignment_episodes order by id",
    );
    const memberships = await pg.query(
      "select id,effective_group_joined_at from public.fb_profiles order by id",
    );
    await migrate(pg, contributorMigration);
    await migrate(pg, flatGroupMigration);
    assert.deepEqual(
      (
        await pg.query(
          "select id,started_at,due_date,ended_at from public.fb_assignment_episodes order by id",
        )
      ).rows,
      episodes.rows,
    );
    assert.deepEqual(
      (
        await pg.query(
          "select id,effective_group_joined_at from public.fb_profiles order by id",
        )
      ).rows,
      memberships.rows,
    );
    assert.equal(
      await value(
        pg,
        "select passed as value from public.fb_progress where user_id=$1",
        [person],
      ),
      true,
    );
    const groups = await value(
      pg,
      "select groups as value from public.fb_config where id",
    );
    assert.deepEqual(
      groups.map((g: any) => g.id),
      ["parent", "child"],
    );
    assert.deepEqual(groups[0].teamIds, ["branch"]);
    assert.deepEqual(groups[0].legacyDirectTeamIds, ["legacy", "unused"]);
    assert.deepEqual(groups[1].requiredCourseIds, [course, childCourse]);
    assert.deepEqual(
      await value(
        pg,
        "select snapshot->'groups' as value from public.fb_deleted_items where id=$1",
        [individual],
      ),
      ["parent", "child"],
    );
    assert.equal(
      await value(
        pg,
        "select count(*)::int as value from public.fb_assignment_episodes where user_id=$1",
        [branchPerson],
      ),
      0,
    );
    await t.test(
      "server rejects new hierarchy, forged legacy links, stale clients and referenced-team deletion",
      async () => {
        await assert.rejects(
          saveRoster(pg, admin, (d) => {
            d.groups[1].parentId = "parent";
          }),
          /independent audiences/,
        );
        await assert.rejects(
          saveRoster(pg, admin, (d) => {
            d.groups[1].legacyDirectTeamIds = ["legacy"];
          }),
          /include all subteams/,
        );
        await assert.rejects(
          saveRoster(pg, admin, (d) => {
            delete d.groups[0].legacyDirectTeamIds;
          }),
          /Reload/,
        );
        await assert.rejects(
          saveRoster(pg, admin, (d) => {
            d.groups[0].legacyDirectTeamIds = ["legacy"];
            d.teams = d.teams.filter((x: any) => x.id !== "unused");
          }),
          /learning-group links/,
        );
      },
    );
    await t.test(
      "new child-only individual stays independent, new linked subteams remain dynamic and legacy expansion is explicit",
      async () => {
        await saveRoster(pg, admin, (d) => {
          const p = d.users.find((p: any) => p.id === branchPerson);
          p.groups = ["child"];
          p.teamId = undefined;
        });
        assert.deepEqual(
          await value(
            pg,
            "select jsonb_agg(id order by id) as value from public.fb_member_groups('[\"child\"]',null,(select groups from public.fb_config where id))",
          ),
          ["child"],
        );
        await saveRoster(pg, admin, (d) => {
          d.teams.push({
            id: "new-leaf",
            name: "New leaf",
            parentId: "branch",
          });
          d.users.find((p: any) => p.id === branchPerson).teamId = "new-leaf";
        });
        assert.deepEqual(
          await value(
            pg,
            "select jsonb_agg(id order by id) as value from public.fb_member_groups('[]','new-leaf',(select groups from public.fb_config where id))",
          ),
          ["child", "parent"],
        );
        await saveRoster(pg, admin, (d) => {
          d.groups[0].legacyDirectTeamIds = [];
          d.groups[0].teamIds.push("legacy");
        });
        assert.deepEqual(
          await value(
            pg,
            "select jsonb_agg(id order by id) as value from public.fb_member_groups('[]','legacy-leaf',(select groups from public.fb_config where id))",
          ),
          ["parent"],
        );
      },
    );
    await t.test(
      "contributor reporting snapshot keeps saved episodes and governance rejects publisher writes",
      async () => {
        await pg.exec(
          `insert into auth.users values('${person}'); update public.fb_profiles set role='contributor',auth_user_id='${person}' where id='${person}';`,
        );
        await saveRoster(pg, admin, (d) => {
          d.teams.find((t: any) => t.id === "branch").managerId = person;
        });
        const snapshot = await value(
          pg,
          "select public.fb_governance_snapshot($1) as value",
          [person],
        );
        assert.deepEqual(
          snapshot.users.map((p: any) => p.id).sort(),
          [person, branchPerson].sort(),
        );
        assert.ok(
          snapshot.users.find((p: any) => p.id === person).learning_assignments
            .length > 0,
        );
        const before = await value(
          pg,
          "select public.fb_person_assignments($1) as value",
          [person],
        );
        await assert.rejects(
          saveRoster(pg, person, () => {}),
          /Administrator access/,
        );
        await saveRoster(pg, admin, (d) => {
          d.teams.find((t: any) => t.id === "leaf").parentId = "legacy";
          d.users.find((p: any) => p.id === person).groups = [
            "parent",
            "child",
          ];
        });
        assert.deepEqual(
          await value(pg, "select public.fb_person_assignments($1) as value", [
            person,
          ]),
          before,
          "Combined migration keeps continuous episodes through one atomic membership/branch move",
        );
      },
    );
    await t.test(
      "new helper/check functions remain unavailable to browser roles",
      async () => {
        assert.equal(
          await value(
            pg,
            "select has_function_privilege('anon','public.fb_groups_are_flat(jsonb)','execute') as value",
          ),
          false,
        );
        assert.equal(
          await value(
            pg,
            "select has_function_privilege('authenticated','public.fb_validate_learning(jsonb,jsonb,jsonb)','execute') as value",
          ),
          false,
        );
      },
    );
  } finally {
    await pg.close();
  }
});
