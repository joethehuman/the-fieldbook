import { test, expect } from "@playwright/test";

test("portrait viewer fits the screen and keeps Close available", async ({
  page,
}, info) => {
  await page.goto("/ui#image-viewer");
  const open = page.getByRole("button", {
    name: "View portrait image",
    exact: true,
  });
  await open.click();
  const dialog = page.getByRole("dialog", {
    name: "Portrait illustration",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  const image = dialog.getByRole("img", {
    name: "Portrait illustration",
    exact: true,
  });
  await expect
    .poll(() =>
      image.evaluate(
        (element: HTMLImageElement) =>
          element.complete && element.naturalHeight,
      ),
    )
    .toBe(1200);
  const geometry = await dialog.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const image = element.querySelector("img")!;
    const close = element.querySelector("button")!.getBoundingClientRect();
    return {
      left: box.left,
      right: box.right,
      top: box.top,
      bottom: box.bottom,
      closeBottom: close.bottom,
      fit: getComputedStyle(image).objectFit,
      overflow: element.scrollHeight - element.clientHeight,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(0);
  expect(geometry.right).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(geometry.top).toBeGreaterThanOrEqual(0);
  expect(geometry.bottom).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(geometry.closeBottom).toBeLessThan(geometry.bottom);
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.fit).toBe("contain");
  await page.screenshot({ path: info.outputPath("portrait-image-viewer.png") });
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(open).toBeFocused();
});
