import { expect, type Page } from "@playwright/test";

/** Measure catalog controls after its dynamic editor and example media settle. */
export async function openCatalog(page: Page, url = "/ui") {
  // These layout checks do not exercise remote media providers.
  for (const [url, width, height] of [
    ["https://images.unsplash.com/**", 1400, 933],
    ["https://example.com/landscape.png", 1400, 933],
    ["https://i.ytimg.com/**", 1280, 720],
  ] as const) {
    await page.route(url, (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#ddd"/></svg>`,
      }),
    );
  }
  await page.goto(url);
  await expect(
    page.locator(".writing-editor [contenteditable=true]").first(),
  ).toBeVisible();
  await expect(
    page
      .locator(".writing-editor")
      .getByRole("img", { name: "A landscape illustration", exact: true }),
  ).toBeVisible();
  await page.locator("img").evaluateAll(async (images) => {
    await Promise.all(
      images.map((image) => {
        if (!(image instanceof HTMLImageElement)) return;
        image.loading = "eager";
        return image.decode().catch(() => undefined);
      }),
    );
  });
  await page.evaluate(() => document.fonts.ready);
}
