import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  availableMcpCapabilities,
  LEGACY_MCP_CAPABILITIES,
  MCP_CAPABILITIES,
  resolveMcpAccess,
  validMcpCapabilities,
} from "../lib/mcp-access";
import type { Team, User } from "../lib/types";

const user: User = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Publisher",
  email: "publisher@example.test",
  active: true,
  registered: true,
  role: "contributor",
  groups: [],
};
const teams: Team[] = [
  { id: "root", name: "Root", managerId: user.id, requiredCourseIds: [] },
  { id: "child", name: "Child", parentId: "root", requiredCourseIds: [] },
  { id: "sibling", name: "Sibling", requiredCourseIds: [] },
];

test("MCP rights intersect explicit consent and current role with fresh reporting responsibilities", () => {
  const contributor = resolveMcpAccess(user, teams, MCP_CAPABILITIES);
  assert.deepEqual(contributor.teamIds, ["child", "root"]);
  assert.equal(contributor.capabilities.includes("reports:read"), true);
  for (const cap of ["content:assign", "reports:aggregate"] as const)
    assert.equal(contributor.capabilities.includes(cap), false);
  const manager = resolveMcpAccess(
    { ...user, role: "manager" },
    teams,
    MCP_CAPABILITIES,
  );
  assert.deepEqual(manager.capabilities, ["reports:read"]);
  assert.deepEqual(
    resolveMcpAccess({ ...user, role: "manager" }, [], MCP_CAPABILITIES)
      .capabilities,
    [],
  );
  for (const account of [
    { ...user, role: "learner" as const },
    { ...user, active: false },
    { ...user, registered: false },
  ])
    assert.deepEqual(availableMcpCapabilities(account, teams), []);
  assert.deepEqual(resolveMcpAccess(user, [], MCP_CAPABILITIES).teamIds, []);
  assert.equal(
    resolveMcpAccess(user, [], MCP_CAPABILITIES).capabilities.includes(
      "reports:read",
    ),
    false,
  );
});

test("legacy consent preserves existing tools while promotions and added capabilities require approval", () => {
  const admin = { ...user, role: "admin" as const };
  const oldConnection = resolveMcpAccess(admin, teams, LEGACY_MCP_CAPABILITIES);
  assert.deepEqual(oldConnection.capabilities, [...LEGACY_MCP_CAPABILITIES]);
  assert.deepEqual(oldConnection.consentRequired, [
    "content:assign",
    "media:write",
    "reports:read",
    "feedback:read",
  ]);
  const promoted = resolveMcpAccess(admin, teams, [
    "content:read",
    "content:write",
  ]);
  assert.deepEqual(promoted.capabilities, ["content:read", "content:write"]);
  const managerPromotedToAdmin = resolveMcpAccess(
    admin,
    teams,
    ["reports:read"],
    "manager",
  );
  assert.deepEqual(
    managerPromotedToAdmin.capabilities,
    [],
    "promotion cannot broaden an approved team report to all learners",
  );
  assert.deepEqual(managerPromotedToAdmin.consentRequired, [
    ...MCP_CAPABILITIES,
  ]);
  const publisherPromotedToAdmin = resolveMcpAccess(
    admin,
    teams,
    ["content:write"],
    "contributor",
  );
  assert.deepEqual(
    publisherPromotedToAdmin.capabilities,
    [],
    "promotion cannot grant protected Docs hierarchy edits",
  );
  const downgraded = resolveMcpAccess(user, teams, MCP_CAPABILITIES);
  assert.equal(downgraded.capabilities.includes("content:assign"), false);
  assert.equal(downgraded.capabilities.includes("reports:aggregate"), false);
  assert.equal(
    validMcpCapabilities(["reports:read", "unrecognized:read"]),
    false,
  );
  assert.equal(validMcpCapabilities([null]), false);
  assert.equal(validMcpCapabilities("content:write"), false);
});

test("capability migration preserves old admin consent and rejects unapproved database grant writes", async () => {
  const pg = new PGlite();
  const manager = "22222222-2222-4222-8222-222222222222";
  const learner = "33333333-3333-4333-8333-333333333333";
  try {
    await pg.exec(`
      create role anon; create role authenticated; create role service_role;
      create table public.fb_profiles(id uuid primary key,role text,active boolean,auth_user_id uuid,deleted_at timestamptz);
      create table public.fb_config(teams jsonb);
      create table public.fb_mcp_grants(user_id uuid,client_id text,client_name text,enabled boolean default true,granted_at timestamptz default now(),primary key(user_id,client_id));
      insert into public.fb_profiles values
        ('${user.id}','admin',true,'${user.id}',null),
        ('${manager}','manager',true,'${manager}',null),
        ('${learner}','learner',true,'${learner}',null);
      insert into public.fb_config values ('[{"id":"team","managerId":"${manager}"}]');
      insert into public.fb_mcp_grants(user_id,client_id,client_name) values ('${user.id}','legacy','Original'),('${manager}','unexpected','Unexpected');
      grant all on public.fb_profiles,public.fb_config,public.fb_mcp_grants to service_role;
    `);
    await pg.exec(
      await readFile(
        new URL(
          "../supabase/migrations/20261002222344_mcp_connection_capabilities.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const preserved = (
      await pg.query<{ capabilities: string[]; enabled: boolean }>(
        "select capabilities,enabled from public.fb_mcp_grants where client_id='legacy'",
      )
    ).rows[0];
    assert.deepEqual(preserved.capabilities, [...LEGACY_MCP_CAPABILITIES]);
    assert.equal(preserved.enabled, true);
    assert.equal(
      (
        await pg.query<{ enabled: boolean }>(
          "select enabled from public.fb_mcp_grants where client_id='unexpected'",
        )
      ).rows[0].enabled,
      false,
    );
    await pg.exec("set role authenticated");
    await assert.rejects(
      pg.query(
        "select public.fb_enable_mcp_grant($1,'blocked','Blocked',array['content:read'])",
        [user.id],
      ),
      /permission denied/,
    );
    await pg.exec("reset role; set role service_role");
    await pg.query(
      "select public.fb_enable_mcp_grant($1,'manager','Reports',array['reports:read'])",
      [manager],
    );
    await pg.query(
      "update public.fb_mcp_grants set enabled=false where client_id='manager'",
    );
    await assert.rejects(
      pg.query(
        "select public.fb_enable_mcp_grant($1,'manager','Reports',array['reports:read'],true)",
        [manager],
      ),
      /revoked/,
    );
    await pg.query(
      "select public.fb_enable_mcp_grant($1,'manager','Reports',array['reports:read'])",
      [manager],
    );
    for (const [id, caps] of [
      [manager, ["content:write"]],
      [learner, ["reports:read"]],
      [user.id, ["bad:permission"]],
      [user.id, []],
    ] as [string, string[]][])
      await assert.rejects(
        pg.query(
          "select public.fb_enable_mcp_grant($1,'blocked','Blocked',$2)",
          [id, caps],
        ),
      );
    await pg.query(
      "update public.fb_profiles set role='contributor' where id=$1",
      [user.id],
    );
    await pg.query(
      "select public.fb_enable_mcp_grant($1,'publisher','Publisher',array['content:write','media:write','feedback:read'])",
      [user.id],
    );
    await assert.rejects(
      pg.query(
        "select public.fb_enable_mcp_grant($1,'publisher','Publisher',array['content:assign'])",
        [user.id],
      ),
    );
    await pg.exec("update public.fb_config set teams='[]'");
    await assert.rejects(
      pg.query(
        "select public.fb_enable_mcp_grant($1,'manager','Reports',array['reports:read'])",
        [manager],
      ),
    );
    await pg.query(
      "update public.fb_profiles set auth_user_id=null where id=$1",
      [user.id],
    );
    await assert.rejects(
      pg.query(
        "select public.fb_enable_mcp_grant($1,'publisher','Publisher',array['content:write'])",
        [user.id],
      ),
    );
  } finally {
    await pg.close();
  }
});
