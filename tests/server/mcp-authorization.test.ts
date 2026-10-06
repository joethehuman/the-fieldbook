import test from "node:test";
import assert from "node:assert/strict";
import {
  currentMcpAccess,
  validateMcpAuthorization,
} from "../../server/mcp-authorization";
import { MCP_CAPABILITIES } from "../../lib/mcp-access";
import { defaultSettings } from "../../lib/settings";
import type { User } from "../../lib/types";
import type {
  AuthorizationDetails,
  ProfileRecord,
} from "../../server/ports/identity";

const subject = "11111111-1111-4111-8111-111111111111";
const personId = "22222222-2222-4222-8222-222222222222";
const user: User = {
  id: personId,
  role: "contributor",
  name: "Publisher",
  email: "publisher@example.test",
  active: true,
  registered: true,
  groups: [],
};
const record: ProfileRecord = { ...user, auth_user_id: subject };

test("every MCP refresh applies account, consent and reporting changes immediately", async () => {
  const oldEnv = { ...process.env },
    oldFetch = globalThis.fetch;
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://mcp-authorization.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic",
    SUPABASE_SECRET_KEY: "synthetic",
    FIELDBOOK_URL: "https://fieldbook.example",
    FIELDBOOK_OWNER_EMAIL: "owner@example.test",
  });
  let profile = { ...record };
  let teams = [
    { id: "owned", managerId: personId },
    { id: "child", parentId: "owned" },
    { id: "sibling" },
  ];
  let grant = {
    enabled: true,
    capabilities: [...MCP_CAPABILITIES],
    role_at_consent: "contributor",
  };
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("fb_profiles"))
      return Response.json(profile.active ? profile : null);
    if (url.pathname.endsWith("fb_config"))
      return Response.json({
        settings: defaultSettings,
        groups: [],
        teams,
        curricula: [],
        revision: 1,
        governance_revision: 1,
      });
    assert.equal(url.pathname, "/rest/v1/fb_mcp_grants");
    assert.equal(url.searchParams.get("user_id"), `eq.${personId}`);
    assert.equal(url.searchParams.get("client_id"), "eq.client");
    return Response.json(grant);
  };
  try {
    let context = await currentMcpAccess(subject, "client");
    assert.equal(context.user.id, personId);
    assert.deepEqual(context.access.teamIds, ["child", "owned"]);
    assert.equal(context.access.capabilities.includes("content:assign"), false);
    teams = [
      { id: "owned", managerId: "another" },
      { id: "child", parentId: "owned" },
      { id: "sibling" },
    ];
    context = await currentMcpAccess(subject, "client");
    assert.deepEqual(context.access.teamIds, []);
    assert.equal(context.access.capabilities.includes("reports:read"), false);
    profile = { ...record, role: "admin" };
    context = await currentMcpAccess(subject, "client");
    assert.deepEqual(
      context.access.capabilities,
      [],
      "a promotion does not broaden current tools without reconsent",
    );
    grant.role_at_consent = "admin";
    assert.equal(
      (await currentMcpAccess(subject, "client")).access.allTeams,
      true,
    );
    grant.enabled = false;
    await assert.rejects(currentMcpAccess(subject, "client"), /revoked/);
    grant.enabled = true;
    profile = { ...record, role: "learner" };
    await assert.rejects(currentMcpAccess(subject, "client"), /Learner/);
    profile = { ...record, active: false };
    await assert.rejects(currentMcpAccess(subject, "client"), /no active/);
  } finally {
    globalThis.fetch = oldFetch;
    process.env = oldEnv;
  }
});

test("consent rejects another identity, mismatched authorization and custom OAuth scopes", async () => {
  const oldEnv = { ...process.env },
    oldFetch = globalThis.fetch;
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://mcp-authorization.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic",
    SUPABASE_SECRET_KEY: "synthetic",
    FIELDBOOK_URL: "https://fieldbook.example",
    FIELDBOOK_OWNER_EMAIL: "owner@example.test",
  });
  let linked = true;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.equal(url.searchParams.get("auth_user_id"), `eq.${subject}`);
    return Response.json(linked ? record : { ...record, id: "another-person" });
  };
  const details: Exclude<AuthorizationDetails, { redirect_url: string }> = {
    authorization_id: "authorization",
    redirect_uri: "https://client.example/callback",
    client: { id: "client", name: "Client" },
    user: { id: subject },
    scope: "openid email profile",
  };
  try {
    await validateMcpAuthorization(user, details, "authorization");
    await validateMcpAuthorization(
      user,
      { ...details, scope: "openid email offline_access profile" },
      "authorization",
    );
    linked = false;
    await assert.rejects(
      validateMcpAuthorization(user, details, "authorization"),
      /another account/,
    );
    linked = true;
    await assert.rejects(
      validateMcpAuthorization(user, details, "different"),
      /another account/,
    );
    await assert.rejects(
      validateMcpAuthorization(
        user,
        { ...details, scope: "email offline_access content:write" },
        "authorization",
      ),
      /unsupported identity scopes/,
    );
  } finally {
    globalThis.fetch = oldFetch;
    process.env = oldEnv;
  }
});
