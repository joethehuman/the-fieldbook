import { test, expect, type Page } from "@playwright/test";
import { downloadMarkdown } from "../authoring/editor-helpers";

async function open(page: Page) {
  await page.goto("/ui/writing");
  const writer = page
    .locator('.writing-content[contenteditable="true"]')
    .first();
  await expect(writer).toContainText("Triple-click this paragraph");
  return writer;
}
async function actions(page: Page, name: string) {
  const button = page.getByRole("button", {
    name: `${name} actions`,
    exact: true,
  });
  await button.focus();
  await button.click();
}

test("table handles sit on the grid edges and drag shows origin and destination", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const writer = await open(page);
  const table = writer.locator("table");
  const row = page.getByRole("button", {
    name: "Row 2 actions and drag handle",
  });
  const column = page.getByRole("button", {
    name: "Column 2 actions and drag handle",
  });
  await row.scrollIntoViewIfNeeded();
  const cell = await table
    .locator("tbody tr")
    .nth(1)
    .locator(":is(td, th):not([data-tool-cell])")
    .first()
    .boundingBox();
  const handle = await row.boundingBox();
  expect(Math.abs(handle!.x + handle!.width / 2 - cell!.x)).toBeLessThan(2);
  expect(
    Math.abs(handle!.y + handle!.height / 2 - cell!.y - cell!.height / 2),
  ).toBeLessThan(2);
  const header = await table
    .locator("tbody tr")
    .first()
    .locator(":is(td, th):not([data-tool-cell])")
    .nth(1)
    .boundingBox();
  const grip = await column.boundingBox();
  expect(Math.abs(grip!.y + grip!.height / 2 - header!.y)).toBeLessThan(2);
  const last = await table.locator("tbody tr").last().boundingBox();
  await page.mouse.move(
    handle!.x + handle!.width / 2,
    handle!.y + handle!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(cell!.x + 40, last!.y + last!.height - 3, {
    steps: 12,
  });
  await expect(page.locator(".writing-table-drag-source")).toBeVisible();
  await expect(page.locator(".writing-table-drop-row")).toBeVisible();
  await page.screenshot({
    path: info.outputPath("table-drag-origin-destination.png"),
  });
  await page.mouse.up();
  await expect(table.locator("tbody tr").last()).toContainText("Documentation");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(table.locator("tbody tr").nth(1)).toContainText("Documentation");
  expect(errors).toEqual([]);
});

test("column move saves current cell edits and carries alignment; Escape cancels dragging", async ({
  page,
}) => {
  const writer = await open(page);
  const table = writer.locator("table");
  const cells = table
    .locator("tbody tr")
    .nth(1)
    .locator(":is(td, th):not([data-tool-cell])");
  await cells.nth(1).locator('[contenteditable="true"]').fill("Edited owner");
  const handle = page.getByRole("button", {
    name: "Column 2 actions and drag handle",
  });
  await handle.click();
  await page
    .getByRole("menuitem", { name: "Align right", exact: true })
    .click();
  await handle.click();
  await page
    .getByRole("menuitem", { name: "Move column right", exact: true })
    .click();
  await expect(cells.nth(2)).toContainText("Edited owner");
  const before = (await downloadMarkdown(page)).body;
  expect(before).toContain("Edited owner");
  const grip = await handle.boundingBox();
  await page.mouse.move(grip!.x + grip!.width / 2, grip!.y + grip!.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip!.x - 80, grip!.y, { steps: 6 });
  await expect(page.locator(".writing-table-drop-column")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect(page.locator(".writing-table-drop-column")).toHaveCount(0);
  expect((await downloadMarkdown(page)).body).toBe(before);
});

test("image settings use the shared dialog and preserve Cancel versus Save", async ({
  page,
}, info) => {
  const writer = await open(page);
  await actions(page, "Image");
  await page.getByRole("menuitem", { name: "Edit image", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Image settings" });
  await expect(dialog).toHaveAttribute("data-slot", "dialog-content");
  await dialog.getByLabel("Alternative text").fill("Cancelled description");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(writer.locator("img")).toHaveAttribute(
    "alt",
    "A landscape illustration",
  );
  await actions(page, "Image");
  await page.getByRole("menuitem", { name: "Edit image", exact: true }).click();
  await dialog.getByLabel("Alternative text").fill("A useful description");
  await dialog.getByLabel("Title (optional)").fill("Updated title");
  await page.screenshot({ path: info.outputPath("image-settings.png") });
  await dialog.getByRole("button", { name: "Save image", exact: true }).click();
  await expect(writer.locator("img")).toHaveAttribute(
    "alt",
    "A useful description",
  );
  expect((await downloadMarkdown(page)).body).toContain('"Updated title"');
});

for (const [label, selector] of [
  ["Code block", ".writing-code"],
  ["Image", "[data-editor-block-type=image]"],
  ["Table", "table"],
  ["Divider", "hr"],
]) {
  test(`${label} can be removed from its menu and restored with Undo`, async ({
    page,
  }) => {
    const writer = await open(page);
    await actions(page, label);
    await page
      .getByRole("menuitem", {
        name: `Remove ${label.toLowerCase()}`,
        exact: true,
      })
      .click();
    await expect(writer.locator(selector)).toHaveCount(0);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(writer.locator(selector)).toHaveCount(1);
  });
}

test("triple-click paragraph selection opens formatting and applies to the entire paragraph", async ({
  page,
}) => {
  const writer = await open(page);
  const paragraph = writer
    .locator("p")
    .filter({ hasText: "Triple-click this paragraph" });
  await paragraph.click({ clickCount: 3 });
  await expect(
    page.getByRole("group", { name: "Text formatting" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(paragraph.locator("strong")).toContainText(
    "Triple-click this paragraph to select it and open the formatting menu.",
  );
  const body = (await downloadMarkdown(page)).body;
  expect(body).toContain(
    "**Triple-click this paragraph to select it and open the formatting menu.**",
  );
});
