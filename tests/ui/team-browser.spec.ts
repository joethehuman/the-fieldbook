import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace, type Workspace } from "../../lib/store";

const levelName = (index: number) =>
  `Revenue level ${String(index).padStart(2, "0")}${index === 11 ? " with a long internationally distributed team name" : ""}`;
const longManagerName =
  "Alexandra Morgan — International Customer and Partner Operations";
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
  const rootId = data.teams!.find((team) => team.system === "organization")!.id;
  data.teams!.push(
    { id: "revenue", name: "Revenue", parentId: rootId },
    { id: "operations", name: "Operations", parentId: rootId },
  );
  data.teams!.push(
    ...Array.from({ length: 24 }, (_, index) => ({
      id: `peer-${index}`,
      name: `Peer team ${String(index).padStart(2, "0")}`,
      parentId: rootId,
    })),
  );
  for (let index = 1; index <= 11; index++)
    data.teams!.push({
      id: `level-${index}`,
      name: levelName(index),
      parentId: index === 1 ? "revenue" : `level-${index - 1}`,
      managerId: index === 11 ? "demo-manager" : undefined,
    });
  data.teams!.push(
    {
      id: "alternate",
      name: "Revenue alternative branch",
      parentId: "level-4",
    },
    {
      id: "alternate-child",
      name: "Revenue alternative territory",
      parentId: "alternate",
    },
  );
  data.users.find((person) => person.id === "demo-learner")!.teamId =
    "level-11";
  data.users.find((person) => person.id === "demo-manager")!.name =
    longManagerName;
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

test("twelve-level chart retains every depth, replaces the expanded sibling path and preserves scroll", async ({
  page,
}, info) => {
  await seed(page, deepFixture());
  const baseline = await saved(page);
  const browser = page.locator('[data-slot="hierarchy-browser"]');
  const chart = browser.getByRole("region", {
    name: "Teams chart",
    exact: true,
  });
  await expect(
    browser.locator('[data-slot="hierarchy-column"]:visible'),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Open Operations", exact: true }),
  ).toBeVisible();
  const operationCard = browser.locator('[data-hierarchy-id="operations"]');
  const node = await operationCard.boundingBox();
  expect(node!.width).toBeLessThanOrEqual(264);
  expect(node!.height).toBeLessThanOrEqual(100);
  const memberCount = operationCard.getByRole("img", {
    name: "0 direct members",
    exact: true,
  });
  await expect(memberCount).toBeVisible();
  await expect(
    operationCard.getByRole("img", {
      name: "0 subteams",
      exact: true,
    }),
  ).toBeVisible();
  await expect(operationCard.getByRole("button")).toHaveCount(3);
  const metricBounds = (await memberCount.boundingBox())!;
  const openBounds = (await operationCard
    .getByRole("button", {
      name: "Open Operations",
      exact: true,
    })
    .boundingBox())!;
  expect(
    Math.abs(
      metricBounds.y +
        metricBounds.height / 2 -
        openBounds.y -
        openBounds.height / 2,
    ),
  ).toBeLessThanOrEqual(2);
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
  const fixedControls = [
    page.getByRole("heading", { name: "Teams", exact: true }),
    page.getByRole("searchbox", { name: "Find teams", exact: true }),
    page.getByRole("button", { name: "Add team", exact: true }),
    page.getByRole("navigation", { name: "Teams path", exact: true }),
  ];
  const fixedTops = await Promise.all(
    fixedControls.map(async (control) => (await control.boundingBox())!.y),
  );
  const panel = page.locator(".admin-panel");
  await expect
    .poll(() =>
      panel.evaluate((element) => element.scrollHeight - element.clientHeight),
    )
    .toBeLessThanOrEqual(1);
  await chart.press("Home");
  await roots.evaluate((list) => {
    list.scrollTop = 0;
  });
  await roots.hover();
  await page.mouse.wheel(0, 500);
  await expect
    .poll(() => roots.evaluate((list) => list.scrollTop))
    .toBeGreaterThan(0);
  // Continue past the column boundary to catch wheel chaining into the panel.
  await page.mouse.wheel(0, 10000);
  await expect
    .poll(() =>
      roots.evaluate(
        (list) => list.scrollHeight - list.clientHeight - list.scrollTop,
      ),
    )
    .toBeLessThanOrEqual(1);
  await page.mouse.wheel(0, 500);
  for (let index = 0; index < fixedControls.length; index++)
    await expect
      .poll(async () =>
        Math.abs(
          (await fixedControls[index].boundingBox())!.y - fixedTops[index],
        ),
      )
      .toBeLessThanOrEqual(1);
  await roots.evaluate((list, scrollTop) => {
    list.scrollTop = scrollTop;
  }, rootScroll);
  for (let index = 1; index <= 11; index++)
    await browse(page, levelName(index));
  const longCard = browser.locator('[data-hierarchy-id="level-11"]');
  const manager = longCard.locator('[data-slot="hierarchy-manager"]');
  await expect(manager).toHaveAttribute("title", `Manager: ${longManagerName}`);
  expect(
    await manager.evaluate(
      (element) =>
        element.getBoundingClientRect().height <=
        parseFloat(getComputedStyle(element).lineHeight) * 2 + 1,
    ),
  ).toBe(true);
  await expect(
    longCard.getByRole("img", {
      name: "1 direct member",
      exact: true,
    }),
  ).toBeVisible();
  expect((await longCard.boundingBox())!.height).toBeLessThanOrEqual(132);
  await expect(
    browser.locator('[data-slot="hierarchy-column"]:visible'),
  ).toHaveCount(12);
  expect(
    await chart.evaluate(
      (element) => element.scrollWidth > element.clientWidth,
    ),
  ).toBe(true);
  expect(await chart.evaluate((element) => element.scrollLeft)).toBeGreaterThan(
    0,
  );
  await expect
    .poll(() => browser.locator('[data-slot="connector-line"]').count())
    .toBeGreaterThan(0);
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
  const chartPosition = await chart.evaluate((element) => element.scrollLeft);
  const search = page.getByRole("searchbox", {
    name: "Find teams",
    exact: true,
  });
  await search.fill("Operations");
  // Search also matches the deliberately long manager name on two teams.
  await expect(browser.locator("[data-hierarchy-id]")).toHaveCount(3);
  await search.fill("");
  await expect(browser.locator('[data-slot="hierarchy-column"]')).toHaveCount(
    12,
  );
  await expect
    .poll(async () =>
      Math.abs(
        (await chart.evaluate((element) => element.scrollLeft)) - chartPosition,
      ),
    )
    .toBeLessThanOrEqual(1);
  await page.screenshot({
    path: info.outputPath("twelve-level-browser.png"),
    fullPage: true,
  });
  await chart.focus();
  await page.keyboard.press("Home");
  await expect
    .poll(() => chart.evaluate((element) => element.scrollLeft))
    .toBe(0);
  await page.keyboard.press("End");
  expect(await chart.evaluate((element) => element.scrollLeft)).toBeGreaterThan(
    0,
  );
  const expandedAncestor = page.getByRole("button", {
    name: `Browse ${levelName(4)} subteams`,
    exact: true,
  });
  await expect(expandedAncestor).toHaveAttribute("aria-expanded", "true");
  await expandedAncestor.click();
  await expect(expandedAncestor).toHaveAttribute("aria-expanded", "false");
  await expect(expandedAncestor).toBeFocused();
  await expect(browser.locator('[data-slot="hierarchy-column"]')).toHaveCount(
    5,
  );
  await expect(browser.locator('[data-branch-id="level-4"]')).toHaveCount(0);
  await expandedAncestor.click();
  await expect(expandedAncestor).toHaveAttribute("aria-expanded", "true");
  for (let index = 5; index <= 11; index++)
    await browse(page, levelName(index));
  // Earlier sibling controls remain mounted even after twelve levels. Choosing
  // a different sibling keeps its ancestors and replaces the downstream path.
  await browse(page, "Revenue alternative branch");
  await expect(browser.locator('[data-slot="hierarchy-column"]')).toHaveCount(
    7,
  );
  await expect(browser.locator('[data-branch-id="level-5"]')).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Open Revenue alternative territory",
      exact: true,
    }),
  ).toBeVisible();
  await browse(page, levelName(5));
  await expect(browser.locator('[data-branch-id="alternate"]')).toHaveCount(0);
  for (let index = 6; index <= 11; index++)
    await browse(page, levelName(index));
  await expect(browser.locator('[data-slot="hierarchy-column"]')).toHaveCount(
    12,
  );
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
  expect(await chart.evaluate((element) => element.scrollLeft)).toBeGreaterThan(
    0,
  );
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
  await expect(browser.locator("[data-hierarchy-id]")).toHaveCount(14);
  await expect(browser).toContainText(
    [
      "Revenue",
      ...Array.from({ length: 11 }, (_, index) => levelName(index + 1)),
    ].join(" / "),
  );
  await page.getByRole("button", { name: "Select teams", exact: true }).click();
  await expect(
    browser.getByRole("checkbox", { name: /^Select Revenue/ }),
  ).toHaveCount(14);
  await browser
    .getByRole("checkbox", { name: "Select all matching teams", exact: true })
    .check();
  await expect(browser).toContainText("14 selected");
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
    editor.getByRole("button", { name: "Parent team", exact: true }),
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

test("built-in Organization has its own manager and direct-members page", async ({
  page,
}, info) => {
  const data = stable(freshWorkspace());
  const root = data.teams!.find((team) => team.system === "organization")!;
  data.users.find((person) => person.id === "demo-admin")!.teamId = root.id;
  data.teams!.push({ id: "west", name: "West team", parentId: "sales-team" });
  data.users.find((person) => person.id === "demo-learner")!.teamId = "west";
  await seed(page, data);
  const baseline = await saved(page);
  await expect(
    page.getByRole("button", { name: "Open Organization", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Open Sales team", exact: true }),
  ).toBeVisible();
  await pageAction(page, "Manage organization team");
  await expect(
    page.getByRole("heading", { name: "Organization", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Direct members", exact: true }),
  ).toBeVisible();
  const table = page.getByRole("table", { name: "Team members", exact: true });
  await expect(table).toContainText("Oliver Anderson");
  await expect(table).not.toContainText("Alex Edwards");
  await expect(
    page.getByRole("button", { name: "Team actions", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("tab", { name: "Subteams", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Edit manager", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "Organization manager",
    exact: true,
  });
  await expect(
    editor.getByRole("textbox", { name: "Team name", exact: true }),
  ).toHaveCount(0);
  await expect(
    editor.getByRole("button", { name: "Parent team", exact: true }),
  ).toHaveCount(0);
  await editor.getByRole("combobox", { name: "Manager", exact: true }).click();
  await page.getByRole("option", { name: "Sara Downy", exact: true }).click();
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await saved(page)).teams).toEqual(baseline.teams);
  await page.getByRole("button", { name: "Add members", exact: true }).click();
  const add = page.getByRole("dialog", { name: "Add members", exact: true });
  await add.getByRole("checkbox", { name: /^Alex Edwards/ }).check();
  await add.getByRole("button", { name: /^Review changes/ }).click();
  const review = page.getByRole("dialog", {
    name: "Review membership changes",
    exact: true,
  });
  await review
    .getByRole("button", { name: "Add members", exact: true })
    .click();
  await expect(add).not.toBeVisible();
  await expect(table).toContainText("Alex Edwards");
  await page.screenshot({
    path: info.outputPath("organization-direct-members.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Back to teams", exact: true })
    .click();
  await page.reload();
  await teamsSection(page);
  const after = await saved(page);
  expect(after.settings!.organizationTeamId).toBe(root.id);
  expect(after.teams).toEqual(baseline.teams);
  expect(after.progress).toEqual(baseline.progress);
  expect(
    after.users.find((person) => person.id === "demo-learner")!.teamId,
  ).toBe(root.id);
});

test("legacy root upgrade preserves an explicit sole root and neutrally joins multiple roots", async ({
  page,
}) => {
  for (const preserve of [true, false]) {
    const data = stable(freshWorkspace());
    data.teams = [
      { id: "company", name: "Company", managerId: "demo-manager" },
      { id: "sales-team", name: "Sales team", parentId: "company" },
      ...(preserve ? [] : [{ id: "other", name: "Other team" }]),
    ];
    data.settings!.organizationTeamId = "company";
    data.users.find((person) => person.id === "demo-admin")!.teamId = "company";
    await page.goto("/");
    await page.evaluate((workspace) => {
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
    }, data);
    await page.goto("/#admin");
    await page.reload();
    await teamsSection(page);
    const after = await saved(page);
    const root = after.teams!.find((team) => team.system === "organization")!;
    expect(root.parentId).toBeUndefined();
    expect(root.id).toBe(after.settings!.organizationTeamId);
    expect(root.managerId).toBe(preserve ? "demo-manager" : undefined);
    expect(root.name).toBe(preserve ? "Company" : "Organization");
    expect(root.id === "company").toBe(preserve);
    expect(after.users.map((person) => person.teamId)).toEqual(
      data.users.map((person) => person.teamId),
    );
    expect(after.progress).toEqual(data.progress);
    expect(after.teams!.filter((team) => !team.parentId)).toHaveLength(1);
    await pageAction(page, "Manage organization team");
    await expect(
      page.getByRole("heading", { name: "Organization", exact: true }),
    ).toBeVisible();
  }
});
