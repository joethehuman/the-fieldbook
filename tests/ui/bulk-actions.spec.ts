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
  await page.getByRole("button", { name: "Actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete selected" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("30 days");
  await expect(
    dialog.getByRole("button", { name: "Delete 1", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await expect(
    dialog.getByRole("button", { name: "Delete 1", exact: true }),
  ).toBeEnabled();
  await page.screenshot({ path: info.outputPath("delete-warning.png") });
  await dialog.getByRole("button", { name: "Delete 1", exact: true }).click();
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
  await page.getByRole("button", { name: "Actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Restore selected" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Restore 1", exact: true })
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
  const remove = page.getByRole("button", {
    name: "Remove people",
    exact: true,
  });
  await remove.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox").first().check();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await remove.click();
  await expect(
    page.getByRole("dialog").getByRole("checkbox").first(),
  ).not.toBeChecked();
});
