import { test, expect, type Locator, type Page } from "@playwright/test";
import type { LexicalEditor, RangeSelection } from "lexical";
import { freshWorkspace, type Workspace } from "../../lib/store";
import { defaultSettings } from "../../lib/settings";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import { authoringUser, setupAuthoringProvider, syncAuthoringProvider } from "./provider-fixture";
import { waitForDraftSaved } from "./editor-helpers";

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

const fixtureId = "00000000-0000-4000-8000-000000000901";
const imageUrl = "https://example.test/table-image.png";
const tableBody = "Before\n\n| Topic | Detail |\n| --- | --- |\n| Keep this cell | Useful detail |\n\nAfter";

async function open(page: Page, installed: boolean, body: string) {
  let state = withPublishedSnapshots(freshWorkspace());
  state.settings = { ...defaultSettings, ...state.settings };
  const item = {
    ...state.content.find((entry) => entry.kind === "doc")!,
    id: fixtureId,
    title: "Mobile block fixture",
    body,
    revision: 1,
    publishedRevision: 1,
  };
  state.content = [item];
  state.publishedContent = [structuredClone(item)];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
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
  await page.route(imageUrl, (route) => route.fulfill({
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64"),
  }));
  await page.goto(installed ? `/admin/content/${fixtureId}/edit` : `/#admin/content/${fixtureId}/edit`);
  const writer = page.getByRole("textbox", { name: "Doc content", exact: true });
  await expect(writer).toBeVisible();
  const read = async (): Promise<Workspace> => installed ? state : page.evaluate(() => JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!));
  return { writer, read, errors };
}

async function nativeSelectionMatches(surface: Locator) {
  return surface.evaluate((element) => {
    const editor = (element as HTMLElement & { __lexicalEditor: LexicalEditor }).__lexicalEditor;
    const native = window.getSelection();
    const selection = editor.getEditorState()._selection as RangeSelection | null;
    if (!native?.rangeCount || !selection?.anchor || !selection.focus) return false;
    return !!editor.getElementByKey(selection.anchor.key)?.contains(native.anchorNode)
      && !!editor.getElementByKey(selection.focus.key)?.contains(native.focusNode)
      && selection.anchor.offset === native.anchorOffset
      && selection.focus.offset === native.focusOffset
      && selection.isCollapsed() === native.isCollapsed;
  });
}

async function commands(page: Page, name: string) {
  await page.getByRole("button", { name: /^Commands:/ }).tap();
  await page.getByRole("menuitem", { name, exact: true }).tap();
}

test("touch heading and table commands restore a writable caret without browser errors or extra lines", async ({ page }, info) => {
  const { writer, read, errors } = await open(page, info.project.name.startsWith("production"), "Before\n\nAfter");
  await writer.locator(":scope > p").first().tap();
  await page.keyboard.press("End");
  await commands(page, "Heading 2");
  await page.keyboard.insertText(" heading");
  await expect(writer.locator("h2")).toHaveText("Before heading");
  await expect.poll(() => nativeSelectionMatches(writer)).toBe(true);
  await writer.locator(":scope > p").last().tap({ position: { x: 1, y: 10 } });
  await expect.poll(() => nativeSelectionMatches(writer)).toBe(true);
  await commands(page, "Table");
  await expect(writer.locator("table")).toHaveCount(1);
  await page.keyboard.insertText("After table ");
  await expect(writer.locator(":scope > p")).toHaveText(["After table After"]);
  await expect.poll(() => nativeSelectionMatches(writer)).toBe(true);
  await waitForDraftSaved(page);
  const body = (await read()).content[0].body;
  expect(body).toMatch(/^## Before heading\n\n\|/);
  expect(body).toMatch(/\n\nAfter table After$/);
  expect(body).not.toMatch(/\n{3,}/);
  await page.reload();
  await expect(writer.locator("h2")).toHaveText("Before heading");
  await expect(writer.locator("table")).toHaveCount(1);
  await expect(writer.locator(":scope > p")).toHaveText(["After table After"]);
  expect(errors).toEqual([]);
});

test("table cells reject block insertion and image-file paste while keeping literal slash text", async ({ page }, info) => {
  const { writer, read, errors } = await open(page, info.project.name.startsWith("production"), tableBody);
  const cell = writer.locator("table [contenteditable=true]").nth(2);
  await cell.tap();
  await page.keyboard.press("End");
  await expect(page.getByRole("button", { name: /^Commands:/ })).toBeDisabled();
  await cell.locator("p").evaluate((element) => {
    const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode()!;
    const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 4);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await expect.poll(() => nativeSelectionMatches(cell)).toBe(true);
  await expect(page.getByRole("button", { name: /^Commands:/ })).toBeDisabled();
  await expect(page.getByRole("dialog", { name: "Format selected text", exact: true })).toHaveCount(0);
  await page.keyboard.press("ArrowRight");
  await cell.locator("p").evaluate((element) => {
    const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode()!;
    const range = document.createRange(); range.setStart(text, text.textContent!.length); range.collapse(true);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await expect.poll(() => nativeSelectionMatches(cell)).toBe(true);
  await page.keyboard.type("/image");
  await expect(page.getByRole("menu", { name: /^Insert content/ })).toHaveCount(0);
  await expect(cell).toHaveText("Keep this cell/image");
  await expect.poll(() => nativeSelectionMatches(cell)).toBe(true);
  await writer.locator(":scope > p").last().tap();
  await waitForDraftSaved(page);
  const beforePaste = (await read()).content[0].body;
  expect(beforePaste).toContain("Keep this cell/image");
  await cell.tap();
  await cell.evaluate((element) => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array([137, 80, 78, 71])], "cell.png", { type: "image/png" }));
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  const error = page.getByRole("alert").filter({ hasText: /table/i });
  await expect(error).toBeVisible();
  await expect(cell.locator("img")).toHaveCount(0);
  await expect(cell).toHaveText("Keep this cell/image");
  expect((await read()).content[0].body).toBe(beforePaste);
  await error.getByRole("button", { name: "Dismiss message", exact: true }).tap();
  await cell.tap();
  await cell.locator("p").evaluate((element) => {
    const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode()!;
    const range = document.createRange(); range.setStart(text, text.textContent!.length); range.collapse(true);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await expect.poll(() => nativeSelectionMatches(cell)).toBe(true);
  await page.keyboard.insertText(" continued");
  await expect(cell).toHaveText("Keep this cell/image continued");
  await writer.locator(":scope > p").last().tap();
  await waitForDraftSaved(page);
  expect((await read()).content[0].body).toContain("Keep this cell/image continued");
  await page.reload();
  await expect(cell).toHaveText("Keep this cell/image continued");
  await expect(cell.locator("img")).toHaveCount(0);
  await expect(writer.locator(":scope > p")).toHaveText(["Before", "After"]);
  expect(errors).toEqual([]);
});

test.describe("mouse table formatting", () => {
  test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 1000 } });

test("table selections keep desktop inline formatting and omit unsupported block styles", async ({ page }, info) => {
  const { writer, read, errors } = await open(page, info.project.name.startsWith("production"), tableBody);
  const cell = writer.locator("table [contenteditable=true]").nth(2);
  await cell.click();
  await cell.locator("p").evaluate((element) => {
    const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode()!;
    const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 4);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await expect.poll(() => nativeSelectionMatches(cell)).toBe(true);
  const formatting = page.getByRole("dialog", { name: "Format selected text", exact: true });
  await expect(formatting).toBeVisible();
  await expect(formatting.getByRole("button", { name: "Normal Text", exact: true })).toHaveCount(0);
  for (const name of ["Bold", "Italic", "Inline code", "Link"])
    await expect(formatting.getByRole("button", { name, exact: true })).toBeEnabled();
  await formatting.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(cell.locator("strong")).toHaveText("Keep");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.insertText(" preserved");
  await expect(cell).toHaveText("Keep preserved this cell");
  await expect.poll(() => nativeSelectionMatches(cell)).toBe(true);
  await writer.locator(":scope > p").last().click();
  await waitForDraftSaved(page);
  expect((await read()).content[0].body).toContain("**Keep preserved** this cell");
  await page.reload();
  await expect(cell.locator("strong")).toHaveText("Keep preserved");
  await expect(cell).toHaveText("Keep preserved this cell");
  expect(errors).toEqual([]);
});

});

test("touch image insertion outside a table leaves its next line writable and saved", async ({ page }, info) => {
  const { writer, read, errors } = await open(page, info.project.name.startsWith("production"), tableBody);
  await writer.locator(":scope > p").last().tap();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await commands(page, "Image");
  const chooser = page.getByRole("dialog", { name: "Insert image", exact: true });
  await chooser.getByRole("button", { name: "Link", exact: true }).tap();
  await chooser.getByRole("textbox", { name: "Image URL", exact: true }).fill(imageUrl);
  await chooser.getByRole("button", { name: "Insert image", exact: true }).tap();
  await expect(writer.locator(`img[src="${imageUrl}"]`)).toHaveCount(1);
  await page.keyboard.insertText("After the image");
  await expect(writer.locator(":scope > p").last()).toHaveText("After the image");
  await expect.poll(() => nativeSelectionMatches(writer)).toBe(true);
  await waitForDraftSaved(page);
  const body = (await read()).content[0].body;
  expect(body).toContain(`](${imageUrl})`);
  expect(body).toMatch(/\n\nAfter the image$/);
  expect(body).not.toMatch(/\n{3,}/);
  await page.reload();
  await expect(writer.locator(`img[src="${imageUrl}"]`)).toHaveCount(1);
  await expect(writer.locator(":scope > p").last()).toHaveText("After the image");
  await expect(writer.locator("table")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("touch table controls save the active cell edit before moving its column", async ({ page }, info) => {
  const { writer, read, errors } = await open(page, info.project.name.startsWith("production"), tableBody);
  const cells = writer.locator("table [contenteditable=true]");
  await cells.nth(2).tap();
  await expect(cells.nth(2)).toBeFocused();
  await expect.poll(() => nativeSelectionMatches(cells.nth(2))).toBe(true);
  await cells.nth(2).locator("p").evaluate((element) => {
    const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode()!;
    const range = document.createRange(); range.selectNodeContents(text);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await expect.poll(() => nativeSelectionMatches(cells.nth(2))).toBe(true);
  await page.keyboard.type("Edited cell");
  await expect(cells.nth(2)).toHaveText("Edited cell");
  await page.getByRole("button", { name: "Column 1 actions and drag handle", exact: true }).tap();
  await page.getByRole("menuitem", { name: "Move column right", exact: true }).tap();
  await expect(cells.nth(3)).toHaveText("Edited cell");
  await writer.locator(":scope > p").last().tap();
  await waitForDraftSaved(page);
  expect((await read()).content[0].body).toContain("Edited cell");
  await page.reload();
  await expect(cells.nth(3)).toHaveText("Edited cell");
  await expect(cells.nth(0)).toHaveText("Detail");
  expect(errors).toEqual([]);
});

test("existing inline table images survive neighboring cell edits and reload", async ({ page }, info) => {
  const body = `Before\n\n| Picture | Context |\n| --- | --- |\n| ![Existing picture](${imageUrl}) | Keep this text |\n\nAfter`;
  const { writer, read, errors } = await open(page, info.project.name.startsWith("production"), body);
  const image = writer.locator(`table img[src="${imageUrl}"]`);
  await expect(image).toHaveCount(1);
  const cell = writer.locator("table [contenteditable=true]").last();
  await cell.tap();
  await expect(cell).toBeFocused();
  await expect.poll(() => nativeSelectionMatches(cell)).toBe(true);
  await expect(page.getByRole("button", { name: /^Commands:/ })).toBeDisabled();
  await cell.fill("Keep this text preserved");
  await writer.locator(":scope > p").last().tap();
  await waitForDraftSaved(page);
  const saved = (await read()).content[0].body;
  expect(saved).toContain(`![Existing picture](${imageUrl})`);
  expect(saved).toContain("Keep this text preserved");
  await page.reload();
  await expect(image).toHaveCount(1);
  await expect(cell).toHaveText("Keep this text preserved");
  expect(errors).toEqual([]);
});

test("touch table insertion splits a callout without dropping its text or the new table", async ({ page }, info) => {
  const { writer, read, errors } = await open(page, info.project.name.startsWith("production"), "> BeforeAfter");
  await writer.locator("blockquote p").tap();
  await writer.locator("blockquote p").evaluate((element) => {
    const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode()!;
    const range = document.createRange(); range.setStart(text, 6); range.collapse(true);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
  });
  await expect.poll(() => nativeSelectionMatches(writer)).toBe(true);
  await commands(page, "Table");
  await expect(writer.locator("table")).toHaveCount(1);
  await expect(writer.locator(":scope > blockquote")).toHaveText(["Before", "After"]);
  await page.keyboard.insertText("Typing ");
  await expect(writer.locator(":scope > blockquote")).toHaveText(["Before", "Typing After"]);
  await expect.poll(() => nativeSelectionMatches(writer)).toBe(true);
  await waitForDraftSaved(page);
  const body = (await read()).content[0].body;
  expect(body).toMatch(/^> Before\n\n\|/);
  expect(body).toContain("> Typing After");
  expect(body).not.toMatch(/\n{3,}/);
  await page.reload();
  await expect(writer.locator("table")).toHaveCount(1);
  await expect(writer.locator(":scope > blockquote")).toHaveText(["Before", "Typing After"]);
  expect(errors).toEqual([]);
});

for (const style of ["Bulleted list", "Numbered list"]) {
  test(`a code block consumes an empty ${style.toLowerCase()} command line and stays writable`, async ({ page }, info) => {
    const { writer, read, errors } = await open(page, info.project.name.startsWith("production"), "Before");
    await writer.locator(":scope > p").first().tap();
    await expect.poll(() => nativeSelectionMatches(writer)).toBe(true);
    await page.keyboard.press("Enter");
    await commands(page, style);
    await commands(page, "Code block");
    const code = writer.locator(".writing-code-block .cm-content");
    await expect(code).toBeFocused();
    await expect(writer.locator(":scope > ul, :scope > ol")).toHaveCount(0);
    await page.keyboard.type("example");
    await code.press("ArrowDown");
    await page.keyboard.type("After");
    await expect(writer.locator(":scope > p")).toHaveText(["Before", "After"]);
    await expect.poll(() => nativeSelectionMatches(writer)).toBe(true);
    await waitForDraftSaved(page);
    expect((await read()).content[0].body).toBe("Before\n\n```\nexample\n```\n\nAfter");
    await page.reload();
    await expect(code).toHaveText("example");
    await expect(writer.locator(":scope > ul, :scope > ol")).toHaveCount(0);
    await expect(writer.locator(":scope > p")).toHaveText(["Before", "After"]);
    expect(errors).toEqual([]);
  });
}

test("code insertion removes only the targeted empty list item and preserves an authored blank sibling", async ({ page }, info) => {
  const { writer, read, errors } = await open(page, info.project.name.startsWith("production"), "Before\n\n-\n-\n- Later");
  const items = writer.locator("ul > li");
  await expect(items).toHaveText(["", "", "Later"]);
  await items.nth(1).tap();
  await expect.poll(() => nativeSelectionMatches(writer)).toBe(true);
  await commands(page, "Code block");
  const code = writer.locator(".writing-code-block .cm-content");
  await expect(code).toBeFocused();
  await page.keyboard.type("example");
  await code.press("ArrowDown");
  await page.keyboard.type("After ");
  await expect(writer.locator("ul > li")).toHaveText(["", "After Later"]);
  await waitForDraftSaved(page);
  const body = (await read()).content[0].body;
  expect(body).toContain("```\nexample\n```");
  expect(body).toContain("* After Later");
  await page.reload();
  await expect(code).toHaveText("example");
  await expect(writer.locator("ul > li")).toHaveText(["", "After Later"]);
  expect(errors).toEqual([]);
});

for (const [style, markdown, selector] of [
  ["paragraph", "After", ":scope > p"],
  ["heading", "## After", "h2"],
  ["list", "- After", "ul > li"],
  ["callout", "> After", "blockquote p"],
] as const) {
  test(`code insertion at the start of a ${style} preserves its text without an empty prefix`, async ({ page }, info) => {
    const { writer, read, errors } = await open(page, info.project.name.startsWith("production"), `Before\n\n${markdown}`);
    await writer.locator(selector).last().tap();
    await writer.locator(selector).last().evaluate((element) => {
      const text = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode()!;
      const range = document.createRange(); range.setStart(text, 0); range.collapse(true);
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
    await expect.poll(() => nativeSelectionMatches(writer)).toBe(true);
    await commands(page, "Code block");
    const code = writer.locator(".writing-code-block .cm-content");
    await expect(code).toBeFocused();
    expect(await writer.evaluate(element => Array.from(element.children).slice(0, 2).map(child => child.tagName))).toEqual(["P", "DIV"]);
    await page.keyboard.type("example");
    await code.press("ArrowDown");
    await page.keyboard.type("Exit ");
    await expect(writer.locator(selector).last()).toHaveText("Exit After");
    await expect.poll(() => nativeSelectionMatches(writer)).toBe(true);
    await waitForDraftSaved(page);
    const body = (await read()).content[0].body;
    expect(body).toMatch(/^Before\n\n```\nexample\n```\n\n/);
    expect(body).not.toMatch(/\n{3,}/);
    await page.reload();
    await expect(code).toHaveText("example");
    await expect(writer.locator(selector).last()).toHaveText("Exit After");
    expect(await writer.evaluate(element => Array.from(element.children).slice(0, 2).map(child => child.tagName))).toEqual(["P", "DIV"]);
    expect(errors).toEqual([]);
  });
}
