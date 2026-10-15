import { test, expect } from "@playwright/test";

// Cell selection belongs to BlockNote's native table extension. Exercise the
// public DOM and clipboard output rather than a parallel app selection model.
test("native rectangular selection copies cell content without executable markup", async ({
  page,
}) => {
  await page.goto("/ui/writing");
  const table = page.locator("#writing .bn-editor table").first();
  await expect(table).toBeVisible();
  await table.scrollIntoViewIfNeeded();
  const cells = table.locator("tr").nth(1).locator("td, th");
  await cells.first().locator("p").click();
  await cells
    .last()
    .locator("p")
    .click({ modifiers: ["Shift"] });
  await expect(table.locator(".selectedCell")).toHaveCount(3);
  const clipboard = await table.evaluate((node) => {
    const data = new DataTransfer();
    node.dispatchEvent(
      new ClipboardEvent("copy", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
    return {
      text: data.getData("text/plain"),
      html: data.getData("text/html"),
    };
  });
  expect(clipboard.text).toContain("Documentation");
  expect(clipboard.text).toContain("Enablement");
  expect(clipboard.html).toContain("table");
  expect(clipboard.html).not.toMatch(/<script|onerror=/i);
  await page.keyboard.press("Escape");
  await cells.first().click();
  await page.keyboard.type("Updated ");
  await expect(cells.first()).toContainText("Updated");
});
