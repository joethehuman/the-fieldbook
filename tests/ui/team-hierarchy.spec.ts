import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace, type Workspace } from "../../lib/store";

async function section(page: Page) {
  const picker = page.getByRole("combobox", {
    name: "Administration section",
    exact: true,
  });
  if (await picker.isVisible()) {
    await picker.click();
    await page.getByRole("option", { name: "Teams", exact: true }).click();
  } else await page.getByRole("tab", { name: "Teams", exact: true }).click();
}
async function saved(page: Page): Promise<Workspace> {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
  );
}
async function action(page: Page, name: string) {
  await page.getByRole("button", { name: "Team actions", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}

test("search hierarchy, move existing branch, detach and guard deletion", async ({
  page,
}, info) => {
  const data = freshWorkspace();
  data.teams!.push(
    { id: "other", name: "Customer success" },
    {
      id: "child",
      name: "Regional customer success with a long descriptive name",
      parentId: "other",
    },
  );
  data.users.find((user) => user.id === "demo-learner")!.teamId = "child";
  data.users = data.users.map((user) => ({
    ...user,
    groupJoinedAt: Object.fromEntries(
      user.groups.map((id) => [id, "2026-01-01T00:00:00.000Z"]),
    ),
    effectiveGroupJoinedAt: Object.fromEntries(
      user.groups.map((id) => [id, "2026-01-01T00:00:00.000Z"]),
    ),
  }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    if (!localStorage.getItem("fieldbook.workspace.v1"))
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto("/#admin");
  await expect(page.locator(".admin-layout")).toBeVisible();
  const baseline = await saved(page);
  await section(page);
  const expand = page.getByRole("button", {
    name: "Expand Customer success",
    exact: true,
  });
  await expand.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", {
      name: "Manage Regional customer success with a long descriptive name",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Find teams", exact: true })
    .fill("Regional");
  await expect(
    page.getByRole("button", { name: "Manage Customer success", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Manage Sales team", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("hierarchy-search.png"),
    fullPage: true,
  });
  await page
    .getByRole("searchbox", { name: "Find teams", exact: true })
    .fill("");
  await page
    .getByRole("button", { name: "Manage Sales team", exact: true })
    .click();
  await page.getByRole("tab", { name: "Subteams", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Create subteam", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Move existing team here", exact: true })
    .click();
  await page
    .getByRole("radio", {
      name: "Customer success Customer success",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Review move", exact: true }).click();
  const review = page.locator("#team-move");
  await expect(review).toContainText("Sales team / Customer success");
  await expect(review).toContainText("2 teams and 1 member");
  await expect(review).toContainText("Gains 2 teams / 1 active person.");
  await page.screenshot({
    path: info.outputPath("branch-move-review.png"),
    fullPage: true,
  });
  await review.getByRole("button", { name: "Move team", exact: true }).click();
  await expect(review).toHaveCount(0);
  let after = await saved(page);
  expect(after.teams!.find((team) => team.id === "other")!.parentId).toBe(
    "sales-team",
  );
  expect(after.teams!.find((team) => team.id === "child")!.parentId).toBe(
    "other",
  );
  expect(after.users).toEqual(baseline.users);
  expect(after.progress).toEqual(baseline.progress);
  expect(after.groups).toEqual(baseline.groups);
  await page
    .getByRole("button", { name: "Manage Customer success", exact: true })
    .click();
  await page.getByRole("button", { name: "Move team", exact: true }).click();
  await expect(
    page.getByRole("radio", { name: /Regional customer success/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("radio", { name: /^Customer success/ }),
  ).toHaveCount(0);
  await page.getByRole("radio", { name: /^Top-level team/ }).check();
  await page.getByRole("button", { name: "Review move", exact: true }).click();
  await expect(review).toContainText("Loses 2 teams / 1 active person.");
  await review.getByRole("button", { name: "Move team", exact: true }).click();
  await expect(review).toHaveCount(0);
  after = await saved(page);
  expect(
    after.teams!.find((team) => team.id === "other")!.parentId,
  ).toBeUndefined();
  await action(page, "Delete empty team");
  await expect(page.locator("[data-slot=alert]")).toContainText(
    "1 immediate subteams",
  );
  expect((await saved(page)).teams!.some((team) => team.id === "other")).toBe(
    true,
  );
  await page
    .getByRole("button", { name: "Back to teams", exact: true })
    .click();
  await page.getByRole("button", { name: "Add team", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Team name", exact: true })
    .fill("Empty team");
  await dialog.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await action(page, "Delete empty team");
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(
    page.getByRole("searchbox", { name: "Find teams", exact: true }),
  ).toBeVisible();
  expect(
    (await saved(page)).teams!.some((team) => team.name === "Empty team"),
  ).toBe(false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
