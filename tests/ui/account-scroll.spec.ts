import { expect, test } from "@playwright/test";

test("demo profile chooser stays in place when it fits and scrolls when needed", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone");
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/");
  const heading = page.getByRole("heading", { name: "Choose a demo profile" });
  await expect(heading).toBeVisible();
  const viewport = page.locator('[data-slot="account-viewport"]');
  const card = viewport.getByRole("main");
  const initialTop = (await card.boundingBox())!.y;

  await page.mouse.wheel(0, 500);
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollTop))
    .toBe(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect((await card.boundingBox())!.y).toBe(initialTop);

  await page.setViewportSize({ width: 390, height: 380 });
  await page.mouse.wheel(0, 500);
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.mouse.wheel(0, -500);
  await expect
    .poll(() => viewport.evaluate((element) => element.scrollTop))
    .toBe(0);
  await expect(heading).toBeVisible();
});
