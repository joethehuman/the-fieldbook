import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

export const readerImageUrl = "https://example.test/reader-image.svg";
export const readerImageAlt = "Landscape illustration";

export async function serveReaderImage(page: Page) {
  const body = readFileSync(
    "demo/public/ui/image-viewer-landscape.svg",
    "utf8",
  );
  await page.route(readerImageUrl, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body }),
  );
}

export async function expectShortLessonFits(page: Page) {
  await expect
    .poll(() =>
      page
        .locator(".main-content")
        .evaluate((main) => main.scrollHeight - main.clientHeight),
    )
    .toBeLessThanOrEqual(2);
  const main = (await page.locator(".main-content").boundingBox())!;
  const next = (await page
    .getByRole("button", { name: /^Next lesson/ })
    .boundingBox())!;
  expect(next.y + next.height).toBeLessThanOrEqual(main.y + main.height);
}

export async function exerciseImageViewer(
  page: Page,
  screenshot: (name: string) => string,
) {
  const trigger = page.getByRole("button", {
    name: `Expand image: ${readerImageAlt}`,
    exact: true,
  });
  await trigger.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      trigger
        .locator("img")
        .evaluate(
          (image: HTMLImageElement) => image.complete && image.naturalWidth > 0,
        ),
    )
    .toBe(true);
  const inlineWidth = (await trigger.locator("img").boundingBox())!.width;
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", {
    name: readerImageAlt,
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused();
  const renderedWidth = await dialog
    .locator("img")
    .evaluate((image: HTMLImageElement) => {
      const box = image.getBoundingClientRect();
      return (
        Math.min(
          box.width / image.naturalWidth,
          box.height / image.naturalHeight,
        ) * image.naturalWidth
      );
    });
  if (page.viewportSize()!.width >= 1120)
    expect(renderedWidth).toBeGreaterThan(inlineWidth + 100);
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused();
  await page.screenshot({ path: screenshot("expanded-landscape.png") });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.press("Enter");
  await expect(
    dialog.getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.press("Enter");
  await expect(
    dialog.getByRole("button", { name: "Close", exact: true }),
  ).toBeFocused();
  await page
    .locator('[data-slot="dialog-overlay"]')
    .click({ position: { x: 5, y: 5 } });
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();

  // Short viewports and enlarged type still leave the image and Close in view.
  await page.setViewportSize({ width: 900, height: 400 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await trigger.click();
  const geometry = await dialog.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const close = element.querySelector("button")!.getBoundingClientRect();
    const image = element.querySelector("img")!.getBoundingClientRect();
    return {
      top: box.top,
      bottom: box.bottom,
      right: box.right,
      left: box.left,
      closeBottom: close.bottom,
      imageHeight: image.height,
      overflow: element.scrollHeight - element.clientHeight,
    };
  });
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(400);
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(900);
  expect(geometry.closeBottom).toBeLessThan(geometry.bottom);
  expect(geometry.imageHeight).toBeGreaterThan(0);
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: screenshot("expanded-image-short-enlarged.png"),
  });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(trigger).toBeFocused();
}
