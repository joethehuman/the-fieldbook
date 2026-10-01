import { expect, type Page } from "@playwright/test";

export async function courseSidebarGap(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector(".main-content")!;
    return (
      document.querySelector(".course-sidebar")!.getBoundingClientRect().top -
      main.getBoundingClientRect().top
    );
  });
}

export async function expectDesktopOutlineMinimum(
  page: Page,
  lessonCount: number,
) {
  const outline = page.getByRole("navigation", { name: "In this course" });
  const geometry = await outline.evaluate((nav) => {
    const panel = nav.closest(".course-sidebar-panel")!;
    const exit = panel.querySelector(".course-sidebar-exit")!;
    const last = nav.querySelector(".quiz-step")!;
    const rect = nav.getBoundingClientRect();
    return {
      height: rect.height,
      minimum:
        16 * parseFloat(getComputedStyle(document.documentElement).fontSize),
      overflow: nav.scrollHeight - nav.clientHeight,
      quizBottom: last.getBoundingClientRect().bottom - rect.top,
      exitGap: exit.getBoundingClientRect().top - rect.bottom,
      panelOverflow: panel.scrollHeight - panel.clientHeight,
    };
  });
  expect(geometry.height).toBeGreaterThanOrEqual(geometry.minimum - 1);
  expect(geometry.exitGap).toBeGreaterThanOrEqual(0);
  expect(geometry.panelOverflow).toBeLessThanOrEqual(1);
  if (lessonCount === 3) {
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    expect(geometry.quizBottom).toBeLessThanOrEqual(geometry.height);
  } else {
    expect(geometry.overflow).toBeGreaterThan(0);
    await outline.evaluate((nav) => { nav.scrollTop = 0; });
    await outline.scrollIntoViewIfNeeded();
    const mainScroll = await page
      .locator(".main-content")
      .evaluate((main) => main.scrollTop);
    await outline.hover();
    await page.mouse.wheel(0, 400);
    await expect
      .poll(() => outline.evaluate((nav) => nav.scrollTop))
      .toBeGreaterThan(0);
    expect(
      await page.locator(".main-content").evaluate((main) => main.scrollTop),
    ).toBe(mainScroll);
  }
  // Both the end of the outline and Exit remain reachable when the whole card
  // must exceed a very short workspace. The body never becomes a second scroller.
  await outline.evaluate((nav) => {
    nav.scrollTop = nav.scrollHeight;
  });
  await page.locator(".main-content").evaluate((main) => {
    main.scrollTop = main.scrollHeight;
  });
  await expect(outline.getByRole("button", { name: /Quiz/ })).toBeInViewport({
    ratio: 1,
  });
  await expect(
    page
      .getByRole("button", { name: "← Exit course" })
      .or(page.getByRole("link", { name: /^Exit course/ })),
  ).toBeInViewport({ ratio: 1 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollHeight - innerHeight,
    ),
  ).toBeLessThanOrEqual(1);
}
