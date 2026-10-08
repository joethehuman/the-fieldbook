import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace, type Workspace } from "../../lib/store";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import { waitForDraftSaved, openContentSettings, closeContentSettings, returnToContent } from "./editor-helpers";
import { authoringUser, setupAuthoringProvider } from "./provider-fixture";

async function openMenu(page: Page) {
  const sidebar = page.getByRole("button", { name: "Open navigation", exact: true });
  if (await sidebar.isVisible()) await sidebar.click();
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
}
async function section(page: Page, name: string) {
  const picker = page.getByRole("combobox", { name: "Publishing section", exact: true });
  if (await picker.isVisible()) {
    await picker.click(); await page.getByRole("option", { name, exact: true }).click();
  } else await page.getByRole("tab", { name, exact: true }).click();
}
async function setup(page: Page, production: boolean, role: "contributor" | "admin", manages: boolean) {
  const data = withPublishedSnapshots(freshWorkspace());
  const actor = { ...authoringUser, role, name: "Synthetic Publisher" };
  data.users = [actor, { ...actor, id: "00000000-0000-4000-8000-000000000020", name: "Managed learner", role: "learner", teamId: "child" }, { ...actor, id: "00000000-0000-4000-8000-000000000021", name: "Sibling secret", role: "learner", teamId: "sibling" }];
  data.teams = [{ id: "root", name: "Managed root", managerId: manages ? actor.id : undefined }, { id: "child", name: "Managed child", parentId: "root" }, { id: "sibling", name: "Sibling team" }];
  data.feedback = [{ id: "general", userId: "guest", comment: "Contributor general feedback", rating: "up", updatedAt: "2026-10-01" }];
  data.settings!.docSections = [{ id: "empty", name: "Existing empty section" }];
  data.deletedItems = [{ id: "deleted-user", entity: "user", name: "Deleted account secret", revision: 1, deletedAt: new Date().toISOString(), purgeAfter: new Date(Date.now() + 86400000).toISOString(), deletedBy: "Admin", purging: false }];
  if (production) {
    await setupAuthoringProvider(page, data);
    await page.request.post("http://127.0.0.1:3130/fixture", { data: {
      role, settings: data.settings, groups: data.groups, curricula: data.curricula,
      teams: data.teams, users: data.users.map((u) => ({ ...u, auth_user_id: u.id, team_id: u.teamId, group_joined_at: {}, effective_group_joined_at: {} })),
      feedback: [{ id: "general", user_id: null, content_id: null, rating: "up", comment: "Contributor general feedback", updated_at: "2026-10-01" }],
      documents: data.content.map((item) => ({ id: item.id, draft: item, published: data.publishedContent?.find((c) => c.id === item.id) || null, revision: 1, published_revision: item.status === "published" ? 1 : null, updated_at: item.updatedAt })),
    }});
  } else {
    // Use a selectable synthetic persona while exercising contributor+manager combinations.
    data.users[0].id = "demo-contributor";
    if (manages) data.teams[0].managerId = "demo-contributor";
    if (role === "admin") data.users[0].id = "demo-admin";
    await page.addInitScript((workspace: Workspace) => {
      sessionStorage.setItem("fieldbook.profile.v1", workspace.users[0].id);
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
    }, data);
  }
  await page.goto("/");
}

test("contributors share publishing editors with four permitted destinations on desktop and phone", async ({ page }, info) => {
  const production = info.project.name.startsWith("production");
  await setup(page, production, "contributor", false);
  await openMenu(page);
  await expect(page.getByRole("menuitem", { name: "My team’s progress" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Manage organization" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Manage content" }).click();
  await expect(page.locator(".admin-layout")).toBeVisible();
  const picker = page.getByRole("combobox", { name: "Publishing section" });
  if (await picker.isVisible()) {
    await picker.click();
    await expect(page.getByRole("option")).toHaveText(["Content", "Feedback", "MCP", "Recently deleted"]);
    await page.keyboard.press("Escape");
  } else await expect(page.locator(".admin-nav-group").getByRole("tab")).toHaveText(["Content", "Feedback", "MCP", "Recently deleted"]);
  await page.screenshot({ path: info.outputPath("contributor-panel.png"), fullPage: true });
  await section(page, "Feedback");
  await expect(page.getByText("Contributor general feedback", { exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Export.*CSV/ }).click();
  expect((await download).suggestedFilename()).toMatch(/feedback/);
  await section(page, "Recently deleted");
  await expect(page.getByText("Deleted account secret", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("tab", { name: "Users", exact: true })).toHaveCount(0);
  await section(page, "MCP");
  if (production) {
    await expect(page.getByText("Contributors can author and publish content, upload media and review feedback. Reporting requires an explicitly managed team.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Manage connections →" })).toBeVisible();
  }
  if (production) {
    for (const scope of ["people", "person", "governance"]) {
      const url = `/api/admin/snapshot?scope=${scope}${scope === "person" ? `&userId=${authoringUser.id}` : ""}`;
      expect((await page.request.get(url)).status()).toBe(403);
    }
  }
  await section(page, "Content");
  await page.getByRole("button", { name: "Doc", exact: true }).click();
  await expect(page.getByRole("button", { name: "Create section", exact: true })).toHaveCount(0);
  await page.getByRole("textbox", { name: "Title", exact: true }).fill("Contributor draft");
  await waitForDraftSaved(page);
  await openContentSettings(page);
  await expect(page.getByRole("button", { name: "Create section", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Section", exact: true })).toBeVisible();
  await page.locator("main").evaluate((node) => Promise.all(
    node.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})),
  ));
  await page.screenshot({ path: info.outputPath("contributor-editor.png"), fullPage: true });
  await page.getByRole("button", { name: "Existing empty section", exact: true }).click();
  await page.getByRole("textbox", { name: "Short description", exact: true }).fill("Contributor publishing check.");
  await closeContentSettings(page);
  await page.getByRole("textbox", { name: "Doc content", exact: true }).fill("Contributor-written reference content.");
  await waitForDraftSaved(page);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByRole("button", { name: "Published", exact: true })).toBeVisible();
  await returnToContent(page);
  await page.getByRole("button", { name: "Course", exact: true }).click();
  await openContentSettings(page);
  await expect(page.getByRole("button", { name: "Manage assigned courses", exact: true })).toHaveCount(0);
  await expect(page.getByText("Groups", { exact: true })).toHaveCount(0);
});

test("contributor Update audience offers groups without team or Organization controls", async ({
  page,
}, info) => {
  await setup(
    page,
    info.project.name.startsWith("production"),
    "contributor",
    false,
  );
  await openMenu(page);
  await page
    .getByRole("menuitem", { name: "Manage content", exact: true })
    .click();
  await page.getByRole("button", { name: "Update", exact: true }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Contributor audience draft");
  await expect(page.locator(".editor-heading [role=status] .sr-only")).toHaveText("Saved");
  await openContentSettings(page);
  await page
    .getByRole("button", { name: /^(?:Assign audience|Edit Audience|Edit audience)$/, exact: true })
    .click();
  const panel = page.getByRole("dialog", {
    name: "Update audience",
    exact: true,
  });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("radio")).toHaveCount(0);
  await expect(panel.getByRole("checkbox", { name: /Team:/ })).toHaveCount(0);
  await expect(
    panel.getByRole("checkbox", { name: /Group:/ }).first(),
  ).toBeVisible();
  await panel
    .getByRole("checkbox", { name: /Group:/ })
    .first()
    .check();
  await panel
    .getByRole("button", { name: "Apply to draft", exact: true })
    .click();
  await expect(panel).not.toBeVisible();
});

test("team managers who contribute get two destinations; administrators get the organization destination", async ({ page }, info) => {
  const production = info.project.name.startsWith("production");
  await setup(page, production, "contributor", true);
  await openMenu(page);
  await expect(page.getByRole("menuitem", { name: "Manage content" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "My team’s progress" })).toBeVisible();
  await page.getByRole("menuitem", { name: "My team’s progress" }).click();
  await expect(page.getByText("Managed learner", { exact: true })).toBeVisible();
  await expect(page.getByText("Sibling secret", { exact: true })).toHaveCount(0);
  await setup(page, production, "admin", true);
  await openMenu(page);
  await expect(page.getByRole("menuitem", { name: "Manage organization" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Manage content" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "My team’s progress" })).toHaveCount(0);
});
