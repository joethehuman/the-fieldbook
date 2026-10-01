import { expect, test } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { readdirSync, readFileSync } from "node:fs";

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
  let sectionReads = 0;
  const editorChunks = readdirSync(".next/static/chunks").filter(file => file.endsWith(".js") && readFileSync(`.next/static/chunks/${file}`, "utf8").includes('writing-readiness'));
  expect(editorChunks.length).toBeGreaterThan(0);
  let editorLoads = 0;
  let documentNavigations = 0;
  page.on("request", (req) => {
    if (req.url().includes("/api/workspace")) workspaceReads++;
    if (req.url().includes("/api/admin/snapshot")) sectionReads++;
    if (editorChunks.some(chunk => req.url().includes(chunk))) editorLoads++;
    if (req.isNavigationRequest()) documentNavigations++;
  });
  const response = await page.goto("/admin");
  expect(response?.status()).toBe(200);
  expect(await response!.text()).not.toContain(draft.body);
  await expect(page.locator(".admin-layout:visible")).toBeVisible();
  await expect(page.getByText(draft.title)).toBeVisible();
  expect(workspaceReads).toBe(0);
  expect(sectionReads).toBe(0);
  expect(editorLoads).toBe(0);
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
  expect(editorLoads).toBe(1);
  expect(workspaceReads).toBe(0);
  await page
    .getByRole("textbox", { name: "Title" })
    .fill("Revised administration article");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  expect(workspaceReads).toBe(0);
  // A refresh after autosave must keep the runtime's open draft. Collection
  // projections deliberately omit bodies; recovery must fetch the full item.
  await page.getByRole("button", { name: /^Details/ }).click();
  await page.getByRole("button", { name: "Draft recovery", exact: true }).click();
  await page.getByRole("button", { name: "Review saved copy", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Revised administration article");
  await expect(page.getByText(draft.body, { exact: true })).toBeVisible();
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
  await expect(page.locator(".admin-layout:visible")).toBeVisible();
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
  await expect(page.locator(".admin-layout:visible")).toBeVisible();
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
    ).toHaveCount(0);
    expect(await page.locator(".topbar").boundingBox()).toEqual(topbar);
    await page.screenshot({ path: info.outputPath("pending-navigation.png") });
  } finally {
    release();
  }
  await expect(page).toHaveURL(/\/docs(?:\/|$)/);
});
