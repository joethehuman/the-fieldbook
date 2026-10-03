import { freshWorkspace } from "../../lib/store";
import { learningUiFixture } from "../fixtures/learning-ui";
import { test, expect, type Page } from "@playwright/test";

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}
async function learner(page: Page) {
  await page.addInitScript(() =>
    sessionStorage.setItem("fieldbook.profile.v1", "demo-learner"),
  );
}
async function adminSection(page: Page, name: string) {
  // Reloads remount the lazy Administration bundle before its navigation.
  await expect(page.locator(".admin-layout")).toBeVisible();
  const picker = page.getByRole("combobox", {
    name: "Administration section",
    exact: true,
  });
  if (await picker.isVisible()) {
    await picker.click();
    await page.getByRole("option", { name, exact: true }).click();
  } else await page.getByRole("tab", { name, exact: true }).click();
}
async function admin(page: Page) {
  await page.addInitScript(() =>
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin"),
  );
  await page.goto("/#admin");
  await expect(page.locator(".admin-layout")).toBeVisible();
}

test("catalog: keyboard select, tab spacing, dialog stacking and ordering", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/ui");
  await expect(
    page.getByRole("heading", { name: "Interface reference" }),
  ).toBeVisible();
  const tabs = page.getByRole("tablist", { name: "Example group sections" });
  const members = tabs.getByRole("tab", { name: "People" });
  const panel = page.getByRole("tabpanel", { name: "People" });
  const select = panel.getByRole("combobox", { name: "Linked team" });
  const tabBox = await tabs.boundingBox(),
    fieldBox = await select.boundingBox();
  expect(fieldBox!.y - (tabBox!.y + tabBox!.height)).toBeGreaterThanOrEqual(20);
  await select.focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("option", { name: "No linked team", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("option", { name: "No linked team", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(select).toHaveText("No linked team");
  await select.click();
  await page
    .getByRole("option", {
      name: "Sales and customer success with a deliberately long group name",
      exact: true,
    })
    .click();
  await noOverflow(page);

  await expect(select).toBeFocused();
  await members.focus();
  await expect(members).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(
    tabs.getByRole("tab", { name: "Assigned Courses" }),
  ).toHaveAttribute("aria-selected", "true");
  const order = page.getByRole("tabpanel", { name: "Assigned Courses" });
  await order
    .getByRole("button", { name: "Move Company essentials down", exact: true })
    .click();
  await expect(order.locator("li").first()).toContainText(
    "Customer conversations",
  );
  await order
    .getByRole("button", { name: "Move Company essentials up", exact: true })
    .click();
  await expect(order.locator("li").first()).toContainText("Company essentials");
  const trigger = page.getByRole("button", { name: "Edit example group" });
  await trigger.click();
  const dialog = page.getByRole("dialog");
  const dialogSelect = dialog.getByRole("combobox", {
    name: "Dialog linked team",
  });
  await dialogSelect.click();
  // Opening a nested Select hides siblings for accessibility; its dialog stays painted.
  const paintedDialog = page.locator('[data-slot="dialog-content"]');
  const paintedSelect = paintedDialog.locator('[data-slot="select-trigger"]');
  await expect(paintedDialog).toBeVisible();
  await expect(paintedSelect).toBeVisible();
  const option = page.getByRole("option", { name: "Company", exact: true });
  await expect(option).toBeVisible();
  const triggerBox = await paintedSelect.boundingBox();
  const menuBox = await page
    .locator('[data-slot="select-content"]')
    .boundingBox();
  // A wider option list may shift to stay inside a narrow viewport.
  expect(Math.abs(menuBox!.x - triggerBox!.x)).toBeLessThan(
    Math.abs(menuBox!.width - triggerBox!.width) + 8,
  );
  expect(menuBox!.x).toBeGreaterThanOrEqual(0);
  expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  expect(
    Math.min(
      Math.abs(menuBox!.y - triggerBox!.y - triggerBox!.height - 5),
      Math.abs(menuBox!.y + menuBox!.height + 5 - triggerBox!.y),
    ),
  ).toBeLessThan(8);
  await page.getByRole("option", { name: "Company", exact: true }).click();
  await expect(dialog.getByRole("combobox")).toHaveText("Company");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await noOverflow(page);
  await testInfo.attach("component-catalog", {
    body: await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath("review.png"),
    }),
    contentType: "image/png",
  });
  expect(errors).toEqual([]);
});

test("learning groups: shared controls, save and reload", async ({
  page,
}, testInfo) => {
  await admin(page);
  await adminSection(page, "Learning groups");
  const search = page.getByRole("searchbox", {
    name: "Find a group",
    exact: true,
  });
  await expect(search).toBeVisible();
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  const createDialog = page.getByRole("dialog", {
    name: "Create learning group",
    exact: true,
  });
  await createDialog
    .getByRole("textbox", { name: "Group name", exact: true })
    .fill("Sales design test");
  await expect(
    createDialog.getByRole("combobox", { name: "Parent group" }),
  ).toHaveCount(0);
  await createDialog
    .getByRole("button", { name: "Create group", exact: true })
    .click();
  await expect(createDialog).not.toBeVisible();
  const createdGroup = page.getByRole("button", {
    name: "Sales design test",
    exact: true,
  });
  await expect(createdGroup).toBeFocused();
  await expect(
    page.getByRole("table", { name: "Learning groups", exact: true }),
  ).toBeVisible();
  await createdGroup.click();
  await expect(
    page.getByRole("heading", { name: "Sales design test", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "People", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("button", { name: /Add child group|Move group/ }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "People", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Add Members", exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: testInfo.outputPath("flat-group-detail.png"),
    fullPage: true,
  });
  await page.reload();
  await adminSection(page, "Learning groups");
  await search.fill("Sales design test");
  await page
    .getByRole("button", { name: "Sales design test", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Group settings", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Rename group", exact: true })
    .click();
  const rename = page.getByRole("dialog", {
    name: "Rename learning group",
    exact: true,
  });
  await rename
    .getByRole("textbox", { name: "Group name", exact: true })
    .fill("Account executives");
  await rename.getByRole("button", { name: "Save name", exact: true }).click();
  await expect(rename.getByRole("alert")).toContainText("already in use");
  await rename
    .getByRole("textbox", { name: "Group name", exact: true })
    .fill("Sales design test");
  await rename.getByRole("button", { name: "Cancel", exact: true }).click();
});

test("admin menu scroll stays put while the new panel starts at the top", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.setViewportSize({ width: 1280, height: 400 });
  await admin(page);
  const nav = page.locator('[data-slot="admin-navigation"] [role="tablist"]');
  await expect(nav).toBeVisible();
  await expect(nav).toHaveAttribute("data-scroll-fade-after", "true");
  await expect(page.locator("main h1")).toHaveClass(/sr-only/);
  await expect(nav.getByText("Administration", { exact: true })).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText(
    "Content, people, and the settings that keep your organization running.",
  );
  const panel = page.getByRole("tabpanel", { name: "Content" });
  const shellPositions = await page.evaluate(() => ({
    header: document.querySelector(".topbar")!.getBoundingClientRect().top,
    sidebar: document.querySelector(".sidebar")!.getBoundingClientRect().top,
  }));
  await nav.hover();
  await page.mouse.wheel(0, 500);
  await expect
    .poll(() => nav.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  await expect(nav).toHaveAttribute("data-scroll-fade-before", "true");
  expect(await panel.evaluate((element) => element.scrollTop)).toBe(0);
  const before = await nav.evaluate((element) => element.scrollTop);
  await panel.hover();
  await page.mouse.wheel(0, 500);
  await expect
    .poll(() => panel.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  expect(await nav.evaluate((element) => element.scrollTop)).toBe(before);
  await panel.evaluate((element) => (element.scrollTop = element.scrollHeight));
  await page.mouse.wheel(0, 500);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(
    await page.evaluate(() => ({
      header: document.querySelector(".topbar")!.getBoundingClientRect().top,
      sidebar: document.querySelector(".sidebar")!.getBoundingClientRect().top,
    })),
  ).toEqual(shellPositions);
  await nav.getByRole("tab", { name: "Privacy", exact: true }).click();
  await expect(page.getByRole("tabpanel", { name: "Privacy" })).toBeVisible();
  expect(await nav.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(
    page.getByRole("tabpanel", { name: "Privacy" }),
  ).toBeInViewport();
});

test("short pages keep the shared shell fixed at both scroll limits", async ({
  page,
}) => {
  await learner(page);
  const data = freshWorkspace();
  data.content = [];
  await page.addInitScript((workspace) => {
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto("/#updates");
  const main = page.locator("#main-content");
  await expect(page.getByText("No updates published yet.")).toBeVisible();
  const before = await page.evaluate(() => ({
    header: document.querySelector(".topbar")!.getBoundingClientRect().top,
    sidebar: document.querySelector(".sidebar")!.getBoundingClientRect().top,
  }));
  await main.hover();
  await page.mouse.wheel(0, -600);
  await page.mouse.wheel(0, 600);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect(await main.evaluate((element) => element.scrollTop)).toBe(0);
  expect(
    await page.evaluate(() => ({
      header: document.querySelector(".topbar")!.getBoundingClientRect().top,
      sidebar: document.querySelector(".sidebar")!.getBoundingClientRect().top,
    })),
  ).toEqual(before);
});

test("scrollbars leave room beside Admin feedback controls and cards", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  await page.setViewportSize({ width: 1280, height: 560 });
  const data = freshWorkspace();
  const item = data.content[0];
  data.feedback = data.users.slice(0, 3).map((user, index) => ({
    id: `scrollbar-feedback-${index}`,
    userId: user.id,
    contentId: item.id,
    version: item.version,
    rating: index === 0 ? "down" : "up",
    comment: "Feedback alongside the scrollbar",
    updatedAt: "2026-09-25T12:00:00Z",
  }));
  await page.addInitScript((workspace) => {
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await admin(page);
  await adminSection(page, "Feedback");
  const panel = page.getByRole("tabpanel", { name: "Feedback" });
  await expect(panel.getByText("Feedback alongside the scrollbar")).toHaveCount(
    3,
  );
  expect(await panel.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  const distanceFromPanelEdge = (locator: ReturnType<Page["locator"]>) =>
    locator.evaluate((el) => {
      const panel = el.closest(".admin-panel")!;
      return (
        panel.getBoundingClientRect().right - el.getBoundingClientRect().right
      );
    });
  await expect
    .poll(() =>
      distanceFromPanelEdge(panel.getByRole("button", { name: "Export CSV" })),
    )
    .toBeGreaterThanOrEqual(16);
  expect(
    await distanceFromPanelEdge(panel.locator('[data-slot="card"]').first()),
  ).toBeGreaterThanOrEqual(16);
  await page.screenshot({
    path: testInfo.outputPath("feedback-scrollbar-clearance.png"),
  });
});

test("admin destinations and editor render without overflow or errors", async ({
  page,
}, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await admin(page);
  for (const name of [
    "Content",
    "Feedback",
    "Demo profiles",
    "Learning groups",
    "Teams",
    "Curricula",
    "Progress",
    "Identity",
    "Docs navigation",
    "Due dates",
    "Access",
    "Privacy",
    "MCP",
  ]) {
    await adminSection(page, name);
    await expect(
      page.getByRole("tabpanel", { name, exact: true }),
    ).toBeVisible();
    await noOverflow(page);
  }
  await adminSection(page, "Content");
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await expect(
    page.getByRole("textbox", { name: "Title", exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  await testInfo.attach("course-editor", {
    body: await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath("review.png"),
    }),
    contentType: "image/png",
  });
  expect(errors).toEqual([]);
});

test("learner routes and narrow navigation remain usable", async ({
  page,
}, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await learner(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [route, heading] of [
    ["courses", "Courses"],
    ["updates", "Updates"],
    ["docs", "Docs"],
  ]) {
    await page.goto(`/#${route}`);
    if (route === "docs")
      await expect(page.locator("article h1")).toBeVisible();
    else
      await expect(
        page.getByRole("heading", { name: heading, exact: true }).first(),
      ).toBeVisible();
    await noOverflow(page);
  }
  await expect(page.locator(".app-footer")).toHaveCount(0);
  await page.goto("/#courses");
  const firstChannel = page.locator(".library .channel").first();
  const channelHeading = await firstChannel
    .locator('[data-slot="section-header"]')
    .boundingBox();
  const channelCourses = await firstChannel
    .locator(".course-row")
    .boundingBox();
  expect(channelCourses!.y).toBeGreaterThan(
    channelHeading!.y + channelHeading!.height,
  );
  const search = page.locator("[data-slot=search-field]").first();
  const searchIcon = await search.locator("svg").first().boundingBox();
  const searchInput = await search.getByRole("textbox").boundingBox();
  expect(
    Math.abs(
      searchIcon!.y +
        searchIcon!.height / 2 -
        searchInput!.y -
        searchInput!.height / 2,
    ),
  ).toBeLessThanOrEqual(2);
  if (testInfo.project.name === "phone") {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("button", { name: "Updates", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Updates", exact: true }),
    ).toBeVisible();
  }
  await testInfo.attach("learner", {
    body: await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath("review.png"),
    }),
    contentType: "image/png",
  });
  expect(errors).toEqual([]);
});

test("curriculum builder uses shared fields and preserves saved sequence", async ({
  page,
}) => {
  await page.addInitScript(
    (workspace) =>
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace)),
    learningUiFixture(),
  );
  await admin(page);
  await adminSection(page, "Curricula");
  await page
    .getByRole("button", { name: "Create curriculum", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Onboarding design test");
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill("A synthetic playlist for UI verification.");
  await page.getByRole("button", { name: "Add courses", exact: true }).click();
  const picker = page.getByRole("dialog");
  await picker
    .getByRole("checkbox", { name: /Start with the customer/ })
    .check();
  await picker.getByRole("checkbox", { name: /Know the platform/ }).check();
  await picker.getByRole("button", { name: /^Add courses 2$/ }).click();
  await page
    .getByRole("button", { name: "Move Know the platform up", exact: true })
    .click();
  await page.getByRole("combobox", { name: "Status", exact: true }).click();
  await page.getByRole("option", { name: "Published", exact: true }).click();
  await page
    .getByRole("button", { name: "Save curriculum", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit Onboarding design test", exact: true })
    .click();
  await expect(page.locator(".learning-order li").first()).toContainText(
    "Know the platform",
  );
  await expect(
    page.getByRole("combobox", { name: "Status", exact: true }),
  ).toHaveText("Published");
  await noOverflow(page);
});

test("course completion still works through shared choices and controls", async ({
  page,
}) => {
  await page.addInitScript((workspace) => {
    if (!localStorage.getItem("course-ui-seeded")) {
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
      localStorage.setItem("course-ui-seeded", "yes");
    }
  }, learningUiFixture());
  await learner(page);
  await page.goto("/#courses/course-2");
  await expect(
    page.getByRole("heading", {
      name: "Know the platform",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Next lesson/ }).click();
  await page.getByRole("button", { name: "Quiz Check your knowledge" }).click();
  await page
    .getByRole("radio", { name: "The customer’s goal", exact: true })
    .check();
  await page.getByRole("button", { name: "Submit and continue" }).click();
  await page
    .getByRole("radio", { name: "With an agreed next step", exact: true })
    .check();
  await page.getByRole("button", { name: "Submit and see results" }).click();
  await expect(
    page.getByRole("heading", { name: "2 of 2 correct" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close course" }).click();
  await page.reload();
  await expect(
    page.getByText("Completed", { exact: true }).first(),
  ).toBeVisible();
  await noOverflow(page);
});

test("manager reporting uses shared filters and scoped people", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("fieldbook.profile.v1", "demo-manager"),
  );
  await page.goto("/#team");
  await expect(
    page.getByRole("combobox", { name: "Search teams or people", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: /Alex Edwards/ })).toBeVisible();
  const personCell = page.getByRole("cell", { name: /Alex Edwards/ });
  const nameBox = await personCell.locator("strong").boundingBox();
  const emailBox = await personCell.locator("small").boundingBox();
  expect(emailBox!.y).toBeGreaterThanOrEqual(nameBox!.y + nameBox!.height);

  await expect(page.getByRole("cell", { name: /Oliver Anderson/ })).toHaveCount(
    0,
  );
  await noOverflow(page);
  await testInfo.attach("manager-report", {
    body: await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath("review.png"),
    }),
    contentType: "image/png",
  });
});

test("catalog remains usable with enlarged text", async ({ page }) => {
  await page.goto("/ui");
  await expect(
    page.getByRole("heading", { name: "Interface reference" }),
  ).toBeVisible();
  await page
    .getByRole("tab", { name: "Assigned Courses", exact: true })
    .click();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await noOverflow(page);
  await expect(
    page.getByRole("button", { name: "Edit example group" }),
  ).toBeVisible();
});

async function snapshotReview(
  page: Page,
  testInfo: import("@playwright/test").TestInfo,
  name: string,
) {
  await testInfo.attach(name, {
    body: await page.screenshot({
      fullPage: !name.startsWith("feedback"),
      path: testInfo.outputPath(`${name}.png`),
    }),
    contentType: "image/png",
  });
}

test("admin composition keeps headings, navigation and reorder actions aligned", async ({
  page,
}, testInfo) => {
  await admin(page);
  const skip = page.getByRole("link", { name: "Skip to content", exact: true });
  await skip.focus();
  const skipBox = await skip.boundingBox();
  expect(skipBox!.y).toBeGreaterThanOrEqual(0);
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  const heading = page.getByRole("heading", { name: "Content", exact: true });
  const description = page.getByText(
    "Create and maintain courses, docs, and updates.",
    { exact: true },
  );
  const h = await heading.boundingBox(),
    d = await description.boundingBox();
  expect(d!.y).toBeGreaterThanOrEqual(h!.y + h!.height);
  expect(Math.abs(d!.x - h!.x)).toBeLessThan(1);
  const nav = page.getByRole("tab", { name: "Due dates", exact: true });
  if (await nav.isVisible()) {
    await expect(nav).toHaveCSS("text-align", "left");
    const icons = await page
      .locator('[data-variant="sidebar"] button > svg')
      .evaluateAll((nodes) =>
        nodes.map((n) => n.getBoundingClientRect().width),
      );
    expect(new Set(icons).size).toBe(1);
  }
  await snapshotReview(page, testInfo, "content-composition");
  await adminSection(page, "Docs navigation");
  await page.getByRole("button", { name: "New section", exact: true }).click();
  await page
    .getByRole("textbox", { name: "New section name" })
    .fill("A deliberately long section title for checking aligned actions");
  await page
    .getByRole("button", { name: "Create section", exact: true })
    .click();
  const rows = page.locator(
    ".doc-order-list > li > .doc-order-list > [data-slot=reorder-row]:first-child",
  );
  const actionX = await rows
    .locator("[data-slot=reorder-actions]")
    .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().x));
  expect(Math.max(...actionX) - Math.min(...actionX)).toBeLessThan(1);
  const firstText = await rows.first().locator("strong").innerText();
  await rows
    .first()
    .getByRole("button", { name: /^Actions for / })
    .click();
  await page.getByRole("menuitem", { name: "Move down" }).click();
  await expect(rows.nth(1).locator("strong")).toHaveText(firstText);
  await rows
    .nth(1)
    .getByRole("button", { name: /^Actions for / })
    .click();
  await page.getByRole("menuitem", { name: "Move down" }).click();
  await expect(rows.nth(2).locator("strong")).toHaveText(firstText);
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await noOverflow(page);
  await snapshotReview(page, testInfo, "reorder-composition");
  await page.reload();
  await adminSection(page, "Docs navigation");
  await expect(
    page
      .locator(
        ".doc-order-list > li > .doc-order-list > [data-slot=reorder-row]:first-child",
      )
      .nth(2)
      .locator("strong"),
  ).toHaveText(firstText);
});

test("report columns stay fixed across teams, long values and empty results", async ({
  page,
}, testInfo) => {
  await admin(page);
  // Synthetic state belongs only to this isolated browser context.
  await page.evaluate((data) => {
    const key = "fieldbook.workspace.v1";
    (data.teams ??= []).push(
      {
        id: "long-team",
        name: "Customer success and strategic account development",
        parentId: data.settings!.organizationTeamId ?? undefined,
      },
      {
        id: "empty-team",
        name: "Empty team",
        parentId: data.settings!.organizationTeamId ?? undefined,
      },
    );
    data.users.push({
      id: "long-person",
      name: "Alexandria Example with a deliberately long family name",
      email: "alexandria.long.example@synthetic.example",
      role: "learner",
      groups: ["sales"],
      teamId: "long-team",
      active: true,
    });
    localStorage.setItem(key, JSON.stringify(data));
  }, freshWorkspace());
  await page.reload();
  await adminSection(page, "Progress");
  const table = page.locator("table[data-layout=progressPeople]");
  const measure = () =>
    table.getByRole("columnheader").evaluateAll((nodes) =>
      nodes.map((n) => {
        const b = n.getBoundingClientRect();
        return { x: b.x, width: b.width };
      }),
    );
  const baseline = await measure();
  const picker = page.getByRole("combobox", {
    name: "Search teams or people",
    exact: true,
  });
  for (const team of [
    "Sales team",
    "Customer success and strategic account development",
    "Empty team",
    "Organization",
  ]) {
    await picker.fill(team);
    await page
      .getByRole("group", { name: "Teams", exact: true })
      .getByRole("option", { name: new RegExp(`^${team} —`) })
      .click();
    const columns = await measure();
    columns.forEach((column, i) => {
      expect(Math.abs(column.x - baseline[i].x)).toBeLessThan(1);
      expect(Math.abs(column.width - baseline[i].width)).toBeLessThan(1);
    });
    if (team === "Empty team")
      await expect(table.locator("tbody tr")).toHaveCount(0);
    await noOverflow(page);
  }
  await snapshotReview(page, testInfo, "stable-report");
});

test("update footers and saved feedback keep text and actions separated", async ({
  page,
}, testInfo) => {
  await learner(page);
  await page.goto("/#updates");
  const action = page.locator('[data-slot="card-action"]').first();
  const box = await action.boundingBox(),
    icon = await action.locator("svg").boundingBox();
  expect(
    Math.abs(box!.y + box!.height / 2 - icon!.y - icon!.height / 2),
  ).toBeLessThan(1);
  await snapshotReview(page, testInfo, "update-cards");
  await page.locator(".brief-card").first().click();
  const feedback = page.getByRole("region", { name: "Content feedback" });
  await feedback.getByRole("button", { name: "Useful", exact: true }).click();
  const form = page.getByRole("form", {
    name: "Did you find this useful?",
    exact: true,
  });
  await expect(form.getByRole("textbox")).toBeFocused();
  await form.getByRole("textbox").fill("The example was clear.");
  await form.getByRole("button", { name: "Send", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(form).toBeHidden();
  await expect(
    feedback.getByRole("button", { name: "Useful", exact: true }),
  ).toBeFocused();
  await expect(feedback.getByRole("status")).toHaveText("Feedback saved.");
  await page.reload();
  await feedback
    .getByRole("button", { name: "Did you find this useful?", exact: true })
    .click();
  await expect(form.getByRole("textbox")).toHaveValue("The example was clear.");
  await noOverflow(page);
  await snapshotReview(page, testInfo, "feedback-composition");
});

test("content feedback catalog preserves failed drafts, pending state and keyboard dismissal", async ({
  page,
}, info) => {
  await page.goto("/ui#catalog-content-feedback");
  const catalog = page.locator("#catalog-content-feedback");
  await catalog.getByRole("switch").click();
  await catalog
    .getByRole("button", { name: "Not useful", exact: true })
    .first()
    .click();
  const form = page.getByRole("form", {
    name: "Did you find this useful?",
    exact: true,
  });
  await expect(form.getByRole("textbox")).toBeFocused();
  await expect(
    form.getByRole("button", { name: "Send", exact: true }),
  ).toBeDisabled();
  await expect(form.getByRole("alert")).toContainText(
    "Could not save feedback",
  );
  await form.getByRole("textbox").fill("Keep this draft while I retry.");
  await form.getByRole("button", { name: "Send", exact: true }).click();
  await expect(form.getByRole("alert")).toContainText(
    "Could not save feedback",
  );
  await expect(form.getByRole("textbox")).toHaveValue(
    "Keep this draft while I retry.",
  );
  await snapshotReview(page, info, "feedback-error");
  await form.getByRole("textbox").press("Escape");
  await expect(form).toBeHidden();
  await expect(
    catalog.getByRole("button", { name: "Not useful", exact: true }).first(),
  ).toBeFocused();
  await catalog.getByRole("switch").click();
  await catalog
    .getByRole("button", { name: "Did you find this useful?", exact: true })
    .first()
    .click();
  await expect(form.getByRole("textbox")).toHaveValue(
    "Keep this draft while I retry.",
  );
  await form.getByRole("button", { name: "Send", exact: true }).click();
  await expect(form).toBeHidden();
  await expect(catalog.getByRole("status").first()).toHaveText(
    "Feedback saved.",
  );
  await expect(
    catalog
      .getByRole("button", { name: "Did you find this useful?", exact: true })
      .last(),
  ).toBeDisabled();
  await noOverflow(page);
});

test("long feedback prompt wraps without crowding rating controls", async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/ui#catalog-content-feedback");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const feedback = page
    .locator("#catalog-content-feedback")
    .getByRole("region", {
      name: "Content feedback",
    })
    .first();
  const prompt = feedback.getByRole("button", {
    name: "Did you find this useful?",
    exact: true,
  });
  const rating = feedback
    .getByRole("group", { name: "Rate this content" })
    .first();
  await expect(prompt).toBeVisible();
  const promptBox = await prompt.boundingBox();
  const ratingBox = await rating.boundingBox();
  expect(promptBox!.x + promptBox!.width).toBeLessThanOrEqual(ratingBox!.x + 1);
  const feedbackBox = await feedback.boundingBox();
  expect(feedbackBox!.x + feedbackBox!.width).toBeLessThanOrEqual(321);
  await prompt.click();
  const form = page.getByRole("form", {
    name: "Did you find this useful?",
    exact: true,
  });
  await expect(form).toBeVisible();
  await expect(
    form.getByRole("button", { name: "Useful", exact: true }),
  ).toBeVisible();
  const formBox = await form.boundingBox();
  expect(formBox!.x + formBox!.width).toBeLessThanOrEqual(321);
  await snapshotReview(page, info, "feedback-narrow-long-prompt");
});

test("hire-date guidance labels the date and stage is derived", async ({
  page,
}, info) => {
  await admin(page);
  await adminSection(page, "Demo profiles");
  await expect(
    page.getByRole("button", { name: "New user defaults", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("row")
    .filter({ hasText: "Alex Edwards" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const date = dialog.getByLabel("Hire date", { exact: true });
  await expect(date).toHaveAccessibleDescription(
    /Signing in does not start this window/,
  );
  await date.fill("2020-01-01");
  await expect(dialog).toContainText("Existing user");
  await snapshotReview(page, info, "hire-date-guidance");
});

test("feedback remains usable with enlarged text and branded selection under dark preference", async ({
  page,
}, info) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/ui#catalog-content-feedback");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
    document.documentElement.style.setProperty("--brand", "#b42318");
    document.documentElement.style.setProperty("--link", "#b42318");
  });
  const catalog = page.locator("#catalog-content-feedback");
  await catalog
    .getByRole("button", { name: "Useful", exact: true })
    .first()
    .click();
  const form = page.getByRole("form", {
    name: "Did you find this useful?",
    exact: true,
  });
  await expect(
    form.getByRole("button", { name: "Send", exact: true }),
  ).toBeEnabled();
  await expect(
    form.getByRole("button", { name: "Useful", exact: true }),
  ).toHaveCSS("color", "rgb(180, 35, 24)");
  await form
    .getByRole("textbox")
    .fill(
      "Long feedback text that wraps correctly with enlarged type and retains the existing character limit.",
    );
  await noOverflow(page);
  const box = await form.getByRole("textbox").boundingBox();
  expect(box!.width).toBeLessThanOrEqual(info.project.use.viewport!.width);
  await snapshotReview(page, info, "feedback-enlarged");
  await form.getByRole("button", { name: "Send", exact: true }).click();
  await expect(form).toBeHidden();
});
