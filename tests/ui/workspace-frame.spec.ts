import { test, expect } from "@playwright/test";

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
