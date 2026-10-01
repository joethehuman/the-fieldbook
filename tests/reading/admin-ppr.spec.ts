import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { get } from "node:http";
import { freshWorkspace } from "../../lib/store";
const backend = "http://127.0.0.1:3130";
const id = "00000000-0000-4000-8000-000000000081";
const adminId = "00000000-0000-4000-8000-000000000010";
const doc = {
  ...freshWorkspace().content.find((item) => item.kind === "doc")!,
  id,
  title: "PPR private content fixture",
  body: "Private editor fixture",
  status: "published",
};
const documents = [
  { id, draft: doc, published: doc, revision: 1, published_revision: 1 },
];

test("a cold section starts its code before the data finishes and retains the real navigation", async ({
  page,
  request,
}, info) => {
  await request.post(`${backend}/fixture`, {
    data: { settings: { access: "private" }, documents },
  });
  await session(page, request);
  const settingsChunks = readdirSync(".next/static/chunks").filter(
    (file) =>
      file.endsWith(".js") &&
      readFileSync(`.next/static/chunks/${file}`, "utf8").includes(
        '"installation-name"',
      ),
  );
  expect(settingsChunks.length).toBeGreaterThan(0);
  let codeStarted = false;
  let releaseCode!: () => void;
  const codeHeld = new Promise<void>((resolve) => {
    releaseCode = resolve;
  });
  await page.route(
    (url) => settingsChunks.some((chunk) => url.pathname.endsWith(`/${chunk}`)),
    async (route) => {
      codeStarted = true;
      await codeHeld;
      await route.continue();
    },
  );
  await page.goto("/admin");
  await expect(
    page.getByRole("status").filter({ hasText: /^Content ready$/ }),
  ).toBeVisible();
  expect(codeStarted).toBe(false);
  await page.evaluate(() => {
    (window as any).sectionNav = document.querySelector(
      '[data-slot="admin-navigation"]',
    );
  });
  await request.post(`${backend}/fixture`, {
    data: {
      settings: { access: "private" },
      documents,
      adminReadDelayMs: 1800,
    },
  });
  const routeStarted = page.waitForRequest(
    (entry) =>
      entry.url().includes("/admin/settings-identity?") &&
      !entry.isNavigationRequest(),
  );
  const picker = page.getByRole("combobox", { name: "Administration section" });
  if (await picker.isVisible()) {
    await picker.click();
    await page.getByRole("option", { name: "Identity", exact: true }).click();
  } else {
    const identity = page.getByRole("tab", { name: "Identity", exact: true });
    await identity.focus();
    await expect.poll(() => codeStarted).toBe(true);
    await expect(page).toHaveURL(/\/admin$/);
    await identity.click();
  }
  await routeStarted;
  await expect.poll(() => codeStarted).toBe(true);
  // Observe the real delayed snapshot read, rather than waiting for a Flight
  // response that Next may abort once its streamed panel has been consumed.
  await expect
    .poll(
      async () =>
        (await (await request.get(`${backend}/reads`)).json()).adminReadStarts,
    )
    .toBe(1);
  expect((await (await request.get(`${backend}/reads`)).json()).reads).toBe(0);
  await expect(page.locator('[data-slot="admin-navigation"]')).toBeVisible();
  await expect(page.getByText("Loading section", { exact: true })).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(
      () =>
        (window as any).sectionNav ===
        document.querySelector('[data-slot="admin-navigation"]'),
    ),
  ).toBe(true);
  releaseCode();
  await expect(
    page.getByRole("textbox", { name: "Installation name", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as any).sectionNav ===
        document.querySelector('[data-slot="admin-navigation"]'),
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("ppr-cold-section-ready.png"),
  });
});
async function session(page: Page, request: APIRequestContext) {
  const token = await (
    await request.post(`${backend}/auth/v1/token`, { data: {} })
  ).json();
  const value =
    "base64-" +
    Buffer.from(
      JSON.stringify({
        ...token,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url");
  await page
    .context()
    .addCookies([
      { name: "sb-test-auth-token", value, domain: "localhost", path: "/" },
    ]);
  return `sb-test-auth-token=${value}`;
}
async function stream(
  path: string,
  cookie: string,
  shell: string,
  privateMarker: string,
) {
  return new Promise<{
    shellAt: number;
    privateAt: number;
    status: number;
    body: string;
  }>((resolve, reject) => {
    const started = Date.now();
    let body = "",
      shellAt = -1,
      privateAt = -1;
    get(`http://localhost:3131${path}`, { headers: { cookie } }, (res) => {
      res.on("data", (chunk) => {
        body += chunk;
        if (shellAt < 0 && body.includes(shell)) shellAt = Date.now() - started;
        if (privateAt < 0 && body.includes(privateMarker))
          privateAt = Date.now() - started;
      });
      res.on("end", () =>
        resolve({ shellAt, privateAt, status: res.statusCode!, body }),
      );
    }).on("error", reject);
  });
}
test("Admin has a built static shell and delivers usable persistent navigation before private data", async ({
  page,
  request,
}, info) => {
  const manifest = JSON.parse(
    readFileSync(".next/prerender-manifest.json", "utf8"),
  );
  expect(manifest.routes["/admin"].renderingMode).toBe("PARTIALLY_STATIC");
  const html = readFileSync(".next/server/app/admin.html", "utf8");
  expect(html).toContain('data-slot="admin-navigation"');
  expect(html).not.toContain(doc.title);
  await request.post(`${backend}/fixture`, {
    data: {
      settings: { access: "private" },
      adminReadDelayMs: 1800,
      documents,
    },
  });
  const cookie = await session(page, request);
  const result = await stream(
    "/admin",
    cookie,
    'data-slot="admin-navigation"',
    doc.title,
  );
  expect(result.status).toBe(200);
  expect(result.shellAt).toBeGreaterThanOrEqual(0);
  expect(result.privateAt - result.shellAt).toBeGreaterThan(1000);
  writeFileSync(
    info.outputPath("ppr-admin-stream.json"),
    JSON.stringify({
      shellMs: result.shellAt,
      privateContentMs: result.privateAt,
      status: result.status,
    }),
  );
  await info.attach("ppr-admin-stream", {
    body: JSON.stringify({
      shellMs: result.shellAt,
      privateContentMs: result.privateAt,
      status: result.status,
    }),
    contentType: "application/json",
  });
  expect(result.body).not.toContain("Loading section");
  await page.goto("/admin", { waitUntil: "commit" });
  const nav = page.locator('[data-slot="admin-navigation"]');
  await expect(nav).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Retrieving content" }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("ppr-admin-pending.png") });
  await page.evaluate(() => {
    (window as any).originalAdminNav = document.querySelector(
      '[data-slot="admin-navigation"]',
    );
  });
  const picker = page.getByRole("combobox", { name: "Administration section" });
  if (await picker.isVisible()) {
    await picker.click();
    await page.getByRole("option", { name: "Access", exact: true }).click();
  } else await page.getByRole("tab", { name: "Access", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/settings-access$/);
  await expect(
    page.getByRole("heading", { name: "Access and accounts", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as any).originalAdminNav ===
        document.querySelector('[data-slot="admin-navigation"]'),
    ),
  ).toBe(true);
  await expect(page.getByText("Loading section", { exact: true })).toHaveCount(
    0,
  );
  await page.screenshot({ path: info.outputPath("ppr-admin-access.png") });
  await page.goBack();
  await expect(
    page.getByText(doc.title, { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as any).originalAdminNav ===
        document.querySelector('[data-slot="admin-navigation"]'),
    ),
  ).toBe(true);
});
test("manager progress prerenders real controls and only streams the authorized reporting scope", async ({
  page,
  request,
}, info) => {
  const manifest = JSON.parse(
    readFileSync(".next/prerender-manifest.json", "utf8"),
  );
  expect(manifest.routes["/team"].renderingMode).toBe("PARTIALLY_STATIC");
  const html = readFileSync(".next/server/app/team.html", "utf8");
  expect(html).toContain("Find a team member");
  expect(html).not.toContain("PRIVATE OUTSIDE TEAM");
  await request.post(`${backend}/fixture`, {
    data: {
      role: "manager",
      teamReadDelayMs: 1800,
      settings: { access: "private" },
      users: [
        {
          id: adminId,
          name: "Manager fixture",
          email: "admin@example.test",
          role: "manager",
          active: true,
          groups: [],
          team_id: "own",
        },
        {
          id: "member",
          name: "Scoped team member",
          email: "member@example.test",
          role: "learner",
          active: true,
          groups: [],
          team_id: "own",
        },
        {
          id: "outsider",
          name: "PRIVATE OUTSIDE TEAM",
          email: "outside@example.test",
          role: "learner",
          active: true,
          groups: [],
          team_id: "other",
        },
      ],
      teams: [
        { id: "own", name: "Owned team", managerId: adminId },
        { id: "other", name: "PRIVATE OUTSIDE TEAM", managerId: "outsider" },
      ],
    },
  });
  const cookie = await session(page, request);
  const result = await stream(
    "/team",
    cookie,
    "Find a team member",
    "Scoped team member",
  );
  expect(result.status).toBe(200);
  expect(result.privateAt - result.shellAt).toBeGreaterThan(1000);
  expect(result.body).not.toContain("PRIVATE OUTSIDE TEAM");
  writeFileSync(
    info.outputPath("ppr-manager-stream.json"),
    JSON.stringify({
      shellMs: result.shellAt,
      privateContentMs: result.privateAt,
      status: result.status,
    }),
  );
  await info.attach("ppr-manager-stream", {
    body: JSON.stringify({
      shellMs: result.shellAt,
      privateContentMs: result.privateAt,
      status: result.status,
    }),
    contentType: "application/json",
  });
  await page.goto("/team", { waitUntil: "commit" });
  const search = page.getByRole("searchbox", { name: "Find a team member" });
  await expect(search).toBeVisible();
  await page.evaluate(() => {
    (window as any).originalTeamSearch = document.querySelector(
      'input[placeholder="Find a team member by name or email"]',
    );
  });
  await expect(
    page.getByRole("status").filter({ hasText: "Retrieving team progress" }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("ppr-manager-pending.png") });
  await search.fill("Scoped");
  await expect(
    page.getByText("Scoped team member", { exact: true }),
  ).toBeVisible();
  await expect(search).toHaveValue("Scoped");
  expect(
    await page.evaluate(
      () =>
        (window as any).originalTeamSearch ===
        document.querySelector(
          'input[placeholder="Find a team member by name or email"]',
        ),
    ),
  ).toBe(true);
  await expect(
    page.getByText("PRIVATE OUTSIDE TEAM", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("ppr-manager-progress.png") });
  await request.post(`${backend}/fixture`, {
    data: { role: "learner", documents },
  });
  for (const path of ["/admin", "/admin/settings-access", "/team"]) {
    const denied = await request.get(`http://localhost:3131${path}`, {
      headers: { cookie },
      maxRedirects: 0,
    });
    expect(denied.status()).toBe(404);
    expect(await denied.text()).not.toContain(doc.title);
    expect(await denied.text()).not.toContain('data-slot="admin-navigation"');
    expect(denied.headers()["cache-control"]).toContain("no-store");
  }
  const anon = await request.get("http://localhost:3131/admin", {
    maxRedirects: 0,
  });
  expect(anon.status()).toBe(307);
  expect(anon.headers().location).toContain("/auth/sign-in");
});

test("admission preserves direct statuses and metadata regardless of user agent or protocol hints", async ({
  page,
  request,
}) => {
  await request.post(`${backend}/fixture`, {
    data: { role: "learner", settings: { access: "public" }, documents },
  });
  const cookie = await session(page, request);
  const variants: Record<string, string>[] = [
    { cookie, "user-agent": "" },
    { cookie, "user-agent": "Googlebot" },
    { cookie, "user-agent": "", rsc: "1", "next-router-prefetch": "1" },
    {
      cookie,
      "user-agent": "",
      rsc: "1",
      "next-router-prefetch": "1",
      "next-router-segment-prefetch": "/_tree",
    },
  ];
  for (const headers of variants) {
    for (const path of ["/admin", "/admin/settings-access", "/team"]) {
      const denied = await request.get(path, { headers, maxRedirects: 0 });
      expect(denied.status()).toBe(404);
      const body = await denied.text();
      expect(body).not.toContain(doc.title);
      expect(body).not.toContain('data-slot="admin-navigation"');
      expect(body).not.toContain("Find a team member");
      expect(denied.headers()["cache-control"]).toContain("no-store");
      expect(denied.headers().vary).toContain("Cookie");
      if (!headers.rsc) {
        expect(body).toContain("This page isn’t available");
        expect(body).toContain('name="robots" content="noindex"');
      }
    }
  }
  for (const row of [
    { ...documents[0], deleted_at: "2026-09-30" },
    { ...documents[0], published: { ...doc, status: "draft" } },
  ]) {
    await request.post(`${backend}/fixture`, {
      data: { settings: { access: "public" }, documents: [row] },
    });
    const response = await request.get(`/docs/${id}`, {
      headers: { "user-agent": "" },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain(doc.title);
  }
  await request.post(`${backend}/fixture`, {
    data: {
      settings: { access: "public" },
      curricula: [
        {
          id: "private-curriculum",
          title: "Private curriculum marker",
          status: "draft",
          courseIds: [],
        },
      ],
    },
  });
  const curriculum = await request.get("/curricula/private-curriculum", {
    headers: { "user-agent": "" },
  });
  expect(curriculum.status()).toBe(404);
  expect(await curriculum.text()).not.toContain("Private curriculum marker");
  await request.post(`${backend}/fixture`, {
    data: { settings: { access: "private" }, documents },
  });
  const guest = await request.get(`/docs/${id}`, {
    headers: { "user-agent": "" },
    maxRedirects: 0,
  });
  expect(guest.status()).toBe(307);
  expect(await guest.text()).not.toContain(doc.title);
});

test("Content filters remain the same usable controls while the first index arrives", async ({
  page,
  request,
}) => {
  await request.post(`${backend}/fixture`, {
    data: {
      settings: { access: "private" },
      adminReadDelayMs: 1800,
      documents,
    },
  });
  await session(page, request);
  await page.goto("/admin", { waitUntil: "commit" });
  const search = page.getByRole("searchbox", {
    name: "Search content",
    exact: true,
  });
  await expect(search).toBeVisible();
  await page.evaluate(() => {
    (window as any).originalContentSearch = document.querySelector(
      'input[placeholder="Search content by title, summary, or folder"]',
    );
  });
  await search.fill("PPR private");
  await expect(page.getByText(doc.title, { exact: true })).toBeVisible();
  await expect(search).toHaveValue("PPR private");
  expect(
    await page.evaluate(
      () =>
        (window as any).originalContentSearch ===
        document.querySelector(
          'input[placeholder="Search content by title, summary, or folder"]',
        ),
    ),
  ).toBe(true);
  await expect(
    page.getByRole("status").filter({ hasText: "Content ready" }),
  ).toBeAttached();
});

test("admission outages fail closed and retry the exact destination without JavaScript", async ({
  browser,
  request,
}, info) => {
  await request.post(`${backend}/fixture`, {
    data: { fail: true, settings: { access: "public" }, documents },
  });
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: info.project.use.viewport,
    baseURL: "http://localhost:3131",
  });
  try {
    const page = await context.newPage();
    const destination = `/docs/${id}?source=%22%3E%3Cscript%3Ebad%3C%2Fscript%3E&source=second`;
    const response = await page.goto(destination);
    expect(response?.status()).toBe(503);
    expect(response?.headers()["cache-control"]).toContain("no-store");
    await expect(
      page.getByRole("heading", { name: "Unable to load this page" }),
    ).toBeVisible();
    await expect(page.getByText(/Reference:/)).toBeVisible();
    expect(await page.content()).not.toContain(doc.title);
    await expect(page.locator("script")).toHaveCount(0);
    await request.post(`${backend}/fixture`, {
      data: { settings: { access: "public" }, documents },
    });
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: doc.title, exact: true }),
    ).toBeVisible();
    const url = new URL(page.url());
    expect(url.pathname).toBe(`/docs/${id}`);
    expect(url.searchParams.getAll("source")).toEqual([
      '"><script>bad</script>',
      "second",
    ]);
  } finally {
    await context.close();
  }
});
