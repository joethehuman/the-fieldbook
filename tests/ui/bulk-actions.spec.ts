import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
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
test("content selection, explicit deletion, recovery and clean navigation", async ({
  page,
}, info) => {
  const data = freshWorkspace();
  const original = data.content.find((c) => c.kind === "doc")!;
  original.title = "Bulk recovery fixture";
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto("/#admin");
  await page
    .getByRole("checkbox", {
      name: "Select Bulk recovery fixture",
      exact: true,
    })
    .check();
  await expect(
    page.getByRole("region", { name: "Selected items" }),
  ).toContainText("1 selected");
  await expect(
    page.getByRole("button", { name: "Bulk actions", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: `Actions for ${original.title}`, exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("30 days");
  await expect(
    dialog.getByRole("button", { name: "Delete", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await expect(
    dialog.getByRole("button", { name: "Delete", exact: true }),
  ).toBeEnabled();
  await page.screenshot({ path: info.outputPath("delete-warning.png") });
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(
    page.getByRole("checkbox", {
      name: "Select Bulk recovery fixture",
      exact: true,
    }),
  ).toHaveCount(0);
  await section(page, "Recently deleted");
  await expect(
    page.getByRole("cell", { name: "Bulk recovery fixture Doc", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Bulk actions", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: `Actions for ${original.title}`, exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Restore", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(page.getByText("No recently deleted items yet.")).toBeVisible();
  await section(page, "Content");
  const row = page
    .getByRole("row")
    .filter({ hasText: "Bulk recovery fixture" });
  await expect(row).toContainText("Draft");
  await page
    .getByRole("checkbox", {
      name: "Select Bulk recovery fixture",
      exact: true,
    })
    .check();
  await page.getByRole("searchbox", { name: "Search content" }).fill("Bulk");
  await expect(
    page.getByRole("region", { name: "Selected items" }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Selection cleared because the view changed."),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("admin-bulk-content.png") });
  await section(page, "MCP");
  await section(page, "Groups");
});
test("all matching selection crosses pages and group pickers wait for Apply", async ({
  page,
}) => {
  const data = freshWorkspace();
  data.users.push({
    ...data.users[0],
    id: "unassigned",
    name: "Unassigned fixture",
    email: "unassigned@example.test",
    groups: [],
    teamId: undefined,
  });
  const sample = data.content.find((c) => c.kind === "brief")!;
  data.content = Array.from({ length: 26 }, (_, i) => ({
    ...sample,
    id: `bulk-${i}`,
    title: `Bulk update ${String(i).padStart(2, "0")}`,
  }));
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto("/#admin");
  await page
    .getByRole("checkbox", { name: "Select page (25)", exact: true })
    .check();
  await expect(
    page.getByRole("region", { name: "Selected items" }),
  ).toContainText("25 selected");
  await page
    .getByRole("button", { name: "Select all 26 matching items" })
    .click();
  await expect(
    page.getByRole("region", { name: "Selected items" }),
  ).toContainText("26 selected");
  await page
    .getByRole("navigation", { name: "Content pages" })
    .getByRole("button", { name: "Next", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Select page (1)", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("checkbox", { name: /^Select Bulk update / }),
  ).toBeChecked();
  await expect(
    page.getByRole("region", { name: "Selected items" }),
  ).toContainText("26 selected");
  await section(page, "Groups");
  await page
    .getByRole("button", { name: /^Manage / })
    .first()
    .click();
  await page.getByRole("tab", { name: "Members", exact: true }).click();
  const add = page.getByRole("button", { name: "Add people", exact: true });
  await add.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox").first().check();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await add.click();
  await expect(
    page.getByRole("dialog").getByRole("checkbox").first(),
  ).not.toBeChecked();
});

test("existing categories, mixed types and one People menu", async ({
  page,
}, info) => {
  const data = freshWorkspace();
  const updates = data.content.filter((c) => c.kind === "brief").slice(0, 2);
  const course = data.content.find((c) => c.kind === "course")!;
  updates.forEach((c, i) => {
    c.title = `Category fixture ${i}`;
    c.category = i ? "Existing beta" : "Existing alpha";
  });
  course.title = "Category fixture course";
  data.content = [...updates, course];
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto("/#admin");
  for (const c of updates)
    await page
      .getByRole("checkbox", { name: `Select ${c.title}`, exact: true })
      .check();
  await page.getByRole("button", { name: "Bulk actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Move to category…", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("textbox")).toHaveCount(0);
  await dialog.getByRole("combobox", { name: "Category", exact: true }).click();
  await page
    .getByRole("option", { name: "Existing beta", exact: true })
    .click();
  await page.screenshot({ path: info.outputPath("category-selector.png") });
  await dialog
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
  );
  expect(
    saved.content
      .filter(
        (c: any) =>
          c.title.startsWith("Category fixture ") && c.kind === "brief",
      )
      .every((c: any) => c.category === "Existing beta"),
  ).toBe(true);
  await page
    .getByRole("checkbox", { name: `Select ${updates[0].title}`, exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: `Select ${course.title}`, exact: true })
    .check();
  await page.getByRole("button", { name: "Bulk actions", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "Move to category…", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      "Select one content type to change its category or section.",
    ),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await section(page, "Demo profiles");
  await page.getByRole("checkbox", { name: /^Select page / }).check();
  await expect(
    page.getByRole("button", { name: "Bulk actions", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Add to groups", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Bulk actions", exact: true }).click();
  await expect(page.getByRole("menuitem").last()).toHaveText("Delete selected");
  await expect(page.getByRole("separator")).toBeVisible();
  await page.screenshot({ path: info.outputPath("people-menu.png") });
});

test("group learning, Updates and linked teams use selected rows", async ({
  page,
}, info) => {
  const data = freshWorkspace();
  // Own two updates so this test exercises bulk controls independently of demo copy.
  const updates = data.content
    .filter((item) => item.kind === "brief")
    .slice(0, 2);
  data.content = data.content.filter(
    (item) => item.kind !== "brief" || updates.includes(item),
  );
  for (const update of updates) update.groups = [];
  const group = data.groups[0];
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto("/#admin");
  await section(page, "Groups");
  await page
    .getByRole("button", { name: `Manage ${group.name}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add courses or curricula", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: /^Select (page|all) / }).check();
  await dialog.getByRole("button", { name: /^Add items / }).click();
  await page
    .getByRole("checkbox", { name: "Select all matching rows", exact: true })
    .check();
  await page.getByRole("button", { name: "Bulk actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Remove from group", exact: true })
    .click();
  await page.screenshot({
    path: info.outputPath("group-learning-selection.png"),
  });
  await dialog
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(page.locator(".learning-order li")).toHaveCount(0);
  await page.getByRole("tab", { name: "Updates", exact: true }).click();
  await page.getByRole("button", { name: "Add Updates", exact: true }).click();
  await expect(
    dialog.getByRole("checkbox", { name: /^Select (page|all) / }),
  ).toHaveCount(1);
  await dialog.getByRole("checkbox", { name: /^Select (page|all) / }).check();
  await dialog.getByRole("button", { name: /^Add Updates / }).click();
  await page
    .getByRole("checkbox", {
      name: /^Select (page|all) .*Updates for this group/,
    })
    .check();
  await page.getByRole("button", { name: "Bulk actions", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "Remove from group", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("tab", { name: "Members", exact: true }).click();
  await expect(
    page.getByRole("checkbox", {
      name: /^Select (page|all) .*Linked teams/,
    }),
  ).toHaveCount(0);
});

test("collection size controls bulk visibility and keeps single-item actions", async ({
  page,
}, info) => {
  await page.goto("/ui");
  await page.waitForLoadState("networkidle");
  const example = page.getByRole("region", { name: "Bulk selection example" });
  await expect(
    example.getByRole("button", { name: "Bulk actions", exact: true }),
  ).toBeDisabled();
  await example
    .getByRole("checkbox", { name: "Select Example course 1", exact: true })
    .check();
  // One selected out of three retains a disabled bulk menu.
  await expect(
    example.getByRole("button", { name: "Bulk actions", exact: true }),
  ).toBeDisabled();
  await example
    .getByRole("checkbox", { name: "Select Example course 2", exact: true })
    .check();
  await example
    .getByRole("button", { name: "Bulk actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Remove from example", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Apply changes" })
    .click();
  await expect(example.getByRole("checkbox")).toHaveCount(0);
  await expect(
    example.getByRole("region", { name: "Selected items" }),
  ).toHaveCount(0);
  await example
    .getByRole("button", { name: "Actions for Example course 3", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Remove from example", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Apply changes" })
    .click();
  await expect(example.getByText("No items in this list.")).toBeVisible();
  await expect(example.getByRole("checkbox")).toHaveCount(0);
  await expect(
    example.getByRole("button", { name: "Actions", exact: true }),
  ).toHaveCount(0);
  await example
    .getByRole("button", { name: "Add example courses", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("searchbox").fill("Example course 22");
  await expect(
    dialog.getByRole("checkbox", { name: /^Select (page|all) / }),
  ).toHaveCount(0);
  await dialog
    .getByRole("checkbox", { name: "Example course 22", exact: true })
    .check();
  await dialog
    .getByRole("button", { name: "Add courses 1", exact: true })
    .click();
  await expect(example.getByRole("checkbox")).toHaveCount(0);
  await expect(
    example.getByText("Example course 22", { exact: true }),
  ).toBeVisible();
  await example.screenshot({
    path: info.outputPath("single-item-catalog.png"),
  });
});

test("page selection reflects partial and complete rows without selecting other pages", async ({
  page,
}) => {
  await page.goto("/ui");
  const picker = page.locator("#catalog-member-selection");
  const first = picker.getByRole("checkbox", { name: /^Example person 1 / });
  const pageChoice = picker.getByRole("checkbox", {
    name: "Select page (10)",
    exact: true,
  });
  await first.check();
  await expect(pageChoice).toHaveAttribute("data-state", "indeterminate");
  await pageChoice.click();
  await expect(pageChoice).toBeChecked();
  await expect(
    picker.getByRole("status").filter({ hasText: /^10 selected$/ }),
  ).toBeVisible();
  await expect(
    picker.getByRole("status").filter({ hasText: /^1–10 of 32 shown$/ }),
  ).toBeVisible();
  await picker.getByRole("button", { name: "Select all 32 matching" }).click();
  await expect(
    picker.getByRole("status").filter({ hasText: /^32 selected$/ }),
  ).toBeVisible();
});

test("single curriculum and empty or single linked teams have no bulk controls", async ({
  page,
}, info) => {
  const data = freshWorkspace();
  data.curricula = data.curricula!.slice(0, 1);
  // Own two updates so this test exercises bulk controls independently of demo copy.
  const updates = data.content
    .filter((item) => item.kind === "brief")
    .slice(0, 2);
  data.content = data.content.filter(
    (item) => item.kind !== "brief" || updates.includes(item),
  );
  for (const update of updates) update.groups = [];
  const group = data.groups[0];
  group.teamIds = [];
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto("/#admin");
  await section(page, "Curricula");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Create curriculum", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("single-curriculum.png") });
  await section(page, "Groups");
  await page
    .getByRole("button", { name: `Manage ${group.name}`, exact: true })
    .click();
  await page.getByRole("tab", { name: "Members", exact: true }).click();
  const teams = page.getByRole("group", { name: "Linked teams", exact: true });
  await expect(teams.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Add teams", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("checkbox", { name: data.teams![0].name, exact: true })
    .check();
  await dialog
    .getByRole("button", { name: "Add teams 1", exact: true })
    .click();
  await expect(teams.getByRole("checkbox")).toHaveCount(0);
  await expect(teams).toContainText(data.teams![0].name);
  await page.screenshot({ path: info.outputPath("single-linked-team.png") });
  // Only the teams list has a single-item menu in this fixture.
  await page.getByRole("button", { name: "Actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Remove team links", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(teams).toContainText("No items in this list.");
});
