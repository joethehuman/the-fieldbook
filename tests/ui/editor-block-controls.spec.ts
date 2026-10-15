import { test, expect } from "@playwright/test";

test("native block menu uses shared row styling and keeps deletion reversible", async ({
  page,
}) => {
  await page.goto("/ui/writing");
  const writer = page
    .locator('.writing-content[contenteditable="true"]')
    .first();
  const heading = writer.getByRole("heading", {
    name: "A clear place to write",
    exact: true,
  });
  await expect(heading).toBeVisible();
  await heading.hover();
  await page
    .getByRole("button", { name: "Open block menu", exact: true })
    .click();
  const menu = page.getByRole("menu").first();
  const remove = menu.getByRole("menuitem", { name: "Delete", exact: true });
  await expect(remove).toBeVisible();
  await expect(remove).toHaveCSS(
    "font-family",
    await writer.evaluate((node) => getComputedStyle(node).fontFamily),
  );
  await remove.click();
  await expect(heading).toHaveCount(0);
  await writer.focus();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(heading).toBeVisible();
});

test("native code language picker is separate from the editable code", async ({
  page,
}) => {
  await page.goto("/ui/writing");
  const block = page.locator('[data-content-type="codeBlock"]').first();
  await block.scrollIntoViewIfNeeded();
  await block.getByRole("button", { name: "Code language" }).click();
  const menu = page.getByRole("menu", { name: "Code language" });
  await expect(menu).toBeVisible();
  await menu
    .getByRole("menuitem", { name: "Python", exact: true })
    .click();
  await expect(
    block.getByRole("button", { name: "Code language" }),
  ).toContainText("Python");
  await block.locator("pre code").click({ clickCount: 3 });
  await page.keyboard.press("ArrowRight");
  await page.keyboard.type(" # still editable");
  await expect(block.locator("pre code")).toContainText("# still editable");
});
