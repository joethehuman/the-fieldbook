import { test, expect } from "@playwright/test";

test("confirmations replace one another without shifting layout and fade automatically", async ({
  page,
}, info) => {
  await page.goto("/ui");
  const trigger = page.getByRole("button", {
    name: "Preview confirmation",
    exact: true,
  });
  await trigger.scrollIntoViewIfNeeded();
  const before = await trigger.boundingBox();
  await trigger.click();
  const toast = page.locator('[data-slot="toast"]');
  await expect(toast).toHaveText("Doc published.");
  await expect(trigger).toBeFocused();
  expect(await trigger.boundingBox()).toEqual(before);
  await page.clock.install();
  await page.clock.fastForward(3000);
  for (let i = 0; i < 10; i++) await trigger.click();
  await expect(toast).toHaveCount(1);
  await page.clock.fastForward(3000);
  await expect(toast).toHaveText("Doc published.");
  await page.getByRole("button", { name: "Preview long confirmation" }).click();
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText("installation guide");
  const box = await toast.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({
    path: info.outputPath("confirmation.png"),
    fullPage: false,
  });
  await toast.hover();
  await page.clock.fastForward(6000);
  await expect(toast).toBeVisible();
  await trigger.hover();
  await page.clock.fastForward(4300);
  await expect(toast).toHaveCount(0);
  expect(await trigger.boundingBox()).toEqual(before);
});

test("reduced motion preserves confirmation and timeout without animation", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/ui");
  await page
    .getByRole("button", { name: "Preview confirmation", exact: true })
    .click();
  const toast = page.locator('[data-slot="toast"]');
  await expect(toast).toHaveCSS("transition-property", "none");
  await expect(toast).toHaveCount(0, { timeout: 6000 });
});
