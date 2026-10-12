import test from "node:test";
import assert from "node:assert/strict";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { NextRequest } from "next/server";
import { actor, HttpError } from "../../server/auth";
import { ServiceError } from "../../server/errors";
import {
  verifyIdentity,
  lockIdentity,
  unlockIdentity,
  deleteIdentity,
  identityProvider,
  signInPresentation,
  startSignIn,
  findProfileBySubject,
  registerProfile,
} from "../../server/identity";
import { POST as mcp } from "../../app/api/mcp/route";
import { proxy } from "../../proxy";
import { LEGACY_MCP_CAPABILITIES } from "../../lib/mcp-access";
import { data as dataStore } from "../../server/data";
import { defaultSettings } from "../../lib/settings";

const subject = "11111111-1111-4111-8111-111111111111";
const config = {
  NEXT_PUBLIC_SUPABASE_URL: "https://identity-test.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "synthetic-key",
  SUPABASE_SECRET_KEY: "synthetic-secret",
  FIELDBOOK_URL: "https://fieldbook.example",
  FIELDBOOK_OWNER_EMAIL: "owner@example.test",
};
const person = {
  id: subject,
  auth_user_id: subject as string | null,
  email: "member@example.test",
  name: "Member",
  role: "admin",
  active: true,
  groups: [],
};
const authUser = {
  id: subject,
  email: person.email,
  email_confirmed_at: "2026-01-01T00:00:00Z",
  user_metadata: { full_name: person.name },
};
function location(input: string | URL | Request) {
  return new URL(input instanceof Request ? input.url : String(input));
}
async function fixture(run: () => Promise<void>) {
  const originalFetch = globalThis.fetch;
  const originalEnvironment = { ...process.env };
  Object.assign(process.env, config);
  delete process.env.VERCEL_ENV;
  delete process.env.FIELDBOOK_IDENTITY_PROVIDER;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    process.env = originalEnvironment;
  }
}

test("verified identities retain Fieldbook's fresh profile and verified-email checks", async () => {
  await fixture(async () => {
    let user = { ...authUser };
    let profile: typeof person | null = { ...person };
    let reads = 0;
    globalThis.fetch = async (input) => {
      const url = location(input);
      if (url.pathname === "/auth/v1/user") return Response.json(user);
      assert.equal(url.pathname, "/rest/v1/fb_profiles");
      assert.equal(url.searchParams.get("auth_user_id"), `eq.${subject}`);
      reads++;
      return Response.json(profile);
    };
    assert.deepEqual(await verifyIdentity("synthetic-token"), {
      subject,
      email: person.email,
      emailVerified: true,
      displayName: person.name,
    });
    assert.equal((await actor("synthetic-token"))?.id, subject);
    const personId = "22222222-2222-4222-8222-222222222222";
    profile = { ...person, id: personId };
    assert.equal(
      (await actor("synthetic-token"))?.id,
      personId,
      "application identity comes from the resolved profile, not the provider subject",
    );

    profile = { ...person, active: false };
    await assert.rejects(
      actor("synthetic-token"),
      (e: HttpError) => e.status === 403 && /inactive/.test(e.message),
    );
    profile = null;
    await assert.rejects(
      actor("synthetic-token"),
      /Sign in to Fieldbook before connecting/,
    );
    user = { ...authUser, email_confirmed_at: "" };
    const before = reads;
    await assert.rejects(actor("synthetic-token"), /verified account/);
    assert.equal(
      reads,
      before,
      "unverified identities cannot reach profile lookup",
    );
  });
});

test("identity absence remains distinct from provider failure", async () => {
  await fixture(async () => {
    globalThis.fetch = async () =>
      Response.json(
        { code: "session_not_found", message: "expired" },
        { status: 401, headers: { "x-supabase-api-version": "2024-01-01" } },
      );
    assert.equal(await verifyIdentity("synthetic-token"), null);
    globalThis.fetch = async () =>
      Response.json(
        { code: "over_request_rate_limit", message: "private diagnostic" },
        { status: 429, headers: { "x-supabase-api-version": "2024-01-01" } },
      );
    await assert.rejects(
      verifyIdentity("synthetic-token"),
      (e: ServiceError) =>
        e.status === 503 &&
        e.service === "auth" &&
        !e.message.includes("private diagnostic"),
    );
  });
});

test("identity locking and deletion preserve provider operations and retry failures", async () => {
  await fixture(async () => {
    const operations: { method: string; body: unknown }[] = [];
    const personId = "22222222-2222-4222-8222-222222222222";
    let linked = true;
    let deleting = false;
    let failed = false;
    globalThis.fetch = async (input, init) => {
      if (location(input).pathname === "/rest/v1/fb_profiles") {
        assert.equal(location(input).searchParams.get("id"), `eq.${personId}`);
        return Response.json({ auth_user_id: linked ? subject : null });
      }
      assert.equal(location(input).pathname, `/auth/v1/admin/users/${subject}`);
      operations.push({
        method: init?.method || "GET",
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (failed)
        return Response.json(
          { code: "unexpected_failure", message: "retry" },
          { status: 400, headers: { "x-supabase-api-version": "2024-01-01" } },
        );
      if (deleting)
        return Response.json(
          { code: "user_not_found", message: "absent" },
          { status: 404, headers: { "x-supabase-api-version": "2024-01-01" } },
        );
      return Response.json(authUser);
    };
    linked = false;
    await lockIdentity(personId);
    await unlockIdentity(personId);
    await deleteIdentity(personId);
    assert.equal(
      operations.length,
      0,
      "preregistered people need no Auth write",
    );
    linked = true;
    await lockIdentity(personId);
    await unlockIdentity(personId);
    assert.deepEqual(
      operations.slice(0, 2).map((operation) => operation.body),
      [{ ban_duration: "876600h" }, { ban_duration: "none" }],
    );
    deleting = true;
    await deleteIdentity(personId);
    assert.equal(operations.at(-1)?.method, "DELETE");
    failed = true;
    await assert.rejects(deleteIdentity(personId));
    await assert.rejects(lockIdentity(personId));
  });
});

test("MCP checks signed resource identity, current grant and profile before transport", async () => {
  await fixture(async () => {
    const { publicKey, privateKey } = await generateKeyPair("ES256");
    const jwk = {
      ...(await exportJWK(publicKey)),
      kid: "identity-test",
      alg: "ES256",
      use: "sig",
    };
    const issuer = `${config.NEXT_PUBLIC_SUPABASE_URL}/auth/v1`;
    const resource = `${config.FIELDBOOK_URL}/api/mcp`;
    const signed = (claims: Record<string, unknown> = {}) =>
      new SignJWT({
        sub: subject,
        client_id: "client-one",
        iss: issuer,
        aud: resource,
        exp: Math.floor(Date.now() / 1000) + 600,
        ...claims,
      })
        .setProtectedHeader({ alg: "ES256", kid: "identity-test" })
        .sign(privateKey);
    let enabled = true;
    const personId = "22222222-2222-4222-8222-222222222222";
    let profile = { ...person, id: personId };
    let allowed = true;
    let databaseReads = 0;
    globalThis.fetch = async (input) => {
      const url = location(input);
      if (url.pathname.endsWith("/.well-known/jwks.json"))
        return Response.json({ keys: [jwk] });
      databaseReads++;
      if (url.pathname === "/rest/v1/fb_mcp_grants") {
        assert.equal(url.searchParams.get("user_id"), `eq.${personId}`);
        assert.equal(url.searchParams.get("client_id"), "eq.client-one");
        return Response.json({
          enabled,
          capabilities: [...LEGACY_MCP_CAPABILITIES],
          capability_version: 0,
          role_at_consent: "admin",
        });
      }
      if (url.pathname === "/rest/v1/fb_profiles") {
        assert.equal(url.searchParams.get("auth_user_id"), `eq.${subject}`);
        assert.equal(url.searchParams.get("active"), "eq.true");
        assert.equal(url.searchParams.get("deleted_at"), "is.null");
        return Response.json(profile.active ? profile : null);
      }
      if (url.pathname === "/rest/v1/fb_config")
        return Response.json({
          settings: defaultSettings,
          teams: [],
          groups: [],
          curricula: [],
          revision: 1,
          governance_revision: 1,
        });
      assert.equal(url.pathname, "/rest/v1/rpc/fb_allow_request");
      return Response.json(allowed);
    };
    const request = (token?: string, origin = config.FIELDBOOK_URL) =>
      new Request(resource, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Origin: origin,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
    const missing = await mcp(request());
    assert.equal(missing.status, 401);
    assert.match(
      missing.headers.get("WWW-Authenticate") || "",
      /oauth-protected-resource\/api\/mcp/,
    );
    for (const claims of [
      { iss: "https://other.example/auth/v1" },
      { aud: "authenticated" },
      { client_id: undefined },
      { exp: undefined },
      { exp: 1 },
    ])
      assert.equal((await mcp(request(await signed(claims)))).status, 401);
    assert.equal(
      databaseReads,
      0,
      "invalid tokens cannot reach grants or profiles",
    );
    const valid = await signed();
    enabled = false;
    assert.equal((await mcp(request(valid))).status, 403);
    enabled = true;
    profile = { ...person, id: personId, role: "learner" };
    assert.equal((await mcp(request(valid))).status, 403);
    profile = { ...person, id: personId, active: false };
    assert.equal((await mcp(request(valid))).status, 403);
    profile = { ...person, id: personId };
    allowed = false;
    assert.equal((await mcp(request(valid))).status, 429);
    allowed = true;
    const response = await mcp(request(valid));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    const tools = (await response.json()).result.tools.map(
      (tool: { name: string }) => tool.name,
    );
    for (const name of [
      "search",
      "fetch",
      "create_content",
      "update_content",
      "publish_content",
      "unpublish_content",
      "content_report",
      "list_media",
    ])
      assert.equal(
        tools.includes(name),
        true,
        `${name} remains available to a legacy connection`,
      );
    assert.equal(
      tools.includes("learning_report"),
      false,
      "individual reports require added consent",
    );
    assert.equal(
      tools.includes("create_media_upload"),
      false,
      "uploads require added consent",
    );
    const tooLarge = new Request(resource, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${valid}`,
        "Content-Type": "application/json",
      },
      body: " ".repeat(2_000_001),
    });
    assert.equal(
      (await mcp(tooLarge)).status,
      413,
      "actual bytes are bounded without Content-Length",
    );
    const before = databaseReads;
    assert.equal(
      (await mcp(request(valid, "https://untrusted.example"))).status,
      403,
    );
    assert.equal(databaseReads, before);
  });
});

test("guest proxy preserves reader headers and no-store without contacting identity provider", async () => {
  await fixture(async () => {
    globalThis.fetch = async () => {
      throw new Error("guest proxy contacted provider");
    };
    const response = await proxy(
      new NextRequest("https://fieldbook.example/docs?topic=setup", {
        headers: {
          "x-fieldbook-reader-path": "/forged",
          "x-fieldbook-reader-return": "/forged",
        },
      }),
    );
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("x-middleware-request-x-fieldbook-reader-path"),
      "/docs",
    );
    assert.equal(
      response.headers.get("x-middleware-request-x-fieldbook-reader-return"),
      "/docs?topic=setup",
    );
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  });
});

test("proxy refresh forwards the new session to rendering and the browser", async () => {
  await fixture(async () => {
    const { privateKey } = await generateKeyPair("ES256");
    const token = await new SignJWT({ sub: subject })
      .setProtectedHeader({ alg: "ES256" })
      .setExpirationTime("1h")
      .sign(privateKey);
    const session = {
      access_token: token,
      refresh_token: "synthetic-old-refresh",
      expires_at: 1,
      expires_in: 1,
      token_type: "bearer",
      user: authUser,
    };
    const cookie =
      "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
    let refreshes = 0;
    globalThis.fetch = async (input, init) => {
      assert.equal(location(input).pathname, "/auth/v1/token");
      assert.equal(
        location(input).searchParams.get("grant_type"),
        "refresh_token",
      );
      assert.equal(
        JSON.parse(String(init?.body)).refresh_token,
        session.refresh_token,
      );
      refreshes++;
      return Response.json({
        ...session,
        access_token: token,
        refresh_token: "synthetic-new-refresh",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      });
    };
    const response = await proxy(
      new NextRequest("https://fieldbook.example/docs?topic=setup", {
        headers: { cookie: `sb-identity-test-auth-token=${cookie}` },
      }),
    );
    assert.equal(refreshes, 1);
    assert.equal(response.status, 200);
    const refreshed = response.cookies.get("sb-identity-test-auth-token");
    assert.ok(refreshed);
    assert.notEqual(refreshed.value, cookie);
    assert.match(
      response.headers.get("x-middleware-request-cookie") || "",
      /sb-identity-test-auth-token=/,
    );
    assert.ok(
      response.headers
        .get("x-middleware-request-cookie")
        ?.includes(refreshed.value),
    );
    assert.equal(
      response.headers.get("x-middleware-request-x-fieldbook-reader-return"),
      "/docs?topic=setup",
    );
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  });
});

test("identity composition preserves Google presentation and rejects unimplemented providers and options", async () => {
  await fixture(async () => {
    const login = signInPresentation();
    assert.deepEqual(login.options, [
      { id: "google", label: "Continue with Google" },
    ]);
    assert.equal(login.signInLabel, "Sign in with Google");
    assert.equal(login.registration.emailLabel, "Google email");
    assert.match(login.registration.description, /verified Google email/);
    assert.equal(
      JSON.parse(JSON.stringify(login)).options[0].id,
      "google",
      "presentation contains only public serializable data",
    );
    await assert.rejects(
      startSignIn("https://fieldbook.example/auth/callback", "unconfigured"),
      /available sign-in option/,
    );
    process.env.FIELDBOOK_IDENTITY_PROVIDER = "supabase";
    assert.equal(typeof identityProvider().refreshIdentitySession, "function");
    process.env.FIELDBOOK_IDENTITY_PROVIDER = "unimplemented";
    assert.throws(
      identityProvider,
      (error: ServiceError) =>
        error.status === 503 && error.service === "configuration",
    );
  });
});

test("Supabase profile mapping hides external subjects in identity, roster and governance records", async () => {
  await fixture(async () => {
    const personId = "22222222-2222-4222-8222-222222222222";
    let registered = true;
    globalThis.fetch = async (input) => {
      const url = location(input);
      const raw = {
        ...person,
        id: personId,
        auth_user_id: registered ? subject : null,
      };
      if (url.pathname.startsWith("/rest/v1/rpc/"))
        return Response.json({
          revision: 1,
          users: [raw],
          groups: [],
          teams: [],
          progress: [],
          pending: [],
        });
      assert.equal(url.pathname, "/rest/v1/fb_profiles");
      if (url.searchParams.has("auth_user_id")) return Response.json(raw);
      return Response.json([raw], { headers: { "Content-Range": "0-0/1" } });
    };
    const check = (
      record: Awaited<ReturnType<typeof findProfileBySubject>>,
    ) => {
      assert.ok(record);
      assert.equal(record.id, personId);
      assert.equal(record.registered, registered);
      assert.equal("auth_user_id" in record, false);
    };
    for (registered of [true, false]) {
      check(await findProfileBySubject(subject));
      check((await dataStore().listProfiles())[0]);
      check((await dataStore().readGovernanceSnapshot(personId)).users[0]);
      check((await dataStore().readAdminPeopleSnapshot(personId)).users[0]);
    }
  });
});

test("registration delegates account linking to the existing transaction and retains the stable person ID", async () => {
  await fixture(async () => {
    const personId = "22222222-2222-4222-8222-222222222222";
    let denied = false;
    globalThis.fetch = async (input, init) => {
      assert.equal(
        location(input).pathname,
        "/rest/v1/rpc/fb_register_profile",
      );
      assert.deepEqual(JSON.parse(String(init?.body)), {
        p_id: subject,
        p_email: person.email,
        p_name: person.name,
        p_owner: false,
      });
      return denied
        ? Response.json(
            { code: "P0001", message: "Account is pending deletion" },
            { status: 400 },
          )
        : Response.json({ ...person, id: personId });
    };
    const registration = {
      subject,
      email: person.email,
      name: person.name,
      owner: false,
    };
    const linked = await registerProfile(registration);
    assert.equal(linked?.id, personId);
    assert.equal(linked?.registered, true);
    assert.equal("auth_user_id" in linked!, false);
    denied = true;
    assert.equal(await registerProfile(registration), null);
  });
});
