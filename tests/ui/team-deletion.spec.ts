import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace, type Workspace } from "../../lib/store";
async function section(page: Page, name: string) {
  const picker = page.getByRole("combobox", {
    name: "Administration section",
    exact: true,
  });
  if (await picker.isVisible()) {
    await picker.click();
    await page.getByRole("option", { name, exact: true }).click();
  } else await page.getByRole("tab", { name, exact: true }).click();
}
const saved = (page: Page): Promise<Workspace> =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
  );
async function seed(page: Page, manyManagedTeams = false) {
  const data = freshWorkspace();
  const root = data.teams!.find((t) => t.system === "organization")!;
  data.teams = [
    root,
    { id: "parent", name: "Parent", parentId: root.id },
    { id: "deleted", name: "Delete this team", parentId: "parent" },
    {
      id: "child",
      name: "Surviving subteam",
      parentId: "deleted",
      managerId: "demo-manager",
    },
    { id: "nested", name: "Nested team", parentId: "child" },
  ];
  if (manyManagedTeams)
    data.teams.push(
      ...Array.from({ length: 40 }, (_, index) => ({
        id: `managed-${index}`,
        name: `Managed regional team ${index}`,
        parentId: root.id,
        managerId: "demo-manager",
      })),
    );
  data.groups = [];
  data.curricula = [];
  data.users = data.users
    .filter((u) =>
      ["demo-admin", "demo-manager", "demo-learner"].includes(u.id),
    )
    .map((u) => ({
      ...u,
      groups: [],
      teamId:
        u.id === "demo-manager"
          ? "child"
          : u.id === "demo-learner"
            ? "deleted"
            : undefined,
    }));
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    if (!localStorage.getItem("fieldbook.workspace.v1"))
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto("/#admin");
  await expect(page.locator(".admin-layout")).toBeVisible();
  return root.id;
}
test("bulk team deletion reviews paths, cancels safely and promotes the surviving branch to Organization", async ({
  page,
}, info) => {
  const root = await seed(page);
  await section(page, "Teams");
  await page.getByRole("button", { name: "Select multiple", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Select Delete this team", exact: true })
    .check();
  const before = await saved(page);
  const open = async () => {
    await page
      .getByRole("button", { name: "Bulk actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Delete selected teams", exact: true })
      .click();
  };
  await open();
  const dialog = page.getByRole("dialog", {
    name: "Delete 1 team?",
    exact: true,
  });
  await expect(dialog.getByLabel("Teams to delete")).toContainText(
    "Organization / Parent / Delete this team",
  );
  await expect(
    dialog.getByLabel("Subteams moving to Organization"),
  ).toContainText("Organization / Surviving subteam");
  await expect(dialog).toContainText("direct users will move to Organization");
  await page.screenshot({ path: info.outputPath("team-delete-review.png") });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await saved(page)).teams).toEqual(before.teams);
  await expect(
    page.getByRole("checkbox", {
      name: "Select Delete this team",
      exact: true,
    }),
  ).toBeChecked();
  await open();
  await dialog
    .getByRole("button", { name: "Delete teams", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const after = await saved(page);
  expect(after.teams!.some((t) => t.id === "deleted")).toBe(false);
  expect(after.teams!.find((t) => t.id === "child")).toEqual({
    ...before.teams!.find((t) => t.id === "child")!,
    parentId: root,
  });
  expect(after.teams!.find((t) => t.id === "nested")).toEqual(
    before.teams!.find((t) => t.id === "nested"),
  );
  expect(
    after.users.find((u) => u.id === "demo-learner")!.teamId,
  ).toBeUndefined();
  expect(after.users.find((u) => u.id === "demo-manager")!.teamId).toBe(
    "child",
  );
  expect(after.progress).toEqual(before.progress);
});
test("manager user deletion warns and leaves its team and members intact without a manager", async ({
  page,
}, info) => {
  await page.setViewportSize({
    width: info.project.use.viewport!.width,
    height: 600,
  });
  await seed(page, true);
  await section(page, "Demo profiles");
  const before = await saved(page);
  const manager = before.users.find((u) => u.id === "demo-manager")!;
  const query = page.getByRole("searchbox", {
    name: "Search profiles",
    exact: true,
  });
  await expect(query).toHaveAttribute("autocomplete", "off");
  await expect(query).toHaveAttribute("name", "admin-people-search");
  await page
    .getByRole("checkbox", { name: `Select ${manager.name}`, exact: true })
    .check();
  await page.getByRole("button", { name: "Bulk actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Delete selected", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("without a manager");
  await expect(dialog).toContainText("Surviving subteam");
  await expect(dialog).toContainText("Delete teams separately");
  const list = dialog.locator('[data-slot="scroll-region"]');
  await expect(list).toHaveAttribute("data-scroll-fade-after", "true");
  await list.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const bounds = await list.boundingBox();
  await page.mouse.move(
    bounds!.x + bounds!.width / 2,
    bounds!.y + bounds!.height / 2,
  );
  const needsOuterScroll = await dialog.evaluate(
    (el) => el.scrollHeight > el.clientHeight + 1,
  );
  if (needsOuterScroll) {
    const beforeScroll = await dialog.evaluate((el) => el.scrollTop);
    await page.mouse.wheel(0, 600);
    await expect
      .poll(() => dialog.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(beforeScroll);
  }
  await page.screenshot({ path: info.outputPath("manager-delete-review.png") });
  await dialog.getByRole("checkbox").check();
  await dialog
    .getByRole("button", { name: "Delete selected", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  const after = await saved(page);
  const { managerId, ...team } = before.teams!.find((t) => t.id === "child")!;
  expect(after.teams!.find((t) => t.id === "child")).toEqual(team);
  expect(after.teams!.find((t) => t.id === "nested")).toEqual(
    before.teams!.find((t) => t.id === "nested"),
  );
  expect(after.deletedItems!.some((item) => item.id === manager.id)).toBe(true);
});
