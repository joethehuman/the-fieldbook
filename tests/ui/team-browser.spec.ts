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
  if (name !== "Manage organization team")
    throw new Error(`Unknown Teams action: ${name}`);
  await page.getByRole("button", { name: "Organization", exact: true }).click();
}
async function browse(page: Page, name: string) {
  const chartNode = page.getByRole("button", { name: `Browse ${name} subteams`, exact: true });
  if (await chartNode.count()) {
    await chartNode.click();
  } else {
    const row = page.locator('table[data-layout="teamDirectory"] tbody tr').filter({
      has: page.getByRole("button", { name, exact: true }),
    });
    await row.getByRole("button", { name: `Actions for ${name}`, exact: true }).click();
    await page.getByRole("menuitem", { name: "Browse subteams", exact: true }).click();
  }
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
  const chartTop = (await chart.boundingBox())!.y;
  await browse(page, "Revenue");
  await expect(
    page.getByRole("navigation", { name: "Teams path", exact: true }),
  ).toHaveCount(0);
  await expect
    .poll(async () => Math.abs((await chart.boundingBox())!.y - chartTop))
    .toBeLessThanOrEqual(1);
  await expect(
    page.getByRole("heading", { name: "Subteams of Revenue", exact: true }),
  ).toBeFocused();
  const fixedControls = [
    page.getByRole("heading", { name: "Teams", exact: true }),
    page.getByRole("searchbox", { name: "Find teams", exact: true }),
    page.getByRole("button", { name: "Add team", exact: true }),
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
  await expect(browser.locator('[data-hierarchy-id="level-11"]')).toContainText(
    levelName(11),
  );
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
  // Ancestor cards remain the way to collapse/reopen an earlier branch.
  await chart.press("Home");
  await browse(page, levelName(4));
  await browse(page, levelName(4));
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
  await chart.press("Home");
  await browse(page, "Revenue");
  await expect
    .poll(() => roots.evaluate((list) => list.scrollTop))
    .toBeGreaterThanOrEqual(rootScroll - 1);
  expect((await saved(page)).teams).toEqual(baseline.teams);
  expect((await saved(page)).users).toEqual(baseline.users);
});

test("saved parent owns its child and connector across sibling switches and reload", async ({
  page,
}, info) => {
  const data = freshWorkspace();
  const root = data.teams!.find((team) => team.system === "organization")!;
  data.teams!.push(
    { id: "chart-sales", name: "Chart sales", parentId: root.id },
    { id: "chart-two", name: "Team 2", parentId: "chart-sales" },
    { id: "chart-a", name: "Team A", parentId: "chart-sales" },
    { id: "chart-y", name: "Team Y", parentId: "chart-a" },
    { id: "chart-empty", name: "Empty sibling", parentId: "chart-sales" },
  );
  await seed(page, stable(data));
  await browse(page, "Chart sales");
  await browse(page, "Team A");
  await page.getByRole("button", { name: "Add team", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "New team", exact: true });
  await editor
    .getByRole("textbox", { name: "Team name", exact: true })
    .fill("Team C");
  await editor
    .getByRole("button", { name: "Parent team", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Find a parent team", exact: true })
    .fill("Team 2");
  await page.getByRole("option", { name: /Team 2$/, exact: false }).click();
  await editor.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const created = (await saved(page)).teams!.find(
    (team) => team.name === "Team C",
  )!;
  expect(created.parentId).toBe("chart-two");
  const browser = page.locator('[data-slot="hierarchy-browser"]');
  const chart = browser.getByRole("region", {
    name: "Teams chart",
    exact: true,
  });
  const createdCard = browser.locator(`[data-hierarchy-id="${created.id}"]`);
  const createdEdge = browser.locator(
    `[data-slot="hierarchy-child-connection"][data-child-id="${created.id}"]`,
  );
  async function ownBranch() {
    await expect(
      page.getByRole("heading", { name: "Subteams of Team 2", exact: true }),
    ).toBeVisible();
    await expect(createdCard).toBeVisible();
    await expect(createdEdge).toHaveCount(1);
    await expect(createdEdge).toHaveAttribute("data-parent-id", "chart-two");
    await expect(browser.locator('[data-hierarchy-id="chart-y"]')).toHaveCount(
      0,
    );
    // Measure the stem itself: it must start at Team 2's right edge and midpoint.
    const stem = browser
      .locator(
        '[data-slot="hierarchy-connection"][data-parent-id="chart-two"] > [data-slot="connector-line"]',
      )
      .first();
    await expect
      .poll(async () => {
        const parent = (await browser
          .locator('[data-hierarchy-id="chart-two"]')
          .boundingBox())!;
        const line = (await stem.boundingBox())!;
        return Math.max(
          Math.abs(line.x - parent.x - parent.width),
          Math.abs(line.y - parent.y - parent.height / 2),
        );
      })
      .toBeLessThanOrEqual(1);
  }
  await ownBranch();
  for (let index = 0; index < 3; index++) {
    await browse(page, "Team A");
    await expect(createdCard).toHaveCount(0);
    await expect(createdEdge).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "Subteams of Team A", exact: true }),
    ).toBeVisible();
    await expect(
      browser.locator(
        '[data-slot="hierarchy-child-connection"][data-child-id="chart-y"]',
      ),
    ).toHaveAttribute("data-parent-id", "chart-a");
    await browse(page, "Team 2");
    await ownBranch();
  }
  await browse(page, "Empty sibling");
  await expect(browser.locator('[data-slot="hierarchy-column"]')).toHaveCount(
    2,
  );
  await expect(createdCard).toHaveCount(0);
  await expect(createdEdge).toHaveCount(0);
  await browse(page, "Team 2");
  await ownBranch();
  await page.screenshot({
    path: info.outputPath("single-parent-branch.png"),
    fullPage: true,
  });
  const beforeReload = await saved(page);
  await page.reload();
  await teamsSection(page);
  expect((await saved(page)).teams).toEqual(beforeReload.teams);
  await browse(page, "Chart sales");
  await browse(page, "Team 2");
  await ownBranch();
  await chart.focus();
  await chart.press("Home");
  await browse(page, "Team 2");
  await expect(createdCard).toHaveCount(0);
  await expect(createdEdge).toHaveCount(0);
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
  await page.getByRole("button", { name: "Select multiple", exact: true }).click();
  await expect(
    browser.getByRole("checkbox", { name: /^Select Revenue/ }),
  ).toHaveCount(14);
  await browser
    .getByRole("checkbox", { name: "Select all 14", exact: true })
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
  await browse(page, "Revenue");
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
    page.getByRole("button", {
      name: "Browse Operations subteams",
      exact: true,
    }),
  ).toHaveAttribute("aria-current", "location");
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
    page.getByRole("heading", { name: "Subteams of Operations", exact: true }),
  ).toBeVisible();
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
  data.users.find((person) => person.id === "demo-admin")!.teamId = undefined;
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
    page.getByRole("heading", { name: "People at Organization", exact: true }),
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
  ).toBeUndefined();
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

test("Organization automatically includes people without teams and supports a reviewed round trip", async ({
  page,
}, info) => {
  const data = stable(freshWorkspace());
  const admin = data.users.find((person) => person.id === "demo-admin")!;
  expect(admin.teamId).toBeUndefined();
  await seed(page, data);
  const beforeTeams = (await saved(page)).teams;
  await page.getByRole("button", { name: "Organization", exact: true }).click();
  const table = page.getByRole("table", { name: "Team members", exact: true });
  await expect(table).toContainText(admin.name);
  await expect(
    page.getByRole("heading", { name: "Guests", exact: true }),
  ).toHaveCount(0);
  await table
    .getByRole("checkbox", { name: `Select ${admin.name}`, exact: true })
    .check();
  await page.getByRole("button", { name: "Bulk actions", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "Remove from team", exact: true }),
  ).toHaveAttribute("aria-disabled", "true");
  await page
    .getByRole("menuitem", { name: "Move to team", exact: true })
    .click();
  const move = page.getByRole("dialog", { name: "Move to team", exact: true });
  await move
    .getByRole("combobox", { name: "Destination", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Organization / Sales team", exact: true })
    .click();
  await move
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: "Review membership changes",
    exact: true,
  });
  await review
    .getByRole("button", { name: "Move members", exact: true })
    .click();
  await expect(move).not.toBeVisible();
  await expect(table).not.toContainText(admin.email);
  expect(
    (await saved(page)).users.find((person) => person.id === admin.id)!.teamId,
  ).toBe("sales-team");
  await page
    .getByRole("button", { name: "Back to teams", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Open Sales team", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: `Remove ${admin.name} from team`,
      exact: true,
    })
    .click();
  await page
    .getByRole("dialog", { name: "Review membership changes", exact: true })
    .getByRole("button", { name: "Remove member", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Back to teams", exact: true })
    .click();
  await page.getByRole("button", { name: "Organization", exact: true }).click();
  await expect(table).toContainText(admin.name);
  const after = await saved(page);
  expect(
    after.users.find((person) => person.id === admin.id)!.teamId,
  ).toBeUndefined();
  expect(after.progress).toEqual(data.progress);
  expect(after.teams).toEqual(beforeTeams);
  expect(after.settings?.guestGroupId).toBe(data.settings?.guestGroupId);
  await page.screenshot({
    path: info.outputPath("organization-fallback-round-trip.png"),
    fullPage: true,
  });
  after.settings!.access = "private";
  await page.evaluate(
    (workspace) =>
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace)),
    after,
  );
  await page.reload();
  await teamsSection(page);
  await page.getByRole("button", { name: "Organization", exact: true }).click();
  await expect(page.getByText("Guests", { exact: true })).toHaveCount(0);
});


test("standard Teams table keeps page selection and restores the chart", async ({ page }, info) => {
  const data = stable(freshWorkspace());
  const total = data.teams!.filter((team) => team.system !== "organization").length;
  await seed(page, data);
  await browse(page, "Sales");
  const browser = page.locator('[data-slot="hierarchy-browser"]');
  const columns = browser.locator('[data-slot="hierarchy-column"]');
  await expect(columns).toHaveCount(2);
  await page.getByRole("button", { name: "Select multiple", exact: true }).click();
  const table = browser.locator('table[data-layout="teamDirectory"]');
  await expect(table.getByRole("columnheader")).toHaveText(["", "Team", "Manager", "Members", "Subteams", "Actions"]);
  await expect(table.locator("tbody tr")).toHaveCount(25);
  await expect(browser.getByRole("region", { name: "Selected items" })).toContainText(`1–25 of ${total} shown`);
  await expect(browser.getByText("Choose two or more teams", { exact: false })).toHaveCount(0);
  const menu = browser.getByRole("button", { name: "Bulk actions", exact: true });
  await table.locator("tbody tr").first().getByRole("checkbox").check();
  await expect(menu).toBeDisabled();
  await table.getByRole("checkbox", { name: "Select page (25)", exact: true }).check();
  await expect(browser.getByRole("region", { name: "Selected items" })).toContainText("25 selected");
  await expect(menu).toBeEnabled();
  await browser.getByRole("button", { name: "Next", exact: true }).click();
  await expect(table.locator("tbody tr")).toHaveCount(total - 25);
  await expect(browser.getByRole("region", { name: "Selected items" })).toContainText(`26–${total} of ${total} shown`);
  await expect(browser.getByRole("region", { name: "Selected items" })).toContainText("25 selected");
  await table.locator("tbody tr").first().getByRole("checkbox").check();
  await expect(browser.getByRole("region", { name: "Selected items" })).toContainText("26 selected");
  await browser.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(table.getByRole("checkbox", { name: "Select page (25)", exact: true })).toBeChecked();
  await page.screenshot({ path: info.outputPath("teams-standard-table.png"), fullPage: true });
  const search = page.getByRole("searchbox", { name: "Find teams", exact: true });
  await search.fill("APAC Sales Enterprise");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table.getByRole("checkbox")).toHaveCount(0);
  await expect(menu).toHaveCount(0);
  await expect(browser).toContainText("1–1 of 1 shown");
  await search.fill("No matching team xyz");
  await expect(table).toHaveCount(0);
  await expect(browser).toContainText("0 results");
  await search.fill("");
  await expect(table.locator("tbody tr")).toHaveCount(25);
  await expect(menu).toBeDisabled();
  await page.getByRole("button", { name: "Done selecting", exact: true }).click();
  await expect(table).toHaveCount(0);
  await expect(columns).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Browse Sales subteams", exact: true })).toHaveAttribute("aria-expanded", "true");
});
