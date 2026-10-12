import { test, expect } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import { categoryLists } from "../../lib/content-categories";
import { setupAuthoringProvider } from "./provider-fixture";

test("installed category controls count actual rows and save settings through the provider", async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith("production"), "Settings persistence uses the installed-app provider fixture.");
  const data = withPublishedSnapshots(freshWorkspace());
  data.settings = {
    ...data.settings!,
    contentCategories: categoryLists(data.content),
  };
  const course = data.content.find((item) => item.kind === "course")!;
  for (const [index, category, title] of [
    [1, "", "Unassigned installed draft"],
    [2, course.category, "Categorized installed draft"],
    [3, "Removed category", "Restored installed draft"],
  ] as const) {
    data.content.push({
      ...course,
      id: `00000000-0000-4000-8000-00000000999${index}`,
      category,
      title,
      status: "draft",
      publishedRevision: null,
    });
  }
  const items = data.content.filter(
    (item) => item.kind === "course" && item.category === course.category,
  );
  await setupAuthoringProvider(page, data);
  await page.goto("/admin/settings/categories");
  await expect(
    page.getByRole("heading", { name: "Categories", exact: true }),
  ).toBeVisible();
  const card = page.locator("#settings-categories");
  const heading = await page.getByRole("heading", { name: "Categories", exact: true }).boundingBox();
  const surface = await card.boundingBox();
  expect(heading!.y + heading!.height).toBeLessThan(surface!.y);
  if (info.project.name === "production-phone") {
    const row = page.locator('[data-slot="reorder-row"]').first();
    const count = await row.locator('[data-slot="reorder-detail"]').boundingBox();
    const checkbox = await row.getByRole("checkbox").boundingBox();
    expect(Math.abs(count!.x - checkbox!.x)).toBeLessThanOrEqual(1);
  }
  await expect(page.getByText("Unassigned installed draft", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Restored installed draft", { exact: true })).toBeVisible();
  const bulk = page.getByRole("button", {
    name: "Categories bulk actions",
    exact: true,
  });
  await page
    .getByRole("checkbox", {
      name: `Select category ${course.category}`,
      exact: true,
    })
    .check();
  await expect(
    page.getByRole("checkbox", {
      name: "Select all matching categories",
      exact: true,
    }),
  ).toHaveAttribute("aria-checked", "mixed");
  await expect(bulk).toBeDisabled();
  const other = data.settings!.contentCategories!.course[1];
  await page
    .getByRole("checkbox", { name: `Select category ${other}`, exact: true })
    .check();
  await expect(bulk).toBeEnabled();
  await page
    .getByRole("group", { name: "Categories selection", exact: true })
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await page
    .getByRole("button", { name: `Expand ${course.category}`, exact: true })
    .click();
  const section = page.getByRole("region", {
    name: `Items in ${course.category}`,
    exact: true,
  });
  const itemBulk = section.getByRole("button", {
    name: `Items in ${course.category} bulk actions`,
    exact: true,
  });
  await expect(section.getByRole("row").filter({ hasText: "Categorized installed draft" })).toContainText("Draft");
  await section
    .getByRole("checkbox", { name: `Select ${items[0].title}`, exact: true })
    .check();
  await expect(itemBulk).toBeDisabled();
  await section
    .getByRole("checkbox", { name: `Select ${items[1].title}`, exact: true })
    .check();
  await expect(itemBulk).toBeEnabled();
  await section
    .getByRole("checkbox", { name: `Select ${items[1].title}`, exact: true })
    .uncheck();
  await expect(itemBulk).toBeDisabled();
  const action = section.getByRole("button", {
    name: `Actions for ${items[0].title}`,
    exact: true,
  });
  await action.click();
  await page
    .getByRole("menuitem", { name: "Move to category…", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("1 selected item.");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(action).toBeFocused();
  await page.screenshot({
    path: info.outputPath("installed-categories-selection.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Create category", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Category name", { exact: true })
    .fill("Verified category");
  await dialog
    .getByRole("button", { name: "Create category", exact: true })
    .click();
  // Check the border join in normal flow, before the sticky header detaches
  // from the card as the page scrolls through its expanded contents.
  await card.evaluate((element) => {
    let owner = element.parentElement;
    while (owner && !/(auto|scroll)/.test(getComputedStyle(owner).overflowY)) owner = owner.parentElement;
    if (owner) owner.scrollTop = 0;
    else window.scrollTo(0, 0);
  });
  await expect.poll(async () => {
    const pending = await page.locator('[data-slot="pending-changes-bar"]').boundingBox();
    const surface = await card.boundingBox();
    return Math.abs(surface!.y - pending!.y - pending!.height);
  }).toBeLessThanOrEqual(1);
  // Staging does not write settings until the administrator chooses Save.
  let snapshot = await (
    await page.request.get("/api/admin/snapshot?scope=categories")
  ).json();
  expect(snapshot.data.settings.contentCategories.course).not.toContain(
    "Verified category",
  );
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    page.locator('[data-slot="pending-changes-region"]'),
  ).toHaveAttribute("data-active", "false");
  snapshot = await (
    await page.request.get("/api/admin/snapshot?scope=categories")
  ).json();
  expect(snapshot.data.settings.contentCategories.course).toContain(
    "Verified category",
  );
  await page.reload();
  await expect(
    page.getByRole("button", {
      name: "Actions for Verified category",
      exact: true,
    }),
  ).toBeVisible();
});
