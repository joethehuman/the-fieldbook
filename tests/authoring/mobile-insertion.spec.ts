import { test, expect, type Page, type Locator } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import { authoringUser, setupAuthoringProvider, syncAuthoringProvider } from "./provider-fixture";
import { waitForDraftSaved } from "./editor-helpers";

test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
const id = "00000000-0000-4000-8000-000000000902";

async function open(page: Page, installed: boolean, body = "Before\n\nAfter") {
  let state = withPublishedSnapshots(freshWorkspace());
  const item = { ...state.content.find(item => item.kind === "doc")!, id,
    title: "Mobile insertion fixture", body, revision: 1, publishedRevision: 1 };
  state.content = [item]; state.publishedContent = [structuredClone(item)];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  if (installed) {
    await setupAuthoringProvider(page, state);
    await page.route("**/api/admin/snapshot?**", route => route.fulfill({ json: { data: state, user: authoringUser } }));
    await page.route("**/api/content*", async route => {
      if (route.request().method() === "GET") return route.fulfill({ json: state.content[0] });
      const request = route.request().postDataJSON();
      expect(request.expected).toBe(state.content[0].revision);
      state.content = [{ ...request.content, revision: state.content[0].revision! + 1, publishedRevision: 1 }];
      await syncAuthoringProvider(page, state);
      return route.fulfill({ json: state.content[0] });
    });
  } else await page.addInitScript(data => {
    if (!localStorage.getItem("fieldbook.workspace.v1")) localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
  }, state);
  await page.goto(installed ? `/admin/content/${id}/edit` : `/#admin/content/${id}/edit`);
  const writer = page.getByRole("textbox", { name: "Doc content", exact: true });
  await expect(writer).toBeVisible();
  return { writer, errors, read: async () => installed ? state : page.evaluate(() => JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!)) };
}

async function insert(page: Page, writer: Locator, command: string, slash = false) {
  await writer.locator(":scope > p").last().tap();
  await page.keyboard.press("End"); await page.keyboard.press("Enter");
  if (slash) await page.keyboard.type(`/${command.toLowerCase()}`);
  else await page.getByRole("button", { name: /^Commands:/ }).tap();
  await page.getByRole("menuitem", { name: command, exact: true }).tap();
}

for (const slash of [false, true]) {
  test(`${slash ? "slash" : "toolbar"} divider inserts, preserves prose and survives save/reload`, async ({ page }, info) => {
    const { writer, errors, read } = await open(page, info.project.name.startsWith("production"));
    await insert(page, writer, "Divider", slash);
    await expect(writer.locator("hr")).toHaveCount(1);
    await page.keyboard.insertText("Continue after divider");
    await expect(writer).toContainText("Continue after divider");
    await waitForDraftSaved(page);
    const body = (await read()).content[0].body;
    expect(body).toContain("Before"); expect(body).toContain("After");
    expect(body).toMatch(/\*\*\*|---/);
    await page.reload();
    await expect(writer.locator("hr")).toHaveCount(1);
    await expect(writer).toContainText("Continue after divider");
    expect(errors).toEqual([]);
  });
}

for (const command of ["Table", "Code block"]) {
  test(`${command} stays focused and visible after delayed keyboard contraction`, async ({ page }, info) => {
    const body = Array.from({ length: 24 }, (_, i) => `Paragraph ${i + 1}. Keep this writing.`).join("\n\n");
    const { writer, errors } = await open(page, info.project.name.startsWith("production"), body);
    await insert(page, writer, command);
    const target = command === "Table" ? writer.locator('table [contenteditable="true"]').first()
      : writer.locator(".cm-content");
    await expect(target).toBeFocused();
    // Reproduce late geometry reporting independently of layout viewport size.
    // This is a regression model, not an emulation of the physical iOS keyboard.
    await page.evaluate(() => {
      // Desktop engines don't create iOS's native keyboard-panning range.
      // Supply that range separately; it is test-only and never saved content.
      const runway = document.createElement("div"); runway.inert = true;
      runway.style.height = `${innerHeight - 330}px`;
      document.querySelector(".editor-frame")!.after(runway);
      Object.defineProperty(visualViewport!, "height", { configurable: true, get: () => 330 });
      visualViewport!.dispatchEvent(new Event("resize"));
    });
    await expect.poll(async () => {
      const box = await target.locator(".cm-line, p").first().boundingBox();
      const toolbar = await page.locator(".editor-mobile-toolbar").boundingBox();
      return box && toolbar ? Math.min(box.y - toolbar.y - toolbar.height, 330 - box.y - box.height) : -Infinity;
    }).toBeGreaterThanOrEqual(0);
    await expect(target).toBeFocused();
    await page.keyboard.insertText("Destination text");
    await expect(target).toHaveText("Destination text");
    await expect(writer.locator(":scope > p").first()).toHaveText("Paragraph 1. Keep this writing.");
    expect(errors).toEqual([]);
  });

  test(`${command} at the end of a short document survives an actual viewport resize`, async ({ page }, info) => {
    const { writer, errors } = await open(page, info.project.name.startsWith("production"));
    await insert(page, writer, command);
    const target = command === "Table" ? writer.locator('table [contenteditable="true"]').first() : writer.locator(".cm-content");
    await expect(target).toBeFocused();
    await page.setViewportSize({ width: 390, height: 330 });
    await expect.poll(async () => {
      const box = await target.locator(".cm-line, p").first().boundingBox();
      const toolbar = await page.locator(".editor-mobile-toolbar").boundingBox();
      return box && toolbar ? Math.min(box.y - toolbar.y - toolbar.height, 330 - box.y - box.height) : -Infinity;
    }).toBeGreaterThanOrEqual(0);
    await expect(target).toBeFocused();
    expect(errors).toEqual([]);
  });

  test(`${command} insertion reveal yields to manual scrolling`, async ({ page }, info) => {
    const { writer } = await open(page, info.project.name.startsWith("production"), Array.from({ length: 24 }, () => "Keep this paragraph.").join("\n\n"));
    await insert(page, writer, command);
    const target = command === "Table" ? writer.locator('table [contenteditable="true"]').first() : writer.locator(".cm-content");
    await expect(target).toBeFocused();
    const scroll = await page.evaluate(async () => {
      document.dispatchEvent(new Event("touchmove", { bubbles: true }));
      window.scrollTo(0, 0);
      Object.defineProperty(visualViewport!, "height", { configurable: true, get: () => 330 });
      visualViewport!.dispatchEvent(new Event("resize"));
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      return scrollY;
    });
    expect(scroll).toBe(0);
    await expect(target).toBeFocused();
  });
}

for (const command of ["Heading 2", "Bulleted list", "Divider"]) {
  test(`${command} reveals its writable entry after keyboard contraction`, async ({ page }, info) => {
    const { writer, errors } = await open(page, info.project.name.startsWith("production"), Array.from({ length: 24 }, () => "Keep this writing.").join("\n\n"));
    await insert(page, writer, command);
    const entry = writer.locator(command === "Heading 2" ? "h2" : command === "Bulleted list" ? "li" : ":scope > p").last();
    await expect(writer).toBeFocused();
    await page.evaluate(() => {
      const runway = document.createElement("div"); runway.inert = true;
      runway.style.height = `${innerHeight - 330}px`;
      document.querySelector(".editor-frame")!.after(runway);
      Object.defineProperty(visualViewport!, "height", { configurable: true, get: () => 330 });
      visualViewport!.dispatchEvent(new Event("resize"));
    });
    await expect.poll(async () => {
      const box = await entry.boundingBox();
      const toolbar = await page.locator(".editor-mobile-toolbar").boundingBox();
      return box && toolbar ? Math.min(box.y - toolbar.y - toolbar.height, 330 - box.y - box.height) : -Infinity;
    }).toBeGreaterThanOrEqual(0);
    await page.keyboard.insertText("Continue writing");
    await expect(entry).toHaveText("Continue writing");
    expect(errors).toEqual([]);
  });
}

for (const paragraphs of [1, 24]) {
  test(`${paragraphs} paragraph canvas: toolbar has no stale offset during scroll reversal`, async ({ page }, info) => {
    await open(page, info.project.name.startsWith("production"), Array.from({ length: paragraphs }, () => "Keep this writing.").join("\n\n"));
    const result = await page.evaluate(async () => {
      const frame = document.querySelector<HTMLElement>(".editor-frame")!;
      const tail = document.createElement("div"); tail.style.height = "1200px"; tail.inert = true; frame.after(tail);
      const end = frame.getBoundingClientRect().bottom + scrollY;
      scrollTo(0, end - 40);
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      const toolbar = document.querySelector(".editor-mobile-toolbar")!;
      const before = toolbar.getBoundingClientRect().top;
      scrollTo(0, end - 140);
      // Inspect synchronously, before JS can rewrite any positioning offset.
      const reversed = toolbar.getBoundingClientRect().top;
      tail.remove();
      return { before, reversed };
    });
    expect(result.before).toBeCloseTo(0, 0);
    expect(result.reversed).toBeCloseTo(0, 0);
  });
}
