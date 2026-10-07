import assert from "node:assert/strict";
import test from "node:test";
import {
  feedbackReportInputSchema,
  learningReportInputSchema,
} from "../../lib/mcp-report-schema";
import type { User } from "../../lib/types";
import {
  feedbackReport,
  getReportingScopes,
  learningReport,
  learningReportRow,
} from "../../server/mcp-reports";
import type { LearningReportPage } from "../../server/ports/mcp-reporting";
import { rosterDatabase, value } from "../helpers/roster-database";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const user = (role: User["role"], n = 1): User => ({
  id: id(n),
  name: "Actor",
  email: "actor@example.test",
  role,
  active: true,
  registered: true,
  groups: [],
});

async function database() {
  const pg = await rosterDatabase();
  return pg;
}

test("MCP scoped reporting SQL preserves data, denies sibling/group escalation, and projects canonical statuses", async (t) => {
  const pg = await database();
  const report = async (
    actor: number,
    input: Record<string, unknown> = {},
    after?: { personId: string; courseId: string },
    expected?: string,
  ) =>
    (await value(
      pg,
      "select public.fb_mcp_learning_report($1,$2,$3,$4,$5) value",
      [
        id(actor),
        JSON.stringify({ assignment: "all", ...input }),
        after?.personId || null,
        after?.courseId || null,
        expected || null,
      ],
    )) as LearningReportPage;
  try {
    await pg.exec(
      `insert into auth.users values('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}'),('${id(5)}'),('${id(6)}'),('${id(7)}'),('${id(8)}');
     insert into fb_profiles(id,auth_user_id,name,email,role,team_id,groups) values
     ('${id(1)}','${id(1)}','Admin','admin@example.test','admin',null,'[]'),
     ('${id(2)}','${id(2)}','Manager outside branch','manager@example.test','manager','other','[]'),
     ('${id(3)}','${id(3)}','Authorized child','child@example.test','learner','child','[]'),
     ('${id(4)}','${id(4)}','Secret sibling','sibling@example.test','learner','other','[]'),
     ('${id(5)}','${id(5)}','Contributor manager','contribmanager@example.test','contributor','other','[]'),
     ('${id(6)}','${id(6)}','Contributor only','contributor@example.test','contributor','other','[]'),
     ('${id(7)}','${id(7)}','Learner','learner@example.test','learner','sales','[]'),
     ('${id(8)}','${id(8)}','Inactive','inactive@example.test','manager','sales','[]'),
     ('${id(9)}',null,'Preregistered child','pending@example.test','learner','child','[]');
     update fb_profiles set active=false where id='${id(8)}';
     update fb_config set teams=teams||'[${JSON.stringify({
       id: "sales",
       name: "Sales",
       managerId: id(2),
       parentId: "REPLACE",
       learningItems: [
         { kind: "course", id: id(10) },
         { kind: "course", id: id(13) },
       ],
     })},${JSON.stringify({ id: "child", name: "Child", managerId: id(5), parentId: "sales" })},${JSON.stringify({ id: "other", name: "Secret sibling team", parentId: "REPLACE" })}]'::jsonb;`.replaceAll(
        '"REPLACE"',
        `"${await value(pg, "select settings->>'organizationTeamId' value from fb_config")}"`,
      ),
    );
    await pg.exec(`update fb_config set groups='[{"id":"shared","name":"Shared cohort","teamIds":["sales","other"],"learningItems":[{"kind":"course","id":"${id(10)}"}]},{"id":"secret","name":"Secret sibling cohort","teamIds":["other"]}]';
     insert into fb_documents(id,draft,published,revision,published_revision) values
     ('${id(10)}','{"kind":"course","title":"Assigned","status":"published","version":1,"lessons":[{"id":"a"},{"id":"b"}],"questions":[{"id":"quiz","answer":2}]}','{"kind":"course","title":"Assigned","status":"published","version":1,"lessons":[{"id":"a"},{"id":"b"}],"questions":[{"id":"quiz","answer":2}]}',1,1),
     ('${id(11)}','{"kind":"course","title":"Optional","status":"published","version":1,"lessons":[{"id":"x"}]}','{"kind":"course","title":"Optional","status":"published","version":1,"lessons":[{"id":"x"}]}',1,1),
     ('${id(12)}','{"kind":"course","title":"Untouched optional","status":"published","version":1,"lessons":[]}','{"kind":"course","title":"Untouched optional","status":"published","version":1,"lessons":[]}',1,1),
     ('${id(13)}','{"kind":"course","title":"New version","status":"published","version":2,"lessons":[{"id":"new"}]}','{"kind":"course","title":"New version","status":"published","version":2,"lessons":[{"id":"new"}]}',2,2);
     select fb_sync_learning();
     update fb_assignment_episodes set due_date='2000-01-01',started_at='1999-12-01',catch_up_days=7 where ended_at is null;
     insert into fb_progress(user_id,content_id,version,lessons,passed,attempts) values
     ('${id(3)}','${id(10)}',1,'["a","b"]',true,'[{"at":"2026-01-01","passed":true,"answers":[{"questionId":"quiz","correct":true,"optionIds":["secret-answer"]}]}]'),
     ('${id(3)}','${id(11)}',1,'["x"]',true,'[]'),
     ('${id(3)}','${id(13)}',1,'["new"]',true,'[]'),
     ('${id(4)}','${id(10)}',1,'["a"]',false,'[]'),
     ('${id(7)}','${id(11)}',1,'[]',false,'[{"at":"2026-01-01","passed":false,"answers":[{"optionIds":["hidden"]}]}]');`);
    await t.test(
      "manager scope excludes own account and sibling users even with shared group filters",
      async () => {
        const result = await report(2, { groupIds: ["shared"], limit: 100 });
        assert.equal(result.total, 8); // Three scoped people, six assigned and two optional rows.
        assert.deepEqual(
          [...new Set(result.rows.map((r) => r.personId))].sort(),
          [id(3), id(7), id(9)],
        );
        assert.equal(JSON.stringify(result).includes("Secret sibling"), false);
        assert.equal(JSON.stringify(result).includes("secret-answer"), false);
        assert.equal(JSON.stringify(result).includes("answers"), false);
        assert.equal(JSON.stringify(result).includes("@example.test"), false);
        assert.equal(JSON.stringify(result).includes('"questions"'), false);
        assert.equal(result.totals.assigned.total, 6);
        assert.equal(result.totals.assigned.complete, 1);
        assert.equal(result.totals.optional.total, 2);
        assert.equal(result.totals.optional.complete, 1);
        const complete = result.rows.find(
          (r) => r.personId === id(3) && r.course.id === id(10),
        )!;
        const output = learningReportRow(
          complete,
          result.dueDatesEnabled,
          result.asOf,
        );
        assert.equal(output.complete, true);
        assert.equal(output.dueDate, "2000-01-01");
        assert.equal(output.status, "complete");
        assert.equal(output.overdue, false);
        assert.equal(
          output.sources.length,
          2,
          "Overlapping Team and Group sources do not duplicate the assignment",
        );
        const version = result.rows.find(
          (r) => r.personId === id(3) && r.course.id === id(13),
        )!;
        assert.equal(
          learningReportRow(version, true, result.asOf).status,
          "overdue",
          "Old version completion does not complete the current assignment",
        );
        assert.equal(
          result.rows.some((r) => r.course.id === id(12)),
          false,
        );
        await assert.rejects(
          report(2, { teamIds: ["other"] }),
          /outside reporting access/,
        );
        await assert.rejects(
          report(2, { groupIds: ["secret"] }),
          /outside reporting access/,
        );
        const filtered = await report(2, {
          teamIds: ["child"],
          courseIds: [id(10)],
        });
        assert.deepEqual(
          filtered.rows.map((r) => r.personId),
          [id(3), id(9)],
        );
        for (const r of result.rows)
          learningReportRow(r, result.dueDatesEnabled, result.asOf);
      },
    );

    await t.test(
      "authoritative roles, activation, explicit management, and safe discovery",
      async () => {
        assert.equal(
          (await report(1, { limit: 100 })).total > (await report(2)).total,
          true,
        );
        const contributorScope = await report(5);
        assert.deepEqual(
          [...new Set(contributorScope.rows.map((r) => r.personId))],
          [id(3), id(9)],
        );
        assert.ok(
          contributorScope.rows.some((row) =>
            row.sources.some(
              (source) =>
                source.kind === "team" &&
                source.id === null &&
                source.name === "Inherited team assignment",
            ),
          ),
        );
        assert.equal(
          JSON.stringify(contributorScope).includes('"Sales"'),
          false,
          "An inherited assignment does not expose out-of-scope team names",
        );
        for (const actor of [6, 7, 8, 9])
          await assert.rejects(
            report(actor),
            /Reporting access|explicitly managed/,
          );
        const scopes = await value(
          pg,
          "select fb_mcp_reporting_scopes($1) value",
          [id(2)],
        );
        assert.equal(scopes.organizationWide, false);
        assert.deepEqual(scopes.teams.map((v: any) => v.id).sort(), [
          "child",
          "sales",
        ]);
        assert.deepEqual(scopes.groups, [
          { id: "shared", name: "Shared cohort" },
        ]);
        assert.equal(JSON.stringify(scopes).includes("managerId"), false);
        assert.equal(JSON.stringify(scopes).includes("teamIds"), false);
        assert.equal(JSON.stringify(scopes).includes("secret"), false);
        for (const role of ["anon", "authenticated"]) {
          const permitted = await value(
            pg,
            "select has_function_privilege($1,'public.fb_mcp_learning_report(uuid,jsonb,uuid,uuid,text)','EXECUTE') value",
            [role],
          );
          assert.equal(permitted, false);
          await pg.exec(`set role ${role}`);
          await assert.rejects(report(2), /permission denied/);
          await pg.exec("reset role");
        }
        const first = await report(2, { limit: 1 });
        const last = first.rows[0];
        await pg.exec(
          `update fb_profiles set role='learner' where id='${id(2)}'`,
        );
        await assert.rejects(
          report(
            2,
            { limit: 1 },
            { personId: last.personId, courseId: last.course.id },
            first.fingerprint,
          ),
          /Reporting access/,
        );
        await pg.exec(
          `update fb_profiles set role='manager' where id='${id(2)}'`,
        );
      },
    );

    await t.test(
      "paused deadlines and changed exports fail explicitly",
      async () => {
        const first = await report(2, { limit: 1 });
        const last = first.rows[0];
        await pg.exec(
          `update fb_progress set lessons='["a","b"]',passed=true where user_id='${id(4)}' and content_id='${id(10)}'`,
        );
        const unchangedScope = await report(
          2,
          { limit: 1 },
          { personId: last.personId, courseId: last.course.id },
          first.fingerprint,
        );
        assert.equal(
          unchangedScope.total,
          first.total,
          "Sibling progress does not enter a manager report or invalidate it",
        );
        await pg.exec(
          `update fb_config set settings=settings||'{"dueDatesEnabled":false}'`,
        );
        await assert.rejects(
          report(
            2,
            { limit: 1 },
            { personId: last.personId, courseId: last.course.id },
            first.fingerprint,
          ),
          /Report changed/,
        );
        const paused = await report(2, { limit: 100 });
        assert.equal(paused.totals.assigned.overdue, 0);
        for (const row of paused.rows) {
          const output = learningReportRow(
            row,
            paused.dueDatesEnabled,
            paused.asOf,
          );
          assert.equal(output.dueDate, null);
          if (row.assignment) assert.equal(output.savedDueDate, "2000-01-01");
        }
      },
    );

    await t.test(
      "feedback is publisher-only with names and no email, guest key, or progress",
      async () => {
        await pg.exec(`insert into fb_feedback(id,user_id,guest_key,content_id,version,rating,comment) values
       ('${id(101)}','${id(3)}',null,'${id(10)}',1,'up','Useful content'),
       ('${id(102)}',null,'${"a".repeat(64)}',null,null,'down','General feedback');`);
        const feedback = async (actor: number, filters = {}) =>
          await value(pg, "select fb_mcp_feedback_report($1,$2) value", [
            id(actor),
            JSON.stringify(filters),
          ]);
        const result = await feedback(6);
        assert.equal(result.total, 2);
        assert.deepEqual(
          result.rows.map((r: any) => r.person),
          ["Authorized child", "Guest visitor"],
        );
        assert.equal(JSON.stringify(result).includes("@example.test"), false);
        assert.equal(JSON.stringify(result).includes("guest_key"), false);
        assert.equal(JSON.stringify(result).includes("attempt"), false);
        assert.equal((await feedback(6, { kind: "general" })).total, 1);
        assert.equal(
          (await feedback(6, { rating: "up", contentId: id(10) })).total,
          1,
        );
        await assert.rejects(feedback(2), /Publisher access/);
        await assert.rejects(feedback(7), /Publisher access/);
        const first = await value(
          pg,
          "select fb_mcp_feedback_report($1,$2) value",
          [id(6), '{"limit":1}'],
        );
        await pg.exec(
          `update fb_feedback set comment='Changed' where id='${id(101)}'`,
        );
        await assert.rejects(
          value(pg, "select fb_mcp_feedback_report($1,$2,$3,$4) value", [
            id(6),
            '{"limit":1}',
            id(101),
            first.fingerprint,
          ]),
          /Feedback changed/,
        );
      },
    );
    await t.test(
      "services execute provider RPC pages, bind filters, and honor immediate database revocation",
      async () => {
        const savedFetch = globalThis.fetch;
        const savedEnvironment = { ...process.env };
        const operations: string[] = [];
        Object.assign(process.env, {
          NEXT_PUBLIC_SUPABASE_URL: "https://test.supabase.co",
          NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-test-key",
          SUPABASE_SECRET_KEY: "synthetic-secret",
          FIELDBOOK_URL: "https://test.example",
          FIELDBOOK_OWNER_EMAIL: "admin@example.test",
          VERCEL_ENV: "production",
          FIELDBOOK_ENVIRONMENT: "production",
        });
        globalThis.fetch = async (input, init) => {
          const operation = new URL(String(input)).pathname.split("/").at(-1)!;
          operations.push(operation);
          const body = JSON.parse(String(init?.body));
          const sql =
            operation === "fb_mcp_reporting_scopes"
              ? "select fb_mcp_reporting_scopes($1) value"
              : operation === "fb_mcp_learning_report"
                ? "select fb_mcp_learning_report($1,$2,$3,$4,$5) value"
                : operation === "fb_mcp_feedback_report"
                  ? "select fb_mcp_feedback_report($1,$2,$3,$4) value"
                  : null;
          assert.ok(
            sql,
            `Only the actor-aware reporting RPC may be called, saw ${operation}`,
          );
          const args =
            operation === "fb_mcp_reporting_scopes"
              ? [body.p_actor]
              : operation === "fb_mcp_learning_report"
                ? [
                    body.p_actor,
                    JSON.stringify(body.p_input),
                    body.p_after_person,
                    body.p_after_course,
                    body.p_expected_fingerprint,
                  ]
                : [
                    body.p_actor,
                    JSON.stringify(body.p_input),
                    body.p_after,
                    body.p_expected_fingerprint,
                  ];
          try {
            return new Response(JSON.stringify(await value(pg, sql, args)), {
              headers: { "Content-Type": "application/json" },
            });
          } catch (error: any) {
            return new Response(
              JSON.stringify({ message: error.message, code: error.code }),
              { status: 400, headers: { "Content-Type": "application/json" } },
            );
          }
        };
        try {
          const scopes = await getReportingScopes(user("manager", 2));
          assert.deepEqual(scopes.groups, [
            { id: "shared", name: "Shared cohort" },
          ]);
          const first = await learningReport(user("manager", 2), {
            groupIds: ["shared"],
            limit: 1,
          });
          assert.equal(first.total, 6);
          assert.equal(first.complete, false);
          assert.equal(first.returnedCount, 1);
          assert.ok(first.nextCursor);
          assert.equal(first.rows[0].person.name, "Authorized child");
          assert.equal(first.rows[0].savedDueDate, "2000-01-01");
          const next = await learningReport(user("manager", 2), {
            groupIds: ["shared", "shared"],
            limit: 3,
            cursor: first.nextCursor,
          });
          assert.equal(next.returnedCount, 3);
          assert.equal(next.total, first.total);
          assert.notEqual(
            `${next.rows[0].person.id}:${next.rows[0].course.id}`,
            `${first.rows[0].person.id}:${first.rows[0].course.id}`,
          );
          const before = operations.length;
          await assert.rejects(
            learningReport(user("manager", 2), {
              courseIds: [id(13)],
              cursor: first.nextCursor,
            }),
            /different filters/,
          );
          await assert.rejects(
            learningReport(user("admin", 1), {
              groupIds: ["shared"],
              cursor: first.nextCursor,
            }),
            /different filters/,
          );
          assert.equal(operations.length, before);
          await pg.exec(
            `update fb_profiles set role='learner' where id='${id(2)}'`,
          );
          await assert.rejects(
            learningReport(user("manager", 2), {
              groupIds: ["shared"],
              cursor: first.nextCursor,
            }),
            (error: any) => error.status === 403,
          );
          await pg.exec(
            `update fb_profiles set role='manager' where id='${id(2)}'; update fb_profiles set name='Changed scoped child' where id='${id(3)}'`,
          );
          await assert.rejects(
            learningReport(user("manager", 2), {
              groupIds: ["shared"],
              cursor: first.nextCursor,
            }),
            (error: any) => error.status === 409,
          );
          const feedbackFirst = await feedbackReport(user("contributor", 6), {
            limit: 1,
          });
          assert.equal(feedbackFirst.total, 2);
          assert.equal(feedbackFirst.complete, false);
          const feedbackLast = await feedbackReport(user("contributor", 6), {
            cursor: feedbackFirst.nextCursor,
            limit: 2,
          });
          assert.equal(feedbackLast.complete, true);
          assert.equal(feedbackLast.rows[0].person, "Guest visitor");
          assert.equal(feedbackLast.nextCursor, null);
          await assert.rejects(
            feedbackReport(user("contributor", 6), {
              kind: "general",
              cursor: feedbackFirst.nextCursor,
            }),
            /different filters/,
          );
          assert.ok(
            operations.every((operation) => operation.startsWith("fb_mcp_")),
          );
        } finally {
          globalThis.fetch = savedFetch;
          process.env = savedEnvironment;
        }
      },
    );
  } finally {
    await pg.close();
  }
});

test("MCP reporting pages cross the API's 1000-row cap without duplicates and bound filters", async (t) => {
  const pg = await database();
  try {
    await pg.exec(`insert into auth.users values('${id(1)}'); insert into fb_profiles(id,auth_user_id,name,email,role) values('${id(1)}','${id(1)}','Admin','admin@example.test','admin');
     select set_config('fieldbook.learning_batch','on',false);
     insert into fb_profiles(id,name,email,role) select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Person '||n,'person'||n||'@example.test','learner' from generate_series(1000,1104) n;
     insert into fb_documents(id,draft,published) select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,jsonb_build_object('kind','course','title','Course '||n,'status','published','version',1,'lessons',jsonb_build_array(jsonb_build_object('id','one'))),jsonb_build_object('kind','course','title','Course '||n,'status','published','version',1,'lessons',jsonb_build_array(jsonb_build_object('id','one'))) from generate_series(2000,2010) n;
     update fb_config set teams=(select jsonb_agg(t||jsonb_build_object('learningItems',(select jsonb_agg(jsonb_build_object('kind','course','id',id)) from fb_documents))) from jsonb_array_elements(teams) t);
     select set_config('fieldbook.learning_batch','',false);select fb_sync_learning();`);
    const expected = 106 * 11;
    let after: [string, string] | null = null;
    let fingerprint: string | null = null;
    const seen = new Set<string>();
    let pages = 0;
    while (true) {
      const result = (await value(
        pg,
        "select fb_mcp_learning_report($1,$2,$3,$4,$5) value",
        [
          id(1),
          '{"limit":100,"assignment":"assigned"}',
          after?.[0] || null,
          after?.[1] || null,
          fingerprint,
        ],
      )) as LearningReportPage;
      assert.equal(result.total, expected);
      assert.equal(result.totals.assigned.total, expected);
      assert.ok(result.rows.length <= 100);
      for (const row of result.rows) {
        const key = `${row.personId}:${row.course.id}`;
        assert.equal(seen.has(key), false);
        seen.add(key);
      }
      pages++;
      if (!result.hasMore) break;
      fingerprint = result.fingerprint;
      const last = result.rows.at(-1)!;
      after = [last.personId, last.course.id];
    }
    assert.equal(seen.size, expected);
    assert.ok(pages > 10);
    await assert.rejects(
      value(pg, "select fb_mcp_learning_report($1,$2) value", [
        id(1),
        '{"limit":1001}',
      ]),
      /Invalid report/,
    );
    // Representative 500-person / 100-course installation: aggregation stays
    // in PostgreSQL and only the requested 100 minimal rows cross the API.
    await pg.exec(`select set_config('fieldbook.learning_batch','on',false);
     insert into fb_profiles(id,name,email,role) select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Person '||n,'person'||n||'@example.test','learner' from generate_series(1105,1498) n;
     insert into fb_documents(id,draft,published) select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,jsonb_build_object('kind','course','title','Course '||n,'status','published','version',1,'lessons',jsonb_build_array(jsonb_build_object('id','one'))),jsonb_build_object('kind','course','title','Course '||n,'status','published','version',1,'lessons',jsonb_build_array(jsonb_build_object('id','one'))) from generate_series(2011,2099) n;
     update fb_config set teams=(select jsonb_agg(t||jsonb_build_object('learningItems',(select jsonb_agg(jsonb_build_object('kind','course','id',id)) from fb_documents))) from jsonb_array_elements(teams) t);
     select set_config('fieldbook.learning_batch','',false);select fb_sync_learning();`);
    const startedAt = performance.now();
    const large = (await value(
      pg,
      "select fb_mcp_learning_report($1,$2) value",
      [id(1), '{"limit":100}'],
    )) as LearningReportPage;
    assert.equal(large.total, 50000);
    assert.equal(large.rows.length, 100);
    assert.equal(large.totals.assigned.total, 50000);
    assert.equal(large.hasMore, true);
    assert.ok(
      JSON.stringify(large).length < 150000,
      "The report payload does not contain the full installation history",
    );
    t.diagnostic(
      `500 people / 100 courses: ${Math.round(performance.now() - startedAt)}ms for 100 rows, ${JSON.stringify(large).length} response characters, 50,000 rows counted.`,
    );
  } finally {
    await pg.close();
  }
});

test("MCP report services reject learners and stale or mismatched pagination before provider reads", async () => {
  await assert.rejects(
    learningReport(user("learner"), {}),
    /Team reporting access/,
  );
  await assert.rejects(
    getReportingScopes(user("learner")),
    /Team reporting access/,
  );
  await assert.rejects(
    feedbackReport(user("manager"), {}),
    /publishing access/,
  );
  await assert.rejects(
    learningReport({ ...user("manager"), registered: false }, {}),
    /Team reporting access/,
  );
  await assert.rejects(
    learningReport(user("manager"), { cursor: "invalid" }),
    /cursor is invalid/,
  );
  assert.equal(
    learningReportInputSchema.safeParse({ limit: 101 }).success,
    false,
  );
  assert.equal(
    feedbackReportInputSchema.safeParse({ role: "admin" }).success,
    false,
  );
});
