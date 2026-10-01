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

export async function expectContentSizedCourseSidebar(page: Page) {
  const panel = page.locator(".course-sidebar-panel");
  await page
    .getByRole("navigation", { name: "In this course" })
    .evaluate((nav) => {
      nav.scrollTop = 0;
    });
  const geometry = await panel.evaluate((element) => {
    const nav = element.querySelector(".lesson-nav")!;
    const last = nav.querySelector(".quiz-step")!;
    const navStyle = getComputedStyle(nav);
    const rect = nav.getBoundingClientRect();
    const content =
      last.getBoundingClientRect().bottom -
      rect.top +
      parseFloat(navStyle.paddingBottom) +
      parseFloat(navStyle.borderBottomWidth);
    const minimum =
      16 * parseFloat(getComputedStyle(document.documentElement).fontSize);
    return {
      outline: rect.height,
      desired: Math.max(content, minimum),
      panel: element.getBoundingClientRect().height,
    };
  });
  // An outline with few rows keeps its floor; it never fills spare window height.
  expect(Math.abs(geometry.outline - geometry.desired)).toBeLessThan(2);
  await page.setViewportSize({ width: 1440, height: 1600 });
  await expect
    .poll(async () =>
      Math.abs((await panel.boundingBox())!.height - geometry.panel),
    )
    .toBeLessThan(2);
}

export async function exercisePreviousLessons(
  page: Page,
  firstTitle: string,
  secondTitle: string,
  hasQuiz: boolean,
  screenshot: (name: string) => string,
) {
  const previous = page.getByRole("button", { name: /^Previous lesson/ });
  const outline = page.getByRole("navigation", { name: "In this course" });
  let writes = 0;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/progress"
    )
      writes++;
  });
  await expect(previous).toHaveCount(0);
  await page.getByRole("button", { name: /^Next lesson/ }).click();
  await expect(
    page.getByRole("heading", { name: secondTitle, exact: true }),
  ).toBeFocused();
  await expect(previous).toBeVisible();
  const continuation = page.getByRole("navigation", {
    name: "Continue course",
  });
  await continuation.scrollIntoViewIfNeeded();
  await expect(previous).toBeInViewport({ ratio: 1 });
  await expect(continuation.locator('[data-direction="next"]')).toBeInViewport({
    ratio: 1,
  });
  await page.screenshot({ path: screenshot("previous-and-next.png") });
  const saved = await outline.locator(".step-number.done").count();
  const writesBefore = writes;
  await previous.click();
  await expect(
    page.getByRole("heading", { name: firstTitle, exact: true }),
  ).toBeFocused();
  expect(await outline.locator(".step-number.done").count()).toBe(saved);
  expect(writes).toBe(writesBefore);
  await expect(previous).toHaveCount(0);
  if (new URL(page.url()).searchParams.has("lesson"))
    expect(new URL(page.url()).searchParams.get("lesson")).toBe("first");
  await page.getByRole("button", { name: /^Next lesson/ }).click();
  await page
    .getByRole("button", {
      name: hasQuiz
        ? "Quiz Check your knowledge"
        : "Finish course Course complete",
    })
    .click();
  await expect(
    page.getByRole("heading", {
      name: hasQuiz ? "Check your knowledge" : "Course complete",
      exact: true,
    }),
  ).toBeFocused();
  await expect(previous).toBeVisible();
  const completed = await outline.locator(".step-number.done").count();
  const completion = await page
    .locator('.course-detail-meta [data-slot="badge"]')
    .getAttribute("aria-hidden");
  expect(completion).toBe(hasQuiz ? "true" : "false");
  const finalWrites = writes;
  await previous.click();
  await expect(
    page.getByRole("heading", { name: secondTitle, exact: true }),
  ).toBeFocused();
  expect(await outline.locator(".step-number.done").count()).toBe(completed);
  expect(
    await page
      .locator('.course-detail-meta [data-slot="badge"]')
      .getAttribute("aria-hidden"),
  ).toBe(completion);
  expect(writes).toBe(finalWrites);
  if (new URL(page.url()).searchParams.has("lesson"))
    expect(new URL(page.url()).searchParams.get("lesson")).toBe("second");
  expect(
    await page
      .locator(".main-content")
      .evaluate((main) => main.scrollWidth - main.clientWidth),
  ).toBeLessThanOrEqual(1);
}

export async function expectDesktopOutlineMinimum(
  page: Page,
  lessonCount: number,
) {
  const outline = page.getByRole("navigation", { name: "In this course" });
  // ResizeObserver adjusts the surrounding-content allowance before paint.
  await expect
    .poll(() =>
      page
        .locator(".course-sidebar-panel")
        .evaluate((panel) => panel.scrollHeight - panel.clientHeight),
    )
    .toBeLessThanOrEqual(1);
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
    await outline.evaluate((nav) => {
      nav.scrollTop = 0;
    });
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
