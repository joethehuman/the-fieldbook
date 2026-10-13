import { expect, test, type Locator, type Page } from "@playwright/test";
import type { LexicalEditor, RangeSelection } from "lexical";
import { freshWorkspace, type Workspace } from "../../lib/store";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import { writeTableWidths } from "../../lib/writing-table";
import { authoringUser, setupAuthoringProvider, syncAuthoringProvider } from "./provider-fixture";
import { waitForDraftSaved } from "./editor-helpers";

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

const fixtureId = "00000000-0000-4000-8000-000000000916";
const tableBody = writeTableWidths(
  "Before the table.\n\n| Topic | Detail |\n| --- | --- |\n| First | A short detail. |\n| Second | Another detail. |\n\nAfter the table.",
  [[176, 260]],
);

async function open(page: Page, installed: boolean) {
  let state = withPublishedSnapshots(freshWorkspace());
  const item = {
    ...state.content.find((entry) => entry.kind === "doc")!,
    id: fixtureId, title: "Editor fluidity fixture", body: tableBody,
    revision: 1, publishedRevision: 1,
  };
  state.content = [item];
  state.publishedContent = [structuredClone(item)];
  if (installed) {
    await setupAuthoringProvider(page, state);
    await page.route("**/api/admin/snapshot?**", (route) => route.fulfill({ json: { data: state, user: authoringUser } }));
    await page.route("**/api/content*", async (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: state.content[0] });
      const request = route.request().postDataJSON();
      expect(request.expected).toBe(state.content[0].revision);
      state.content = [{ ...request.content, revision: state.content[0].revision! + 1, publishedRevision: state.content[0].publishedRevision }];
      await syncAuthoringProvider(page, state);
      return route.fulfill({ json: state.content[0] });
    });
  } else {
    await page.addInitScript((data) => {
      if (!localStorage.getItem("fieldbook.workspace.v1")) localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    }, state);
  }
  await page.goto(installed ? `/admin/content/${fixtureId}/edit` : `/#admin/content/${fixtureId}/edit`);
  const writer = page.getByRole("textbox", { name: "Doc content", exact: true });
  await expect(writer).toBeVisible();
  await expect(writer.locator(".writing-table-row")).toHaveCount(3);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  await afterPaints(page);
  const read = async (): Promise<Workspace> => installed ? state : page.evaluate(() => JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!));
  return { writer, read };
}

async function afterPaints(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))));
}

async function nativeSelectionMatches(surface: Locator) {
  return surface.evaluate((element) => {
    const editor = (element as HTMLElement & { __lexicalEditor: LexicalEditor }).__lexicalEditor;
    const native = window.getSelection();
    const selection = editor.getEditorState()._selection as RangeSelection | null;
    if (document.activeElement !== element || !native?.rangeCount || !selection?.anchor || !selection.focus) return false;
    return !!editor.getElementByKey(selection.anchor.key)?.contains(native.anchorNode)
      && !!editor.getElementByKey(selection.focus.key)?.contains(native.focusNode)
      && selection.anchor.offset === native.anchorOffset
      && selection.focus.offset === native.focusOffset
      && selection.isCollapsed() === native.isCollapsed;
  });
}

/** The controls must remain on the actual rows/columns after any invalidation. */
async function controlError(host: Locator) {
  return host.evaluate((element) => {
    const rows = Array.from(element.querySelector("table")!.tBodies[0].rows)
      .map((row) => Array.from(row.cells).filter((cell) => !cell.hasAttribute("data-tool-cell")));
    const rowControls = Array.from(element.querySelectorAll(".writing-table-row"));
    const columnControls = Array.from(element.querySelectorAll(".writing-table-column"));
    const resizers = Array.from(element.querySelectorAll(".writing-table-resizer"));
    if (rowControls.length !== rows.length || columnControls.length !== rows[0].length || resizers.length !== rows[0].length) return Infinity;
    const errors = rows.map((row, index) => {
      const cell = row[0].getBoundingClientRect(), control = rowControls[index].getBoundingClientRect();
      return Math.abs(cell.top + cell.height / 2 - control.top - control.height / 2);
    });
    rows[0].forEach((cell, index) => {
      const bounds = cell.getBoundingClientRect(), control = columnControls[index].getBoundingClientRect();
      const resizer = resizers[index].getBoundingClientRect();
      errors.push(Math.abs(bounds.left + bounds.width / 2 - control.left - control.width / 2));
      errors.push(Math.abs(bounds.right - resizer.left - resizer.width / 2));
    });
    const fade = element.closest(".mdxeditor-contenteditable-wrapper")!.querySelector(".writing-table-edge-fade")!.getBoundingClientRect();
    errors.push(Math.abs(rows[0][0].getBoundingClientRect().top - fade.top));
    errors.push(Math.abs(rows.at(-1)![0].getBoundingClientRect().bottom - fade.bottom));
    return Math.max(...errors);
  });
}

test("typing prose and moving its caret do not remeasure unchanged table cells", async ({ page }, info) => {
  const { writer } = await open(page, info.project.name.startsWith("production"));
  await writer.locator(":scope > p").first().tap();
  await page.keyboard.press("End");
  await afterPaints(page);
  await writer.locator("table").evaluate((table) => {
    const metrics = { reads: 0 };
    (window as typeof window & { tableMeasurements?: typeof metrics }).tableMeasurements = metrics;
    table.querySelectorAll("td, th").forEach((cell) => {
      const measure = cell.getBoundingClientRect.bind(cell);
      cell.getBoundingClientRect = () => { metrics.reads++; return measure(); };
    });
  });
  await page.keyboard.type(" More prose.");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowRight");
  await afterPaints(page);
  expect(await page.evaluate(() => (window as typeof window & { tableMeasurements?: { reads: number } }).tableMeasurements!.reads)).toBe(0);
  await expect(writer.locator(":scope > p").first()).toHaveText("Before the table. More prose.");
});

test("table controls follow prose movement, cell wrapping, and resizing without losing saved edits", async ({ page }, info) => {
  const { writer, read } = await open(page, info.project.name.startsWith("production"));
  const host = writer.locator(".writing-table-block");
  await expect.poll(() => controlError(host)).toBeLessThan(1.5);
  const initialTop = await host.evaluate((element) => (element as HTMLElement).offsetTop);
  await writer.locator(":scope > p").first().tap();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("A new paragraph above the table.");
  await expect.poll(() => host.evaluate((element) => (element as HTMLElement).offsetTop)).toBeGreaterThan(initialTop);
  await expect.poll(() => controlError(host)).toBeLessThan(1.5);

  const cell = host.locator('table [contenteditable="true"]').nth(2);
  const beforeHeight = await cell.evaluate((element) => element.closest("tr")!.getBoundingClientRect().height);
  const detail = "A longer first cell that wraps across several lines and moves the next row.";
  await cell.tap();
  await expect(cell.locator("..")).toHaveAttribute("data-active", "true");
  await expect.poll(() => nativeSelectionMatches(cell)).toBe(true);
  await cell.press("ControlOrMeta+a");
  await expect.poll(() => cell.evaluate(() => window.getSelection()?.toString())).toBe("First");
  await expect.poll(() => nativeSelectionMatches(cell)).toBe(true);
  await page.keyboard.insertText(detail);
  await expect(cell).toHaveText(detail);
  await expect.poll(() => cell.evaluate((element) => element.closest("tr")!.getBoundingClientRect().height)).toBeGreaterThan(beforeHeight);
  await expect.poll(() => controlError(host)).toBeLessThan(1.5);
  const resize = page.getByRole("separator", { name: "Resize column 1", exact: true });
  await resize.focus();
  await resize.press("ArrowRight");
  await expect(resize).toHaveAttribute("aria-valuenow", "192");
  await expect.poll(() => controlError(host)).toBeLessThan(1.5);
  await waitForDraftSaved(page);
  const saved = (await read()).content[0].body;
  expect(saved).toContain("A new paragraph above the table.");
  expect(saved).toContain(detail);
  expect(saved).not.toContain(`${detail}First`);
  expect(saved).toContain("[[192,260]]");
  await page.reload();
  await expect(writer).toBeVisible();
  await expect(cell).toHaveText(detail);
  await expect(resize).toHaveAttribute("aria-valuenow", "192");
  await expect.poll(() => controlError(host)).toBeLessThan(1.5);
});
