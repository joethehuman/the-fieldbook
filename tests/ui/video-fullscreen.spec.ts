import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://www.youtube-nocookie.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><html><body>Embedded video fixture</body></html>",
    }),
  );
  await page.route("https://media.fieldbook.example/**", (route) =>
    route.abort(),
  );
});

test("fullscreen and Close preserve the iframe and inline geometry", async ({
  page,
}) => {
  await page.goto("/ui/video");
  const player = page.locator(".course-video").first();
  const frame = player.locator(".course-video-frame");
  const iframe = await player.locator("iframe").elementHandle();
  const inline = await frame.boundingBox();
  await player
    .getByRole("button", { name: "Expand video to fullscreen" })
    .click();
  await expect
    .poll(() =>
      frame.evaluate((element) => document.fullscreenElement === element),
    )
    .toBe(true);
  const close = player.getByRole("button", { name: "Close fullscreen video" });
  await expect(close).toBeVisible();
  const expanded = await frame.boundingBox();
  const viewport = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
  }));
  expect(expanded!.width).toBe(viewport.width);
  expect(expanded!.height).toBe(viewport.height);
  await close.click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);
  await expect(
    player.getByRole("button", { name: "Expand video to fullscreen" }),
  ).toBeFocused();
  expect(await iframe!.evaluate((element) => element.isConnected)).toBe(true);
  expect(await frame.boundingBox()).toEqual(inline);
  await expect(page.getByRole("button", { name: /theater/i })).toHaveCount(0);
});

test("browser exit restores the expand control; authoring keeps provider controls", async ({
  page,
}) => {
  await page.goto("/ui/video");
  const player = page.locator(".course-video").first();
  await player
    .getByRole("button", { name: "Expand video to fullscreen" })
    .click();
  await expect(
    player.getByRole("button", { name: "Close fullscreen video" }),
  ).toBeVisible();
  // Browser Escape produces the same fullscreenchange event as this API exit.
  await page.evaluate(() => document.exitFullscreen());
  await expect(
    player.getByRole("button", { name: "Expand video to fullscreen" }),
  ).toBeFocused();
  const authoring = page.locator(".course-video").nth(2);
  await expect(authoring.locator("iframe")).toHaveAttribute(
    "allowfullscreen",
    "",
  );
  await expect(authoring.getByRole("button")).toHaveCount(0);
});

test("a rejected request leaves the video inline with recovery guidance", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () =>
      Promise.reject(new Error("Fullscreen denied"));
  });
  await page.goto("/ui/video");
  const player = page.locator(".course-video").first();
  const inline = await player.locator(".course-video-frame").boundingBox();
  await player
    .getByRole("button", { name: "Expand video to fullscreen" })
    .click();
  await expect(player.getByRole("alert")).toContainText(
    "Use the video player’s fullscreen control",
  );
  expect(await player.locator(".course-video-frame").boundingBox()).toEqual(
    inline,
  );
});

test("unavailable browser fullscreen retains provider and native video controls", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, "fullscreenEnabled", { value: false });
  });
  await page.goto("/ui/video");
  await expect(page.getByRole("button", { name: /fullscreen/ })).toHaveCount(0);
  await expect(page.locator("iframe").first()).toHaveAttribute(
    "allowfullscreen",
    "",
  );
  await expect(page.locator("video")).toHaveAttribute("controls", "");
});
