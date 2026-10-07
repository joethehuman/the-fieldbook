import assert from "node:assert/strict";
import test from "node:test";
import {
  availableMcpCapabilities,
  LEGACY_MCP_CAPABILITIES,
  MCP_CAPABILITIES,
  resolveMcpAccess,
  validMcpCapabilities,
} from "../lib/mcp-access";
import type { Team, User } from "../lib/types";
import { database } from "./helpers/database.mjs";

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

test("MCP consent defaults remain compatible and reject unapproved database grant writes", async () => {
  const pg = await database();
  const manager = "22222222-2222-4222-8222-222222222222";
  const learner = "33333333-3333-4333-8333-333333333333";
  try {
    await pg.exec(`
      insert into auth.users(id) values('${user.id}'),('${manager}'),('${learner}');
      insert into public.fb_profiles(id,auth_user_id,email,name,role) values
        ('${user.id}','${user.id}','admin@example.test','Admin','admin'),
        ('${manager}','${manager}','manager@example.test','Manager','manager'),
        ('${learner}','${learner}','learner@example.test','Learner','learner');
      update public.fb_config set teams=teams||jsonb_build_array(jsonb_build_object('id','team','name','Team','managerId','${manager}','parentId',settings->>'organizationTeamId'));
      insert into public.fb_mcp_grants(user_id,client_id,client_name) values ('${user.id}','legacy','Original');
    `);
    const preserved = (
      await pg.query<{ capabilities: string[]; enabled: boolean }>(
        "select capabilities,enabled from public.fb_mcp_grants where client_id='legacy'",
      )
    ).rows[0];
    assert.deepEqual(preserved.capabilities, [...LEGACY_MCP_CAPABILITIES]);
    assert.equal(preserved.enabled, true);
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
    await pg.exec(
      "update public.fb_config set teams=(select jsonb_agg(t) from jsonb_array_elements(teams)t where t->>'system'='organization')",
    );
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
