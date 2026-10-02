import { expect, test } from "@playwright/test";

test("catalog content discovery retains choices across a 100-item library", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ui#catalog-content-selection");
  const picker = page.locator("#catalog-content-selection");
  await expect(
    picker.getByRole("button", { name: "Sort: Updated newest", exact: true }),
  ).toBeVisible();
  const newest = picker.getByRole("checkbox", {
    name: /^Product knowledge 100/,
  });
  await newest.check();
  await picker.getByRole("button", { name: "Filters", exact: true }).click();
  const filters = page.getByRole("dialog", {
    name: "Collection filters",
    exact: true,
  });
  await filters
    .getByRole("combobox", { name: "Category", exact: true })
    .click();
  await page.getByRole("option", { name: "Operations", exact: true }).click();
  await filters.press("Escape");
  await picker.getByRole("checkbox", { name: /^Security 098/ }).check();
  await picker
    .getByRole("searchbox", { name: "Find content", exact: true })
    .fill("missing synthetic title");
  await expect(picker).toContainText(
    "No content matches your search or filters.",
  );
  await picker
    .getByRole("button", { name: "Review selected", exact: true })
    .click();
  await expect(newest).toBeChecked();
  await expect(
    picker.getByRole("checkbox", { name: /^Security 098/ }),
  ).toBeChecked();
  await expect(picker).toContainText("2 selected");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await picker.scrollIntoViewIfNeeded();
  await picker.screenshot({
    path: info.outputPath("content-discovery-catalog.png"),
  });
  expect(errors).toEqual([]);
});
