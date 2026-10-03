import { register } from "tsx/esm/api";
import { register as registerCjs } from "tsx/cjs/api";
register();
registerCjs();
import { createServer } from "node:http";
import { createSign, generateKeyPairSync } from "node:crypto";
const fixturePort = Number(process.env.FIELDBOOK_BACKEND_TEST_PORT || 3130);
const fixtureOrigin = `http://127.0.0.1:${fixturePort}`;
const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});
const jwk = {
  ...publicKey.export({ format: "jwk" }),
  alg: "RS256",
  use: "sig",
  kid: "synthetic-reader",
};
const file = "00000000-0000-4000-8000-000000000001.png";
const organization = {
  id: "account-fixture-organization",
  name: "Organization",
  system: "organization",
};
const initial = () => ({
  organizationTeamId: organization.id,
  name: "Acme Learning",
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
  reads = 0,
  authReads = 0;
let fixtureGeneration = Date.now();
let readQueries = [];
let settings = initial(),
  configuredGroups = [],
  configuredCurricula = [],
  configuredProgress = [],
  configuredFeedback = [],
  configuredUsers = [],
  configuredTeams = [organization],
  userGroups = [],
  fail = false,
  role = "admin",
  revision = 1;
const user = () => ({
  id: "00000000-0000-4000-8000-000000000010",
  email: "admin@example.test",
  email_confirmed_at: "2026-01-01",
  app_metadata: {},
  user_metadata: {},
});
const profile = () =>
  configuredUsers.find((entry) => entry.id === user().id) || {
    ...user(),
    auth_user_id: user().id,
    name: "Synthetic Admin",
    role,
    active: role !== "inactive",
    groups: userGroups,
    group_joined_at: {},
    effective_group_joined_at: {},
  };
const send = (res, data, status = 200, headers = {}) => {
  // Match PostgREST pagination so large synthetic lists exercise complete reads.
  if (Array.isArray(data) && res.req.url.startsWith("/rest/v1/")) {
    const params = new URL(res.req.url, fixtureOrigin).searchParams;
    const offset = Number(params.get("offset") || 0);
    const limit = params.has("limit")
      ? Number(params.get("limit"))
      : data.length;
    const total = data.length;
    data = data.slice(offset, offset + limit);
    headers = {
      ...headers,
      "Content-Range":
        total === 0 ? "*/0" : `${offset}-${offset + data.length - 1}/${total}`,
    };
  }

  res.writeHead(status, {
    "Content-Type": "application/json",
    "X-Supabase-Api-Version": "2024-01-01",
    ...headers,
  });
  res.end(JSON.stringify(data));
};
createServer(async (req, res) => {
  const url = new URL(req.url, fixtureOrigin);
  let body = "";
  for await (const chunk of req) body += chunk;
  if (url.pathname === "/fixture") {
    const change = JSON.parse(body || "{}");
    fixtureGeneration = change.governanceRevision ?? fixtureGeneration + 1;
    documents = change.documents || [];
    reads = 0;
    authReads = 0;
    readQueries = [];
    settings = { ...initial(), ...change.settings };
    configuredGroups = change.groups || [];
    configuredCurricula = change.curricula || [];
    configuredProgress = change.progress || [];
    configuredFeedback = change.feedback || [];
    configuredUsers = change.users || [];
    // Model a migrated installation: Organization is the sole root. Supplied
    // ordinary team fixtures remain descendants without changing their IDs.
    const supplied = change.teams || [];
    const root =
      supplied.find((team) => team.system === "organization") || organization;
    settings.organizationTeamId = root.id;
    configuredTeams = [
      root,
      ...supplied
        .filter((team) => team.id !== root.id)
        .map((team) => (team.parentId ? team : { ...team, parentId: root.id })),
    ];
    userGroups = change.userGroups || [];
    fail = !!change.fail;
    role = change.role || "admin";
    revision = 1;
    return send(res, { ok: true });
  }
  if (url.pathname === "/reads")
    return send(res, { reads, readQueries, authReads });
  if (url.pathname === "/health") return send(res, { ok: true });
  if (url.pathname === "/auth/v1/.well-known/jwks.json")
    return send(res, { keys: [jwk] });
  if (url.pathname === "/logo") {
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
    if (select.includes("name:settings->>name"))
      return send(res, {
        name: settings.name ?? null,
        accent: settings.accent ?? null,
        homePage: settings.homePage ?? null,
        welcomeDescription: settings.welcomeDescription ?? null,
        access: settings.access ?? null,
        policyMode: settings.privacy?.published?.mode ?? null,
        policyUrl: settings.privacy?.published?.url ?? null,
      });
    return send(res, {
      settings,
      revision,
      governance_revision: fixtureGeneration,
      groups: configuredGroups,
      teams: configuredTeams,
      curricula: configuredCurricula,
    });
  }
  if (url.pathname === "/rest/v1/fb_deleted_items")
    return send(res, [], 200, { "Content-Range": "*/0" });
  if (url.pathname === "/rest/v1/fb_cleanup_config")
    return send(res, {
      endpoint: "https://example.test/cleanup",
      last_run: new Date().toISOString(),
    });
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
    if (url.searchParams.get("published->>kind") === "eq.course")
      rows = rows.filter((row) => row.published?.kind === "course");
    if (url.searchParams.get("draft->>kind") === "eq.course")
      rows = rows.filter((row) => row.draft?.kind === "course");
    if ((url.searchParams.get("select") || "").includes("title:draft"))
      rows = rows.map((row) => ({
        id: row.id,
        revision: row.revision,
        published_revision: row.published_revision,
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
            "version",
            "createdAt",
            "groups",
            "assignments",
            "duration",
            "coverImageUrl",
          ].map((key) => [key, row.draft?.[key]]),
        ),
      }));
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
            "assignments",
            "coverImageUrl",
            "duration",
            "version",
            "lessons",
            "questions",
          ].map((key) => [key, row.published[key]]),
        ),
      }));
    return send(res, rows, 200, {
      "Content-Range": `0-${rows.length - 1}/${rows.length}`,
    });
  }
  if (url.pathname === "/rest/v1/fb_progress") {
    const rows = configuredProgress.filter((row) =>
      ["user_id", "content_id", "version"].every((field) => {
        const value = url.searchParams.get(field);
        return !value || String(row[field]) === value.slice(3);
      }),
    );
    return send(res, rows, 200, {
      "Content-Range": `0-${Math.max(0, rows.length - 1)}/${rows.length}`,
    });
  }
  if (url.pathname === "/rest/v1/rpc/fb_save_document") {
    const input = JSON.parse(body);
    const index = documents.findIndex((row) => row.id === input.p_id);
    const previous = documents[index];
    if (input.p_expected !== (previous?.revision ?? 0))
      return send(res, { message: "Revision conflict", code: "P0001" }, 400);
    const saved = {
      ...previous,
      id: input.p_id,
      draft: input.p_draft,
      published: input.p_unpublish
        ? null
        : input.p_publish
          ? input.p_draft
          : previous?.published || null,
      revision: input.p_expected + 1,
      published_revision: input.p_unpublish
        ? null
        : input.p_publish
          ? input.p_expected + 1
          : previous?.published_revision || null,
    };
    if (index < 0) documents.push(saved);
    else documents[index] = saved;
    return send(res, saved);
  }
  if (url.pathname === "/rest/v1/rpc/fb_allow_request") return send(res, true);
  if (url.pathname === "/rest/v1/rpc/fb_record_progress") {
    const input = JSON.parse(body || "{}");
    const index = configuredProgress.findIndex(
      (row) =>
        row.user_id === input.p_user &&
        row.content_id === input.p_content &&
        row.version === input.p_version,
    );
    const previous = configuredProgress[index];
    const saved = {
      user_id: input.p_user,
      content_id: input.p_content,
      version: input.p_version,
      lessons: [...new Set([...(previous?.lessons || []), ...input.p_lessons])],
      passed: !!(previous?.passed || input.p_passed),
      attempts: [
        ...(previous?.attempts || []),
        ...(input.p_attempt ? [input.p_attempt] : []),
      ],
    };
    if (index < 0) configuredProgress.push(saved);
    else configuredProgress[index] = saved;
    return send(res, saved);
  }
  if (url.pathname === "/rest/v1/fb_profiles") {
    const people = configuredUsers.length ? configuredUsers : [profile()];
    const personId = url.searchParams.get("id")?.slice(3);
    const subject = url.searchParams.get("auth_user_id")?.slice(3);
    if (personId || subject)
      return send(
        res,
        people.find((p) =>
          personId
            ? p.id === personId
            : (p.auth_user_id === undefined ? p.id : p.auth_user_id) ===
              subject,
        ) || null,
      );
    return send(res, people);
  }
  if (url.pathname === "/rest/v1/rpc/fb_progress_report") {
    const { progressPeople, localProgressDetail } =
      await import("../../lib/progress-report.ts");
    const { reconcileAssignments } =
      await import("../../lib/assignment-episodes.ts");
    const { reconcileLearning } = await import("../../lib/learning-groups.ts");
    const { reportTeamIds } = await import("../../lib/types.ts");
    const { p_actor, p_person } = JSON.parse(body || "{}");
    const users = (configuredUsers.length ? configuredUsers : [profile()])
      .filter((p) => !p.deleted_at)
      .map((p) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        role: p.role,
        active: p.active,
        registered: p.auth_user_id !== null,
        groups: p.groups || [],
        teamId: p.team_id || undefined,
        hireDate: p.hire_date || undefined,
        onboardingStart: p.onboarding_start || undefined,
        onboardingDays: p.onboarding_days,
        learningAssignments: p.learning_assignments,
        groupJoinedAt: p.group_joined_at,
        effectiveGroupJoinedAt: p.effective_group_joined_at,
      }));
    let model = {
      schema: 1,
      settings,
      groups: configuredGroups,
      teams: configuredTeams,
      curricula: configuredCurricula,
      users,
      content: documents.filter((d) => d.published).map((d) => d.published),
      progress: Object.fromEntries(
        users.map((p) => [
          p.id,
          configuredProgress.filter((r) => r.user_id === p.id),
        ]),
      ),
    };
    model = reconcileLearning(model, model);
    model.users = reconcileAssignments(
      model,
      model,
      new Date().toISOString(),
      true,
    );
    for (const u of model.users) {
      const p = configuredUsers.find((p) => p.id === u.id);
      if (p) p.learning_assignments = u.learningAssignments;
    }
    const actor = model.users.find((u) => u.id === p_actor);
    if (
      !actor ||
      !actor.active ||
      actor.registered === false ||
      !["admin", "manager", "contributor"].includes(actor.role)
    )
      return send(
        res,
        { code: "42501", message: "Reporting access is required" },
        403,
      );
    const rows = progressPeople(model, actor);
    const target = rows.find((r) => r.u.id === p_person);
    if (p_person && !target)
      return send(
        res,
        {
          code: "42501",
          message: "This person is outside your current reporting access",
        },
        403,
      );
    const allowed = reportTeamIds(actor, configuredTeams);
    return send(res, {
      asOf: new Date().toISOString().slice(0, 10),
      revision: fixtureGeneration,
      settings: {
        name: settings.name,
        accent: settings.accent,
        dueDatesEnabled: settings.dueDatesEnabled,
        onboardingDays: settings.onboardingDays,
      },
      teams: configuredTeams.filter((t) => allowed.has(t.id)),
      groups: configuredGroups
        .filter((g) => rows.some((r) => r.groupIds.includes(g.id)))
        .map((g) => ({ id: g.id, name: g.name })),
      people: rows
        .filter((r) => !p_person || r.u.id === p_person)
        .map((r) => ({
          u: {
            id: r.u.id,
            name: r.u.name,
            email: r.u.email,
            role: r.u.role,
            active: r.u.active,
            registered: r.u.registered,
            groups: [],
            teamId: r.u.teamId,
            hireDate: r.u.hireDate,
            onboardingStart: r.u.onboardingStart,
            onboardingDays: r.u.onboardingDays,
          },
          groupIds: r.groupIds,
          assigned: r.assigned,
          completed: r.completed,
          overdue: r.overdue,
          started: r.started,
        })),
      detail: target ? localProgressDetail(model, target.u) : null,
    });
  }
  if (url.pathname === "/rest/v1/rpc/fb_admin_people_snapshot") {
    const { p_actor, p_user } = JSON.parse(body || "{}");
    const users = (
      configuredUsers.length ? configuredUsers : [profile()]
    ).filter((p) => !p.deleted_at);
    if (!users.some((p) => p.id === p_actor && p.role === "admin" && p.active))
      return send(res, { message: "Administrator access is required" }, 403);
    return send(res, {
      users,
      progress: p_user
        ? configuredProgress.filter((p) => p.user_id === p_user)
        : [],
      groups: configuredGroups,
      teams: configuredTeams,
      curricula: configuredCurricula,
      pending: [],
      revision: fixtureGeneration,
    });
  }
  if (url.pathname === "/rest/v1/rpc/fb_governance_snapshot")
    return send(res, {
      users: configuredUsers.length ? configuredUsers : [profile()],
      progress: configuredProgress,
      groups: configuredGroups,
      teams: configuredTeams,
      pending: [],
      revision: fixtureGeneration,
    });
  if (url.pathname === "/rest/v1/fb_feedback") {
    if (req.method === "POST") {
      const row = JSON.parse(body || "{}");
      if (row.content_id === null) {
        configuredFeedback.push(row);
        return send(res, []);
      }
      const index = configuredFeedback.findIndex(
        (entry) =>
          entry.content_id === row.content_id &&
          (row.guest_key
            ? entry.guest_key === row.guest_key
            : entry.user_id === row.user_id),
      );
      if (index < 0) configuredFeedback.push(row);
      else configuredFeedback[index] = row;
      return send(res, []);
    }
    const rows = configuredFeedback.filter((row) =>
      ["content_id", "guest_key", "user_id"].every((field) => {
        const value = url.searchParams.get(field);
        return !value || row[field] === value.slice(3);
      }),
    );
    return send(res, rows, 200, {
      "Content-Range": `0-${Math.max(0, rows.length - 1)}/${rows.length}`,
    });
  }
  if (
    ["/rest/v1/fb_documents", "/rest/v1/fb_mcp_grants"].includes(url.pathname)
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
    const claims = {
      iss: "https://test.supabase.co/auth/v1",
      aud: "authenticated",
      role: "authenticated",
      sub: user().id,
      email: user().email,
      exp: Math.floor(Date.now() / 1000) + 3600,
      iat: Math.floor(Date.now() / 1000),
    };
    const value = `${encode({ alg: "RS256", kid: jwk.kid, typ: "JWT" })}.${encode(claims)}`;
    const token = `${value}.${createSign("RSA-SHA256").update(value).sign(privateKey, "base64url")}`;
    return send(res, {
      access_token: token,
      refresh_token: "synthetic-refresh",
      token_type: "bearer",
      expires_in: 3600,
      user: user(),
    });
  }
  if (url.pathname === "/auth/v1/user") {
    authReads++;
    return send(res, user());
  }
  if (url.pathname === "/auth/v1/logout") return send(res, {});
  return send(
    res,
    { message: `Unhandled synthetic request ${url.pathname}` },
    404,
  );
}).listen(fixturePort, "127.0.0.1");
