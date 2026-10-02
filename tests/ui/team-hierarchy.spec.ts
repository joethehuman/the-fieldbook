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
    {
      id: "deep",
      name: "Enterprise EMEA account executives and solutions engineering",
      parentId: "child",
    },
  );
  data.users.find((user) => user.id === "demo-learner")!.teamId = "deep";
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
    name: "Browse Customer success subteams",
    exact: true,
  });
  await expand.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", {
      name: "Open Regional customer success with a long descriptive name",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Find teams", exact: true })
    .fill("Regional");
  await expect(page.locator('[data-slot="hierarchy-browser"]')).toContainText(
    "Customer success / Regional customer success with a long descriptive name",
  );
  await expect(
    page.getByRole("button", { name: "Open Sales team", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("hierarchy-search.png"),
    fullPage: true,
  });
  await page
    .getByRole("searchbox", { name: "Find teams", exact: true })
    .fill("");
  await page
    .getByRole("navigation", { name: "Teams path", exact: true })
    .getByRole("button", { name: "Teams", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open Sales team", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Subteams", exact: true }),
  ).toHaveCount(0);
  await action(page, "Move existing team here");
  await page
    .getByRole("radio", {
      name: "Customer success Customer success",
      exact: true,
    })
    .check();
  const movePicker = page.getByRole("dialog", {
    name: "Move a team into Sales team",
    exact: true,
  });
  await expect(movePicker).toContainText("Sales team / Customer success");
  await movePicker
    .getByRole("button", { name: "Review move", exact: true })
    .click();
  const effects = page.getByRole("dialog", {
    name: "Review team move",
    exact: true,
  });
  await expect(effects).toContainText("Sales team / Customer success");
  await info.attach("review-dialog-dom", {
    body: JSON.stringify(
      await page.locator('[role="dialog"]').evaluateAll((nodes) =>
        nodes.map((node) => ({
          title: document.getElementById(
            node.getAttribute("aria-labelledby") || "",
          )?.textContent,
          ariaHidden: node.getAttribute("aria-hidden"),
          parentAriaHidden: node.parentElement?.getAttribute("aria-hidden"),
          dataSlot: node.getAttribute("data-slot"),
        })),
      ),
      null,
      2,
    ),
    contentType: "application/json",
  });
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await effects.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(effects).toHaveCount(0);
  await expect(movePicker).toBeVisible();
  await expect(
    movePicker.getByRole("button", { name: "Review move", exact: true }),
  ).toBeFocused();
  expect(
    (await saved(page)).teams!.find((team) => team.id === "other")!.parentId,
  ).toBeUndefined();
  await movePicker
    .getByRole("button", { name: "Review move", exact: true })
    .click();
  await page.screenshot({
    path: info.outputPath("branch-move-review.png"),
    fullPage: true,
  });
  await expect(effects).toBeVisible();
  await effects.getByRole("button", { name: "Move team", exact: true }).click();
  await expect(movePicker).toHaveCount(0);
  let after = await saved(page);
  expect(after.teams!.find((team) => team.id === "other")!.parentId).toBe(
    "sales-team",
  );
  expect(after.teams!.find((team) => team.id === "child")!.parentId).toBe(
    "other",
  );
  expect(after.teams!.find((team) => team.id === "deep")!.parentId).toBe(
    "child",
  );
  expect(after.users).toEqual(baseline.users);
  expect(after.progress).toEqual(baseline.progress);
  expect(after.groups).toEqual(baseline.groups);
  await page
    .getByRole("button", { name: "Back to teams", exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "Find teams", exact: true })
    .fill("Enterprise EMEA");
  await expect(
    page.getByRole("button", {
      name: "Open Enterprise EMEA account executives and solutions engineering",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('[data-slot="hierarchy-browser"]')).toContainText(
    "Sales team / Customer success / Regional customer success with a long descriptive name / Enterprise EMEA account executives and solutions engineering",
  );
  await page
    .getByRole("button", {
      name: "Browse Enterprise EMEA account executives and solutions engineering subteams",
      exact: true,
    })
    .click();
  await page.screenshot({
    path: info.outputPath("four-level-hierarchy.png"),
    fullPage: true,
  });
  await page
    .getByRole("searchbox", { name: "Find teams", exact: true })
    .fill("Customer success");
  await page
    .getByRole("button", { name: "Open Customer success", exact: true })
    .click();
  await action(page, "Move team");
  await expect(
    page.getByRole("radio", { name: /Regional customer success/ }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("radio", { name: /^Customer success/ }),
  ).toHaveCount(0);
  await page.getByRole("radio", { name: /^Top-level team/ }).check();
  await page.getByRole("button", { name: "Review move", exact: true }).click();
  await expect(effects).toContainText("Customer success");
  await effects.getByRole("button", { name: "Move team", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Move Customer success", exact: true }),
  ).toHaveCount(0);
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
  await page
    .getByRole("button", { name: "Open Empty team", exact: true })
    .click();
  await action(page, "Delete empty team");
  const deletion = page.getByRole("dialog", {
    name: "Delete Empty team?",
    exact: true,
  });
  await expect(deletion).toContainText("permanently removes the empty team");
  await deletion
    .getByRole("button", { name: "Delete team", exact: true })
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
