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
  await page.getByRole("button", { name: "Bulk actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete selected" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("30 days");
  await expect(
    dialog.getByRole("button", { name: "Delete selected", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await expect(
    dialog.getByRole("button", { name: "Delete selected", exact: true }),
  ).toBeEnabled();
  await page.screenshot({ path: info.outputPath("delete-warning.png") });
  await dialog
    .getByRole("button", { name: "Delete selected", exact: true })
    .click();
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
  await page
    .getByRole("checkbox", {
      name: "Select Bulk recovery fixture",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Bulk actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Restore selected" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(page.getByText("No recently deleted items.")).toBeVisible();
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
  await page.getByRole("textbox", { name: "Search content" }).fill("Bulk");
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
  await section(page, "Learning groups");
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
  data.content = Array.from({ length: 32 }, (_, i) => ({
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
    .getByRole("checkbox", { name: "Select this page", exact: true })
    .check();
  await expect(
    page.getByRole("region", { name: "Selected items" }),
  ).toContainText("25 selected");
  await page
    .getByRole("button", { name: "Select all 32 matching items" })
    .click();
  await expect(
    page.getByRole("region", { name: "Selected items" }),
  ).toContainText("32 selected");
  await section(page, "Learning groups");
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
    .getByRole("menuitem", { name: "Set category", exact: true })
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
    page.getByRole("menuitem", { name: "Set category", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      "Select one content type to change its category or section.",
    ),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await section(page, "Demo profiles");
  await page
    .getByRole("checkbox", { name: "Select this page", exact: true })
    .check();
  await expect(
    page.getByRole("button", { name: "Bulk actions", exact: true }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Add to learning groups", exact: true }),
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
  const group = data.groups[0];
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto("/#admin");
  await section(page, "Learning groups");
  await page
    .getByRole("button", { name: `Manage ${group.name}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add courses or curricula", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("checkbox", { name: "Select this page", exact: true })
    .check();
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
  await dialog
    .getByRole("checkbox", { name: "Select this page", exact: true })
    .check();
  await dialog.getByRole("button", { name: /^Add Updates / }).click();
  await page
    .getByRole("checkbox", {
      name: "Select this page of Updates for this group",
      exact: true,
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
      name: "Select this page of Linked teams",
      exact: true,
    }),
  ).toBeVisible();
});
