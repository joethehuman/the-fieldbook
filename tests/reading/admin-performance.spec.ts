import { expect, test } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";

const backend = "http://127.0.0.1:3130";
const id = "00000000-0000-4000-8000-000000000081";
const original = freshWorkspace().content.find((item) => item.kind === "doc")!;
const published = {
  ...original,
  id,
  title: "Published administration article",
  body: "Published body",
  status: "published" as const,
};
const draft = {
  ...published,
  title: "Draft administration article",
  body: "Private draft body for the editor",
  status: "draft" as const,
};

test("admin entry and section changes avoid the full workspace", async ({
  page,
  request,
}, info) => {
  await request.post(`${backend}/fixture`, {
    data: {
      settings: { access: "private", logoUrl: "" },
      documents: [
        {
          id,
          draft,
          published,
          revision: 2,
          published_revision: 1,
          updated_at: "2026-09-24T00:00:00.000Z",
        },
      ],
    },
  });
  const token = await (
    await request.post(`${backend}/auth/v1/token`, { data: {} })
  ).json();
  await page.context().addCookies([
    {
      name: "sb-test-auth-token",
      value:
        "base64-" +
        Buffer.from(
          JSON.stringify({
            ...token,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          }),
        ).toString("base64url"),
      domain: "localhost",
      path: "/",
    },
  ]);
  let workspaceReads = 0;
  let documentNavigations = 0;
  page.on("request", (req) => {
    if (req.url().includes("/api/workspace")) workspaceReads++;
    if (req.isNavigationRequest()) documentNavigations++;
  });
  const response = await page.goto("/admin");
  expect(response?.status()).toBe(200);
  expect(await response!.text()).not.toContain(draft.body);
  await expect(page.locator(".admin-layout")).toBeVisible();
  await expect(page.getByText(draft.title)).toBeVisible();
  expect(workspaceReads).toBe(0);
  await page.screenshot({ path: info.outputPath("admin-entry.png") });

  const openTab = async (name: string) => {
    const picker = page.getByRole("combobox", {
      name: "Administration section",
    });
    if (await picker.isVisible()) {
      await picker.click();
      await page.getByRole("option", { name, exact: true }).click();
    } else await page.getByRole("tab", { name, exact: true }).click();
  };
  await openTab("Feedback");
  await expect(page.getByRole("heading", { name: "Feedback" })).toBeVisible();
  await openTab("People");
  await expect(page.getByRole("heading", { name: "People" })).toBeVisible();
  expect(workspaceReads).toBe(0);
  await openTab("Content");
  await page.getByRole("button", { name: "Edit" }).first().click();
  await expect(page.getByText(draft.body)).toBeVisible();
  expect(workspaceReads).toBe(0);
  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/content" &&
      response.request().method() === "POST" &&
      response.status() === 200,
  );
  await page
    .getByRole("textbox", { name: "Title" })
    .fill("Revised administration article");
  await saved;
  await expect(page.locator(".editor-save-status [role=status]")).toHaveText(
    "Saved",
  );
  expect(workspaceReads).toBe(0);
  await page.getByRole("button", { name: "Back to content" }).click();
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: /Courses/ })
    .click();
  await expect(page).toHaveURL(/\/courses$/);
  expect(documentNavigations).toBe(1);
  expect(workspaceReads).toBe(0);
  if (info.project.name === "phone" || info.project.name === "desktop")
    await page.screenshot({ path: info.outputPath("admin-to-courses.png") });
  if (await menu.isVisible()) await menu.click();
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Manage organization" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator(".admin-layout")).toBeVisible();
  expect(documentNavigations).toBe(1);
  expect(workspaceReads).toBe(0);
});

test("admin page and scoped data reject guests and non-administrators", async ({
  browser,
  request,
  baseURL,
}) => {
  await request.post(`${backend}/fixture`, {
    data: { settings: { access: "public", logoUrl: "" }, role: "learner" },
  });
  expect(
    (await request.get("/api/admin/snapshot?scope=content")).status(),
  ).toBe(401);
  const token = await (
    await request.post(`${backend}/auth/v1/token`, { data: {} })
  ).json();
  const context = await browser.newContext({ baseURL });
  await context.addCookies([
    {
      name: "sb-test-auth-token",
      value:
        "base64-" +
        Buffer.from(
          JSON.stringify({
            ...token,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          }),
        ).toString("base64url"),
      domain: "localhost",
      path: "/",
    },
  ]);
  expect((await context.request.get("/admin")).status()).toBe(404);
  expect(
    (await context.request.get("/api/admin/snapshot?scope=feedback")).status(),
  ).toBe(403);
  await context.close();
});

test("opening the account menu starts the administrator route before selection", async ({
  page,
  request,
}) => {
  await request.post(`${backend}/fixture`, {
    data: { settings: { access: "private", logoUrl: "" } },
  });
  const token = await (
    await request.post(`${backend}/auth/v1/token`, { data: {} })
  ).json();
  await page.context().addCookies([
    {
      name: "sb-test-auth-token",
      value:
        "base64-" +
        Buffer.from(
          JSON.stringify({
            ...token,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          }),
        ).toString("base64url"),
      domain: "localhost",
      path: "/",
    },
  ]);
  let adminPrefetches = 0;
  let documentNavigations = 0;
  page.on("request", (req) => {
    const url = new URL(req.url());
    if (url.pathname === "/admin" && url.searchParams.has("_rsc"))
      adminPrefetches++;
    if (req.isNavigationRequest()) documentNavigations++;
  });
  await page.goto("/courses");
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();
  await expect(
    page.getByRole("button", { name: "Account menu" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Account menu" }).click();
  await expect(
    page.getByRole("menuitem", { name: "Manage organization" }),
  ).toBeVisible();
  await expect.poll(() => adminPrefetches).toBeGreaterThan(0);
  expect(documentNavigations).toBe(1);
});

test("confirmed editor navigation responds while its destination is loading", async ({
  page,
  request,
}, info) => {
  await request.post(`${backend}/fixture`, {
    data: { settings: { access: "private", logoUrl: "" } },
  });
  const token = await (
    await request.post(`${backend}/auth/v1/token`, { data: {} })
  ).json();
  await page.context().addCookies([
    {
      name: "sb-test-auth-token",
      value:
        "base64-" +
        Buffer.from(
          JSON.stringify({
            ...token,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          }),
        ).toString("base64url"),
      domain: "localhost",
      path: "/",
    },
  ]);
  // Hold the destination before the shared shell can prefetch it.
  let release!: () => void;
  const destination = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/docs\?_rsc=/, async (route) => {
    await destination;
    await route.continue();
  });
  await page.goto("/admin");
  await expect(page.locator(".admin-layout")).toBeVisible();
  const picker = page.getByRole("combobox", { name: "Administration section" });
  if (await picker.isVisible()) {
    await picker.click();
    await page.getByRole("option", { name: "Identity" }).click();
  } else await page.getByRole("tab", { name: "Identity" }).click();
  await page
    .getByRole("textbox", { name: "Installation name" })
    .fill("Unsaved name");

  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();
  const topbar = await page.locator(".topbar").boundingBox();
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Docs", exact: true })
    .click();
  const confirmation = page.getByRole("alertdialog", {
    name: "Confirm action",
  });
  await expect(confirmation).toBeVisible();
  await confirmation.getByRole("button", { name: "Confirm" }).click();
  try {
    await expect(
      page.getByRole("status", { name: "Opening page" }),
    ).toBeVisible();
    expect(await page.locator(".topbar").boundingBox()).toEqual(topbar);
    await page.screenshot({ path: info.outputPath("pending-navigation.png") });
  } finally {
    release();
  }
  await expect(page).toHaveURL(/\/docs(?:\/|$)/);
});

test("large People list acknowledges pending reads and preserves search and selection through person history failures", async ({
  page,
  request,
}, info) => {
  const personId = "00000000-0000-4000-8000-000000000599";
  const users = Array.from({ length: 600 }, (_, n) => ({
    id:
      n === 0
        ? "00000000-0000-4000-8000-000000000010"
        : `00000000-0000-4000-8000-${String(n + 1000).padStart(12, "0")}`,
    name: `Person ${String(n).padStart(4, "0")}`,
    email: `person${n}@example.test`,
    role: n ? "learner" : "admin",
    active: true,
    groups: [] as string[],
  }));
  users[599].id = personId;
  users[599].groups = ["required"];
  const course = {
    ...freshWorkspace().content.find((item) => item.kind === "course")!,
    id,
    version: 1,
    title: "Assigned synthetic course",
    status: "published",
    assignments: [
      {
        groupId: "required",
        assignedAt: "2026-09-24T00:00:00Z",
        due: { type: "none" },
      },
    ],
  };
  const progress = users.map((user) => ({
    user_id: user.id,
    content_id: id,
    version: 1,
    lessons: [],
    passed: false,
    attempts: [],
    revision: 1,
  }));
  await request.post(`${backend}/fixture`, {
    data: {
      users,
      progress,
      groups: [{ id: "required", name: "Required learning", parentId: null }],
      documents: [
        {
          id,
          draft: course,
          published: course,
          revision: 1,
          published_revision: 1,
          updated_at: "2026-09-24T00:00:00Z",
        },
      ],
      settings: { access: "private", logoUrl: "" },
    },
  });
  const token = await (
    await request.post(`${backend}/auth/v1/token`, { data: {} })
  ).json();
  await page.context().addCookies([
    {
      name: "sb-test-auth-token",
      value:
        "base64-" +
        Buffer.from(
          JSON.stringify({
            ...token,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          }),
        ).toString("base64url"),
      domain: "localhost",
      path: "/",
    },
  ]);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/admin/snapshot?scope=people", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/admin");
  await expect(page.locator(".admin-layout")).toBeVisible();
  const picker = page.getByRole("combobox", { name: "Administration section" });
  const openPeople = async () => {
    if (await picker.isVisible()) {
      await picker.click();
      await page.getByRole("option", { name: "People", exact: true }).click();
    } else await page.getByRole("tab", { name: "People", exact: true }).click();
  };
  const before = await page.locator(".topbar").boundingBox();
  await openPeople();
  await expect(page.locator(".admin-workspace")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  if (await picker.isVisible())
    await expect(
      page.getByRole("status").filter({ hasText: "Opening People" }),
    ).toBeVisible();
  else
    await expect(
      page
        .getByRole("tab", { name: /People/ })
        .locator('svg[class*="animate-spin"]'),
    ).toBeVisible();
  expect(await page.locator(".topbar").boundingBox()).toEqual(before);
  await page.screenshot({ path: info.outputPath("people-pending.png") });
  release();
  const search = page.getByRole("searchbox", { name: "Search profiles" });
  await expect(search).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(25);
  await search.fill("person59");
  const row = page.locator("tbody tr").filter({ hasText: "Person 0599" });
  await expect(row).toHaveCount(1);
  const checkbox = row.getByRole("checkbox", { name: "Select Person 0599" });
  await checkbox.click();
  let failPerson = true;
  await page.route(
    "**/api/admin/snapshot?scope=person&userId=*",
    async (route) => {
      if (failPerson)
        await route.fulfill({
          status: 503,
          json: { error: "Synthetic history failure. Retry." },
        });
      else await route.continue();
    },
  );
  await row.getByRole("button", { name: "Courses & progress" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Synthetic history failure" }),
  ).toBeVisible();
  await expect(search).toHaveValue("person59");
  await expect(checkbox).toBeChecked();
  failPerson = false;
  const response = page.waitForResponse(
    (response) =>
      response.url().includes("scope=person&") && response.status() === 200,
  );
  await row.getByRole("button", { name: "Courses & progress" }).click();
  const state = await (await response).json();
  expect(Object.keys(state.data.progress)).toEqual([personId]);
  expect(state.data.progress[personId]).toHaveLength(1);
  await expect(
    page.getByRole("heading", { name: "Courses & progress", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Assigned synthetic course").first(),
  ).toBeVisible();
  await expect(page.getByText("No assigned courses yet.")).toHaveCount(0);
  await page.getByRole("heading", { name: "Courses & progress", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("person-progress.png") });
  await page.getByRole("button", { name: "Back to people" }).click();
  await expect(search).toHaveValue("person59");
  await expect(checkbox).toBeChecked();
});
