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
  await page
    .getByRole("textbox", { name: "Title" })
    .fill("Revised administration article");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  expect(workspaceReads).toBe(0);
  await page.getByRole("button", { name: "Back to content" }).click();
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (await menu.isVisible()) await menu.click();
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("button", { name: /Courses/ })
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
