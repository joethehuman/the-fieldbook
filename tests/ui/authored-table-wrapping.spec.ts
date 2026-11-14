import { test, expect } from "@playwright/test";
import { openCatalog } from "../helpers/catalog-ready";

test.beforeEach(async ({ page }) => {
  await openCatalog(page, "/ui#authored-tables");
  await expect(
    page
      .getByRole("group", { name: "Wrapping table example", exact: true })
      .getByRole("table"),
  ).toBeVisible();
});

test("prose and long links wrap while short tables stay compact", async ({
  page,
}) => {
  const prose = page.getByRole("group", {
    name: "Wrapping table example",
    exact: true,
  });
  const geometry = await prose.getByRole("table").evaluate((table) => {
    const node = table as HTMLTableElement;
    const cell = node.rows[1].cells[1];
    const link = node.rows[2].cells[1];
    const range = document.createRange();
    range.selectNodeContents(cell);
    return {
      table: node.getBoundingClientRect().width,
      available: node.parentElement!.clientWidth,
      lines: new Set(
        [...range.getClientRects()].map((rect) => Math.round(rect.top)),
      ).size,
      linkWidth: link.clientWidth,
      linkScroll: link.scrollWidth,
    };
  });
  expect(geometry.table).toBeLessThanOrEqual(geometry.available + 1);
  expect(geometry.lines).toBeGreaterThan(1);
  expect(geometry.linkScroll).toBeLessThanOrEqual(geometry.linkWidth + 1);

  const compact = page.getByRole("group", {
    name: "Compact table example",
    exact: true,
  });
  const size = await compact.getByRole("table").evaluate((table) => ({
    table: table.getBoundingClientRect().width,
    available: table.parentElement!.clientWidth,
  }));
  expect(size.table).toBeLessThan(size.available - 10);
});

test("resized columns retain their widths and wide tables scroll internally", async ({
  page,
}) => {
  for (const [name, expected] of [
    ["Partially resized table example", [240, 176]],
    ["Resized table example", [192, 384]],
  ] as const) {
    const widths = await page
      .getByRole("group", { name, exact: true })
      .getByRole("table")
      .evaluate((table) =>
        [...(table as HTMLTableElement).rows[1].cells].map(
          (cell) => cell.getBoundingClientRect().width,
        ),
      );
    widths.forEach((width, index) =>
      expect(Math.abs(width - expected[index])).toBeLessThanOrEqual(1),
    );
  }

  const wide = page.getByRole("group", {
    name: "Wide table example",
    exact: true,
  });
  const scroller = wide.getByRole("region", { name: "Scrollable table" });
  await scroller.scrollIntoViewIfNeeded();
  const size = await scroller.evaluate((node) => ({
    width: node.clientWidth,
    scroll: node.scrollWidth,
  }));
  expect(size.scroll).toBeGreaterThan(size.width + 50);
  await expect(wide.locator(".table-edge-fade")).toHaveAttribute(
    "data-more-right",
    "true",
  );
  await scroller.focus();
  await expect(scroller).toBeFocused();
  await scroller.hover();
  await page.mouse.wheel(120, 0);
  await expect
    .poll(() => scroller.evaluate((node) => node.scrollLeft))
    .toBeGreaterThan(0);
  // Native horizontal scrolling remains available without moving the page.
  await scroller.evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
  });
  await expect(wide.locator(".table-edge-fade")).toHaveAttribute(
    "data-more-left",
    "true",
  );
  await expect(wide.locator(".table-edge-fade")).toHaveAttribute(
    "data-more-right",
    "false",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
