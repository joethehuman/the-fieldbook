import { createServer } from "node:http";
const file = "00000000-0000-4000-8000-000000000001.png";
const initial = () => ({
  name: "Acme Learning",
  logoUrl: `/api/media/${file}`,
  welcomeDescription: "Welcome to your learning workspace.",
  tagline: "Learn together",
  accent: "#0069ff",
  access: "private",
  registration: "closed",
  privacy: {
    draft: {
      mode: "hosted",
      operatorName: "",
      contactEmail: "",
      contactUrl: "",
      body: "SECRET POLICY DRAFT",
      url: "",
    },
    published: {
      mode: "external",
      operatorName: "",
      contactEmail: "",
      contactUrl: "",
      body: "",
      url: "https://example.test/privacy",
    },
    publishedAt: null,
  },
});
let documents = [],
  reads = 0;
let readQueries = [];
let settings = initial(),
  configuredGroups = [],
  userGroups = [],
  fail = false,
  brokenLogo = false,
  role = "admin",
  revision = 1;
const user = () => ({
  id: "00000000-0000-4000-8000-000000000010",
  email: "admin@example.test",
  email_confirmed_at: "2026-01-01",
  app_metadata: {},
  user_metadata: {},
});
const profile = () => ({
  ...user(),
  name: "Synthetic Admin",
  role,
  active: role !== "inactive",
  groups: userGroups,
  group_joined_at: {},
  effective_group_joined_at: {},
});
const send = (res, data, status = 200, headers = {}) => {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "X-Supabase-Api-Version": "2024-01-01",
    ...headers,
  });
  res.end(JSON.stringify(data));
};
createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1:3130");
  let body = "";
  for await (const chunk of req) body += chunk;
  if (url.pathname === "/fixture") {
    const change = JSON.parse(body || "{}");
    documents = change.documents || [];
    reads = 0;
    readQueries = [];
    settings = { ...initial(), ...change.settings };
    configuredGroups = change.groups || [];
    userGroups = change.userGroups || [];
    fail = !!change.fail;
    brokenLogo = !!change.brokenLogo;
    role = change.role || "admin";
    revision = 1;
    return send(res, { ok: true });
  }
  if (url.pathname === "/reads") return send(res, { reads, readQueries });
  if (url.pathname === "/health") return send(res, { ok: true });
  if (url.pathname === "/logo") {
    if (brokenLogo) return send(res, {}, 404);
    res.writeHead(200, { "Content-Type": "image/svg+xml" });
    return res.end(
      '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="6" fill="#222"/><path d="M8 24L16 8l8 16M11 19h10" fill="none" stroke="white" stroke-width="3"/></svg>',
    );
  }
  if (fail)
    return send(
      res,
      { message: "Synthetic provider failure", code: "unexpected_failure" },
      400,
    );
  if (url.pathname === "/rest/v1/fb_config") {
    if (req.method === "PATCH") {
      const parsed = JSON.parse(body);
      if (url.searchParams.get("revision") !== `eq.${revision}`)
        return send(res, null);
      settings = parsed.settings;
      revision = parsed.revision;
      return send(res, { revision });
    }
    const select = url.searchParams.get("select") || "*";
    if (select.includes("logoUrl:"))
      return send(res, {
        name: settings.name ?? null,
        logoUrl: settings.logoUrl ?? null,
        welcomeDescription: settings.welcomeDescription ?? null,
        access: settings.access ?? null,
        policyMode: settings.privacy?.published?.mode ?? null,
        policyUrl: settings.privacy?.published?.url ?? null,
      });
    return send(res, {
      settings,
      revision,
      governance_revision: 1,
      groups: configuredGroups,
      curricula: [],
    });
  }
  if (url.pathname === "/rest/v1/fb_media")
    return send(res, { path: `uploads/${file}`, mime: "image/png" });
  if (url.pathname.startsWith("/storage/v1/object/sign/"))
    return send(res, { signedURL: "/object/sign/synthetic" });
  if (url.pathname === "/rest/v1/fb_documents") {
    reads++;
    readQueries.push(url.search);
    let rows = documents;
    const id = url.searchParams.get("id");
    if (id) rows = rows.filter((row) => row.id === id.slice(3));
    if (url.searchParams.has("published"))
      rows = rows.filter((row) => row.published);
    if ((url.searchParams.get("select") || "").includes("title:published"))
      rows = rows.map((row) => ({
        id: row.id,
        updated_at: row.updated_at,
        ...Object.fromEntries(
          [
            "title",
            "summary",
            "category",
            "folder",
            "sectionId",
            "kind",
            "status",
            "createdAt",
            "updatedAt",
            "groups",
          ].map((key) => [key, row.published[key]]),
        ),
      }));
    return send(res, rows, 200, {
      "Content-Range": `0-${rows.length - 1}/${rows.length}`,
    });
  }
  if (url.pathname === "/rest/v1/rpc/fb_allow_request") return send(res, true);
  if (url.pathname === "/rest/v1/rpc/fb_record_progress") return send(res, {});
  if (url.pathname === "/rest/v1/fb_profiles") return send(res, profile());
  if (url.pathname === "/rest/v1/rpc/fb_governance_snapshot")
    return send(res, {
      users: [profile()],
      progress: [],
      groups: [],
      teams: [],
      pending: [],
      revision: 1,
    });
  if (
    [
      "/rest/v1/fb_documents",
      "/rest/v1/fb_feedback",
      "/rest/v1/fb_mcp_grants",
    ].includes(url.pathname)
  )
    return send(res, [], 200, { "Content-Range": "*/0" });
  if (url.pathname === "/auth/v1/token") {
    const code = JSON.parse(body || "{}").auth_code;
    if (code === "expired")
      return send(
        res,
        { code: "flow_state_expired", message: "Expired synthetic flow" },
        400,
      );
    if (code === "provider-error")
      return send(
        res,
        {
          code: "oauth_provider_not_supported",
          message: "Synthetic provider configuration failure",
        },
        400,
      );
    const encode = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
    const token = `${encode({ alg: "HS256" })}.${encode({ sub: user().id, exp: Math.floor(Date.now() / 1000) + 3600 })}.synthetic`;
    return send(res, {
      access_token: token,
      refresh_token: "synthetic-refresh",
      token_type: "bearer",
      expires_in: 3600,
      user: user(),
    });
  }
  if (url.pathname === "/auth/v1/user") return send(res, user());
  if (url.pathname === "/auth/v1/logout") return send(res, {});
  return send(
    res,
    { message: `Unhandled synthetic request ${url.pathname}` },
    404,
  );
}).listen(3130, "127.0.0.1");
