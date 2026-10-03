import { test, expect } from "@playwright/test";

test("thinking dots visibly rise in sequence without moving their row", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/ui");
  const dots = page.locator('[data-slot="loading-dots"]');
  await dots.scrollIntoViewIfNeeded();
  await expect(dots).toBeVisible();
  const samples = await dots.evaluate(async (row) => {
    const frames: { row: number; dots: number[] }[] = [];
    const start = performance.now();
    while (performance.now() - start < 1600) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      frames.push({
        row: row.getBoundingClientRect().y,
        dots: [...row.children].map((dot) => dot.getBoundingClientRect().y),
      });
    }
    return frames;
  });
  for (let dot = 0; dot < 3; dot++) {
    const y = samples.map((frame) => frame.dots[dot]);
    expect(Math.max(...y) - Math.min(...y)).toBeGreaterThan(2.5);
    expect(Math.max(...y) - Math.min(...y)).toBeLessThanOrEqual(3.1);
  }
  const rowY = samples.map((frame) => frame.row);
  expect(Math.max(...rowY) - Math.min(...rowY)).toBeLessThan(0.1);
  // Different phases must be visible, not three dots moving together.
  expect(
    samples.some(
      (frame) => Math.max(...frame.dots) - Math.min(...frame.dots) > 1.5,
    ),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("thinking-motion.png") });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() =>
      dots
        .locator("span")
        .first()
        .evaluate((dot) => getComputedStyle(dot).animationName),
    )
    .toBe("none");
  const staticSamples = await dots.evaluate(async (row) => {
    const samples: number[][] = [];
    const start = performance.now();
    while (performance.now() - start < 400) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      samples.push(
        [...row.children].map((dot) => dot.getBoundingClientRect().y),
      );
    }
    return samples;
  });
  expect(
    staticSamples.every((frame) =>
      frame.every((y, dot) => Math.abs(y - staticSamples[0][dot]) < 0.1),
    ),
  ).toBe(true);
  await info.attach("motion-samples", {
    body: JSON.stringify({ samples, staticSamples }),
    contentType: "application/json",
  });
});
