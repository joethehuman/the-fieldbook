import { freshWorkspace } from "../../lib/store";
import { test, expect, type Page } from "@playwright/test";

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}
async function adminSection(page: Page, name: string) {
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
  await expect(
    page.getByRole("heading", { name: "Administration", exact: true }),
  ).toBeVisible();
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
  const members = tabs.getByRole("tab", { name: "Members" });
  const panel = page.getByRole("tabpanel", { name: "Members" });
  const select = panel.getByRole("combobox", { name: "Parent learning group" });
  const tabBox = await tabs.boundingBox(),
    fieldBox = await select.boundingBox();
  expect(fieldBox!.y - (tabBox!.y + tabBox!.height)).toBeGreaterThanOrEqual(20);
  await select.focus();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("option", { name: "No parent", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("option", { name: "No parent", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(select).toHaveText("No parent");
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
  await expect(tabs.getByRole("tab", { name: "Learning" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const order = page.getByRole("tabpanel", { name: "Learning" });
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
  await dialog.getByRole("combobox", { name: "Dialog parent group" }).click();
  await page.getByRole("option", { name: "Company", exact: true }).click();
  await expect(dialog.getByRole("combobox")).toHaveText("Company");
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
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
  await expect(
    page.getByRole("heading", { name: "Learning groups", exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "New learning group" })
    .fill("Sales design test");
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  // Creation opens the detail view.
  await page.getByRole("tab", { name: "Members", exact: true }).click();
  const parent = page.getByRole("combobox", { name: "Parent learning group" });
  await parent.click();
  await page
    .getByRole("option", { name: "Account executives", exact: true })
    .click();
  await expect(parent).toHaveText("Account executives");
  await page.getByRole("tab", { name: "Updates", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Updates for this group" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Members", exact: true }).click();
  await noOverflow(page);
  await testInfo.attach("learning-group", {
    body: await page.screenshot({
      fullPage: true,
      path: testInfo.outputPath("review.png"),
    }),
    contentType: "image/png",
  });
  await page.reload();
  await adminSection(page, "Learning groups");
  await page
    .getByRole("button", { name: "Manage Sales design test", exact: true })
    .click();
  await page.getByRole("tab", { name: "Members", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Parent learning group" }),
  ).toHaveText("Account executives");
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
    "Assignment window",
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
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const [route, heading] of [
    ["courses", "Courses"],
    ["updates", "Updates"],
    ["docs", "Docs"],
  ]) {
    await page.goto(`/#${route}`);
    await expect(
      page.getByRole("heading", { name: heading, exact: true }).first(),
    ).toBeVisible();
    await noOverflow(page);
  }
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
  await page
    .getByRole("button", { name: "Add Start with the customer", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add Know the platform", exact: true })
    .click();
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
  await page.goto("/#courses/course-2");
  await expect(
    page.getByRole("heading", {
      name: "Know the platform",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Complete & continue", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue to quiz", exact: true })
    .click();
  await page
    .getByRole("radio", { name: "The customer’s goal", exact: true })
    .check();
  await page
    .getByRole("radio", { name: "With an agreed next step", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Check answers", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Nicely done.", exact: true }),
  ).toBeVisible();
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
    page.getByRole("combobox", { name: "Reporting team", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: /Alex Morgan/ })).toBeVisible();
  const personCell = page.getByRole("cell", { name: /Alex Morgan/ });
  const nameBox = await personCell.locator("strong").boundingBox();
  const emailBox = await personCell.locator("small").boundingBox();
  expect(emailBox!.y).toBeGreaterThanOrEqual(nameBox!.y + nameBox!.height);

  await expect(
    page.getByRole("cell", { name: /Org Admin/ }),
  ).toHaveCount(0);
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
  await page.getByRole("tab", { name: "Learning", exact: true }).click();
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
      fullPage: true,
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
  const nav = page.getByRole("tab", { name: "Assignment window", exact: true });
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
  await page
    .getByRole("textbox", { name: "New section name" })
    .fill("A deliberately long section title for checking aligned actions");
  await page
    .getByRole("button", { name: "Create section", exact: true })
    .click();
  const rows = page.locator(".doc-order-list [data-slot=reorder-row]");
  const actionX = await rows
    .locator("[data-slot=reorder-actions]")
    .evaluateAll((nodes) => nodes.map((n) => n.getBoundingClientRect().x));
  expect(Math.max(...actionX) - Math.min(...actionX)).toBeLessThan(1);
  const firstText = await rows.first().innerText();
  await rows
    .first()
    .getByRole("button", { name: /^Reorder / })
    .focus();
  await page.keyboard.press("ArrowDown");
  await expect(rows.nth(1)).toHaveText(firstText);
  await rows
    .nth(1)
    .getByRole("button", { name: /^Reorder / })
    .dragTo(rows.nth(2));
  await expect(rows.nth(2)).toHaveText(firstText);
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await noOverflow(page);
  await snapshotReview(page, testInfo, "reorder-composition");
  await page.reload();
  await adminSection(page, "Docs navigation");
  await expect(
    page.locator(".doc-order-list [data-slot=reorder-row]").nth(2),
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
      },
      { id: "empty-team", name: "Empty team" },
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
  const table = page.locator("table[data-layout=progress]");
  const measure = () =>
    table.getByRole("columnheader").evaluateAll((nodes) =>
      nodes.map((n) => {
        const b = n.getBoundingClientRect();
        return { x: b.x, width: b.width };
      }),
    );
  const baseline = await measure();
  const picker = page.getByRole("combobox", {
    name: "Reporting team",
    exact: true,
  });
  for (const team of [
    "Sales team",
    "Customer success and strategic account development",
    "Empty team",
    "Entire organization",
  ]) {
    await picker.click();
    await page.getByRole("option", { name: team, exact: true }).click();
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
  await feedback.getByRole("button", { name: "Done", exact: true }).click();
  const status = await feedback.getByRole("status").boundingBox();
  const edit = await feedback
    .getByRole("button", { name: "Edit comment", exact: true })
    .boundingBox();
  expect(
    edit!.y >= status!.y + status!.height ||
      edit!.x >= status!.x + status!.width + 8,
  ).toBe(true);
  await noOverflow(page);
  await snapshotReview(page, testInfo, "feedback-composition");
});
