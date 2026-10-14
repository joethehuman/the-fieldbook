import { test, expect } from "@playwright/test";

test("compact navigation fades both ways and immediately releases hidden controls", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "Compact drawer motion.");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => sessionStorage.setItem("fieldbook.profile.v1", "demo-learner"));
  await page.goto("/#courses");
  const open = page.getByRole("button", { name: "Open navigation", exact: true });
  const close = page.getByRole("button", { name: "Close navigation", exact: true });
  const sidebar = page.locator("#main-sidebar");
  const backdrop = page.locator(".app-navigation-backdrop");
  const recordFade = () => backdrop.evaluate((element) => {
    (window as any).navigationFade = new Promise<number[]>((resolve) => {
      const values: number[] = [];
      const started = performance.now();
      const sample = () => {
        values.push(Number(getComputedStyle(element).opacity));
        if (performance.now() - started >= 500) resolve(values);
        else requestAnimationFrame(sample);
      };
      sample();
    });
  });
  await recordFade();
  await open.click();
  const entering: number[] = await page.evaluate(() => (window as any).navigationFade);
  expect(entering.some((value) => value > 0 && value < 0.3)).toBe(true);
  expect(entering.some((value) => value > 0.3 && value < 0.9)).toBe(true);
  expect(entering.at(-1)).toBe(1);
  await expect(close).toBeFocused();
  await page.screenshot({ path: info.outputPath("navigation-open.png") });

  await recordFade();
  await close.click();
  await expect(open).toBeFocused();
  await expect(sidebar).toHaveAttribute("inert", "");
  await expect(backdrop).toHaveCSS("pointer-events", "none");
  const leaving: number[] = await page.evaluate(() => (window as any).navigationFade);
  expect(leaving.some((value) => value > 0 && value < 1)).toBe(true);
  expect(leaving.at(-1)).toBe(0);
  await expect(sidebar).toBeHidden();

  // Reverse an in-flight transition without leaving a stale backdrop or focus target.
  await open.press("Enter");
  await page.keyboard.press("Escape");
  await open.press("Enter");
  await expect(close).toBeFocused();
  await expect(backdrop).toHaveCSS("opacity", "1");
  const restingColor = await backdrop.evaluate((element) => getComputedStyle(element).backgroundColor);
  await page.mouse.move(365, 200);
  await page.mouse.down();
  await expect(backdrop).toHaveCSS("background-color", restingColor);
  await page.mouse.up();
  await expect(sidebar).toBeHidden();

  await page.emulateMedia({ reducedMotion: "reduce" });
  await open.click();
  expect(await sidebar.evaluate((element) => element.getAnimations().length)).toBe(0);
  expect(await backdrop.evaluate((element) => element.getAnimations().length)).toBe(0);
  await page.keyboard.press("Escape");
  await expect(open).toBeFocused();
  await expect(sidebar).toBeHidden();
  await expect(backdrop).toBeHidden();
});

test("wide workspace scrolls at the edge while content stays centered", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "desktop", "Wide workspace geometry.");
  await page.setViewportSize({ width: 2560, height: 720 });
  await page.goto("/ui/workspace");
  for (const collapsed of [false, true]) {
    if (collapsed)
      await page
        .getByRole("button", { name: "Collapse sidebar", exact: true })
        .click();
    const geometry = await page.locator(".main-content").evaluate((main) => {
      const box = main.getBoundingClientRect();
      const content = main.firstElementChild!.getBoundingClientRect();
      return {
        right: box.right,
        center: (box.left + box.right) / 2,
        contentCenter: (content.left + content.right) / 2,
        contentWidth: content.width,
        scrollable: main.scrollHeight > main.clientHeight,
      };
    });
    expect(geometry.right).toBe(2560);
    expect(Math.abs(geometry.center - geometry.contentCenter)).toBeLessThan(2);
    expect(geometry.contentWidth).toBeLessThanOrEqual(1440);
    expect(geometry.scrollable).toBe(true);
    await page.locator(".main-content").focus();
    await page.keyboard.press("End");
    await expect
      .poll(() =>
        page
          .locator(".main-content")
          .evaluate(
            (main) => main.scrollHeight - main.clientHeight - main.scrollTop,
          ),
      )
      .toBeLessThan(2);
    await page.screenshot({
      path: info.outputPath(
        `workspace-edge-${collapsed ? "collapsed" : "open"}.png`,
      ),
    });
  }
});
test("workspace frame catalog shares responsive scrolling, pending and navigation controls", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/ui/workspace");
  await expect(
    page.getByRole("heading", { name: "Workspace frame", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Show pending indicator", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Opening page", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Hide pending indicator", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Opening page", exact: true }),
  ).toHaveCount(0);
  const open = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await open.isVisible()) {
    await open.click();
    await expect(
      page
        .getByRole("link", { name: "Interface reference", exact: true })
        .first(),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Close navigation", exact: true })
      .click();
    await expect(open).toBeFocused();
  } else {
    await page
      .getByRole("button", { name: "Collapse sidebar", exact: true })
      .click();
    await expect(page.locator(".app")).toHaveClass(/collapsed/);
    await page
      .getByRole("button", { name: "Expand sidebar", exact: true })
      .click();
  }
  await page.screenshot({
    path: info.outputPath("workspace-frame-catalog.png"),
    fullPage: true,
  });
});
