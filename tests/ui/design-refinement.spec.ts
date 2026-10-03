import { test, expect, type Locator, type Page } from "@playwright/test";
import { learningUiFixture } from "../fixtures/learning-ui";

async function seed(page: Page, profile = "demo-learner") {
  await page.addInitScript(({ data, profile }) => {
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
    sessionStorage.setItem("fieldbook.profile.v1", profile);
  }, { data: learningUiFixture(), profile });
  await page.goto("/#courses");
  await expect(page.getByRole("heading", { name: "Courses", exact: true })).toBeVisible();
}

async function expectImmediateHighlight(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  const before = await target.evaluate(el => getComputedStyle(el).backgroundColor);
  await target.evaluate(el => {
    delete (el as HTMLElement).dataset.firstHoverColor;
    el.addEventListener("pointerenter", () => requestAnimationFrame(() => {
      (el as HTMLElement).dataset.firstHoverColor = getComputedStyle(el).backgroundColor;
    }), { once: true });
  });
  await target.hover();
  await expect(target).toHaveAttribute("data-first-hover-color", /.+/);
  const first = await target.getAttribute("data-first-hover-color");
  // A short pass must reach the same highlight as a resting pointer.
  await page.waitForTimeout(220);
  const resting = await target.evaluate(el => getComputedStyle(el).backgroundColor);
  expect(first).not.toBe(before);
  expect(first).toBe(resting);
}

test("course counts center beside labels and cards lift within their scrolling strip", async ({ page }, info) => {
  await seed(page);
  const title = page.getByRole("heading", { name: /^For you/ });
  const badge = title.locator('[data-slot="count-badge"]');
  const headingBox = await title.boundingBox();
  const badgeBox = await badge.boundingBox();
  expect(Math.abs(headingBox!.y + headingBox!.height / 2 - badgeBox!.y - badgeBox!.height / 2)).toBeLessThan(1);
  if (info.project.name === "phone") await page.getByRole("button", { name: "Open navigation" }).click();
  const nav = page.locator('.sidebar-primary-link').filter({ has: page.locator('.nav-count') });
  const navBox = await nav.boundingBox();
  const countBox = await nav.locator('.nav-count').boundingBox();
  expect(Math.abs(navBox!.y + navBox!.height / 2 - countBox!.y - countBox!.height / 2)).toBeLessThan(1);
  if (info.project.name === "phone") await page.getByRole("button", { name: "Close navigation" }).click();

  const card = page.locator('.course-row [data-interaction="lift"]').first();
  await card.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  const before = await card.boundingBox();
  const shadow = await card.evaluate(el => getComputedStyle(el).boxShadow);
  await card.hover();
  await expect.poll(async () => before!.y - (await card.boundingBox())!.y).toBeCloseTo(2, 0);
  expect(await card.evaluate(el => getComputedStyle(el).boxShadow)).not.toBe(shadow);
  const strip = await card.locator('..').boundingBox();
  const hovered = await card.boundingBox();
  expect(hovered!.y - strip!.y).toBeGreaterThanOrEqual(8);
  expect(strip!.y + strip!.height - hovered!.y - hovered!.height).toBeGreaterThanOrEqual(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath("counts-card-hover.png") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(async () => (await card.boundingBox())!.y).toBeCloseTo(before!.y, 0);
  expect(await card.evaluate(el => getComputedStyle(el).boxShadow)).not.toBe(shadow);
});

test("navigation, table rows and menus highlight on the first hover frame", async ({ page }, info) => {
  await seed(page, "demo-admin");
  if (info.project.name === "phone") await page.getByRole("button", { name: "Open navigation" }).click();
  await expectImmediateHighlight(page, page.locator('.sidebar-primary-link').filter({ hasText: "Updates" }));
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  const menu = page.getByRole("menuitem", { name: "Manage organization", exact: true });
  await expectImmediateHighlight(page, menu);
  await menu.click();
  await expectImmediateHighlight(page, page.locator('tbody tr').first());
});
