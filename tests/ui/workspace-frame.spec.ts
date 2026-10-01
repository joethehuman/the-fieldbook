import { test, expect } from "@playwright/test";
test("workspace frame catalog shares responsive scrolling and navigation controls", async ({
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
  await expect(page.locator(".app-bar-progress, .navigation-pending")).toHaveCount(0);
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
