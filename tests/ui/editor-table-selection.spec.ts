import { test, expect, type Page } from "@playwright/test";
import { downloadMarkdown } from "../authoring/editor-helpers";

const MIME = "application/x-fieldbook-table+json";
const cells = (page: Page) => page.locator('#writing table tbody tr :is(th,td):not([data-tool-cell])');
const selected = (page: Page) => page.locator("[data-writing-cell-selected]");
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on("pageerror", error => messages.push(error.message));
});
test.afterEach(({ page }) => { expect(errors.get(page)).toEqual([]); });

async function open(page: Page) {
  await page.goto("/ui/writing");
  await expect(page.locator('#writing table [contenteditable="true"]').first()).toBeVisible();
  await page.locator('#writing table').scrollIntoViewIfNeeded();
}

async function drag(page: Page, from: number, to: number, release = true) {
  const start = await cells(page).nth(from).boundingBox();
  const end = await cells(page).nth(to).boundingBox();
  await page.mouse.move(start!.x + 14, start!.y + start!.height / 2);
  await page.mouse.down();
  await page.mouse.move(end!.x + 40, end!.y + end!.height / 2, { steps: 16 });
  if (release) await page.mouse.up();
}

async function clipboard(page: Page, type: "copy" | "cut" | "paste", input: Record<string, string> = {}) {
  return page.evaluate(({ type, input }) => {
    const data = new DataTransfer();
    Object.entries(input).forEach(([kind, value]) => data.setData(kind, value));
    const event = new ClipboardEvent(type, { bubbles: true, cancelable: true, clipboardData: data });
    document.activeElement!.dispatchEvent(event);
    return { prevented: event.defaultPrevented, data: Object.fromEntries(Array.from(data.types, kind => [kind, data.getData(kind)])) };
  }, { type, input });
}

test("first-character placement and word selection stay clear of row and column controls", async ({ page }) => {
  await open(page);
  const cell = cells(page).nth(3);
  const character = await cell.evaluate(element => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode()!;
    const range = document.createRange(); range.setStart(node, 0); range.setEnd(node, 1);
    const box = range.getBoundingClientRect(); return { x: box.x + 2, y: box.y + box.height / 2 };
  });
  await page.mouse.click(character.x, character.y);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(cell.locator('[contenteditable="true"]')).toBeFocused();
  await page.mouse.move(character.x, character.y); await page.mouse.down();
  await page.mouse.move(character.x + 62, character.y, { steps: 12 }); await page.mouse.up();
  const range = await page.evaluate(() => document.getSelection()?.toString() || "");
  expect(range.length).toBeGreaterThan(0);
  expect(range.length).toBeLessThan("Documentation".length);
  await expect(selected(page)).toHaveCount(0);
  expect((await clipboard(page, "copy")).data["text/plain"]).toBe(range);
});

test("cross-cell dragging selects complete rectangles including empty cells in either direction", async ({ page }, info) => {
  await open(page);
  const narrow = info.project.use.viewport!.width < 700;
  await drag(page, 3, narrow ? 9 : 10);
  await expect(selected(page)).toHaveCount(narrow ? 3 : 6);
  expect((await clipboard(page, "copy")).data["text/plain"]).toBe(narrow
    ? "Documentation\n\nCustomer follow-up"
    : "Documentation\tEnablement\n\t\nCustomer follow-up\tAccount team");
  await expect(page.locator("[data-writing-selection-menu]")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await drag(page, narrow ? 9 : 10, 3);
  await expect(selected(page)).toHaveCount(narrow ? 3 : 6);
  await page.screenshot({ path: info.outputPath("table-rectangle.png") });
});

test("returning a drag to its starting cell restores ordinary text selection", async ({ page }, info) => {
  await open(page);
  await drag(page, 3, info.project.use.viewport!.width < 700 ? 9 : 10, false);
  await expect(selected(page)).not.toHaveCount(0);
  const start = await cells(page).nth(3).boundingBox();
  await page.mouse.move(start!.x + 72, start!.y + start!.height / 2, { steps: 16 });
  await page.mouse.up();
  await expect(selected(page)).toHaveCount(0);
  expect(await page.evaluate(() => document.getSelection()?.toString())).toBeTruthy();
});

test("keyboard select-all and extension copy every cell, including a recent edit", async ({ page }, info) => {
  await open(page);
  await cells(page).nth(3).locator('[contenteditable="true"]').fill("Recently edited");
  await drag(page, 3, info.project.use.viewport!.width < 700 ? 9 : 10);
  await page.keyboard.press("ControlOrMeta+a");
  await expect(selected(page)).toHaveCount(12);
  const copied = await clipboard(page, "copy");
  expect(copied.data["text/plain"]).toContain("Recently edited");
  expect(copied.data["text/html"]).toContain("<table ");
  expect(copied.data["text/html"]).not.toContain("contenteditable");
  await page.keyboard.press("Escape");
  await drag(page, 3, 6);
  await page.keyboard.press("Shift+ArrowDown");
  await expect(selected(page)).toHaveCount(3);
});

test("rectangular cut preserves the grid and one undo restores rich content", async ({ page }, info) => {
  await open(page);
  const before = await cells(page).allTextContents();
  await drag(page, 3, info.project.use.viewport!.width < 700 ? 9 : 10);
  const copied = await clipboard(page, "cut");
  expect(copied.data["text/plain"]).toContain("Documentation");
  await expect(cells(page)).toHaveCount(12);
  await expect(cells(page).nth(3)).not.toContainText("Documentation");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => cells(page).allTextContents()).toEqual(before);
  await expect(cells(page).nth(3).locator("strong")).toHaveText("Documentation");
});

test("pasting a rectangle fills cells, grows the table, and undoes in one step", async ({ page }) => {
  await open(page);
  const before = await cells(page).allTextContents();
  await drag(page, 3, 9);
  const copied = await clipboard(page, "copy");
  await page.keyboard.press("Escape");
  await cells(page).nth(9).locator('[contenteditable="true"]').click();
  await clipboard(page, "paste", copied.data);
  await expect(cells(page)).toHaveCount(18);
  await expect(cells(page).nth(9).locator("strong")).toHaveText("Documentation");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect.poll(() => cells(page).allTextContents()).toEqual(before);
});

test("copying the whole table into prose creates a rich table with one undo", async ({ page }) => {
  await open(page);
  await drag(page, 3, 6);
  await page.keyboard.press("ControlOrMeta+a");
  await expect(selected(page)).toHaveCount(12);
  const copied = await clipboard(page, "copy");
  const paragraph = page.locator('.writing-content > p').filter({ hasText: "Triple-click this paragraph" });
  await paragraph.click();
  await paragraph.evaluate((element, data) => {
    // Paste immediately after a native caret move, before Lexical's asynchronous selection update.
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    const node = walker.nextNode()!;
    document.getSelection()!.setBaseAndExtent(node, 0, node, 0);
    const clipboard = new DataTransfer();
    Object.entries(data).forEach(([kind, value]) => clipboard.setData(kind, value));
    element.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: clipboard }));
  }, copied.data);
  await expect(page.locator('#writing table')).toHaveCount(2);
  await expect(page.locator('#writing table').last().locator("strong")).toHaveText("Documentation");
  await expect(paragraph).toHaveText("Triple-click this paragraph to select it and open the formatting menu.");
  expect((await downloadMarkdown(page)).body).toContain("| **Documentation**");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(page.locator('#writing table')).toHaveCount(1);
});

test("HTML and tab-separated pastes fill a grid and reject unsafe links", async ({ page }) => {
  await open(page);
  await cells(page).nth(3).locator('[contenteditable="true"]').click();
  await clipboard(page, "paste", { "text/html": '<table><tr><td><strong>Bold</strong></td><td><a href="javascript:alert(1)">Safe text</a></td></tr></table>' });
  await expect(cells(page).nth(3).locator("strong")).toHaveText("Bold");
  await expect(cells(page).nth(4)).toContainText("Safe text");
  await expect(cells(page).nth(4).locator("a")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await cells(page).nth(6).locator('[contenteditable="true"]').click();
  await clipboard(page, "paste", { "text/plain": "One\tTwo\nThree\tFour" });
  await expect(cells(page).nth(6)).toContainText("One");
  await expect(cells(page).nth(10)).toContainText("Four");
});

test("HTML table paste ignores executable markup and resources outside the table", async ({ page }) => {
  await open(page);
  const requests: string[] = [];
  page.on("request", request => { if (request.url().startsWith("https://clipboard.invalid/")) requests.push(request.url()); });
  await page.route("https://clipboard.invalid/**", route => route.abort());
  await cells(page).nth(3).locator('[contenteditable="true"]').click();
  await clipboard(page, "paste", { "text/html": '<img src="https://clipboard.invalid/outside"><iframe src="https://clipboard.invalid/frame"></iframe><table><tr><td onclick="window.tablePasteExecuted=true"><script>window.tablePasteExecuted=true</script><strong>Safe paste</strong><a href="java&#10;script:void(0)"> plain text</a></td><td>Second cell</td></tr></table>' });
  await expect(cells(page).nth(3).locator("strong")).toHaveText("Safe paste");
  await expect(cells(page).nth(3)).toHaveText("Safe paste plain text");
  await expect(cells(page).nth(4)).toHaveText("Second cell");
  await expect(cells(page).nth(3).locator("script, iframe, img, a, [onclick]")).toHaveCount(0);
  expect(await page.evaluate(() => (window as Window & { tablePasteExecuted?: boolean }).tablePasteExecuted)).toBeUndefined();
  expect(requests).toEqual([]);
});

test("a rectangular drag scrolls to hidden columns while the pointer stays at the edge", async ({ page }) => {
  await open(page);
  for (let index = 0; index < 6; index++) {
    await page.getByRole("button", { name: "Column 1 actions and drag handle", exact: true }).click();
    await page.getByRole("menuitem", { name: "Insert column after", exact: true }).click();
  }
  const host = page.locator("#writing .writing-table-block");
  await host.evaluate(element => { element.scrollLeft = 0; });
  const cell = await cells(page).nth(9).boundingBox();
  const bounds = await host.boundingBox();
  await page.mouse.move(cell!.x + 14, cell!.y + cell!.height / 2); await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width - 2, cell!.y + cell!.height / 2, { steps: 16 });
  await expect.poll(() => host.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
  await expect(selected(page)).toHaveCount(9);
  await page.mouse.up();
  expect((await clipboard(page, "copy")).data["text/plain"].split("\t")).toHaveLength(9);
});

test("switching to read-only clears the table selection and its edit handlers", async ({ page }, info) => {
  await open(page);
  await drag(page, 3, info.project.use.viewport!.width < 700 ? 9 : 10);
  await expect(selected(page)).not.toHaveCount(0);
  await page.getByRole("checkbox").first().check();
  await expect(selected(page)).toHaveCount(0);
  await expect(cells(page).nth(3).locator('[contenteditable="false"]')).toHaveCount(1);
  await expect(cells(page).nth(3)).toContainText("Documentation");
});

test("Copy table copies all cells and recent edits through the shared copy handler", async ({ page }) => {
  await open(page);
  const edited = cells(page).nth(4).locator('[contenteditable="true"]');
  await edited.click();
  await expect(edited).toBeFocused();
  await edited.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.keyboard.press("ControlOrMeta+a");
  await expect.poll(() => page.evaluate(() => document.getSelection()?.toString())).toBe("Enablement");
  await edited.pressSequentially("Recent edit");
  await expect(cells(page).nth(4)).toHaveText("Recent edit");
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { write: async () => { throw new DOMException("Use event copying", "NotAllowedError"); } } });
    document.execCommand = command => {
      if (command !== "copy") return false;
      const data = new DataTransfer();
      const event = new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData: data });
      document.activeElement!.dispatchEvent(event);
      (window as Window & { tableClipboard?: Record<string, string> }).tableClipboard = Object.fromEntries(Array.from(data.types, type => [type, data.getData(type)]));
      return event.defaultPrevented;
    };
  });
  await page.getByRole("button", { name: "Table actions", exact: true }).click();
  await expect(page.getByRole("menuitem")).toHaveText([
    "Copy table", "Write before table", "Write after table", "Remove table",
  ]);
  await page.getByRole("menuitem", { name: "Copy table", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-slot="toast"]')).toHaveText("Table copied.");
  await expect(selected(page)).toHaveCount(12);
  const copied = await page.evaluate(() => (window as Window & { tableClipboard?: Record<string, string> }).tableClipboard!);
  expect(copied["text/plain"]).toBe("Area\tOwner\tNext step\nDocumentation\tRecent edit\tConfirm the source\n\t\t\nCustomer follow-up\tAccount team\tKeep the next decision and its context visible");
  const table = JSON.parse(copied[MIME]).table;
  expect(table.children).toHaveLength(4);
  expect(table.children.every((row: { children: unknown[] }) => row.children.length === 3)).toBe(true);
  expect(table.children[1].children[0].children[0].type).toBe("strong");
  await expect(page.getByRole("menu")).toHaveCount(0);
});

test("Copy table's standard clipboard API retains formatting and saved column layout", async ({ page }) => {
  await open(page);
  const resize = page.getByRole("separator", { name: "Resize column 1", exact: true });
  await resize.focus(); await page.keyboard.press("ArrowRight");
  await page.evaluate(() => {
    document.execCommand = () => false;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      write: async (items: ClipboardItem[]) => {
        const html = await items[0].getType("text/html");
        const plain = await items[0].getType("text/plain");
        (window as Window & { tableClipboard?: Record<string, string> }).tableClipboard = { "text/html": await html.text(), "text/plain": await plain.text() };
      },
    } });
  });
  await page.getByRole("button", { name: "Table actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Copy table", exact: true }).click();
  await expect(page.locator('[data-slot="toast"]')).toHaveText("Table copied.");
  const copied = await page.evaluate(() => (window as Window & { tableClipboard?: Record<string, string> }).tableClipboard!);
  expect(copied["text/html"]).toContain("data-fieldbook-table=");
  const paragraph = page.locator('.writing-content > p').filter({ hasText: "Triple-click this paragraph" });
  await paragraph.click(); await page.keyboard.press("End");
  await clipboard(page, "paste", copied);
  await expect(page.locator('#writing table')).toHaveCount(2);
  await expect(page.locator('#writing table').last().locator("strong")).toHaveText("Documentation");
  const markdown = (await downloadMarkdown(page)).body;
  const widths = JSON.parse(markdown.match(/fieldbook-table-widths:v1 (\[[^\n]*\])/)![1]);
  expect(widths[1]).toEqual(widths[0]);
});

test("blocked Copy table leaves a full selection and an honest manual-copy fallback", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    // Returning true without dispatching a copy event must not produce a success toast.
    document.execCommand = () => true;
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { write: async () => { throw new DOMException("Clipboard blocked", "NotAllowedError"); } } });
  });
  await page.getByRole("button", { name: "Table actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Copy table", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Copy failed. Select the table and copy it manually." })).toBeVisible();
  await expect(page.locator('[data-slot="toast"]')).toHaveCount(0);
  await expect(selected(page)).toHaveCount(12);
  expect((await clipboard(page, "copy")).data["text/plain"]).toContain("Area\tOwner\tNext step");
});
