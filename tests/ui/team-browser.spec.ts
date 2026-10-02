import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace, type Workspace } from "../../lib/store";

const levelName = (index: number) =>
  `Revenue level ${String(index).padStart(2, "0")}${index === 11 ? " with a long internationally distributed team name" : ""}`;
function stable(workspace: Workspace) {
  workspace.users = workspace.users.map((person) => ({
    ...person,
    groupJoinedAt: Object.fromEntries(
      person.groups.map((id) => [id, "2026-01-01T00:00:00.000Z"]),
    ),
    effectiveGroupJoinedAt: Object.fromEntries(
      person.groups.map((id) => [id, "2026-01-01T00:00:00.000Z"]),
    ),
  }));
  return workspace;
}
function deepFixture() {
  const data = freshWorkspace();
  data.teams!.push(
    { id: "revenue", name: "Revenue" },
    { id: "operations", name: "Operations" },
  );
  data.teams!.push(
    ...Array.from({ length: 24 }, (_, index) => ({
      id: `peer-${index}`,
      name: `Peer team ${String(index).padStart(2, "0")}`,
    })),
  );
  for (let index = 1; index <= 11; index++)
    data.teams!.push({
      id: `level-${index}`,
      name: levelName(index),
      parentId: index === 1 ? "revenue" : `level-${index - 1}`,
    });
  data.users.find((person) => person.id === "demo-learner")!.teamId =
    "level-11";
  return stable(data);
}
async function seed(page: Page, workspace: Workspace) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((data) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    if (!localStorage.getItem("fieldbook.workspace.v1"))
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
  }, workspace);
  await page.goto("/#admin");
  await teamsSection(page);
}
async function teamsSection(page: Page) {
  await expect(page.locator(".admin-layout")).toBeVisible();
  const select = page.getByRole("combobox", {
    name: "Administration section",
    exact: true,
  });
  if (await select.isVisible()) {
    await select.click();
    await page.getByRole("option", { name: "Teams", exact: true }).click();
  } else await page.getByRole("tab", { name: "Teams", exact: true }).click();
}
async function saved(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!) as Workspace,
  );
}
async function pageAction(page: Page, name: string) {
  await page
    .getByRole("button", { name: "Teams page actions", exact: true })
    .click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}
async function browse(page: Page, name: string) {
  await page
    .getByRole("button", { name: `Browse ${name} subteams`, exact: true })
    .click();
}

test("twelve-level browser keeps bounded columns, recoverable ancestors and explicit open/edit", async ({
  page,
}, info) => {
  await seed(page, deepFixture());
  const baseline = await saved(page);
  const browser = page.locator('[data-slot="hierarchy-browser"]');
  await expect(
    browser.locator('[data-slot="hierarchy-column"]:visible'),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Open Operations", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("teams-root-browser.png"),
    fullPage: true,
  });
  const roots = browser.locator(
    '[data-branch-id=""] [data-slot="hierarchy-column-list"]',
  );
  await page
    .getByRole("button", { name: "Browse Revenue subteams", exact: true })
    .scrollIntoViewIfNeeded();
  const rootScroll = await roots.evaluate((list) => list.scrollTop);
  expect(rootScroll).toBeGreaterThan(0);
  await browse(page, "Revenue");
  await expect(
    page.getByRole("heading", { name: "Subteams of Revenue", exact: true }),
  ).toBeFocused();
  for (let index = 1; index <= 11; index++)
    await browse(page, levelName(index));
  const width = (await browser.boundingBox())!.width;
  await expect(
    browser.locator('[data-slot="hierarchy-column"]:visible'),
  ).toHaveCount(width >= 960 ? 3 : width >= 608 ? 2 : 1);
  await expect(
    page.getByRole("button", {
      name: `Browse ${levelName(11)} subteams`,
      exact: true,
    }),
  ).toBeFocused();
  await expect(
    page.getByRole("navigation", { name: "Teams path", exact: true }),
  ).toContainText(levelName(11));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("twelve-level-browser.png"),
    fullPage: true,
  });
  const ancestors = page.getByRole("button", {
    name: "Teams ancestors",
    exact: true,
  });
  await ancestors.click();
  await page.keyboard.press("Escape");
  await expect(ancestors).toBeFocused();
  await ancestors.click();
  const ancestor = [
    "Revenue",
    ...Array.from({ length: 4 }, (_, index) => levelName(index + 1)),
  ].join(" / ");
  await page.getByRole("menuitem", { name: ancestor, exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: `Subteams of ${levelName(4)}`,
      exact: true,
    }),
  ).toBeFocused();
  await page
    .getByRole("button", { name: `Edit ${levelName(5)}`, exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: `Edit ${levelName(5)}`,
    exact: true,
  });
  await editor
    .getByRole("textbox", { name: "Team name", exact: true })
    .fill("Unsaved rename");
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: `Edit ${levelName(5)}`, exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("heading", {
      name: `Subteams of ${levelName(4)}`,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Open ${levelName(5)}`, exact: true })
    .click();
  await expect(browser).toBeHidden();
  await expect(
    page.getByRole("heading", { name: levelName(5), exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to teams", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Teams", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByRole("heading", {
      name: `Subteams of ${levelName(4)}`,
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Teams path", exact: true })
    .getByRole("button", { name: "Teams", exact: true })
    .click();
  await expect
    .poll(() => roots.evaluate((list) => list.scrollTop))
    .toBeGreaterThanOrEqual(rootScroll - 1);
  expect((await saved(page)).teams).toEqual(baseline.teams);
  expect((await saved(page)).users).toEqual(baseline.users);
});

test("path search and flat bulk selection share the same matches; browsing a result reveals its branch", async ({
  page,
}, info) => {
  await seed(page, deepFixture());
  const baseline = await saved(page);
  const browser = page.locator('[data-slot="hierarchy-browser"]');
  const search = page.getByRole("searchbox", {
    name: "Find teams",
    exact: true,
  });
  await search.fill("Revenue");
  await expect(browser.locator("[data-hierarchy-id]")).toHaveCount(12);
  await expect(browser).toContainText(
    [
      "Revenue",
      ...Array.from({ length: 11 }, (_, index) => levelName(index + 1)),
    ].join(" / "),
  );
  await page.getByRole("button", { name: "Select teams", exact: true }).click();
  await expect(
    browser.getByRole("checkbox", { name: /^Select Revenue/ }),
  ).toHaveCount(12);
  await browser
    .getByRole("checkbox", { name: "Select all matching teams", exact: true })
    .check();
  await expect(browser).toContainText("12 selected");
  await browser
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await expect(
    browser.getByRole("checkbox", {
      name: `Select ${levelName(5)}`,
      exact: true,
    }),
  ).not.toBeChecked();
  await browse(page, levelName(11));
  await expect(search).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Done selecting", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: `Browse ${levelName(11)} subteams`,
      exact: true,
    }),
  ).toBeFocused();
  await page.screenshot({
    path: info.outputPath("searched-branch.png"),
    fullPage: true,
  });
  expect((await saved(page)).teams).toEqual(baseline.teams);
  expect((await saved(page)).users).toEqual(baseline.users);
  expect((await saved(page)).progress).toEqual(baseline.progress);
});

test("two successful new-team saves return to their parent and reveal each row; cancel and validation stay put", async ({
  page,
}, info) => {
  await seed(page, deepFixture());
  await page.getByRole("button", { name: "Open Revenue", exact: true }).click();
  await page.getByRole("button", { name: "Team actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Create subteam", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "New team", exact: true });
  await expect(
    editor.getByRole("combobox", { name: "Parent team", exact: true }),
  ).toContainText("Revenue");
  await editor
    .getByRole("textbox", { name: "Team name", exact: true })
    .fill("Regional team A");
  await editor.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Back to teams", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Browse Regional team A subteams",
      exact: true,
    }),
  ).toBeFocused();
  await page
    .getByRole("navigation", { name: "Teams path", exact: true })
    .getByRole("button", { name: "Teams", exact: true })
    .click();
  await browse(page, "Operations");
  const before = await saved(page);
  await page.getByRole("button", { name: "Add team", exact: true }).click();
  await editor
    .getByRole("textbox", { name: "Team name", exact: true })
    .fill("Canceled team");
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add team", exact: true }),
  ).toBeFocused();
  expect((await saved(page)).teams).toEqual(before.teams);
  await expect(
    page.getByRole("navigation", { name: "Teams path", exact: true }),
  ).toContainText("Operations");
  await page.getByRole("button", { name: "Add team", exact: true }).click();
  await editor
    .getByRole("textbox", { name: "Team name", exact: true })
    .fill("Regional team A");
  await editor.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(editor).toContainText("Use a unique team name");
  expect((await saved(page)).teams).toEqual(before.teams);
  await editor
    .getByRole("textbox", { name: "Team name", exact: true })
    .fill("Regional team B");
  await editor.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Browse Regional team B subteams",
      exact: true,
    }),
  ).toBeFocused();
  await expect(
    page.getByRole("navigation", { name: "Teams path", exact: true }),
  ).toContainText("Operations");
  const after = await saved(page);
  expect(
    after.teams!.find((team) => team.name === "Regional team A")!.parentId,
  ).toBe("revenue");
  expect(
    after.teams!.find((team) => team.name === "Regional team B")!.parentId,
  ).toBe("operations");
  expect(after.users).toEqual(before.users);
  expect(after.progress).toEqual(before.progress);
  await page.screenshot({
    path: info.outputPath("created-row-return.png"),
    fullPage: true,
  });
});

test("organization designation is explicit, cancelable and preserved on reload without changing memberships", async ({
  page,
}, info) => {
  const data = freshWorkspace();
  data.teams![0].name = "Company";
  data.teams!.push(
    { id: "west", name: "West team", parentId: "sales-team" },
    { id: "east", name: "East team", parentId: "sales-team" },
  );
  data.users.find((person) => person.id === "demo-learner")!.teamId = "west";
  await seed(page, stable(data));
  const baseline = await saved(page);
  await expect(
    page.getByRole("button", { name: "Open Company", exact: true }),
  ).toBeVisible();
  await pageAction(page, "Organization team…");
  const editor = page.getByRole("dialog", {
    name: "Organization team",
    exact: true,
  });
  await editor
    .getByRole("combobox", { name: "Organization team", exact: true })
    .click();
  await page.getByRole("option", { name: "Company", exact: true }).click();
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await saved(page)).settings?.organizationTeamId).toEqual(
    baseline.settings?.organizationTeamId,
  );
  await expect(
    page.getByRole("button", { name: "Open Company", exact: true }),
  ).toBeVisible();
  await pageAction(page, "Organization team…");
  await editor
    .getByRole("combobox", { name: "Organization team", exact: true })
    .click();
  await page.getByRole("option", { name: "Company", exact: true }).click();
  await editor
    .getByRole("button", { name: "Save organization team", exact: true })
    .click();
  await expect(editor).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open Company", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open West team", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Open East team", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add team", exact: true }).click();
  const newTeam = page.getByRole("dialog", { name: "New team", exact: true });
  await expect(
    newTeam.getByRole("combobox", { name: "Parent team", exact: true }),
  ).toContainText("Company");
  await newTeam.getByRole("button", { name: "Cancel", exact: true }).click();
  await pageAction(page, "Manage organization team");
  await expect(
    page.getByRole("heading", { name: "Company", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Team members", exact: true }),
  ).toContainText("Direct member");
  await expect(
    page.getByRole("table", { name: "Team members", exact: true }),
  ).toContainText("West team");
  await page
    .getByRole("button", { name: "Back to teams", exact: true })
    .click();
  await page.reload();
  await teamsSection(page);
  await expect(
    page.getByRole("button", { name: "Open Company", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open East team", exact: true }),
  ).toBeVisible();
  const after = await saved(page);
  expect(after.settings?.organizationTeamId).toBe("sales-team");
  expect(after.teams).toEqual(baseline.teams);
  expect(after.users).toEqual(baseline.users);
  expect(after.progress).toEqual(baseline.progress);
  await page.screenshot({
    path: info.outputPath("organization-subteams.png"),
    fullPage: true,
  });
});

test("missing, child and multiple-root designations fall back to ordinary stored teams", async ({
  page,
}) => {
  const data = stable(freshWorkspace());
  data.teams!.push({ id: "child", name: "Child team", parentId: "sales-team" });
  data.settings!.organizationTeamId = "missing";
  await seed(page, data);
  for (const id of ["missing", "child", "sales-team"]) {
    const next = structuredClone(data);
    next.settings!.organizationTeamId = id;
    if (id === "sales-team")
      next.teams!.push({ id: "other", name: "Other root" });
    await page.evaluate(
      (workspace) =>
        localStorage.setItem(
          "fieldbook.workspace.v1",
          JSON.stringify(workspace),
        ),
      next,
    );
    await page.reload();
    await teamsSection(page);
    await expect(
      page.getByRole("button", { name: "Open Sales team", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Teams page actions", exact: true })
      .click();
    await expect(
      page.getByRole("menuitem", {
        name: "Manage organization team",
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole("menuitem", { name: "Organization team…", exact: true })
      .click();
    const editor = page.getByRole("dialog", {
      name: "Organization team",
      exact: true,
    });
    if (id === "sales-team") {
      await expect(editor).toContainText(
        "use the parent controls to combine them",
      );
      await editor
        .getByRole("combobox", { name: "Organization team", exact: true })
        .click();
      await expect(page.getByRole("option")).toHaveCount(1);
      await page.getByRole("option", { name: "None", exact: true }).click();
    }
    await editor.getByRole("button", { name: "Cancel", exact: true }).click();
    expect((await saved(page)).settings?.organizationTeamId).toBe(id);
    expect((await saved(page)).teams).toEqual(next.teams);
  }
});
