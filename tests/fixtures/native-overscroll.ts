import { expect, type Locator, type Page } from "@playwright/test";

export async function expectElasticPage(page: Page, enabled = true) {
  const main = page.locator(".main-content");
  await expect(main).toBeVisible();
  await expect.poll(() => main.evaluate((element) => getComputedStyle(element).overscrollBehaviorY))
    .toBe("none");
  if (enabled) await expect(main).toHaveAttribute("data-elastic-ready", "true");
  else await expect(main).not.toHaveAttribute("data-elastic-ready", "true");
}

export async function exerciseLessonScrollOwner(page: Page, secondTitle: string, screenshot: (name: string) => string) {
  const main = page.locator(".main-content");
  const course = page.locator(".course-player");
  const reader = page.getByRole("region", { name: "Lesson content" });
  await expect(course).toHaveAttribute("data-scroll-layout", "workspace");
  await expect.poll(() => main.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
  await expect(reader).toHaveAttribute("tabindex", "0");
  await expectElasticPage(page, false);
  await expect.poll(() => reader.evaluate((element) => getComputedStyle(element).overscrollBehaviorY)).toBe("none");
  await expect(reader).toHaveAttribute("data-elastic-ready", "true");
  await expectEdgeSpring(page, reader, "top", screenshot("lesson-pane-edge-spring.png"));
  const sidebar = await page.locator(".course-sidebar").boundingBox();
  const pane = (await reader.boundingBox())!;
  const viewport = (await main.boundingBox())!;
  expect(pane.y + pane.height).toBeLessThanOrEqual(viewport.y + viewport.height);
  await reader.hover();
  await page.mouse.wheel(0, 600);
  await expect.poll(() => reader.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await main.evaluate((element) => element.scrollTop)).toBe(0);
  await reader.focus();
  await page.keyboard.press("End");
  const next = page.getByRole("button", { name: /^Next lesson/ });
  await expect(next).toBeInViewport({ ratio: 1 });
  await expectEdgeSpring(page, reader, "bottom");
  expect(await main.evaluate((element) => element.scrollTop)).toBe(0);
  expect(await page.locator(".course-sidebar").boundingBox()).toEqual(sidebar);
  await page.screenshot({ path: screenshot("lesson-pane-bottom.png") });
  await next.click();
  await expect(page.getByRole("heading", { name: secondTitle, exact: true })).toBeFocused();
  await expect.poll(() => reader.evaluate((element) => element.scrollTop)).toBeLessThanOrEqual(1);
  await expect.poll(() => reader.evaluate((element) => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1);
  await expect(reader).toHaveAttribute("tabindex", "-1");
  await expectEdgeSpring(page, reader, "top");
  await expectEdgeSpring(page, reader, "bottom");
  await page.screenshot({ path: screenshot("short-lesson-pane.png") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => reader.evaluate((element) => getComputedStyle(element).overscrollBehaviorY)).toBe("none");
  await page.setViewportSize({ width: 1440, height: 420 });
  await expect(course).toHaveAttribute("data-scroll-layout", "page");
  await expect(reader).toHaveAttribute("tabindex", "-1");
  const continuation = page.getByRole("navigation", { name: "Continue course" });
  await continuation.scrollIntoViewIfNeeded();
  await reader.hover();
  await page.mouse.wheel(0, 180);
  await expect(reader.locator(".elastic-scroll-motion")).toHaveCSS("transform", "none");
  await expect(main).not.toHaveAttribute("data-elastic-ready", "true");
  await continuation.scrollIntoViewIfNeeded();
  await expect(continuation.getByRole("button", { name: /^(Quiz|Finish course)/ })).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: screenshot("short-screen-page.png") });
  await page.setViewportSize({ width: 375, height: 600 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await expect(course).toHaveAttribute("data-scroll-layout", "page");
  await continuation.scrollIntoViewIfNeeded();
  await continuation.getByRole("button", { name: /^(Quiz|Finish course)/ }).click();
  await expect(page.getByRole("heading", { name: /Check your knowledge|Course complete/, exact: true })).toBeFocused();
  await page.screenshot({ path: screenshot("enlarged-phone-activity.png") });
}

/** Assert rendered displacement and return, not just overscroll permission. */
export async function expectEdgeSpring(page: Page, owner: Locator, edge: "top" | "bottom", screenshot?: string) {
  await expect(owner).toHaveAttribute("data-elastic-ready", "true");
  await owner.evaluate((element, end) => element.scrollTo({ top: end === "top" ? 0 : element.scrollHeight, behavior: "instant" }), edge);
  const motion = owner.locator(":scope > .elastic-scroll-boundary > .elastic-scroll-motion");
  const header = await page.getByRole("banner").boundingBox();
  const baseline = await motion.boundingBox();
  const range = await owner.evaluate((element) => ({ top: element.scrollTop, height: element.scrollHeight }));
  await owner.hover({ position: { x: 40, y: 40 } });
  await page.mouse.wheel(0, edge === "top" ? -180 : 180);
  await expect.poll(async () => {
    const current = await motion.boundingBox();
    return (current!.y - baseline!.y) * (edge === "top" ? 1 : -1);
  }, { intervals: [10, 20, 30] }).toBeGreaterThan(8);
  expect(await page.getByRole("banner").boundingBox()).toEqual(header);
  if (screenshot) await page.screenshot({ path: screenshot });
  expect(await owner.evaluate((element) => ({ top: element.scrollTop, height: element.scrollHeight }))).toEqual(range);
  await expect.poll(() => motion.evaluate((element) => getComputedStyle(element).transform)).toBe("none");
  expect((await motion.boundingBox())!.y).toBeCloseTo(baseline!.y, 1);
}
