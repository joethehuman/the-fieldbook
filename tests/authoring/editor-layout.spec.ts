import { test, expect, type Page, type Locator } from "@playwright/test";
import type { Content } from "../../lib/types";
import { freshWorkspace } from "../../lib/store";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import {
  authoringUser,
  setupAuthoringProvider,
  syncAuthoringProvider,
} from "./provider-fixture";
import { downloadMarkdown, waitForDraftSaved, returnToContent } from "./editor-helpers";

async function open(
  page: Page,
  installed: boolean,
  kind: "doc" | "brief" | "course",
  lessonCount = 2,
  prepare?: (item: Content) => void,
  prepareWorkspace?: (state: ReturnType<typeof freshWorkspace>) => void,
  source = false,
  preserveSavedDemo = false,
) {
  if ((page.viewportSize()?.width || 0) >= 1280) await page.setViewportSize({ width: 1600, height: page.viewportSize()!.height });
  let state = withPublishedSnapshots(freshWorkspace());
  const item = state.content.find((item) => item.kind === kind)!;
  const body = Array.from(
    { length: 40 },
    (_, i) =>
      `Paragraph ${i + 1}. Keep the writer and every saved word intact.`,
  ).join("\n\n");
  item.id =
    kind === "doc"
      ? "00000000-0000-4000-8000-000000000101"
      : kind === "brief"
        ? "00000000-0000-4000-8000-000000000102"
        : "00000000-0000-4000-8000-000000000103";
  item.title = "A clear place to write";
  item.body = body;
  item.revision = 1;
  item.publishedRevision = 1;
  if (kind === "course")
    item.lessons = [
      { id: "one", title: "Start with context", body },
      { id: "two", title: "Put it into practice", body: "The second lesson." },
      ...Array.from({ length: lessonCount - 2 }, (_, i) => ({
        id: `extra-${i}`, title: `More context ${i + 3}`, body: "A short lesson.",
      })),
    ];
  prepare?.(item);
  state.content = [item];
  state.publishedContent = [structuredClone(item)];
  prepareWorkspace?.(state);
  if (installed) {
    await setupAuthoringProvider(page, state);
    await page.route("**/api/admin/snapshot?**", (route) =>
      route.fulfill({ json: { data: state, user: authoringUser } }),
    );
    await page.route("**/api/content*", async (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({ json: state.content[0] });
      const request = route.request().postDataJSON();
      expect(request.expected).toBe(state.content[0].revision);
      const saved = {
        ...request.content,
        revision: (state.content[0].revision || 0) + 1,
        publishedRevision: request.publish
          ? (state.content[0].revision || 0) + 1
          : state.content[0].publishedRevision,
      };
      state.content = [saved];
      if (request.publish) state.publishedContent = [structuredClone(saved)];
      await syncAuthoringProvider(page, state);
      return route.fulfill({ json: saved });
    });
  } else
    await page.addInitScript(({ data, preserve }) => {
      if (!preserve || !localStorage.getItem("fieldbook.workspace.v1"))
        localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    }, { data: state, preserve: preserveSavedDemo });
  await page.goto(installed ? `/admin/content/${item.id}/edit` : "/#admin");
  if (!installed)
    await page.getByRole("link", { name: item.title, exact: true }).click();
  if (source) {
    await expect(page.locator(".writing-source")).toBeVisible();
    await expect(page.locator(".writing-source")).toHaveValue(/Paragraph 1\./);
  } else {
    const writing = page.locator('.writing-content[contenteditable="true"]');
    if ((kind === "course" ? item.lessons[0].body : item.body).trim()) await expect(writing).toContainText("Paragraph 1.");
    else await expect(writing).toHaveText("");
    await expect(page.locator('.writing-content[contenteditable="true"]')).toBeInViewport();
  }
  await expect(page.locator(".app")).toHaveClass(/sidebar-collapsed/);
  await page.locator(".main-shell").evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {})));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  return {
    state,
    read: async () =>
      installed
        ? state
        : await page.evaluate(() =>
            JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
          ),
  };
}

async function expectCourseReturnChain(page: Page, read: () => Promise<{ content: Content[] }>, populated: boolean, touch: boolean) {
  const courseTitle = page.locator("#editor-title");
  const lessonTitle = page.getByRole("textbox", { name: "Lesson title", exact: true });
  const writer = page.getByRole("textbox", { name: "Lesson content", exact: true });
  if (!populated) { await courseTitle.fill(""); await lessonTitle.fill(""); }
  const titleBefore = await courseTitle.inputValue();
  const lessonBefore = await lessonTitle.inputValue();
  const bodyBefore = await writer.textContent();
  if (touch) await courseTitle.tap(); else await courseTitle.click();
  await page.keyboard.press("Enter");
  await expect(lessonTitle).toBeFocused();
  await expect(courseTitle).toHaveValue(titleBefore);
  await expect(lessonTitle).toHaveValue(lessonBefore);
  await expect(writer).toHaveText(bodyBefore!);
  await page.keyboard.insertText("Lesson continuation.");
  await expect(lessonTitle).toHaveValue(/Lesson continuation\./);
  if (lessonBefore) expect(await lessonTitle.inputValue()).toContain(lessonBefore);
  await page.keyboard.press("Enter");
  await page.keyboard.insertText("Immediate writing.");
  await expect(writer).toBeFocused();
  await expect(writer).toContainText("Immediate writing.");
  await expect.poll(() => writer.evaluate(node => {
    const selection = window.getSelection();
    return Boolean(selection?.isCollapsed && node.contains(selection.focusNode));
  })).toBe(true);
  await expect(courseTitle).toHaveValue(titleBefore);
  await waitForDraftSaved(page);
  const course = (await read()).content[0];
  expect(course.title).toBe(titleBefore);
  expect(course.lessons[0].title).toContain("Lesson continuation.");
  expect(course.lessons[0].body).toContain("Immediate writing.");
  if (populated) expect(course.lessons[0].body).toContain("Paragraph 1.");
}

for (const kind of ["doc", "brief", "course"] as const)
  test(`${kind}: reading width stays independent of menu clearance and resize defaults`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await open(page, info.project.name.startsWith("production"), kind);
    const resize = async (width: number) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator(".main-shell").evaluate(async (el) => {
        await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {})));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
    };
    const writer = page.locator('.writing-content[contenteditable="true"]');
    const firstLine = writer.locator("p").first();
    const original = await writer.elementHandle();
    const preferred = page.getByRole("button", { name: kind === "course" ? "Outline" : "Details", exact: true });
    await expect(preferred).toHaveAttribute("aria-expanded", "true");
    const font = await writer.evaluate((el) => getComputedStyle(el).fontSize);
    await resize(1440);
    await expect(preferred).toHaveAttribute("aria-expanded", "false");
    await resize(1600);
    await expect(preferred).toHaveAttribute("aria-expanded", "false");
    for (const width of [1600, 1440, 1280, 1279, 1024, 768, 375]) {
      await resize(width);
      const available = (await page.locator(".editor-frame").boundingBox())!.width;
      const compact = await page.locator(".editor-frame").getAttribute("data-cards") === "true";
      await expect.poll(async () => (await firstLine.boundingBox())!.width).toBeCloseTo(Math.min(704, available - (compact ? 88 : 148)), 0);
      const column = (await firstLine.boundingBox())!;
      const frame = (await page.locator(".editor-frame").boundingBox())!;
      expect(Math.abs((column.x - frame.x) - (frame.x + frame.width - column.x - column.width))).toBeLessThanOrEqual(2);
      const title = kind === "course" ? page.getByRole("textbox", { name: "Lesson title", exact: true }) : page.locator("#editor-title");
      expect((await title.boundingBox())!.x).toBeCloseTo(column.x, 0);
      expect((await title.boundingBox())!.width).toBeCloseTo(column.width, 0);
      expect(await writer.evaluate((el) => getComputedStyle(el).fontSize)).toBe(font);
      await page.screenshot({ path: info.outputPath(`${kind}-column-${width}.png`) });
      if (await preferred.getAttribute("aria-expanded") !== "true") await preferred.click();
      expect((await firstLine.boundingBox())!.width).toBeCloseTo(column.width, 0);
      expect((await firstLine.boundingBox())!.x).toBeCloseTo(column.x, 0);
      await page.screenshot({ path: info.outputPath(`${kind}-reading-${width}.png`) });
      await preferred.click();
      expect(await original!.evaluate((node) => node.isConnected)).toBe(true);
    }
    await resize(1440);
    await preferred.click();
    await resize(1300);
    await expect(preferred).toHaveAttribute("aria-expanded", "true");
    await resize(1600);
    await resize(1440);
    await expect(preferred).toHaveAttribute("aria-expanded", "false");
  });

test("balanced phone gutters keep table actions above the row controls", async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, info.project.name.startsWith("production"), "doc", 2, (item) => {
    item.body = "| First column | Second column |\n| --- | --- |\n| Value | Another value |\n\n" + item.body;
  });
  const host = page.locator(".writing-table-block").first();
  await host.hover();
  const actions = page.getByRole("button", { name: "Table actions", exact: true });
  await expect(actions).toBeVisible();
  await expect(actions).toBeInViewport({ ratio: 1 });
  const button = (await actions.boundingBox())!;
  const table = (await host.locator("table").boundingBox())!;
  expect(button.x + button.width).toBeLessThanOrEqual(table.x - 4);
  expect(button.y + button.height).toBeLessThanOrEqual(table.y);
  const row = (await page.getByRole("button", { name: "Row 1 actions and drag handle", exact: true }).boundingBox())!;
  expect(button.y + button.height).toBeLessThanOrEqual(row.y);
  await actions.click();
  await expect(page.getByRole("menuitem", { name: "Remove table", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.screenshot({ path: info.outputPath("phone-table-actions.png") });
});

for (const kind of ["doc", "brief", "course"] as const) {
  test(`${kind}: rectangular table paste saves complete cells and survives refresh`, async ({ page }, info) => {
    const tableBody = "| First | Second |\n| --- | --- |\n| **One** | A |\n| Two | B |\n\n";
    const fixture = await open(page, info.project.name.startsWith("production"), kind, 2, item => {
      if (kind === "course") item.lessons[0].body = tableBody + item.lessons[0].body;
      else item.body = tableBody + item.body;
    }, undefined, false, true);
    const table = page.locator(".writing-table-block table");
    const cells = table.locator('tbody tr :is(th,td):not([data-tool-cell])');
    await table.scrollIntoViewIfNeeded();
    const start = (await cells.nth(2).boundingBox())!, end = (await cells.nth(4).boundingBox())!;
    await page.mouse.move(start.x + 12, start.y + start.height / 2); await page.mouse.down();
    await page.mouse.move(end.x + 30, end.y + end.height / 2, { steps: 12 }); await page.mouse.up();
    await expect(page.locator("[data-writing-cell-selected]")).toHaveCount(2);
    const copied = await page.evaluate(() => {
      const data = new DataTransfer();
      document.activeElement!.dispatchEvent(new ClipboardEvent("copy", { bubbles: true, cancelable: true, clipboardData: data }));
      return Object.fromEntries(Array.from(data.types, type => [type, data.getData(type)]));
    });
    expect(copied["text/plain"]).toBe("One\nTwo");
    await page.keyboard.press("Escape");
    await cells.first().locator('[contenteditable="true"]').click();
    await page.evaluate(data => {
      const clipboard = new DataTransfer();
      Object.entries(data).forEach(([type, value]) => clipboard.setData(type, value));
      document.activeElement!.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData: clipboard }));
    }, copied);
    await expect(cells.first().locator("strong")).toHaveText("One");
    await expect(cells.nth(2)).toHaveText("Two");
    await waitForDraftSaved(page);
    const saved = (await fixture.read()).content[0];
    expect(kind === "course" ? saved.lessons[0].body : saved.body).toMatch(/\| \*\*One\*\*/);
    await page.reload();
    await expect(cells.first().locator("strong")).toHaveText("One");
    await expect(cells.nth(2)).toHaveText("Two");
  });
}

test("writing buttons follow phone width and portrait touch-tablet orientation", async ({ page }, info) => {
  await page.setViewportSize({ width: 1024, height: 1366 });
  await open(page, info.project.name.startsWith("production"), "course");
  const controls = page.getByRole("button", { name: "Commands: insert blocks or format selected text", exact: true });
  if (info.project.use.hasTouch) await expect(controls).toBeVisible(); else await expect(controls).toBeHidden();
  await page.setViewportSize({ width: 1180, height: 820 });
  await expect(controls).toBeHidden();
  await page.setViewportSize({ width: 600, height: 900 });
  if (info.project.use.hasTouch) await expect(controls).toBeVisible(); else await expect(controls).toBeHidden();
  await page.setViewportSize({ width: 1024, height: 1366 });
  if (info.project.use.hasTouch) await expect(controls).toBeVisible(); else await expect(controls).toBeHidden();
});

test("resizing search never revives an empty or populated panel", async ({ page }, info) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await open(page, info.project.name.startsWith("production"), "doc");
  const trigger = page.getByRole("button", { name: "Open search", exact: true });
  const panel = page.locator('[data-slot="search-panel"]');
  const input = page.getByRole("textbox", { name: "Search all content", exact: true });
  for (const query of ["", "context"]) {
    await trigger.click();
    await expect(input).toBeFocused();
    await input.fill(query);
    await page.setViewportSize({ width: 1600, height: 700 });
    await expect(panel).toHaveCount(0);
    await expect(input).toHaveValue(query);
    await page.setViewportSize({ width: 600, height: 900 });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toHaveCount(0);
  }
  await trigger.click();
  await expect(input).toHaveValue("context");
});

test("narrow mouse editors retain desktop controls while the app navigation compacts", async ({ page }, info) => {
  test.skip(info.project.use.hasTouch === true, "This case exercises mouse controls; touch contexts have native editing coverage.");
  await open(page, info.project.name.startsWith("production"), "course");
  const writer = page.locator('.writing-content[contenteditable="true"]');
  const original = await writer.elementHandle();
  const back = page.getByRole("button", { name: "Back to content", exact: true });
  const outline = page.getByRole("button", { name: "Outline", exact: true });
  const details = page.getByRole("button", { name: "Details", exact: true });
  for (const width of [320, 375, 767, 768, 1024, 1279, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator(".main-shell").evaluate(async (el) => {
      await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {})));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const shellCompact = width < 768;
    const navigation = page.getByRole("button", { name: "Open navigation", exact: true });
    if (shellCompact) await expect(navigation).toBeVisible();
    else await expect(navigation).toBeHidden();
    await expect(page.locator(".editor-frame")).not.toHaveAttribute("data-cards", "true");
    await expect(page.locator(".editor-frame")).not.toHaveAttribute("data-mobile", "true");
    await expect(page.getByRole("button", { name: /^Commands:/ })).toBeHidden();
    await expect(page.getByRole("button", { name: "Undo", exact: true })).toBeHidden();
    await expect(page.getByRole("button", { name: "Redo", exact: true })).toBeHidden();
    await expect(back).toBeInViewport({ ratio: 1 });
    for (const [toggle, label] of [[outline, "Course outline"], [details, "Content details"]] as const) {
      await expect(toggle).toBeInViewport({ ratio: 1 });
      if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
      const panel = page.getByRole("complementary", { name: label, exact: true });
      await expect(panel).toBeInViewport({ ratio: 1 });
      const box = (await panel.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      await toggle.click();
    }
    expect(await original!.evaluate((node) => node.isConnected)).toBe(true);
    if (width <= 375) await page.screenshot({ path: info.outputPath(`desktop-canvas-${width}.png`) });
  }
});

test("returning from compact navigation preserves sidebar geometry on every frame", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await open(page, info.project.name.startsWith("production"), "course");
  const compactSizes = info.project.use.hasTouch
    ? [{ width: 600, height: 900 }, { width: 1024, height: 1366 }]
    : [{ width: 600, height: 900 }];
  for (const collapsed of [true, false]) {
    await page.setViewportSize({ width: 900, height: 700 });
    if (!collapsed) {
      await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
      expect(await page.locator("#main-sidebar").evaluate((el) => el.getAnimations().some((animation) => animation.playState === "running"))).toBe(true);
    }
    await page.locator(".main-shell").evaluate(async (el) => {
      await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {})));
    });
    const expectedWidth = await page.locator("#main-sidebar").evaluate((el) => el.getBoundingClientRect().width);
    for (const size of compactSizes) {
      for (const drawerOpen of [false, true]) {
        await page.setViewportSize(size);
        const navigation = page.getByRole("button", { name: "Open navigation", exact: true });
        await expect(navigation).toBeVisible();
        if (drawerOpen) await navigation.click();
        await page.evaluate(() => {
          (window as any).sidebarReturnFrames = new Promise<{ width: number; inset: number; collapsed: boolean }[]>((resolve) => {
            const frames: { width: number; inset: number; collapsed: boolean }[] = [];
            const started = performance.now();
            function sample() {
              // The viewport dimensions can arrive before its media queries update.
              // Inspect every desktop frame, including the first, rather than the
              // still-valid compact layout during that browser handoff.
              if (innerWidth === 900 && !matchMedia("(width < 768px), (width < 1280px) and (pointer: coarse) and (orientation: portrait)").matches) frames.push({
                width: document.getElementById("main-sidebar")!.getBoundingClientRect().width,
                inset: document.querySelector(".main-shell")!.getBoundingClientRect().left,
                collapsed: document.querySelector(".app")!.classList.contains("sidebar-collapsed"),
              });
              if (performance.now() - started >= 350) resolve(frames);
              else requestAnimationFrame(sample);
            }
            requestAnimationFrame(sample);
          });
        });
        await page.setViewportSize({ width: 900, height: 700 });
        const frames: { width: number; inset: number; collapsed: boolean }[] = await page.evaluate(() => (window as any).sidebarReturnFrames);
        await info.attach(`sidebar-return-${size.width}-${collapsed}-${drawerOpen}.json`, { body: JSON.stringify(frames), contentType: "application/json" });
        expect(frames.length).toBeGreaterThan(2);
        expect(frames.every((frame) => frame.collapsed === collapsed)).toBe(true);
        expect(Math.max(...frames.map((frame) => Math.abs(frame.width - expectedWidth)))).toBeLessThanOrEqual(1);
        expect(Math.max(...frames.map((frame) => Math.abs(frame.inset - expectedWidth)))).toBeLessThanOrEqual(1);
        await expect(page.locator(".app")).not.toHaveAttribute("data-sidebar-layout-changing", "true");
        await expect(page.locator("#main-sidebar")).toHaveCSS("transition-duration", "0s");
      }
    }
  }
});

test.describe("touch mobile outline actions", () => {
  test.use({ hasTouch: true, isMobile: true });
  test("mobile writing actions recover after closing the outline", async ({ page }, info) => {
    await page.setViewportSize({ width: 600, height: 900 });
    await open(page, info.project.name.startsWith("production"), "course");
    const writer = page.locator('.writing-content[contenteditable="true"]');
    await page.getByRole("textbox", { name: "Lesson title", exact: true }).press("Enter");
    await page.keyboard.insertText("Keep this new paragraph.");
    await expect(writer).toContainText("Keep this new paragraph.");
    await page.getByRole("button", { name: "Outline", exact: true }).click();
    const undo = page.getByRole("button", { name: "Undo", exact: true });
    const redo = page.getByRole("button", { name: "Redo", exact: true });
    await expect(undo).toBeDisabled();
    await expect(redo).toBeDisabled();
    await expect(page.getByRole("button", { name: /^Commands:/ })).toBeDisabled();
    await expect(writer).toContainText("Keep this new paragraph.");
    await page.getByRole("button", { name: "Outline", exact: true }).tap();
    await expect(page.getByRole("button", { name: "Outline", exact: true })).toBeFocused();
    await writer.locator("p").filter({ hasText: "Keep this new paragraph." }).tap();
    await expect(undo).toBeEnabled();
    await undo.tap();
    await expect(writer).not.toContainText("Keep this new paragraph.");
    await expect(redo).toBeEnabled();
    await redo.tap();
    await expect(writer).toContainText("Keep this new paragraph.");
    await expect(page.getByRole("button", { name: "Outline", exact: true })).toHaveAttribute("aria-expanded", "false");
    const commands = page.getByRole("button", { name: /^Commands:/ });
    await commands.tap();
    await expect(page.getByRole("menuitem", { name: "Heading 2", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Outline", exact: true })).toHaveAttribute("aria-expanded", "false");
  });
});

test("small-screen search clears floating editor controls and restores focus on dismissal", async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, info.project.name.startsWith("production"), "doc");
  const trigger = page.getByRole("button", { name: "Open search", exact: true });
  await trigger.click();
  const input = page.getByRole("textbox", { name: "Search all content", exact: true });
  await expect(input).toBeFocused();
  expect((await input.boundingBox())!.width).toBeGreaterThan(220);
  await input.fill("context");
  await expect(page.locator('[data-slot="search-panel"]')).toBeVisible();
  await input.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(page.locator('[data-slot="search-panel"]')).toHaveCount(0);
  await trigger.click();
  const close = page.getByRole("button", { name: "Close search", exact: true });
  await expect.poll(() => close.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
  })).toBe(true);
  await page.screenshot({ path: info.outputPath("editor-search-controls.png") });
  await close.click();
  await expect(trigger).toBeFocused();
  await expect(page.locator('[data-slot="search-panel"]')).toHaveCount(0);
});

for (const kind of ["doc", "brief", "course"] as const)
  test(`${kind}: mouse canvas navigation keeps desktop Back and compact in-page pinning`, async ({ page }, info) => {
    await open(page, info.project.name.startsWith("production"), kind);
    const back = page.getByRole("button", { name: "Back to content", exact: true });
    const title = page.locator("#editor-title");
    const pinnedTitle = kind === "course" ? page.getByRole("textbox", { name: "Lesson title", exact: true }) : title;
    const nav = page.locator(".editor-canvas-navigation");
    await expect(page.locator(".editor-frame")).not.toHaveAttribute("data-mobile", "true");
    await expect(nav).toBeVisible();
    const start = (await nav.boundingBox())!;
    await expect(back).toBeVisible();
    expect(Math.abs((await back.locator("svg").boundingBox())!.x - (await title.boundingBox())!.x)).toBeLessThanOrEqual(2);
    expect((await title.boundingBox())!.y).toBeGreaterThanOrEqual(start.y + start.height);
    await page.locator(".editor").evaluate(el => {
      const owner = el.getAttribute("data-scroll-layout") === "workspace" ? el.querySelector(".writing-viewport")! : el.closest(".main-content")!;
      owner.scrollTop = 450;
    });
    const pinned = (await pinnedTitle.boundingBox())!;
    expect(pinned.y).toBeGreaterThanOrEqual((await nav.boundingBox())!.y + start.height);
    if (kind === "course") await expect(title).not.toBeInViewport();
    await page.locator(".editor").evaluate(el => {
      const owner = el.getAttribute("data-scroll-layout") === "workspace" ? el.querySelector(".writing-viewport")! : el.closest(".main-content")!;
      owner.scrollTop += 200;
    });
    expect((await pinnedTitle.boundingBox())!.y).toBeCloseTo(pinned.y, 0);
    await page.screenshot({ path: info.outputPath(`${kind}-canvas-navigation.png`) });
    await returnToContent(page);
    await expect(page.locator(".editor")).toHaveCount(0);
  });

for (const kind of ["doc", "brief"] as const)
  test(`${kind}: app-header actions, stable canvas and pinned title`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    const installed = info.project.name.startsWith("production");
    const { read } = await open(page, installed, kind);
    const header = page.locator(".topbar");
    await expect(
      header.getByRole("button", { name: "Publish", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".editor .editor-heading")).toHaveCount(0);
    const title = page.locator("#editor-title");
    const details = page.getByRole("button", { name: "Details", exact: true });
    const compact =
      (await page.locator(".editor-frame").getAttribute("data-cards")) ===
      "true";
    await expect(details).toHaveAttribute(
      "aria-expanded",
      compact ? "false" : "true",
    );
    const writer = page.locator('.writing-content[contenteditable="true"]');
    const sameWriter = await writer.elementHandle();
    const before = await writer.boundingBox();
    await details.click();
    if (compact) {
      const card = page.getByRole("complementary", { name: "Content details", exact: true });
      await expect(card).toBeVisible();
      await details.click();
      await expect(details).toBeFocused();
    } else {
      await details.click();
      const panel = await page.locator(".editor-frame-details").boundingBox();
      const text = (await title.boundingBox())!;
      expect(panel!.x).toBeGreaterThanOrEqual(text.x + text.width);
    }
    expect(await sameWriter!.evaluate((node) => node.isConnected)).toBe(true);
    expect((await writer.boundingBox())!.x).toBeCloseTo(before!.x, 0);
    const initialTitle = await title.boundingBox();
    await page.locator(".editor").evaluate((el) => {
      const owner =
        el.getAttribute("data-scroll-layout") === "workspace"
          ? el.querySelector(".writing-viewport")!
          : el.closest(".main-content")!;
      owner.scrollTop = 450;
    });
    await expect
      .poll(async () => (await title.boundingBox())!.y)
      .toBeCloseTo(initialTitle!.y, 0);
    await title.fill("The revised title");
    await waitForDraftSaved(page);
    expect((await read()).content[0].title).toBe("The revised title");
    await header.getByRole("button", { name: "Publish", exact: true }).click();
    await expect
      .poll(async () => (await read()).publishedContent[0].title)
      .toBe("The revised title");
    await page.screenshot({ path: info.outputPath(`${kind}-layout.png`) });
  });

test("course: floating panels, pinned lesson and working lesson navigation", async ({
  page,
}, info) => {
  await open(page, info.project.name.startsWith("production"), "course");
  const compact =
    (await page.locator(".editor-frame").getAttribute("data-cards")) === "true";
  const outline = page.getByRole("button", { name: "Outline", exact: true });
  const details = page.getByRole("button", { name: "Details", exact: true });
  await expect(outline).toHaveAttribute(
    "aria-expanded",
    compact ? "false" : "true",
  );
  await expect(details).toHaveAttribute("aria-expanded", "false");
  const lesson = page.getByRole("textbox", {
    name: "Lesson title",
    exact: true,
  });
  const initialLesson = await lesson.boundingBox();
  await page.locator(".editor").evaluate((el) => {
    const owner =
      el.getAttribute("data-scroll-layout") === "workspace"
        ? el.querySelector(".writing-viewport")!
        : el.closest(".main-content")!;
    owner.scrollTop = 450;
  });
  await expect
    .poll(async () => (await lesson.boundingBox())!.y)
    .toBeLessThanOrEqual(initialLesson!.y);
  const pinned = (await lesson.boundingBox())!.y;
  await page.locator(".editor").evaluate((el) => {
    const owner =
      el.getAttribute("data-scroll-layout") === "workspace"
        ? el.querySelector(".writing-viewport")!
        : el.closest(".main-content")!;
    owner.scrollTop += 200;
  });
  await expect
    .poll(async () => (await lesson.boundingBox())!.y)
    .toBeCloseTo(pinned, 0);
  if (compact) await outline.click();
  else {
    const canvas = await lesson.boundingBox();
    await details.click();
    await expect(outline).toHaveAttribute("aria-expanded", "true");
    expect(
      (await page.locator(".editor-frame-outline").boundingBox())!.x +
        (await page.locator(".editor-frame-outline").boundingBox())!.width,
    ).toBeLessThanOrEqual(canvas!.x);
    expect(
      (await page.locator(".editor-frame-details").boundingBox())!.x,
    ).toBeGreaterThanOrEqual(canvas!.x + canvas!.width);
  }
  await page.getByRole("button", { name: /2.*Put it into practice/ }).click();
  await expect(lesson).toHaveValue("Put it into practice");
  await expect(
    page.locator('.writing-content[contenteditable="true"]'),
  ).toContainText("The second lesson.");
  expect((await downloadMarkdown(page)).body).toContain("The second lesson.");
  await page.screenshot({ path: info.outputPath("course-layout.png") });
});

test("lesson actions return keyboard focus without a sticky pointer ring", async ({ page }, info) => {
  await open(page, info.project.name.startsWith("production"), "course");
  const trigger = page.getByRole("button", { name: "Lesson actions", exact: true });
  const menu = page.getByRole("menu", { name: "Lesson actions", exact: true });
  for (let entry = 0; entry < 2; entry++) {
    if (entry) await page.reload();
    await expect(page.locator('.writing-content[contenteditable="true"]')).toBeVisible();
    if (await page.locator(".editor-frame").getAttribute("data-cards") === "true")
      await page.getByRole("button", { name: "Outline", exact: true }).click();
    for (let toggle = 0; toggle < 2; toggle++) {
      await trigger.click();
      await expect(menu).toBeVisible();
      await expect(menu).toBeFocused();
      const box = (await page.locator('button[aria-label="Lesson actions"]').boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down({ clickCount: toggle + 2 });
      await page.mouse.up({ clickCount: toggle + 2 });
      await expect(menu).toBeHidden();
      await expect.poll(() => trigger.evaluate((el) => el.matches(":focus-visible"))).toBe(false);
      expect(await page.evaluate(() => window.getSelection()?.toString() || "")).toBe("");
    }
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await trigger.evaluate((el) => el.matches(":focus-visible"))).toBe(true);
  }
});

test("lesson rows keep title space and open menus beyond the desktop outline", async ({ page }, info) => {
  await open(page, info.project.name.startsWith("production"), "course");
  const longTitle = "This is a long lesson title let's see how it wraps";
  const lessonTitle = page.getByRole("textbox", { name: "Lesson title", exact: true });
  await lessonTitle.fill(longTitle);
  await waitForDraftSaved(page);
  const compact = await page.locator(".editor-frame").getAttribute("data-cards") === "true";
  async function openOutline() {
    if (compact && !(await page.getByRole("complementary", { name: "Course outline", exact: true }).isVisible()))
      await page.getByRole("button", { name: "Outline", exact: true }).click();
  }
  await openOutline();
  const nav = page.getByRole("navigation", { name: "Edit course step", exact: true });
  const first = nav.getByRole("button", { name: `1 ${longTitle}`, exact: true });
  const title = first.locator(".line-clamp-2");
  const before = (await title.boundingBox())!;
  const selectedColor = await first.evaluate((el) => getComputedStyle(el.parentElement!).backgroundColor);
  await nav.getByRole("button", { name: "2 Put it into practice", exact: true }).click();
  await expect(lessonTitle).toHaveValue("Put it into practice");
  await openOutline();
  const after = (await title.boundingBox())!;
  expect(after.width).toBeCloseTo(before.width, 0);
  expect(after.height).toBeCloseTo(before.height, 0);
  if (await page.evaluate(() => matchMedia("(hover: hover)").matches)) await first.hover();
  else await first.focus();
  expect(await first.evaluate((el) => getComputedStyle(el.parentElement!).backgroundColor)).toBe(selectedColor);
  for (const rowLink of [first, nav.getByRole("button", { name: /^Quiz/ })]) {
    const box = (await rowLink.boundingBox())!;
    expect(box.width).toBeCloseTo(await rowLink.evaluate((el) => el.parentElement!.getBoundingClientRect().width), 0);
  }
  await first.click();
  await expect(lessonTitle).toHaveValue(longTitle);
  await openOutline();
  await page.getByRole("button", { name: "Lesson actions", exact: true }).click();
  const menu = page.getByRole("menu", { name: "Lesson actions", exact: true });
  await expect(menu).toBeVisible();
  if (!compact) {
    const outline = (await page.locator(".editor-frame-outline").boundingBox())!;
    await expect.poll(async () => (await menu.boundingBox())!.x).toBeGreaterThanOrEqual(outline.x + outline.width + 7);
  } else {
    await expect(menu).toBeInViewport();
    const box = (await menu.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    const card = (await page.getByRole("complementary", { name: "Course outline", exact: true, includeHidden: true }).boundingBox())!;
    if (card.x + card.width + box.width + 16 <= page.viewportSize()!.width)
      expect(box.x).toBeGreaterThanOrEqual(card.x + card.width + 7);
  }
  await page.screenshot({ path: info.outputPath("lesson-row-layout.png") });
});

test("lesson menu keeps reorder, duplicate and removal working", async ({ page }, info) => {
  const { read } = await open(page, info.project.name.startsWith("production"), "course");
  const outline = page.getByRole("button", { name: "Outline", exact: true });
  const lessonTitle = page.getByRole("textbox", { name: "Lesson title", exact: true });
  async function openActions() {
    const card = page.getByRole("complementary", { name: "Course outline", exact: true });
    if (!(await card.isVisible()) && await outline.getAttribute("aria-expanded") === "false") await outline.click();
    await page.getByRole("button", { name: "Lesson actions", exact: true }).click();
    return page.getByRole("menu", { name: "Lesson actions", exact: true });
  }
  async function expectActiveLesson(title: string) {
    const card = page.getByRole("complementary", { name: "Course outline", exact: true });
    if (await card.isVisible()) await outline.click();
    await expect(lessonTitle).toHaveValue(title);
  }
  let menu = await openActions();
  await expect(menu.getByRole("menuitem", { name: "Move up", exact: true })).toHaveAttribute("aria-disabled", "true");
  await menu.getByRole("menuitem", { name: "Move down", exact: true }).click();
  await expect.poll(async () => (await read()).content[0].lessons.map((lesson: { id: string }) => lesson.id)).toEqual(["two", "one"]);
  await expectActiveLesson("Start with context");
  menu = await openActions();
  await expect(menu.getByRole("menuitem", { name: "Move down", exact: true })).toHaveAttribute("aria-disabled", "true");
  await menu.getByRole("menuitem", { name: "Move up", exact: true }).click();
  await expect.poll(async () => (await read()).content[0].lessons.map((lesson: { id: string }) => lesson.id)).toEqual(["one", "two"]);
  menu = await openActions();
  await menu.getByRole("menuitem", { name: "Duplicate lesson", exact: true }).click();
  await expectActiveLesson("Start with context copy");
  await expect.poll(async () => (await read()).content[0].lessons.length).toBe(3);
  menu = await openActions();
  await menu.getByRole("menuitem", { name: "Remove lesson", exact: true }).click();
  await expectActiveLesson("Start with context");
  await expect.poll(async () => (await read()).content[0].lessons.length).toBe(2);
  menu = await openActions();
  await menu.getByRole("menuitem", { name: "Remove lesson", exact: true }).click();
  await expectActiveLesson("Put it into practice");
  await expect.poll(async () => (await read()).content[0].lessons.length).toBe(1);
  menu = await openActions();
  for (const name of ["Move up", "Move down", "Remove lesson"])
    await expect(menu.getByRole("menuitem", { name, exact: true })).toHaveAttribute("aria-disabled", "true");
  await page.screenshot({ path: info.outputPath("lesson-actions-menu.png") });
});

test("floating panels preserve their surfaces and expose every final control", async ({ page }, info) => {
  await open(page, info.project.name.startsWith("production"), "course", 24);
  const compact = await page.locator(".editor-frame").getAttribute("data-cards") === "true";
  await page.getByRole("button", { name: "Details", exact: true }).click();
  const details = compact ? page.getByRole("complementary", { name: "Content details", exact: true }) : page.locator(".editor-frame-details");
  const body = details.locator('[data-slot="scroll-region"]');
  const header = await details.getByRole("heading", { name: "Details", exact: true }).boundingBox();
  await body.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  const lastControl = details.getByRole("button", { name: "Revert to published version", exact: true });
  await expect(lastControl).toBeInViewport();
  const finalBox = await lastControl.boundingBox();
  const bodyBox = await body.boundingBox();
  expect(finalBox!.y + finalBox!.height).toBeLessThanOrEqual(bodyBox!.y + bodyBox!.height);
  expect((await details.getByRole("heading", { name: "Details", exact: true }).boundingBox())!.y).toBeCloseTo(header!.y, 0);
  await expect(body).toHaveAttribute("data-scroll-fade-after", "false");
  if (!compact) {
    const outline = page.locator(".editor-frame-outline");
    const outlineBody = outline.locator('[data-slot="scroll-region"]');
    const surface = (el: Element) => { const style = getComputedStyle(el); return { shadow: style.boxShadow, border: style.border, radius: style.borderRadius, mask: style.maskImage }; };
    expect(await details.evaluate(surface)).toEqual(await outline.evaluate(surface));
    expect((await details.evaluate(surface)).mask).toBe("none");
    await outlineBody.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await expect(outline.getByRole("button", { name: "Add lesson", exact: true })).toBeInViewport();
    const bounds = await details.boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height - 8);
    const workspace = page.locator(".main-content");
    expect(await workspace.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(2);
  }
  await page.screenshot({ path: info.outputPath("panel-bottom.png") });
});

test("desktop menus stay at the workspace edges and artwork has room", async ({ page }, info) => {
  test.skip((page.viewportSize()?.width || 0) < 1280, "This check exercises wide workspace geometry; phone panels have separate coverage.");
  await open(page, info.project.name.startsWith("production"), "course");
  await page.getByRole("button", { name: "Details", exact: true }).click();
  const writer = page.locator('.writing-content[contenteditable="true"] p').first();
  const canvasBefore = await writer.boundingBox();
  const panels = page.locator(".editor-frame-outline, .editor-frame-details");
  for (const panel of await panels.all()) expect((await panel.boundingBox())!.width).toBeCloseTo(320, 0);
  const preview = page.locator(".editor-frame-details .card-artwork-preview");
  expect((await preview.boundingBox())!.width).toBeGreaterThanOrEqual(220);
  await page.getByRole("button", { name: "Details", exact: true }).click();
  expect((await writer.boundingBox())!.x).toBeCloseTo(canvasBefore!.x, 0);
  await page.setViewportSize({ width: 2200, height: 1000 });
  await page.getByRole("button", { name: "Details", exact: true }).click();
  const workspace = (await page.locator(".main-content").boundingBox())!;
  const outline = (await page.locator(".editor-frame-outline").boundingBox())!;
  const details = (await page.locator(".editor-frame-details").boundingBox())!;
  expect(outline.x - workspace.x).toBeLessThanOrEqual(32);
  expect(workspace.x + workspace.width - details.x - details.width).toBeLessThanOrEqual(32);
  expect(outline.width).toBeCloseTo(320, 0);
  expect(details.width).toBeCloseTo(320, 0);
  const leftButton = (await page.getByRole("button", { name: "Outline", exact: true }).boundingBox())!;
  const rightButton = (await page.getByRole("button", { name: "Details", exact: true }).boundingBox())!;
  expect(leftButton.x - outline.x).toBeLessThanOrEqual(16);
  expect(details.x + details.width - rightButton.x - rightButton.width).toBeLessThanOrEqual(16);
  const canvas = (await page.locator(".editor-frame-canvas").boundingBox())!;
  expect(canvas.x + canvas.width / 2).toBeCloseTo(workspace.x + workspace.width / 2, 0);
  await page.screenshot({ path: info.outputPath("workspace-edge-menus.png") });
});

test("editor entry collapses navigation but authors can reopen it", async ({ page }, info) => {
  test.skip((page.viewportSize()?.width || 0) < 1280, "This check exercises wide workspace geometry; phone panels have separate coverage.");
  await open(page, info.project.name.startsWith("production"), "doc");
  const app = page.locator(".app");
  await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
  await expect(app).not.toHaveClass(/sidebar-collapsed/);
  await page.locator("#editor-title").focus();
  await expect(app).not.toHaveClass(/sidebar-collapsed/);
  await returnToContent(page);
  await page.getByRole("link", { name: "A clear place to write", exact: true }).click();
  await expect(app).toHaveClass(/sidebar-collapsed/);
  for (const kind of ["Doc", "Update", "Course"]) {
    await returnToContent(page);
    await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
    await page.getByRole("button", { name: "Content", exact: true }).click();
    await page.getByRole("menuitem", { name: kind, exact: true }).click();
    await expect(page.locator(".editor")).toBeVisible();
    await expect(app).toHaveClass(/sidebar-collapsed/);
  }
});

test("the main writing experience keeps title flow, undo, redo and export", async ({
  page,
}, info) => {
  await open(page, info.project.name.startsWith("production"), "course");
  await expect(
    page.getByRole("button", {
      name: /Focus mode|Exit focus mode|More editor actions/,
    }),
  ).toHaveCount(0);
  const compact =
    (await page.locator(".editor-frame").getAttribute("data-cards")) === "true";
  const commands = page.getByRole("button", {
    name: /^Commands:/,
  });
  const extraControls = compact;
  if (extraControls) await expect(commands).toBeVisible();
  else await expect(commands).toBeHidden();
  const writer = page.locator('.writing-content[contenteditable="true"]');
  const original = await writer.elementHandle();
  await page
    .getByRole("textbox", { name: "Lesson title", exact: true })
    .press("Enter");
  await expect(writer).toBeFocused();
  await page.keyboard.insertText("Keep this edit. ");
  const exported = await downloadMarkdown(page);
  expect(exported.body).toContain("Keep this edit.");
  expect(
    await writer.evaluate((node, original) => node === original, original),
  ).toBe(true);
  await writer.press("ControlOrMeta+z");
  await expect(writer).not.toContainText("Keep this edit.");
  await writer.press("ControlOrMeta+Shift+z");
  await expect(writer).toContainText("Keep this edit.");
  await waitForDraftSaved(page);
});

test("desktop slash insertion and mobile Commands keep the same block tools", async ({
  page,
}, info) => {
  await open(page, info.project.name.startsWith("production"), "doc");
  const compact =
    (await page.locator(".editor-frame").getAttribute("data-cards")) === "true";
  await page.locator("#editor-title").press("Enter");
  if (compact)
    await page
      .getByRole("button", {
        name: /^Commands:/,
      })
      .click();
  else await page.keyboard.type("/");
  await page.getByRole("menuitem", { name: "Heading 2", exact: true }).click();
  await page.keyboard.insertText("A useful heading");
  await expect(
    page.locator('.writing-content[contenteditable="true"] h2'),
  ).toHaveText("A useful heading");
  expect((await downloadMarkdown(page)).body).toContain("## A useful heading");
});

test("publishing requirements close a card and reveal the canvas title", async ({
  page,
}, info) => {
  await open(page, info.project.name.startsWith("production"), "doc");
  const title = page.locator("#editor-title");
  await title.fill("");
  const details = page.getByRole("button", { name: "Details", exact: true });
  await expect(page.locator(".editor-requirements-badge")).toHaveText("1");
  await expect(
    page.getByRole("button", { name: "Publish", exact: true }),
  ).toBeDisabled();
  if ((await details.getAttribute("aria-expanded")) !== "true")
    await details.click();
  await page.getByRole("button", { name: "Add a title", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Content details", exact: true }),
  ).toHaveCount(0);
  await expect(title).toBeFocused();
  await title.fill("Ready to publish");
  await expect(page.locator(".editor-requirements-badge")).toHaveCount(0);
});

for (const kind of ["doc", "brief", "course"] as const)
  test(`${kind}: canvas title highlights are explicit, spacious and unclipped`, async ({ page }, info) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await open(page, info.project.name.startsWith("production"), kind, 2, (item) => {
      if (kind === "course") item.lessons[0].title = "";
    });
    const title = page.locator("#editor-title");
    await title.fill("");
    const lesson = page.getByRole("textbox", { name: "Lesson title", exact: true });
    const fields = kind === "course"
      ? [{ field: title, link: "Add a title" }, { field: lesson, link: "Lesson 1: add a title" }]
      : [{ field: title, link: "Add a title" }];
    for (const width of [375, 600, 1024, 1600]) {
      await page.setViewportSize({ width, height: 900 });
      await page.locator(".main-shell").evaluate(async (el) => {
        await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {})));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      for (const { field, link } of fields) {
        if (info.project.use.hasTouch) await field.tap(); else await field.click();
        await expect(field).toBeFocused();
        await expect(field).not.toHaveAttribute("data-reveal-focus", "true");
        expect(await field.evaluate((el) => getComputedStyle(el).boxShadow)).toBe("none");
        expect(await field.evaluate((el) => getComputedStyle(el).borderRadius)).toBe("0px");
        await field.press("ControlOrMeta+Home");
        expect(await field.evaluate((el: HTMLTextAreaElement) => el.selectionStart)).toBe(0);
        await page.screenshot({ caret: "initial", path: info.outputPath(`${kind}-${link.startsWith("Lesson") ? "lesson" : "title"}-plain-${width}.png`) });
        const before = (await field.boundingBox())!;
        const details = page.getByRole("button", { name: "Details", exact: true });
        if (await details.getAttribute("aria-expanded") !== "true") await details.click();
        await page.getByRole("button", { name: link, exact: true }).click();
        await expect(field).toBeFocused();
        await expect(field).toHaveAttribute("data-reveal-focus", "true");
        const after = (await field.boundingBox())!;
        expect(after.x).toBeCloseTo(before.x, 0);
        expect(after.width).toBeCloseTo(before.width, 0);
        expect(after.height).toBeCloseTo(before.height, 0);
        const geometry = await field.locator("..").evaluate((wrapper) => {
          const box = wrapper.getBoundingClientRect();
          const style = getComputedStyle(wrapper, "::after");
          const left = box.left + parseFloat(style.left);
          const top = box.top + parseFloat(style.top);
          const right = box.right - parseFloat(style.right);
          const bottom = box.bottom - parseFloat(style.bottom);
          const clips: string[] = [];
          if (left < -1 || right > innerWidth + 1 || top < -1 || bottom > innerHeight + 1) clips.push("viewport");
          for (let parent = wrapper.parentElement; parent; parent = parent.parentElement) {
            if (parent === document.body || parent === document.documentElement) continue; // Root overflow clips to the viewport, even with a fixed app and zero flow height.
            const css = getComputedStyle(parent);
            const bounds = parent.getBoundingClientRect();
            if (/^(auto|scroll|clip|hidden)$/.test(css.overflowX) && (left < bounds.left - 1 || right > bounds.right + 1)) clips.push(parent.className);
            if (/^(auto|scroll|clip|hidden)$/.test(css.overflowY) && (top < bounds.top - 1 || bottom > bounds.bottom + 1)) clips.push(parent.className);
          }
          return { radius: parseFloat(style.borderTopLeftRadius), leftSpace: box.left - left - parseFloat(style.borderLeftWidth), rightSpace: right - box.right - parseFloat(style.borderRightWidth), clips };
        });
        expect(geometry.radius).toBeGreaterThan(0);
        expect(geometry.leftSpace).toBeGreaterThanOrEqual(6);
        expect(geometry.rightSpace).toBeGreaterThanOrEqual(6);
        expect(geometry.clips).toEqual([]);
        await page.screenshot({ caret: "initial", path: info.outputPath(`${kind}-${link.startsWith("Lesson") ? "lesson" : "title"}-attention-${width}.png`) });
        if (info.project.use.hasTouch) await field.tap(); else await field.click();
        await expect(field).not.toHaveAttribute("data-reveal-focus", "true");
        expect(await field.locator("..").evaluate((el) => getComputedStyle(el, "::after").content)).toBe("none");
        const back = page.getByRole("button", { name: "Back to content", exact: true });
        if (await back.isVisible()) await back.focus();
        else await page.getByRole("button", { name: "Details", exact: true }).focus();
        for (let step = 0; step < 12; step++) {
          await page.keyboard.press("Tab");
          if (await field.evaluate((el) => document.activeElement === el)) break;
        }
        await expect(field).toBeFocused();
        await expect(field).not.toHaveAttribute("data-reveal-focus", "true");
      }
    }
    await title.fill(kind === "course" ? "Course 1" : "Document title");
    await title.selectText();
    await page.screenshot({ path: info.outputPath(`${kind}-title-selection.png`) });
  });

for (const kind of ["doc", "brief", "course"] as const)
  test(`${kind}: publishing links focus titles and place the canvas caret`, async ({ page }, info) => {
    await open(page, info.project.name.startsWith("production"), kind, 2, (item) => {
      if (kind === "course") item.lessons[1] = { id: "two", title: "", body: "" };
    });
    const showDetails = async () => {
      const toggle = page.getByRole("button", { name: "Details", exact: true });
      if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
    };
    await page.locator("#editor-title").fill("");
    const scrollOwner = page.locator(".editor");
    await scrollOwner.evaluate((el) => {
      const owner = el.getAttribute("data-scroll-layout") === "workspace" ? el.querySelector(".writing-viewport")! : el.closest(".main-content")!;
      owner.scrollTop = 500;
    });
    await showDetails();
    await page.getByRole("button", { name: "Add a title", exact: true }).click();
    const title = page.locator("#editor-title");
    await expect(title).toBeFocused();
    await expect(title).toBeInViewport({ ratio: 1 });
    await expect(title).toHaveAttribute("data-reveal-focus", "true");
    await expect.poll(() => title.locator("..").evaluate((el) => getComputedStyle(el, "::after").borderTopWidth)).toBe("2px");
    await page.screenshot({ path: info.outputPath(`${kind}-requirement-title.png`) });
    await title.fill("The title is complete");
    if (kind === "course") {
      await showDetails();
      await page.getByRole("button", { name: "Lesson 2: add a title", exact: true }).click();
      const lessonTitle = page.getByRole("textbox", { name: "Lesson title", exact: true });
      await expect(lessonTitle).toBeFocused();
      await expect(lessonTitle).toBeInViewport({ ratio: 1 });
      await expect(lessonTitle).toHaveAttribute("data-reveal-focus", "true");
      await expect.poll(() => lessonTitle.locator("..").evaluate((el) => getComputedStyle(el, "::after").borderTopWidth)).toBe("2px");
      await page.screenshot({ path: info.outputPath("lesson-requirement-title.png") });
      await lessonTitle.fill("Second lesson");
    } else {
      const canvas = page.locator('.writing-content[contenteditable="true"]');
      await canvas.press("ControlOrMeta+A");
      await canvas.press("Backspace");
      await expect(canvas).toHaveText("");
    }
    await showDetails();
    await page.getByRole("button", { name: kind === "course" ? "Lesson 2: add content" : "Add content", exact: true }).click();
    const writer = page.locator('.writing-content[contenteditable="true"]');
    await expect(writer).toBeFocused();
    await expect(writer.locator("p").first()).toBeInViewport({ ratio: 1 });
    await expect.poll(() => writer.evaluate((el) => {
      const selection = window.getSelection();
      return !!selection?.isCollapsed && !!selection.anchorNode && el.contains(selection.anchorNode) && selection.anchorOffset === 0;
    })).toBe(true);
    await page.keyboard.press("/");
    const slashMenu = page.getByRole("menu", { name: /Insert content/ });
    await expect(slashMenu).toBeVisible();
    await page.getByRole("menuitem", { name: "Heading 2", exact: true }).click();
    await page.keyboard.insertText("Start writing here");
    await expect(writer.locator("h2").first()).toHaveText("Start writing here");
    await page.screenshot({ path: info.outputPath(`${kind}-requirement-caret.png`) });
    if (kind === "course") {
      const outline = page.getByRole("button", { name: "Outline", exact: true });
      if (await outline.getAttribute("aria-expanded") !== "true") await outline.click();
      await page.getByRole("button", { name: /1.*Start with context/ }).click();
      await expect(writer).toContainText("Paragraph 1.");
      if (await outline.getAttribute("aria-expanded") !== "true") await outline.click();
      await page.getByRole("button", { name: /2.*Second lesson/ }).click();
      await expect(writer).toContainText("Start writing here");
      await expect(writer).not.toBeFocused();
    }
  });

test("quiz publishing links smoothly reveal the question without focusing an input", async ({ page }, info) => {
  await open(page, info.project.name.startsWith("production"), "course", 2, (item) => {
    item.questions = Array.from({ length: 4 }, (_, index) => ({
      id: `question-${index}`, prompt: index === 3 ? "" : `Question ${index + 1}`,
      options: index === 3 ? ["", ""] : ["Yes", "No"],
      optionIds: [`yes-${index}`, `no-${index}`], correctOptionIds: [`yes-${index}`],
    }));
  });
  const details = page.getByRole("button", { name: "Details", exact: true });
  if (await details.getAttribute("aria-expanded") !== "true") await details.click();
  // Observe the actual scroll owner while the newly mounted quiz settles.
  await page.evaluate(() => {
    const samples: number[] = [];
    (window as unknown as { revealScrollSamples: number[] }).revealScrollSamples = samples;
    const frame = document.querySelector(".editor-frame-canvas")!;
    const owner = frame.closest('.editor[data-scroll-layout="workspace"]') ? frame : frame.closest(".main-content")!;
    owner.addEventListener("scroll", () => samples.push(owner.scrollTop));
  });
  await page.getByRole("button", { name: "Quiz question 4: complete the question and answers", exact: true }).click();
  const question = page.locator('[data-question-id="question-3"]');
  await expect(question.getByRole("heading", { name: "Question 4", exact: true })).toBeInViewport({ ratio: 1 });
  await expect(question.getByRole("textbox", { name: "Question", exact: true })).toBeInViewport({ ratio: 1 });
  const quizHeader = page.locator(".course-quiz-canvas > .writing-document-heading");
  expect((await question.getByRole("heading", { name: "Question 4", exact: true }).boundingBox())!.y).toBeGreaterThanOrEqual((await quizHeader.boundingBox())!.y + (await quizHeader.boundingBox())!.height);
  await expect.poll(() => question.evaluate((el) => !el.contains(document.activeElement))).toBe(true);
  const samples = await page.evaluate(() => (window as unknown as { revealScrollSamples: number[] }).revealScrollSamples);
  expect(new Set(samples.map(Math.round)).size).toBeGreaterThan(2);
  await page.screenshot({ path: info.outputPath("quiz-requirement-reveal.png") });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.locator(".editor-frame-canvas").evaluate((el) => {
    const owner = el.closest('.editor[data-scroll-layout="workspace"]') ? el : el.closest(".main-content")!;
    owner.scrollTop = 0;
  });
  if (await details.getAttribute("aria-expanded") !== "true") await details.click();
  await page.getByRole("button", { name: "Quiz question 4: complete the question and answers", exact: true }).click();
  await expect(question.getByRole("heading", { name: "Question 4", exact: true })).toBeInViewport({ ratio: 1 });
  await expect.poll(() => question.evaluate((el) => !el.contains(document.activeElement))).toBe(true);
});

test("selected text keeps contextual formatting without a desktop toolbar", async ({
  page,
}, info) => {
  await open(page, info.project.name.startsWith("production"), "doc");
  const writer = page.locator('.writing-content[contenteditable="true"]');
  await writer.fill("Keep this selection");
  await writer.press("ControlOrMeta+A");
  const native = await page.evaluate(() => matchMedia("(pointer: coarse) and (not (any-pointer: fine))").matches);
  const tools = page.getByRole("dialog", { name: "Format selected text", exact: true });
  if (native) {
    await expect(tools).toHaveCount(0);
    await page.getByRole("button", { name: /^Commands:/ }).click();
    await expect(tools).toHaveCount(0);
  } else {
    await expect(tools).toBeVisible();
    await tools.getByRole("button", { name: "Normal Text", exact: true }).click();
  }
  await page.getByRole("menuitem", { name: "Heading 2", exact: true }).click();
  await expect(writer.locator("h2")).toHaveText("Keep this selection");
  expect((await downloadMarkdown(page)).body).toBe("## Keep this selection");
});

for (const kind of ["doc", "brief", "course"] as const)
  test(`${kind}: Details ordering, readiness and description limits`, async ({ page: basePage }, info) => {
    for (const status of ["published", "draft"] as const) {
      const page = await basePage.context().newPage();
      const fixture = await open(page, info.project.name.startsWith("production"), kind, 2, (item) => {
        item.status = status;
        item.publishedRevision = status === "published" ? 1 : null;
        item.summary = "Clear summary.";
        item.groups = [];
        item.updateTeams = [];
        if (kind === "doc") { item.sectionId = "section-1"; item.category = "Section 1"; item.folder = ""; }
        else item.cardArt = { version: 6, source: "generated", seed: 1, shortTitle: "Clear title" };
      }, (state) => {
        if (kind === "doc") state.settings = { ...state.settings!, docCategoryOrder: [], docSections: [{ id: "section-1", name: "Section 1" }] };
        if (status === "draft") state.publishedContent = [];
      });
      const toggle = page.getByRole("button", { name: "Details", exact: true });
      if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
      const panel = page.getByRole("complementary", { name: "Content details", exact: true });
      await expect(panel.getByRole("heading", { name: "Before publishing", exact: true })).toHaveCount(0);
      const headings = ["Short description", kind === "doc" ? "Section" : "Category"];
      if (kind !== "doc") {
        headings.push("Assign");
        if (kind === "course" && (await fixture.read()).content[0].questions.length > 0) headings.push("Quiz");
        headings.push("Card artwork");
      }
      if (kind === "course") headings.push("Duration", "Version");
      if (kind === "brief" && status === "published") headings.push("Updates feed");
      headings.push("Recovery");
      await expect(panel.getByRole("heading", { level: 3 })).toHaveText(headings);
      await expect(panel).not.toContainText("Drafts save automatically");
      await expect(panel).not.toContainText("Appears in For you");
      await expect(panel).not.toContainText("Choose generated artwork or upload an image");
      await expect(panel.locator("#writing-recovery").getByRole("button", { name: "Download Markdown", exact: true })).toBeVisible();
      const revert = panel.locator("#writing-recovery").getByRole("button", { name: "Revert to published version", exact: true });
      if (status === "published") await expect(revert).toBeDisabled(); else await expect(revert).toHaveCount(0);
      if (kind !== "doc") {
        const audience = panel.getByRole("button", { name: "Assign audience", exact: true });
        if (kind === "course" && status === "draft") await expect(audience).toBeDisabled(); else await expect(audience).toBeEnabled();
        await expect(panel.getByText("Can differ from full title.", { exact: true })).toBeVisible();
        await expect(panel.getByText("Max 40 characters (11/40).", { exact: true })).toBeVisible();
        await expect(panel.getByRole("button", { name: "Shuffle artwork", exact: true })).toBeVisible();
        await expect(panel.getByRole("button", { name: "Replace image", exact: true })).toHaveCount(0);
      }
      if (kind === "course") {
        await expect(panel.getByText(/^Current version: \d+$/)).toBeVisible();
        const version = panel.getByRole("checkbox", { name: "Publish new version and reassign to audiences.", exact: true });
        if (status === "published") await expect(version).toBeVisible();
        else {
          await expect(version).toHaveCount(0);
          await expect(panel.getByText("Keep this unchecked for minor corrections.", { exact: true })).toHaveCount(0);
        }
      }
      const summary = panel.getByRole("textbox", { name: "Short description", exact: true });
      await expect(summary).toHaveAttribute("placeholder", "Max 300 characters…");
      await summary.fill("");
      await expect(panel.getByText("0/300", { exact: true })).toBeVisible();
      await expect(panel.getByRole("heading", { name: "Before publishing", exact: true })).toBeVisible();
      await summary.fill("x".repeat(301));
      await expect(summary).toHaveValue("x".repeat(300));
      await expect(panel.getByText("300/300", { exact: true })).toBeVisible();
      await expect(panel.getByRole("heading", { name: "Before publishing", exact: true })).toHaveCount(0);
      await waitForDraftSaved(page);
      expect((await fixture.read()).content[0].summary).toHaveLength(300);
      await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
      await summary.fill("A clear description for the card.");
      await waitForDraftSaved(page);
      await page.screenshot({ path: info.outputPath(`${kind}-details-${status}.png`), animations: "disabled" });
      await page.close();
    }
  });

for (const kind of ["doc", "course"] as const)
  test(`${kind}: Details picker grows to five options then scrolls with fades`, async ({ page: basePage }, info) => {
    for (const count of [1, 3, 5, 8]) {
      const page = await basePage.context().newPage();
      await open(page, info.project.name.startsWith("production"), kind, 2, (item) => {
        item.category = `${kind === "doc" ? "Section" : "Category"} 1`;
        item.folder = "";
        if (kind === "doc") item.sectionId = "section-1";
      }, (state) => {
        if (kind === "doc") state.settings = { ...state.settings!, docCategoryOrder: [], docSections: Array.from({ length: count }, (_, index) => ({ id: `section-${index + 1}`, name: `Section ${index + 1}` })) };
        else state.content.push(...Array.from({ length: count - 1 }, (_, index) => ({ ...structuredClone(state.content[0]), id: `category-${index + 2}`, title: `Category example ${index + 2}`, category: `Category ${index + 2}` })));
      });
      const toggle = page.getByRole("button", { name: "Details", exact: true });
      if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
      if (kind === "doc") await page.getByRole("button", { name: "Section", exact: true }).click();
      else await page.getByRole("button", { name: "Show categories", exact: true }).click();
      const list = page.getByRole("listbox", { name: kind === "doc" ? "Search sections" : "Categories", exact: true });
      const options = list.getByRole("option");
      await expect(options).toHaveCount(count);
      const expected = await options.evaluateAll((rows) => rows[Math.min(5, rows.length) - 1].getBoundingClientRect().bottom - rows[0].getBoundingClientRect().top);
      await expect.poll(async () => (await list.boundingBox())!.height).toBeCloseTo(expected, 0);
      await expect(list).toHaveAttribute("data-scroll-fade-after", count > 5 ? "true" : "false");
      if (count > 5) {
        await page.screenshot({ path: info.outputPath(`${kind}-details-picker.png`), animations: "disabled" });
        await list.evaluate((el) => { el.scrollTop = el.scrollHeight; });
        await expect(list).toHaveAttribute("data-scroll-fade-before", "true");
        await expect(list).toHaveAttribute("data-scroll-fade-after", "false");
        if (kind === "doc") {
          const search = page.getByRole("combobox", { name: "Search sections", exact: true });
          await search.fill("Section 8");
          await expect(options).toHaveCount(1);
          await search.press("Enter");
        } else {
          const category = page.getByRole("combobox", { name: "Category", exact: true });
          for (let index = 0; index < 8; index++) await category.press("ArrowDown");
          await category.press("Enter");
        }
        if (kind === "doc") await expect(page.getByRole("button", { name: "Section", exact: true })).toContainText("Section 8");
        else await expect(page.getByRole("combobox", { name: "Category", exact: true })).toHaveValue("Category 8");
      } else await page.keyboard.press("Escape");
      await page.close();
    }
  });

test("Details artwork source actions and dismissible upload errors", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("production"), "Uploads are installed-app functionality");
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZRCYAAAAASUVORK5CYII=", "base64");
  await page.route("**/artwork-current.png", (route) => route.fulfill({ contentType: "image/png", body: image }));
  await page.route("**/artwork-updated.png", (route) => route.fulfill({ contentType: "image/png", body: image }));
  await open(page, true, "course", 2, (item) => { item.cardArt = { version: 6, source: "upload", seed: 1, shortTitle: "Clear title", imageUrl: "/artwork-current.png" }; });
  const toggle = page.getByRole("button", { name: "Details", exact: true });
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  const artwork = page.getByRole("region", { name: "Card artwork editor", exact: true });
  await expect(artwork.getByRole("button", { name: "Replace image", exact: true })).toBeEnabled();
  await expect(artwork.getByRole("button", { name: "Remove image", exact: true })).toBeVisible();
  await expect(artwork.getByRole("button", { name: "Shuffle artwork", exact: true })).toHaveCount(0);
  const input = artwork.getByLabel("Upload card artwork", { exact: true });
  await expect(input).toHaveAttribute("accept", /image\/jpeg,image\/png,image\/webp,image\/gif/);
  let uploads = 0;
  await page.route("**/api/upload", (route) => {
    uploads++;
    return route.fulfill({ json: route.request().postDataJSON().complete ? { url: "/artwork-updated.png" } : { id: "artwork", upload: { url: "https://test.supabase.co/details-artwork", method: "PUT", headers: { "Content-Type": "image/png" } } } });
  });
  await page.route("https://test.supabase.co/details-artwork", (route) => route.fulfill({ status: 200, body: "" }));
  await input.setInputFiles({ name: "unsupported.pdf", mimeType: "application/pdf", buffer: Buffer.from("unsupported") });
  await expect(artwork.getByRole("alert")).toContainText("File type not supported. Choose JPG, PNG, WebP or GIF.");
  expect(uploads).toBe(0);
  await artwork.getByRole("button", { name: "Dismiss artwork error", exact: true }).click();
  await expect(artwork.getByRole("alert")).toHaveCount(0);
  await input.setInputFiles({ name: "replacement.png", mimeType: "image/png", buffer: image });
  await expect(artwork.locator(".card-artwork-image")).toHaveAttribute("src", "/artwork-updated.png");
  await expect(artwork.getByRole("alert")).toHaveCount(0);
  await expect(artwork).not.toContainText("Card image updated.");
  await waitForDraftSaved(page);
  await artwork.getByRole("combobox", { name: "Artwork source", exact: true }).click();
  await page.getByRole("option", { name: "Generated", exact: true }).click();
  await expect(artwork.getByRole("button", { name: "Shuffle artwork", exact: true })).toBeVisible();
  await expect(artwork.getByRole("button", { name: "Replace image", exact: true })).toHaveCount(0);
  await expect(artwork.getByRole("button", { name: "Remove image", exact: true })).toHaveCount(0);
});

test("Recovery restores the published draft without publishing changes", async ({ page }, info) => {
  const installed = info.project.name.startsWith("production");
  const fixture = await open(page, installed, "doc", 2, (item) => { item.summary = "Original short description."; });
  const published = structuredClone((await fixture.read()).publishedContent![0]);
  if (installed) await page.route("**/api/content?**", async (route) => {
    const query = new URL(route.request().url()).searchParams;
    if (route.request().method() === "GET" && query.get("draft") !== "true") {
      const latest = (await fixture.read()).content[0];
      return route.fulfill({ json: { ...published, revision: latest.revision, publishedRevision: latest.publishedRevision } });
    }
    return route.fallback();
  });
  const toggle = page.getByRole("button", { name: "Details", exact: true });
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  const panel = page.getByRole("complementary", { name: "Content details", exact: true });
  const summary = panel.getByRole("textbox", { name: "Short description", exact: true });
  await summary.fill("An unpublished correction.");
  await waitForDraftSaved(page);
  const recovery = panel.locator("#writing-recovery");
  await recovery.getByRole("button", { name: "Revert to published version", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(summary).toHaveValue("An unpublished correction.");
  await recovery.getByRole("button", { name: "Revert to published version", exact: true }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(summary).toHaveValue("Original short description.");
  await waitForDraftSaved(page);
  await expect(recovery.getByRole("button", { name: "Revert to published version", exact: true })).toBeDisabled();
  expect((await fixture.read()).publishedContent![0].summary).toBe("Original short description.");
  await recovery.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("details-recovery.png"), animations: "disabled" });
});

test("Docs section guidance focuses the dropdown and shows its attention ring", async ({ page }, info) => {
  await open(page, info.project.name.startsWith("production"), "doc", 2, (item) => { item.category = ""; item.folder = ""; item.sectionId = undefined; });
  const toggle = page.getByRole("button", { name: "Details", exact: true });
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await page.getByRole("button", { name: "Choose a Docs section", exact: true }).click();
  const section = page.getByRole("button", { name: "Section", exact: true });
  await expect(section).toBeFocused();
  await expect(section).toBeInViewport({ ratio: 1 });
  await expect(section).toHaveCSS("--tw-ring-offset-width", "2px");
});

test("Details uses Edit Audience for existing Course and Update assignments", async ({ page: basePage }, info) => {
  for (const kind of ["course", "brief"] as const) {
    const page = await basePage.context().newPage();
    await open(page, info.project.name.startsWith("production"), kind, 2, undefined, (state) => {
      if (kind === "course") state.groups[0].learningItems = [{ kind: "course", id: state.content[0].id }];
      else {
        state.content[0].groups = [state.groups[0].id];
        state.publishedContent![0].groups = [state.groups[0].id];
      }
    });
    const toggle = page.getByRole("button", { name: "Details", exact: true });
    if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
    const panel = page.getByRole("complementary", { name: "Content details", exact: true });
    await expect(panel.getByRole("button", { name: "Edit Audience", exact: true })).toBeEnabled();
    await expect(panel.getByRole("button", { name: "Assign audience", exact: true })).toHaveCount(0);
    await page.close();
  }
});

test("a new Course shows only its current version before first publication", async ({ page }, info) => {
  await open(page, info.project.name.startsWith("production"), "course");
  await returnToContent(page);
  await page.getByRole("button", { name: "Content", exact: true }).click();
  await page.getByRole("menuitem", { name: "Course", exact: true }).click();
  const toggle = page.getByRole("button", { name: "Details", exact: true });
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  const version = page.locator("#course-version");
  await expect(version.getByRole("heading", { name: "Version", exact: true })).toBeVisible();
  await expect(version.getByText("Current version: 1", { exact: true })).toBeVisible();
  await expect(version.getByRole("checkbox")).toHaveCount(0);
  await expect(version).not.toContainText("Keep this unchecked");
});

for (const kind of ["doc", "brief", "course"] as const)
  test(`${kind}: approved desktop row and opaque pinned surfaces survive narrowing and scrolling`, async ({ page }, info) => {
    await open(page, info.project.name.startsWith("production"), kind);
    const back = page.getByRole("button", { name: "Back to content", exact: true });
    const title = page.locator("#editor-title");
    const pinned = kind === "course" ? page.getByRole("textbox", { name: "Lesson title", exact: true }) : title;
    for (const width of [1440, 1279, 1110, 1024, 900, 768, 600]) {
      await page.setViewportSize({ width, height: 900 });
      const frame = page.locator(".editor-frame");
      await expect(frame).not.toHaveAttribute("data-mobile", "true");
      await expect(frame).not.toHaveAttribute("data-cards", "true");
      await page.locator(".editor").evaluate((el) => {
        el.closest(".main-content")!.scrollTop = 0;
        const writer = el.querySelector(".writing-viewport");
        if (writer) writer.scrollTop = 0;
      });
      await page.locator(".main-shell").evaluate(async (el) => {
        await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {})));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      await expect(back).toBeVisible();
      const start = (await back.boundingBox())!;
      const detail = (await page.getByRole("button", { name: "Details", exact: true }).boundingBox())!;
      expect(detail.y + detail.height / 2).toBeCloseTo(start.y + start.height / 2, 0);
      if (width >= 1024) expect(Math.abs((await back.locator("svg").boundingBox())!.x - (await title.boundingBox())!.x)).toBeLessThanOrEqual(2);
      if (kind === "course") {
        const outline = (await page.getByRole("button", { name: "Outline", exact: true }).boundingBox())!;
        expect(outline.y + outline.height / 2).toBeCloseTo(start.y + start.height / 2, 0);
        expect(start.x).toBeGreaterThanOrEqual(outline.x + outline.width + 4);
      }
      await page.locator(".editor").evaluate((el) => {
        const owner = el.getAttribute("data-scroll-layout") === "workspace" ? el.querySelector(".writing-viewport")! : el.closest(".main-content")!;
        owner.scrollTop = 450;
      });
      await expect(back).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole("button", { name: "Details", exact: true })).toBeInViewport({ ratio: 1 });
      if (kind === "course") await expect(page.getByRole("button", { name: "Outline", exact: true })).toBeInViewport({ ratio: 1 });
      await expect(pinned).toBeInViewport({ ratio: 1 });
      // Narrow mouse layouts retain the in-page navigation row above the
      // pinned title.
      const cover = await page.locator(".editor-canvas-navigation").evaluate((nav) => {
        const box = nav.getBoundingClientRect();
        const editor = nav.closest(".editor")!;
        const top = editor.closest(".main-content")!.getBoundingClientRect().top;
        const heading = editor.querySelector(".writing-document-heading")!.getBoundingClientRect();
        const before = getComputedStyle(nav, "::before");
        const extension = before.content !== "none" ? parseFloat(before.height) || 0 : 0;
        return { top: box.top - extension, viewportTop: top, bottom: box.bottom, headingTop: heading.top, background: getComputedStyle(nav).backgroundColor };
      });
      if (await page.locator(".editor").getAttribute("data-scroll-layout") === "page") {
        expect(cover.top).toBeLessThanOrEqual(cover.viewportTop + 1);
        expect(cover.headingTop).toBeCloseTo(cover.bottom, 0);
      }
      expect(cover.background).not.toBe("rgba(0, 0, 0, 0)");
      const pinnedAt = (await pinned.boundingBox())!.y;
      await page.locator(".editor").evaluate((el) => {
        const owner = el.getAttribute("data-scroll-layout") === "workspace" ? el.querySelector(".writing-viewport")! : el.closest(".main-content")!;
        owner.scrollTop += 200;
      });
      expect((await pinned.boundingBox())!.y).toBeCloseTo(pinnedAt, 0);
      if (kind === "course") await expect(title).not.toBeInViewport();
      await page.screenshot({ path: info.outputPath(`${kind}-restored-row-${width}.png`), animations: "disabled" });
    }
  });

for (const kind of ["doc", "brief", "course"] as const) {
  test(`${kind}: final desktop writing row has useful room through menus and owner changes`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await open(page, info.project.name.startsWith("production"), kind);
    const writer = page.locator('.writing-content[contenteditable="true"]');
    const mounted = await writer.elementHandle();
    const details = page.getByRole("button", { name: "Details", exact: true });
    for (const size of [{ width: 1600, height: 1000 }, { width: 1100, height: 780 }, { width: 600, height: 1000 }]) {
      await page.setViewportSize(size);
      await expect(page.locator(".editor")).toHaveAttribute("data-scroll-layout", size.width >= 1100 ? "workspace" : "page");
      if (await details.getAttribute("aria-expanded") === "true") await details.click();
      const finalRow = writer.locator("p").last();
      const finalBounds = (await finalRow.boundingBox())!;
      await finalRow.click({ position: { x: finalBounds.width - 4, y: finalBounds.height - 14 } });
      await expect.poll(() => finalRow.evaluate((paragraph) => {
        const selection = window.getSelection();
        return !!selection?.isCollapsed && paragraph.contains(selection.focusNode);
      })).toBe(true);
      await page.locator(".editor").evaluate(async (editor) => {
        const owner = editor.getAttribute("data-scroll-layout") === "workspace" ? editor.querySelector<HTMLElement>(".writing-viewport")! : editor.closest<HTMLElement>(".main-content")!;
        owner.scrollTop = owner.scrollHeight;
        await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      });
      const read = () => page.locator(".editor").evaluate((editor) => {
        const owner = editor.getAttribute("data-scroll-layout") === "workspace" ? editor.querySelector<HTMLElement>(".writing-viewport")! : editor.closest<HTMLElement>(".main-content")!;
        const bounds = owner.getBoundingClientRect();
        const heading = editor.querySelector(".writing-document-heading")!.getBoundingClientRect();
        const navigation = editor.querySelector(".editor-canvas-navigation")?.getBoundingClientRect();
        const last = Array.from(editor.querySelectorAll(".writing-content > p")).at(-1)!.getBoundingClientRect();
        return { gap: bounds.bottom - last.bottom, usable: bounds.bottom - Math.max(bounds.top, heading.bottom, navigation?.bottom || bounds.top), scrollTop: owner.scrollTop };
      });
      const before = await read();
      expect(before.gap).toBeGreaterThanOrEqual(before.usable * 0.28 - 2);
      expect(before.gap).toBeLessThanOrEqual(before.usable * 0.36 + 32);
      await writer.evaluate((element) => element.blur());
      await writer.evaluate((element) => element.focus({ preventScroll: true }));
      // The control is already visible in pinned navigation. A screen-point
      // click avoids Playwright's extra scrollIntoView on that sticky row.
      await expect(details).toBeInViewport({ ratio: 1 });
      let button = (await details.boundingBox())!;
      await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2);
      await expect(page.getByRole("complementary", { name: "Content details", exact: true })).toBeVisible();
      button = (await details.boundingBox())!;
      await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2);
      const after = await read();
      expect(after.scrollTop).toBeCloseTo(before.scrollTop, 0);
      expect(after.gap).toBeCloseTo(before.gap, 0);
      expect(await mounted!.evaluate((element) => element.isConnected)).toBe(true);
      await page.screenshot({ path: info.outputPath(`${kind}-desktop-writing-room-${size.width}.png`) });
    }
  });

  test(`${kind}: short desktop writing canvas does not gain an extra scroll page`, async ({ page }, info) => {
    await page.setViewportSize({ width: 1600, height: 1000 });
    await open(page, info.project.name.startsWith("production"), kind, 2, item => {
      item.body = "Paragraph 1. A short piece of writing.";
      if (kind === "course") item.lessons[0].body = item.body;
    });
    for (const size of [{ width: 1600, height: 1000 }, { width: 1100, height: 780 }, { width: 600, height: 1000 }]) {
      await page.setViewportSize(size);
      await expect(page.locator(".editor")).toHaveAttribute("data-scroll-layout", size.width >= 1100 ? "workspace" : "page");
      await expect.poll(() => page.locator(".editor").evaluate((editor) => {
        const page = editor.closest<HTMLElement>(".main-content")!;
        const owner = editor.getAttribute("data-scroll-layout") === "workspace" ? editor.querySelector<HTMLElement>(".writing-viewport")! : page;
        return Math.max(owner.scrollHeight - owner.clientHeight, page.scrollHeight - page.clientHeight);
      })).toBeLessThanOrEqual(2);
      await expect(page.locator('.writing-content[contenteditable="true"] > p').first()).toHaveText("Paragraph 1. A short piece of writing.");
    }
  });
}

test("desktop trailing canvas stays useful while typing and clicking back into the final row", async ({ page }, info) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await open(page, info.project.name.startsWith("production"), "doc");
  const writer = page.locator('.writing-content[contenteditable="true"]');
  const details = page.getByRole("button", { name: "Details", exact: true });
  if (await details.getAttribute("aria-expanded") === "true") await details.click();
  const last = writer.locator("p").last();
  const lastBounds = (await last.boundingBox())!;
  // Click after the text on its final rendered line to place a native caret.
  await last.click({ position: { x: lastBounds.width - 4, y: lastBounds.height - 14 } });
  await expect.poll(() => writer.locator("p").last().evaluate((paragraph) => {
    const selection = window.getSelection()!;
    if (!selection.isCollapsed || !paragraph.contains(selection.focusNode)) return false;
    const before = document.createRange(); before.selectNodeContents(paragraph);
    before.setEnd(selection.focusNode!, selection.focusOffset);
    return before.toString() === paragraph.textContent;
  })).toBe(true);
  await page.keyboard.type(" Added writing wraps naturally while preserving the final row and all the paragraphs that came before it.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("A new final writing row.");
  await expect(writer.locator("p")).toHaveCount(41);
  await page.locator(".editor").evaluate(async (editor) => {
    const owner = editor.getAttribute("data-scroll-layout") === "workspace" ? editor.querySelector<HTMLElement>(".writing-viewport")! : editor.closest<HTMLElement>(".main-content")!;
    owner.scrollTop = owner.scrollHeight;
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
  });
  const tail = await writer.evaluate((element) => {
    const editor = element.closest(".editor")!;
    const owner = editor.getAttribute("data-scroll-layout") === "workspace" ? editor.querySelector(".writing-viewport")! : editor.closest(".main-content")!;
    const bounds = owner.getBoundingClientRect();
    const heading = editor.querySelector(".writing-document-heading")!.getBoundingClientRect();
    const navigation = editor.querySelector(".editor-canvas-navigation")?.getBoundingClientRect();
    const line = Array.from(element.querySelectorAll(":scope > p")).at(-1)!.getBoundingClientRect();
    const gap = bounds.bottom - line.bottom;
    const x = line.left + line.width / 2, y = line.bottom + gap / 2;
    return { gap, usable: bounds.bottom - Math.max(bounds.top, heading.bottom, navigation?.bottom || bounds.top), x, y, insideWriting: document.elementFromPoint(x, y)?.closest('.writing-content[contenteditable="true"]') === element };
  });
  expect(tail.gap).toBeGreaterThanOrEqual(tail.usable * 0.28 - 2);
  expect(tail.insideWriting).toBe(true);
  await page.mouse.click(tail.x, tail.y);
  await page.keyboard.type(" Appended from the blank canvas.");
  await expect(writer.locator("p").last()).toHaveText("A new final writing row. Appended from the blank canvas.");
  await expect(writer.locator("p")).toHaveCount(41);
  await waitForDraftSaved(page);
  const { body } = await downloadMarkdown(page);
  const paragraphs = body.trim().split(/\n{2,}/);
  expect(paragraphs).toHaveLength(41);
  expect(paragraphs.at(-1)).toBe("A new final writing row. Appended from the blank canvas.");
  await page.screenshot({ path: info.outputPath("desktop-typing-in-trailing-canvas.png") });
});

test("resizing retains the writing position when the scroll owner changes", async ({ page }, info) => {
  await page.setViewportSize({ width: 1600, height: 900 });
  await open(page, info.project.name.startsWith("production"), "course");
  await page.locator(".editor").evaluate((el) => { el.querySelector(".writing-viewport")!.scrollTop = 500; });
  for (const width of [600, 1600, 768, 1600]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.locator(".editor").evaluate((el) => {
      const owner = el.getAttribute("data-scroll-layout") === "workspace" ? el.querySelector(".writing-viewport")! : el.closest(".main-content")!;
      return owner.scrollTop;
    })).toBeCloseTo(500, 0);
    await expect(page.getByRole("textbox", { name: "Lesson title", exact: true })).toBeInViewport();
  }
});

test("edge controls never cross the canvas and the desktop navigation stays centered", async ({ page }, info) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await open(page, info.project.name.startsWith("production"), "course");
  const original = await page.locator('.writing-content[contenteditable="true"]').elementHandle();
  const frame = page.locator(".editor-frame");
  const back = page.getByRole("button", { name: "Back to content", exact: true });
  const outline = page.getByRole("button", { name: "Outline", exact: true });
  const details = page.getByRole("button", { name: "Details", exact: true });
  const title = page.locator("#editor-title");
  const command = page.getByRole("button", { name: "Commands: insert blocks or format selected text", exact: true });
  for (const expanded of [false, true]) {
    await page.setViewportSize({ width: 1600, height: 1000 });
    if (expanded) await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
    else if (await page.getByRole("button", { name: "Collapse sidebar", exact: true }).isVisible())
      await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
    for (const width of [1250, 1100, 1000, 980, 974, 972, 970, 968, 950, 900, 800, 768, 900, 972, 974, 1100, 1250]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator(".main-shell").evaluate(async (el) => {
        await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {})));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      const boxes = { back: (await back.boundingBox())!, outline: (await outline.boundingBox())!, details: (await details.boundingBox())!, title: (await title.boundingBox())! };
      await expect(frame).not.toHaveAttribute("data-cards", "true");
      // Include the padded Back button hit area, not just its arrow/text.
      expect(boxes.outline.x + boxes.outline.width + 7).toBeLessThanOrEqual(boxes.back.x);
      expect(Math.abs((await back.locator("svg").boundingBox())!.x - boxes.title.x)).toBeLessThanOrEqual(2);
      expect(boxes.outline.y + boxes.outline.height / 2).toBeCloseTo(boxes.back.y + boxes.back.height / 2, 0);
      expect(boxes.details.y + boxes.details.height / 2).toBeCloseTo(boxes.back.y + boxes.back.height / 2, 0);
      await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toBeHidden();
      await expect(command).toBeHidden();
      const modes = await frame.evaluate(async (el) => {
        const values = new Set<string | undefined>();
        for (let i = 0; i < 8; i++) { await new Promise(requestAnimationFrame); values.add((el as HTMLElement).dataset.cards); }
        return values.size;
      });
      expect(modes).toBe(1);
      expect(await original!.evaluate((node) => node.isConnected)).toBe(true);
      if (width === 980 || width === 900 || width === 768) await page.screenshot({ path: info.outputPath(`controls-${expanded ? "expanded" : "rail"}-${width}.png`) });
    }
  }
  // Enlarged type retains the desktop row and its clearance until compact mode.
  await page.setViewportSize({ width: 1100, height: 1000 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "20px"; });
  await expect(frame).not.toHaveAttribute("data-cards", "true");
  const row = (await outline.boundingBox())!;
  const backBox = (await back.boundingBox())!;
  expect(row.x + row.width + 7).toBeLessThanOrEqual(backBox.x);
  expect(row.y + row.height / 2).toBeCloseTo(backBox.y + backBox.height / 2, 0);
});

test("quiz outline actions and delete controls preserve question and answer minimums", async ({ page }, info) => {
  const { read } = await open(page, info.project.name.startsWith("production"), "course", 2, (item) => {
    item.questions = [{ id: "quiz-one", prompt: "Pick the right answer", options: ["Right", "Wrong"], optionIds: ["right", "wrong"], correctOptionIds: ["right"] }];
  });
  const outline = page.getByRole("button", { name: "Outline", exact: true });
  if (await outline.getAttribute("aria-expanded") !== "true") await outline.click();
  await page.getByRole("navigation", { name: "Edit course step", exact: true }).getByRole("button", { name: "Quiz", exact: true }).click();
  const first = page.locator('[data-question-id="quiz-one"]');
  await expect(first.getByText("Mark every correct answer. Keep at least one correct and incorrect answer.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Remove question / })).toHaveCount(0);
  await expect(first.getByRole("button", { name: /^Remove answer / })).toHaveCount(0);
  await first.getByRole("button", { name: "Add answer", exact: true }).click();
  await expect(first.getByRole("button", { name: /^Remove answer / })).toHaveCount(3);
  await first.getByRole("button", { name: "Remove answer 3", exact: true }).click();
  await expect(first.getByRole("textbox", { name: /^Answer / })).toHaveCount(2);
  await expect(first.getByRole("button", { name: /^Remove answer / })).toHaveCount(0);
  await page.getByRole("button", { name: "Add question", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Remove question / })).toHaveCount(2);
  await page.getByRole("button", { name: "Remove question 2", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Remove question / })).toHaveCount(0);
  if (await outline.getAttribute("aria-expanded") !== "true") await outline.click();
  await page.getByRole("button", { name: "Quiz actions", exact: true }).click();
  await expect(page.getByRole("menuitem")).toHaveCount(1);
  await expect(page.getByRole("menuitem", { name: "Delete quiz", exact: true })).toBeVisible();
  await page.getByRole("menuitem", { name: "Delete quiz", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Quiz", exact: true })).toHaveCount(0);
  if (await outline.getAttribute("aria-expanded") !== "true") await outline.click();
  await expect(page.getByRole("button", { name: "Add quiz", exact: true })).toBeVisible();
  await expect.poll(async () => (await read()).content[0].questions.length).toBe(0);
  await page.getByRole("button", { name: "Add quiz", exact: true }).click();
  await expect(page.locator('[data-question-id]')).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^Remove question / })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Remove answer / })).toHaveCount(0);
});

test("Quiz uses lesson title typography and stays pinned while the course title scrolls", async ({ page }, info) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await open(page, info.project.name.startsWith("production"), "course", 2, (item) => {
    item.questions = Array.from({ length: 8 }, (_, index) => ({ id: `pin-${index}`, prompt: `Question ${index + 1}`, options: ["Right", "Wrong"], optionIds: [`right-${index}`, `wrong-${index}`], correctOptionIds: [`right-${index}`] }));
  });
  const typography = await page.getByRole("textbox", { name: "Lesson title", exact: true }).evaluate((el) => {
    const style = getComputedStyle(el);
    return [style.fontSize, style.lineHeight, style.fontWeight, style.letterSpacing, style.color];
  });
  const outline = page.getByRole("button", { name: "Outline", exact: true });
  if (await outline.getAttribute("aria-expanded") !== "true") await outline.click();
  await page.getByRole("navigation", { name: "Edit course step", exact: true }).getByRole("button", { name: "Quiz", exact: true }).click();
  if (await outline.getAttribute("aria-expanded") === "true") await outline.click();
  const heading = page.getByRole("heading", { name: "Quiz", exact: true });
  await expect(heading).toBeVisible();
  expect(await heading.evaluate((el) => { const style = getComputedStyle(el); return [style.fontSize, style.lineHeight, style.fontWeight, style.letterSpacing, style.color]; })).toEqual(typography);
  for (const width of [1600, 900, 375, 1600]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator(".editor").evaluate((el) => {
      const owner = el.getAttribute("data-scroll-layout") === "workspace" ? el.querySelector(".editor-frame-canvas")! : el.closest(".main-content")!;
      owner.scrollTop = 500;
    });
    await expect(heading).toBeInViewport({ ratio: 1 });
    await expect(page.locator("#editor-title")).not.toBeInViewport();
    await expect(page.locator(".editor-frame")).not.toHaveAttribute("data-mobile", "true");
    const nav = (await page.locator(".editor-canvas-navigation").boundingBox())!;
    const pinned = (await page.locator(".course-quiz-canvas > .writing-document-heading").boundingBox())!;
    expect(pinned.y).toBeCloseTo(nav.y + nav.height, 0);
    await page.locator(".editor").evaluate((el) => {
      const owner = el.getAttribute("data-scroll-layout") === "workspace" ? el.querySelector(".editor-frame-canvas")! : el.closest(".main-content")!;
      owner.scrollTop += 150;
    });
    expect((await page.locator(".course-quiz-canvas > .writing-document-heading").boundingBox())!.y).toBeCloseTo(pinned.y, 0);
    await page.screenshot({ path: info.outputPath(`quiz-pinned-${width}.png`), animations: "disabled" });
  }
});

test("short-screen Quiz headings flow without an offset and restore pinning when space returns", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open(page, info.project.name.startsWith("production"), "course", 2, item => {
    item.questions = [{ id: "flow-quiz", prompt: "Question", options: ["Right", "Wrong"], optionIds: ["flow-right", "flow-wrong"], correctOptionIds: ["flow-right"] }];
  });
  const outline = page.getByRole("button", { name: "Outline", exact: true });
  if (await outline.getAttribute("aria-expanded") !== "true") await outline.click();
  await page.getByRole("navigation", { name: "Edit course step", exact: true }).getByRole("button", { name: "Quiz", exact: true }).click();
  const heading = page.locator(".course-quiz-canvas > .writing-document-heading");
  const instance = await heading.elementHandle();
  await page.setViewportSize({ width: 1440, height: 300 });
  await expect(page.locator(".editor")).toHaveAttribute("data-flowing-heading", "");
  await expect.poll(() => heading.evaluate(el => ({ position: getComputedStyle(el).position, top: getComputedStyle(el).top })))
    .toEqual({ position: "relative", top: "0px" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator(".editor")).not.toHaveAttribute("data-flowing-heading", "");
  await expect.poll(() => heading.evaluate(el => getComputedStyle(el).position)).toBe("sticky");
  expect(await instance!.evaluate(el => el.isConnected)).toBe(true);
});

test("course Quiz settings follow Assign, save the passing rule and hide without a quiz", async ({ page }, info) => {
  const { read } = await open(page, info.project.name.startsWith("production"), "course", 2, (item) => { item.questions = []; item.requirePassing = false; });
  const details = page.getByRole("button", { name: "Details", exact: true });
  const outline = page.getByRole("button", { name: "Outline", exact: true });
  const showDetails = async () => { if (await details.getAttribute("aria-expanded") !== "true") await details.click(); };
  const showOutline = async () => { if (await outline.getAttribute("aria-expanded") !== "true") await outline.click(); };
  await showDetails();
  let panel = page.getByRole("complementary", { name: "Content details", exact: true });
  await expect(panel.locator("#course-quiz")).toHaveCount(0);
  await showOutline();
  await page.getByRole("button", { name: "Add quiz", exact: true }).click();
  const canvas = page.locator(".course-quiz-canvas");
  await expect(canvas).toContainText("The quiz always follows the lessons. Learners can retry; no passing score is required unless you enable it in the course details menu.");
  await expect(canvas.getByRole("checkbox", { name: "Require all answers correct to complete", exact: true })).toHaveCount(0);
  await showDetails();
  panel = page.getByRole("complementary", { name: "Content details", exact: true });
  const headings = await panel.getByRole("heading").allTextContents();
  expect(headings.indexOf("Quiz")).toBe(headings.indexOf("Assign") + 1);
  expect(headings.indexOf("Card artwork")).toBe(headings.indexOf("Quiz") + 1);
  const requirement = panel.getByRole("checkbox", { name: "Require all answers correct to complete", exact: true });
  await expect(requirement).not.toBeChecked();
  await requirement.check();
  await expect.poll(async () => (await read()).content[0].requirePassing).toBe(true);
  await showOutline();
  await page.getByRole("navigation", { name: "Edit course step", exact: true }).getByRole("button", { name: /Start with context/ }).click();
  await showDetails();
  await expect(requirement).toBeChecked();
  if (info.project.name.startsWith("production")) {
    await page.reload();
    await showDetails();
    await expect(requirement).toBeChecked();
  } else {
    // The fixture reseeds this page on reload; a fresh tab reads the saved browser data.
    const restored = await page.context().newPage();
    await restored.addInitScript(() => sessionStorage.setItem("fieldbook.profile.v1", "demo-admin"));
    await restored.goto(page.url());
    const toggle = restored.getByRole("button", { name: "Details", exact: true });
    if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
    await expect(restored.getByRole("checkbox", { name: "Require all answers correct to complete", exact: true })).toBeChecked();
    await restored.close();
  }
  await showOutline();
  await page.getByRole("navigation", { name: "Edit course step", exact: true }).locator(".quiz-step").click();
  await showOutline();
  await page.getByRole("button", { name: "Quiz actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete quiz", exact: true }).click();
  await showDetails();
  await expect(page.locator("#course-quiz")).toHaveCount(0);
});

for (const kind of ["doc", "brief", "course"] as const) {
  test(`${kind}: Details typography stays at its smaller size through narrow breakpoints`, async ({ page }, info) => {
    await open(page, info.project.name.startsWith("production"), kind, 2, (item) => {
      item.summary = "";
      if (kind === "doc") { item.sectionId = "section-1"; item.category = "Section one"; item.folder = ""; }
    }, (state) => {
      if (kind === "doc") state.settings = { ...state.settings!, docSections: [{ id: "section-1", name: "Section one" }, { id: "section-2", name: "Section two" }] };
    });
    const toggle = page.getByRole("button", { name: "Details", exact: true });
    const showDetails = async () => { if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click(); };
    let baseline: string[] | undefined;
    for (const width of [1440, 900, 768, 641, 640, 639, 500, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator(".main-shell").evaluate(async () => { await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
      await showDetails();
      const panel = page.getByRole("complementary", { name: "Content details", exact: true });
      const fonts = await panel.evaluate((el) => Array.from(el.querySelectorAll<HTMLElement>("*"))
        .filter(node => !node.closest(".card-artwork-preview") && node.getBoundingClientRect().width > 0 && (node.matches('input:not([type="hidden"]):not([type="checkbox"]), textarea') || Array.from(node.childNodes).some(child => child.nodeType === Node.TEXT_NODE && child.textContent?.trim())))
        .map(node => `${node.tagName}:${node.getAttribute('data-slot') || ''}:${node.matches('input, textarea') ? node.getAttribute('placeholder') || node.getAttribute('type') || '' : node.textContent?.trim()}:${getComputedStyle(node).fontSize}`));
      if (!baseline) baseline = fonts;
      expect(fonts).toEqual(baseline);
      await expect(panel.locator("#editor-summary")).toHaveCSS("font-size", "14px");
      if (kind === "doc") {
        await panel.getByRole("button", { name: "Section", exact: true }).click();
        await expect(page.getByRole("combobox", { name: "Search sections", exact: true })).toHaveCSS("font-size", "14px");
        await page.keyboard.press("Escape");
        await panel.getByRole("button", { name: "Create section", exact: true }).click();
        await expect(panel.getByRole("textbox", { name: "New section name", exact: true })).toHaveCSS("font-size", "14px");
        await panel.getByRole("button", { name: "Cancel", exact: true }).click();
      } else {
        await expect(panel.getByRole("combobox", { name: "Category", exact: true })).toHaveCSS("font-size", "14px");
        await expect(panel.locator("#content-artwork-title")).toHaveCSS("font-size", "14px");
      }
      if (kind === "course") await expect(panel.getByRole("spinbutton", { name: "Estimated minutes", exact: true })).toHaveCSS("font-size", "14px");
      if (width === 640 || width === 639) await page.screenshot({ path: info.outputPath(`${kind}-details-type-${width}.png`), animations: "disabled" });
    }
  });
}


test("centered search yields to publication controls without changing navigation or editor cutoffs", async ({ page }, info) => {
  const installed = info.project.name.startsWith("production");
  await page.setViewportSize({ width: 1800, height: 1000 });
  await open(page, installed, "course");
  await page.locator("#editor-title").fill("A changed course title");
  await waitForDraftSaved(page);
  const icon = page.getByRole("button", { name: "Open search", exact: true });
  const input = page.getByRole("textbox", { name: "Search all content", exact: true });
  let desktopIconSeen = false;
  for (const expanded of [false, true]) {
    if (expanded) await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
    for (const width of [1800, 1600, 1440, 1180, 1024, 900, 768, 767, 600, 375, 1800]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator(".main-shell").evaluate(async (el) => {
        await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {})));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      const geometry = await page.locator(".topbar").evaluate((bar) => {
        const actions = bar.querySelector(".editor-heading-actions")!.getBoundingClientRect();
        const field = bar.querySelector(".app-search-measure")!.getBoundingClientRect();
        const bounds = bar.getBoundingClientRect();
        const shellCompact = matchMedia("(width < 768px), (width < 1280px) and (pointer: coarse) and (orientation: portrait)").matches;
        const gap = parseFloat(getComputedStyle(bar).columnGap);
        return { icon: shellCompact || field.right + gap > actions.left, shellCompact, center: bounds.x + bounds.width / 2, right: bounds.right, actionsRight: actions.right };
      });
      expect(geometry.actionsRight).toBeLessThanOrEqual(geometry.right);
      if (geometry.icon) {
        await expect(icon).toBeVisible();
        await expect(input).toBeHidden();
        if (!geometry.shellCompact) desktopIconSeen = true;
        const search = (await icon.boundingBox())!;
        const actions = (await page.locator(".editor-heading-actions").boundingBox())!;
        expect(search.x + search.width).toBeLessThan(actions.x);
        expect(search.y + search.height / 2).toBeCloseTo(actions.y + actions.height / 2, 0);
      } else {
        await expect(icon).toBeHidden();
        const search = (await input.locator('..').boundingBox())!;
        expect(search.x + search.width / 2).toBeCloseTo(geometry.center, 0);
      }
      await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeInViewport({ ratio: 1 });
      if (geometry.shellCompact) {
        await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toBeVisible();
      } else {
        await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toBeHidden();
      }
      await expect(page.locator(".editor-frame")).not.toHaveAttribute("data-cards", "true");
    }
  }
  expect(desktopIconSeen).toBe(true);
  await page.setViewportSize({ width: 900, height: 1000 });
  await icon.click();
  await expect(input).toBeFocused();
  await input.fill("context");
  const panel = page.locator('[data-slot="search-panel"]');
  await expect(panel).toBeVisible();
  const header = (await page.locator(".topbar").boundingBox())!;
  const panelBox = (await panel.boundingBox())!;
  expect(panelBox.x).toBeGreaterThanOrEqual(header.x);
  expect(panelBox.x + panelBox.width).toBeLessThanOrEqual(header.x + header.width);
  const close = page.getByRole("button", { name: "Close search", exact: true });
  await expect.poll(() => close.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
  })).toBe(true);
  await page.keyboard.press("Escape");
  await expect(icon).toBeFocused();
  await page.setViewportSize({ width: 1800, height: 1000 });
  await expect(icon).toBeHidden();
  await expect(input).toHaveValue("context");
  await expect(panel).toHaveCount(0);
  await page.goto(installed ? "/courses" : "/#courses");
  await page.setViewportSize({ width: 900, height: 1000 });
  await expect(input).toBeVisible();
  await expect(page.locator(".editor-heading-actions")).toHaveCount(0);
  const field = (await input.locator('..').boundingBox())!;
  const bar = (await page.locator(".topbar").boundingBox())!;
  expect(field.x + field.width / 2).toBeCloseTo(bar.x + bar.width / 2, 0);
  await page.screenshot({ path: info.outputPath("centered-reader-search.png"), animations: "disabled" });
});


test("search clear stays inside a stable field and leaves room for long queries", async ({ page }, info) => {
  await open(page, info.project.name.startsWith("production"), "doc");
  for (const width of [1800, 600]) {
    await page.setViewportSize({ width, height: 1000 });
    const icon = page.getByRole("button", { name: "Open search", exact: true });
    if (width === 600) {
      await expect(icon).toBeVisible();
      await icon.click();
    } else await expect(icon).toBeHidden();
    const input = page.getByRole("textbox", { name: "Search all content", exact: true });
    await expect(input).toBeVisible();
    const field = input.locator('..');
    const before = (await field.boundingBox())!;
    const inputBefore = (await input.boundingBox())!;
    await input.fill("A long search query ".repeat(12));
    const clear = page.getByRole("button", { name: "Clear search", exact: true });
    await expect(clear).toBeVisible();
    const after = (await field.boundingBox())!;
    const inputAfter = (await input.boundingBox())!;
    const button = (await clear.boundingBox())!;
    expect(after.width).toBeCloseTo(before.width, 0);
    expect(inputAfter.width).toBeCloseTo(inputBefore.width, 0);
    expect(button.x).toBeGreaterThan(after.x);
    expect(button.x + button.width).toBeLessThan(after.x + after.width);
    expect(button.y).toBeGreaterThanOrEqual(inputAfter.y);
    expect(button.y + button.height).toBeLessThanOrEqual(inputAfter.y + inputAfter.height);
    const padding = await input.evaluate(el=>parseFloat(getComputedStyle(el).paddingRight));
    expect(inputAfter.x + inputAfter.width - padding).toBeLessThanOrEqual(button.x - 4);
    await page.screenshot({ path: info.outputPath(`search-clear-${width}.png`), animations: "disabled" });
    await clear.click();
    await expect(input).toBeFocused();
    await expect(input).toHaveValue("");
    await expect(clear).toBeHidden();
    expect((await field.boundingBox())!.width).toBeCloseTo(before.width, 0);
    if (await icon.isVisible()) await page.keyboard.press("Escape");
  }
});


for (const kind of ["doc", "brief", "course"] as const)
  test(`${kind}: balanced block gutters retain aligned titles, reachable actions and compact cutoffs`, async ({ page }, info) => {
    await page.route("https://example.test/image.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#e5e5e5"/></svg>' }));
    await page.route("https://www.youtube-nocookie.com/**", route => route.fulfill({ contentType: "text/html", body: "<html><body>Video preview</body></html>" }));
    await page.route("https://i.ytimg.com/**", route => route.fulfill({ status: 404, body: "" }));
    const body = "Paragraph 1. Keep every block intact.\n\n```text\nA code example\nSecond line\n```\n\n![Example](https://example.test/image.svg)\n\n[Video](https://www.youtube.com/watch?v=dQw4w9WgXcQ)\n\n| One | Two |\n| --- | --- |\n| First | Second |\n\n---\n\nFinal paragraph.";
    await open(page, info.project.name.startsWith("production"), kind, 2, item => {
      if (kind === "course") item.lessons[0].body = body;
      else item.body = body;
    });
    const writer = page.locator('.writing-content[contenteditable="true"]');
    for (const width of [1600, 768, 767, 600, 375, 320, 1600]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.locator(".main-shell").evaluate(async el => {
        await Promise.all(el.getAnimations().map(a => a.finished.catch(() => {})));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      const compact = await page.locator(".editor-frame").getAttribute("data-mobile") === "true";
      const frame = (await page.locator(".editor-frame").boundingBox())!;
      const line = (await writer.locator("p").first().boundingBox())!;
      expect(line.x - frame.x).toBeCloseTo(frame.x + frame.width - line.x - line.width, 0);
      expect((await page.locator("#editor-title").boundingBox())!.x).toBeCloseTo(line.x, 0);
      if (kind === "course") expect((await page.getByRole("textbox", { name: "Lesson title", exact: true }).boundingBox())!.x).toBeCloseTo(line.x, 0);
      const back = page.getByRole("button", { name: "Back to content", exact: true });
      if (compact) await expect(page.locator(".editor-mobile-toolbar").getByRole("button", { name: "Back to content", exact: true })).toBeVisible();
      else expect(Math.abs((await back.locator("svg").boundingBox())!.x - line.x)).toBeLessThanOrEqual(2);
      if (compact) {
        await expect(page.locator(".editor-frame")).toHaveAttribute("data-cards", "true");
        await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toBeVisible();
        const toolbar = page.locator(".editor-mobile-toolbar");
        await expect(toolbar).toBeVisible();
        await expect(toolbar).toHaveCSS("position", "sticky");
        const bounds = (await toolbar.boundingBox())!;
        const controls = (await toolbar.locator(".editor-frame-controls").boundingBox())!;
        expect(controls.x).toBeGreaterThanOrEqual(0);
        expect(controls.x + controls.width).toBeLessThanOrEqual(width);
        expect(bounds.x + bounds.width / 2).toBeCloseTo(width / 2, 0);
        expect(controls.y).toBeGreaterThanOrEqual(bounds.y);
        expect(controls.y + controls.height).toBeLessThanOrEqual(bounds.y + bounds.height);
      } else {
        await expect(page.locator(".editor-frame")).not.toHaveAttribute("data-cards", "true");
        const navigation = page.getByRole("button", { name: "Open navigation", exact: true });
        if (width < 768) await expect(navigation).toBeVisible();
        else await expect(navigation).toBeHidden();
      }
      for (const [label, selector] of [["Code block", ".writing-code-block"], ["Image", '[data-editor-block-type="image"]'], ["Video", ".writing-media-block"], ["Table", ".writing-table-block"]]) {
        const block = writer.locator(selector).first();
        await block.scrollIntoViewIfNeeded();
        if (!compact) await block.hover();
        const actions = page.getByRole("button", { name: `${label} actions`, exact: true });
        await expect(actions).toBeInViewport({ ratio: 1 });
        const anchor = (await (label === "Table" ? block.locator("table") : block).boundingBox())!;
        const button = (await actions.boundingBox())!;
        expect(button.x + button.width).toBeLessThanOrEqual(anchor.x - 4);
        if (label === "Table") {
          // Established table placement leaves the top gutter clear of row handles.
          expect(button.y + button.height).toBeLessThanOrEqual(anchor.y);
          const row = (await page.getByRole("button", { name: "Row 1 actions and drag handle", exact: true }).boundingBox())!;
          expect(button.y + button.height).toBeLessThanOrEqual(row.y);
        } else expect(button.y).toBeCloseTo(anchor.y, 0);
        await actions.click();
        await expect(page.getByRole("menuitem", { name: `Remove ${label.toLowerCase()}`, exact: true })).toBeVisible();
        await page.keyboard.press("Escape");
        await expect(actions).toBeFocused();
      }
      if (width === 375 || width === 1600) await page.screenshot({ path: info.outputPath(`${kind}-block-gutters-${width}.png`), animations: "disabled" });
    }
    await page.setViewportSize({ width: 375, height: 1000 });
    await writer.locator(".writing-code-block").scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Code block actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Write after code block", exact: true }).click();
    await page.keyboard.insertText("A paragraph after the code.");
    await expect(writer).toContainText("A paragraph after the code.");
    await expect(writer.locator(".writing-code-block")).toHaveCount(1);
  });


test("new list markers and their caret stay in place through the first typed character", async ({ page }, info) => {
  await open(page, info.project.name.startsWith("production"), "doc", 2, item => { item.body = "Paragraph 1."; });
  const writer = page.locator('.writing-content[contenteditable="true"]');
  for (const command of ["Bulleted list", "Numbered list"]) {
    await writer.locator("p").last().click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("Enter");
    await expect(writer.locator("p").last()).toHaveText("");
    const insertionLine = (await writer.locator("p").last().boundingBox())!;
    await page.keyboard.press("/");
    await page.getByRole("menuitem", { name: command, exact: true }).click();
    const item = writer.locator(command === "Bulleted list" ? "ul > li" : "ol > li").last();
    await expect(item).toBeVisible();
    await waitForDraftSaved(page);
    const snapshot = () => item.evaluate(el => {
      const bounds = el.getBoundingClientRect();
      const marker = getComputedStyle(el, "::marker");
      const selection = getSelection();
      return { x: bounds.x, y: bounds.y, font: marker.fontSize, color: marker.color, selected: el.contains(selection?.anchorNode || null) };
    });
    const before = await snapshot();
    expect(before.selected).toBe(true);
    expect(before.y).toBeCloseTo(insertionLine.y, 0);
    await page.keyboard.type("A list item");
    const after = await snapshot();
    expect(after).toEqual(before);
    await expect(item).toHaveText("A list item");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.screenshot({ path: info.outputPath(`${command}-stable.png`), animations: "disabled" });
  }
});


test("every inserted block leaves a consistent noneditable gap before writing resumes", async ({ page }, info) => {
  await page.route("https://example.test/spacing.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="#e5e5e5"/></svg>' }));
  await page.route("https://www.youtube-nocookie.com/**", route => route.fulfill({ contentType: "text/html", body: "<html><body>Video preview</body></html>" }));
  await page.route("https://i.ytimg.com/**", route => route.fulfill({ status: 404, body: "" }));
  const body = "Paragraph 1.\n\n[Video](https://www.youtube.com/watch?v=dQw4w9WgXcQ)\n\nAfter video.\n\n```text\nCode example\n```\n\nAfter code.\n\n![Example](https://example.test/spacing.svg)\n\nAfter image.\n\n| One | Two |\n| --- | --- |\n| First | Second |\n\nAfter table.\n\n---\n\nAfter divider.";
  await open(page, info.project.name.startsWith("production"), "doc", 2, item => { item.body = body; });
  const writer = page.locator('.writing-content[contenteditable="true"]');
  for (const width of [1600, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const [selector, text] of [[".writing-media-block", "After video."], [".writing-code-block", "After code."], ['[data-editor-block-type="image"]', "After image."], [".writing-table-block", "After table."], ["hr", "After divider."]]) {
      const paragraph = writer.locator("p").filter({ hasText: text });
      await paragraph.scrollIntoViewIfNeeded();
      const block = writer.locator(selector).first();
      await expect(block).toBeVisible();
      const bounds = (await block.boundingBox())!;
      const line = (await paragraph.boundingBox())!;
      expect(line.y - bounds.y - bounds.height).toBeGreaterThanOrEqual(24);
      if (selector === ".writing-media-block") {
        expect(line.y - bounds.y - bounds.height).toBeCloseTo(24, 0);
        await page.screenshot({ path: info.outputPath(`video-writing-gap-${width}.png`), animations: "disabled" });
      }
    }
    await page.screenshot({ path: info.outputPath(`block-spacing-${width}.png`), animations: "disabled" });
  }
});

for (const kind of ["doc", "brief", "course"] as const) {
  test(`${kind}: headings retain their spacing before and after media blocks`, async ({ page }, info) => {
    await page.route("https://example.test/heading-spacing.svg", route => route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="#d8e5ed"/></svg>',
    }));
    await page.route("https://www.youtube-nocookie.com/**", route => route.fulfill({ contentType: "text/html", body: "<html><body>Video preview</body></html>" }));
    await page.route("https://i.ytimg.com/**", route => route.fulfill({ status: 404, body: "" }));
    const media = [
      ["image", "![Example](https://example.test/heading-spacing.svg)"],
      ["video", "[Video](https://www.youtube.com/watch?v=dQw4w9WgXcQ)"],
      ["code", "```text\nExample code\n```"],
      ["table", "| One | Two |\n| --- | --- |\n| A | B |"],
      ["divider", "---"],
    ] as const;
    const sections = media.flatMap(([label, markdown]) => Array.from({ length: 6 }, (_, index) => {
      const level = index + 1;
      const heading = `Heading ${label} H${level}`;
      return `Start ${label} H${level}.\n\n${markdown}\n\n${"#".repeat(level)} ${heading}\n\n${markdown}\n\nEnd ${label} H${level}.`;
    }));
    const body = `Paragraph 1.\n\n${sections.join("\n\n")}`;
    await open(page, info.project.name.startsWith("production"), kind, 2, item => {
      if (kind === "course") item.lessons[0].body = body;
      else item.body = body;
    });
    const writer = page.locator('.writing-content[contenteditable="true"]');
    await expect(writer.locator('img[alt="Example"]')).toHaveCount(12);
    await expect.poll(() => writer.locator('img[alt="Example"]').evaluateAll(images => images.every(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);
    for (const width of [1440, 375]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const [label] of media) for (let level = 1; level <= 6; level++) {
        const heading = writer.getByRole("heading", { name: `Heading ${label} H${level}`, exact: true });
        const geometry = await heading.evaluate(element => {
          const previous = element.previousElementSibling!;
          const next = element.nextElementSibling!;
          const bounds = element.getBoundingClientRect();
          return {
            before: bounds.top - previous.getBoundingClientRect().bottom,
            after: next.getBoundingClientRect().top - bounds.bottom,
            marginTop: getComputedStyle(element).marginTop,
            previous: previous.tagName,
            next: next.tagName,
          };
        });
        expect.soft(geometry.before, `${kind} ${label} -> H${level} at ${width}: ${JSON.stringify(geometry)}`).toBeGreaterThanOrEqual(level === 2 ? 48 : level <= 3 ? 32 : 24);
        expect.soft(geometry.after, `${kind} H${level} -> ${label} at ${width}: ${JSON.stringify(geometry)}`).toBeGreaterThanOrEqual(16);
      }
    }
  });
}

for (const style of ["Heading 1", "Heading 2", "Heading 3", "Heading 4", "Callout", "Bulleted list", "Numbered list"] as const) {
  test(`an image inserted in an empty ${style} keeps a writing line after its block`, async ({ page }, info) => {
    await page.route("https://example.test/styled-image.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="#d8e5ed"/></svg>' }));
    await open(page, info.project.name.startsWith("production"), "doc", 2, item => { item.body = "Paragraph 1."; });
    const writer = page.locator('.writing-content[contenteditable="true"]');
    await writer.locator("p").click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.press("/");
    await page.getByRole("menuitem", { name: style, exact: true }).click();
    await page.keyboard.press("/");
    await page.getByRole("menuitem", { name: "Image", exact: true }).click();
    const chooser = page.getByRole("dialog", { name: "Insert image", exact: true });
    await chooser.getByRole("button", { name: "Link", exact: true }).click();
    await chooser.getByRole("textbox", { name: "Image URL", exact: true }).fill("https://example.test/styled-image.svg");
    await chooser.getByRole("button", { name: "Insert image", exact: true }).click();
    const image = writer.locator('img[alt="Image"]');
    await expect(image).toBeVisible();
    const structure = await image.evaluate(element => {
      const root = element.closest(".writing-content")!;
      let block: Element = element;
      while (block.parentElement !== root) block = block.parentElement!;
      return { tag: block.tagName, next: block.nextElementSibling?.tagName, last: root.lastElementChild?.tagName };
    });
    expect(structure.next).toBe("P");
    expect(structure.last).toBe("P");
    const gap = await image.evaluate(element => {
      const root = element.closest(".writing-content")!;
      const media = element.closest('[data-editor-block-type="image"]')!;
      return root.lastElementChild!.getBoundingClientRect().top - media.getBoundingClientRect().bottom;
    });
    expect(gap).toBeCloseTo(24, 0);
    await writer.locator(":scope > p").last().click();
    await page.keyboard.type("After the image.");
    await expect(writer.locator(":scope > p").last()).toHaveText("After the image.");
    await waitForDraftSaved(page);
    expect((await downloadMarkdown(page)).body).toMatch(/Paragraph 1\.[\s\S]*!\[Image\]\([^\n]+\)[\s\S]*After the image\./);
  });
}

for (const direction of ["before", "after"] as const) for (const [style, tag] of [
  ["Normal Text", "P"], ["Heading 1", "H1"], ["Heading 2", "H2"], ["Heading 3", "H3"], ["Heading 4", "H4"],
  ["Callout", "BLOCKQUOTE"], ["Bulleted list", "UL"], ["Numbered list", "OL"],
] as const) test(`${style} commands ${direction} an image preserve media, prose and spacing`, async ({ page }, info) => {
  await page.route("https://example.test/heading-image.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="#d8e5ed"/></svg>' }));
  await open(page, info.project.name.startsWith("production"), "doc", 2, item => {
    item.body = "Paragraph 1.\n\n![Example](https://example.test/heading-image.svg)\n\nUntouched paragraph.";
  });
  const writer = page.locator('.writing-content[contenteditable="true"]');
  const image = writer.locator('img[alt="Example"]');
  await expect(image).toBeVisible();
  await image.evaluate((element, direction) => {
    const paragraph = element.closest("p")!;
    (paragraph.closest("[contenteditable]") as HTMLElement).focus();
    const range = document.createRange();
    range.setStart(paragraph, direction === "before" ? 0 : 1);
    range.collapse(true);
    window.getSelection()!.removeAllRanges();
    window.getSelection()!.addRange(range);
  }, direction);
  await page.keyboard.press("/");
  await page.getByRole("menuitem", { name: style, exact: true }).click();
  const marker = `Authored ${direction} ${style}.`;
  await page.keyboard.type(marker);
  const text = writer.getByText(marker, { exact: true });
  await expect(text).toBeVisible();
  const geometry = await text.evaluate((element, direction) => {
    const root = element.closest(".writing-content")!;
    let block = element;
    while (block.parentElement !== root) block = block.parentElement!;
    const media = root.querySelector('img[alt="Example"]')!.closest("p")!;
    const bounds = block.getBoundingClientRect(), imageBounds = media.getBoundingClientRect();
    return { tag: block.tagName, mediaTag: media.parentElement === root ? "P" : media.parentElement?.tagName,
      gap: direction === "before" ? imageBounds.top - bounds.bottom : bounds.top - imageBounds.bottom };
  }, direction);
  expect(geometry.tag).toBe(tag);
  expect(geometry.mediaTag).toBe("P");
  expect(geometry.gap).toBeGreaterThanOrEqual(direction === "before" ? 16 : style === "Heading 2" ? 48 : style === "Heading 1" || style === "Heading 3" ? 32 : 24);
  await expect(writer.locator(":scope > p").last()).toHaveText("Untouched paragraph.");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(image).toBeVisible();
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(text).toBeVisible();
  await waitForDraftSaved(page);
  const { body } = await downloadMarkdown(page);
  expect(body).toContain(marker);
  expect(body).not.toContain("## ![Example]");
});

test("inserting a table beside an image cannot discard that image", async ({ page }, info) => {
  await page.route("https://example.test/table-image.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="#d8e5ed"/></svg>' }));
  await open(page, info.project.name.startsWith("production"), "doc", 2, item => {
    item.body = "Paragraph 1.\n\n![Example](https://example.test/table-image.svg)\n\nUntouched paragraph.";
  });
  const writer = page.locator('.writing-content[contenteditable="true"]');
  const image = writer.locator('img[alt="Example"]');
  await expect(image).toBeVisible();
  await image.evaluate(element => {
    const paragraph = element.closest("p")!;
    (paragraph.closest("[contenteditable]") as HTMLElement).focus();
    const range = document.createRange();
    range.setStart(paragraph, 1); range.collapse(true);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  });
  await page.keyboard.press("/");
  await page.getByRole("menuitem", { name: "Table", exact: true }).click();
  await expect(writer.locator("table")).toBeVisible();
  await expect(image).toBeVisible();
  await expect(writer).toContainText("Untouched paragraph.");
  await waitForDraftSaved(page);
  const { body } = await downloadMarkdown(page);
  expect(body).toContain("![Example](https://example.test/table-image.svg)");
  expect(body).toContain("Untouched paragraph.");
});

test("inserting an image before an existing H2 preserves its separate heading and spacing", async ({ page }, info) => {
  await page.route("https://example.test/before-heading.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="#d8e5ed"/></svg>' }));
  await open(page, info.project.name.startsWith("production"), "doc", 2, item => {
    item.body = "Paragraph 1.\n\n## Bring a real situation\n\nUntouched paragraph.";
  });
  const writer = page.locator('.writing-content[contenteditable="true"]');
  const heading = writer.locator("h2");
  await heading.evaluate(element => {
    (element.closest("[contenteditable]") as HTMLElement).focus();
    const range = document.createRange(); range.selectNodeContents(element); range.collapse(true);
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range);
  });
  await page.keyboard.press("/");
  await page.getByRole("menuitem", { name: "Image", exact: true }).click();
  const chooser = page.getByRole("dialog", { name: "Insert image", exact: true });
  await chooser.getByRole("button", { name: "Link", exact: true }).click();
  await chooser.getByRole("textbox", { name: "Image URL", exact: true }).fill("https://example.test/before-heading.svg");
  await chooser.getByRole("button", { name: "Insert image", exact: true }).click();
  const image = writer.locator('img[alt="Image"]');
  await expect(image).toBeVisible();
  await expect(heading).toHaveText("Bring a real situation");
  expect(await image.evaluate(element => element.closest("h2"))).toBeNull();
  const picture = (await image.boundingBox())!;
  expect((await heading.boundingBox())!.y - picture.y - picture.height).toBeGreaterThanOrEqual(48);
  await waitForDraftSaved(page);
  expect((await downloadMarkdown(page)).body).toContain("\n\n## Bring a real situation");
});

test("formatting selected prose across an image leaves the media block unformatted", async ({ page }, info) => {
  await page.route("https://example.test/selected-image.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="#d8e5ed"/></svg>' }));
  await open(page, info.project.name.startsWith("production"), "doc", 2, item => {
    item.body = "Paragraph 1.\n\n![Example](https://example.test/selected-image.svg)\n\nAfter the image.";
  });
  const writer = page.locator('.writing-content[contenteditable="true"]');
  await writer.locator("p").first().click();
  await page.keyboard.press("ControlOrMeta+a");
  if (await page.getByRole("button", { name: "Format selected text", exact: true }).isVisible())
    await page.getByRole("button", { name: "Format selected text", exact: true }).click();
  const formatting = page.getByRole("dialog", { name: "Format selected text", exact: true });
  await formatting.getByRole("button", { name: "Normal Text", exact: true }).click();
  await page.getByRole("menuitem", { name: "Heading 2", exact: true }).click();
  await expect(writer.locator("h2")).toHaveCount(2);
  await expect(writer.locator("h2").first()).toHaveText("Paragraph 1.");
  await expect(writer.locator("h2").last()).toHaveText("After the image.");
  expect(await writer.locator('img[alt="Example"]').evaluate(element => element.closest("h2"))).toBeNull();
  await waitForDraftSaved(page);
  const { body } = await downloadMarkdown(page);
  expect(body).toContain("![Example](https://example.test/selected-image.svg)");
  expect(body).not.toContain("## ![Example]");
});

test("native select-all replacement removes the complete rich document", async ({ page }, info) => {
  await page.route("https://example.test/replace-image.svg", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="160"><rect width="320" height="160" fill="#d8e5ed"/></svg>' }));
  await open(page, info.project.name.startsWith("production"), "doc", 2, item => {
    item.body = "Paragraph 1.\n\n## A heading\n\n```text\nKeep this code\n```\n\n![Example](https://example.test/replace-image.svg)\n\n| One | Two |\n| --- | --- |\n| A | B |\n\nLast paragraph.";
  });
  const writer = page.locator('.writing-content[contenteditable="true"]');
  await expect(writer.locator('img[alt="Example"]')).toBeVisible();
  await expect(writer.locator("table")).toBeVisible();
  await expect(writer.locator(".cm-content")).toHaveText("Keep this code");
  await writer.locator(":scope > p").first().click();
  await page.keyboard.press("ControlOrMeta+a");
  await expect.poll(() => writer.evaluate(() => window.getSelection()?.toString())).toContain("Last paragraph.");
  await page.keyboard.insertText("Replacement document.");
  await expect(writer).toHaveText("Replacement document.");
  await expect(writer.locator("img, table, h2, .writing-code-block")).toHaveCount(0);
  await waitForDraftSaved(page);
  expect((await downloadMarkdown(page)).body).toBe("Replacement document.");
  await writer.click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(writer.locator("img")).toHaveCount(1);
  await expect(writer.locator("table")).toHaveCount(1);
  await expect(writer.locator("h2")).toHaveText("A heading");
});


test("a final video block retains a writing line below its reserved gap", async ({ page }, info) => {
  await page.route("https://www.youtube-nocookie.com/**", route => route.fulfill({ contentType: "text/html", body: "<html><body>Video preview</body></html>" }));
  await page.route("https://i.ytimg.com/**", route => route.fulfill({ status: 404, body: "" }));
  await open(page, info.project.name.startsWith("production"), "doc", 2, item => { item.body = "Paragraph 1."; });
  const writer = page.locator('.writing-content[contenteditable="true"]');
  await writer.locator("p").first().click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await expect(writer.locator("p").last()).toHaveText("");
  await page.keyboard.press("/");
  await page.getByRole("menuitem", { name: "Embed video link", exact: true }).click();
  const chooser = page.getByRole("dialog", { name: "Insert video", exact: true });
  await chooser.getByRole("textbox", { name: "Video URL", exact: true }).fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await chooser.getByRole("button", { name: "Insert video", exact: true }).click();
  await expect(chooser).toBeHidden();
  const block = writer.locator(".writing-media-block");
  await expect(block).toBeVisible();
  const line = writer.locator(":scope > p").last();
  await expect(line).toHaveText("");
  const gap = await writer.evaluate((element) => {
    const block = element.querySelector(".writing-media-block")!.getBoundingClientRect();
    const line = Array.from(element.querySelectorAll(":scope > p")).at(-1)!.getBoundingClientRect();
    return line.top - block.bottom;
  });
  expect(gap).toBeCloseTo(24, 0);
  await line.click();
  await page.keyboard.type("After the final video.");
  await waitForDraftSaved(page);
  const { body } = await downloadMarkdown(page);
  expect(body).toMatch(/Paragraph 1\.[\s\S]*\[Video\]\(https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ\)[\s\S]*After the final video\./);
});


test("mobile saving and saved use centered icons without unpublished-edit labels", async ({ page }, info) => {
  await open(page, info.project.name.startsWith("production"), "doc");
  const header = page.locator(".topbar");
  const status = header.locator('.editor-status-phrase');
  const compact = status.locator('.editor-status-compact');
  const wide = status.locator('.editor-status-wide');
  for (const width of [1440, 375, 768, 600]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator("#editor-title").fill(`Saved title at ${width}`);
    await expect(status).toHaveAttribute("data-save-state", "saving");
    await expect(header).not.toContainText("Unpublished");
    if (width < 768 || info.project.use.hasTouch && width < 1000) {
      await expect(wide).toBeHidden();
      await expect(compact.locator('svg')).toBeVisible();
      await expect(compact).toHaveText("");
      const icon = (await compact.boundingBox())!;
      const publish = (await header.getByRole("button", { name: "Publish", exact: true }).boundingBox())!;
      const badge = header.locator('.editor-save-status [data-slot="badge"]');
      await expect(badge).toBeVisible();
      const bounds = (await badge.boundingBox())!;
      expect(icon.y + icon.height / 2).toBeCloseTo(bounds.y + bounds.height / 2, 0);
      expect(icon.y + icon.height / 2).toBeCloseTo(publish.y + publish.height / 2, 0);
      const before = (await compact.boundingBox())!;
      await waitForDraftSaved(page);
      await expect(status).toHaveAttribute("data-save-state", "saved");
      expect((await compact.boundingBox())!.width).toBeCloseTo(before.width, 0);
      await expect(compact.locator('svg')).toBeVisible();
      await expect(compact).toHaveText("");
    } else {
      await expect(compact).toBeHidden();
      await expect(wide).toHaveText("Saving…");
      await waitForDraftSaved(page);
      await expect(wide).toHaveText("Saved");
    }
    await expect(header.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
    await page.screenshot({ path: info.outputPath(`save-icons-${width}.png`), animations: "disabled" });
  }
});

test("failed saves stay in the recovery alert and compact headers omit the failure", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("production"), "Controlled writes use the isolated installed-app fixture.");
  await open(page, true, "doc");
  const header = page.locator(".topbar");
  const status = header.locator('.editor-status-phrase');
  let mode: "hold" | "fail" | "pass" = "pass";
  let release: () => void = () => {};
  let pending: Promise<void> = Promise.resolve();
  let started = 0;
  await page.route("**/api/content*", async route => {
    if (route.request().method() !== "POST" || mode === "pass") return route.fallback();
    started++;
    if (mode === "hold") { await pending; return route.fallback(); }
    return route.fulfill({ status: 503, json: { error: "Synthetic save failure. Try again." } });
  });
  for (const width of [1440, 375]) {
    await page.setViewportSize({ width, height: 1000 });
    mode = "hold";
    pending = new Promise(resolve => { release = resolve; });
    const previous = started;
    await page.locator("#editor-title").fill(`Held draft at ${width}`);
    await expect.poll(() => started).toBeGreaterThan(previous);
    await expect(status).toHaveAttribute("data-save-state", "saving");
    const indicator = status.locator('.editor-status-compact');
    const before = width < 768 ? (await indicator.boundingBox())! : null;
    if (width < 768) await expect(indicator.locator('svg')).toBeVisible();
    mode = "pass";
    release();
    await waitForDraftSaved(page);
    if (before) expect((await indicator.boundingBox())!.width).toBeCloseTo(before.width, 0);
    mode = "fail";
    const details = page.getByRole("button", { name: "Details", exact: true });
    if (width < 768 && await details.getAttribute("aria-expanded") !== "true") await details.click();
    await page.locator("#editor-title").fill(`Retain this failed draft at ${width}`);
    const alert = page.locator('.editor').getByRole("alert");
    await expect(alert).toContainText("The save couldn’t be confirmed.");
    await alert.evaluate(async element => { await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))); });
    const panelGap = async () => {
      const pane = (await page.getByRole("complementary", { name: "Content details", exact: true }).boundingBox())!;
      const mobile = await page.locator(".editor-frame").getAttribute("data-mobile") === "true";
      const boundary = (await page.locator(mobile ? ".editor-mobile-overlays" : ".editor-canvas-navigation").boundingBox())!;
      return pane.y - boundary.y - (mobile ? 8 : 0);
    };
    if (width < 768) await expect.poll(panelGap).toBeCloseTo(0, 0);
    await expect(page.locator(".editor").getByRole("button", { name: "Retry saving", exact: true })).toBeEnabled();
    await expect(page.locator(".editor").getByRole("button", { name: "Download your changes", exact: true })).toBeEnabled();
    await expect(header.getByRole("alert")).toHaveCount(0);
    await expect(status).toHaveAttribute("data-save-state", "failed");
    if (width < 768) {
      await expect(status).toBeHidden();
      await expect(header.getByRole("status")).toHaveCount(0);
    } else await expect(status.locator('.editor-status-wide')).toHaveText("Changes not saved");
    await expect(header).not.toContainText("Unpublished");
    await expect(header.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
    await page.screenshot({ path: info.outputPath(`save-failure-${width}.png`), animations: "disabled" });
    // A mobile panel overlays the canvas. Its toolbar toggle must remain
    // reachable so authors can return to the save alert and recovery actions.
    if (await page.locator(".editor-frame").getAttribute("data-mobile") === "true") {
      await expect(details).toBeInViewport({ ratio: 1 });
      await details.click();
    }
    await alert.getByRole("button", { name: "Dismiss message", exact: true }).click();
    await expect(alert).toHaveCount(0);
    if (width < 768 && await details.getAttribute("aria-expanded") === "true") await expect.poll(panelGap).toBeCloseTo(0, 0);
    for (const name of ["Retry saving", "Download your changes"]) {
      const recovery = page.locator(".editor").getByRole("button", { name, exact: true });
      await expect(recovery).toBeInViewport({ ratio: 1 });
      expect(await recovery.evaluate(element => {
        const bounds = element.getBoundingClientRect();
        return element.contains(document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2));
      })).toBe(true);
    }
    await expect(page.locator(".editor").getByRole("button", { name: "Retry saving", exact: true })).toBeEnabled();
    await expect(page.locator(".editor").getByRole("button", { name: "Download your changes", exact: true })).toBeEnabled();
    await expect(header.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
    mode = "pass";
    await page.locator(".editor").getByRole("button", { name: "Retry saving", exact: true }).click();
    await waitForDraftSaved(page);
    await expect(alert).toHaveCount(0);
    await expect(status).toHaveAttribute("data-save-state", "saved");
    await expect(header.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
  }
});


test("source recovery keeps short-screen writing and retry available after notice dismissal", async ({ page }, info) => {
  const original = "Paragraph 1.\n\n<UnsupportedWidget custom=\"preserved\">Keep this exact source.</UnsupportedWidget>";
  await page.setViewportSize({ width: 1600, height: 500 });
  const { read } = await open(page, info.project.name.startsWith("production"), "doc", 2,
    item => { item.body = original; }, undefined, true);
  const details = page.getByRole("button", { name: "Details", exact: true });
  if (await details.getAttribute("aria-expanded") === "true") await details.click();
  const source = page.locator(".writing-source");
  await expect(source).toHaveValue(original);
  const notice = page.locator(".writing-editor-notice");
  const alert = notice.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(notice.getByRole("button", { name: "Retry visual editor", exact: true })).toBeEnabled();
  await alert.getByRole("button", { name: "Dismiss message", exact: true }).click();
  await expect(alert).toHaveCount(0);
  await expect(notice.getByRole("button", { name: "Retry visual editor", exact: true })).toBeEnabled();
  await expect(source).toHaveValue(original);
  await source.fill(original + "\n\nEdited in Markdown.");
  await waitForDraftSaved(page);
  expect((await read()).content[0].body).toBe(original + "\n\nEdited in Markdown.");
  await notice.getByRole("button", { name: "Retry visual editor", exact: true }).click();
  await expect(source).toBeVisible();
  await expect(source).toHaveValue(original + "\n\nEdited in Markdown.");
  await page.screenshot({ path: info.outputPath("short-source-recovery.png"), animations: "disabled" });
});


for (const kind of ["doc", "brief", "course"] as const) {
  test(`editor delete ${kind} shares list confirmation and preserves cancellation`, async ({ page }, info) => {
    const installed = info.project.name.startsWith("production");
    const { state, read } = await open(page, installed, kind);
    const item = state.content[0];
    const details = page.getByRole("complementary", { name: "Content details", exact: true });
    const toggle = page.getByRole("button", { name: "Details", exact: true });
    if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
    const remove = details.getByRole("button", { name: `Delete ${kind === "doc" ? "Doc" : kind === "course" ? "Course" : "Update"}`, exact: true });
    await expect(remove).toBeEnabled();
    await remove.scrollIntoViewIfNeeded();
    const placement = await remove.evaluate((button) => {
      const recovery = document.getElementById("writing-recovery")!;
      return {
        followsRecovery: !!(recovery.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING),
        divider: getComputedStyle(recovery).borderBottomStyle,
        lastButton: button === Array.from(button.closest('[aria-label="Content details"]')!.querySelectorAll("button")).at(-1),
      };
    });
    expect(placement).toEqual({ followsRecovery: true, divider: "solid", lastButton: true });
    // Native mouse focus differs by browser. Capture the actual pre-dialog
    // owner; separately verify keyboard activation returns to Delete below.
    const pointerReturn = await remove.evaluateHandle(button => {
      const captured: { element: Element | null } = { element: null };
      button.addEventListener("click", () => { captured.element = document.activeElement; }, { once: true });
      return captured;
    });
    await remove.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading")).toHaveText("Delete");
    const description = await dialog.locator("p").first().textContent();
    await expect(dialog).toContainText(`${item.title} can be restored for 30 days. After that, it and its related learning records are permanently erased.`);
    await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toBeDisabled();
    await dialog.getByRole("checkbox").check();
    await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toBeEnabled();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(() => pointerReturn.evaluate(({ element }) =>
      !!element?.isConnected && element === document.activeElement)).toBe(true);
    await pointerReturn.dispose();
    expect((await read()).content[0].id).toBe(item.id);
    await remove.focus();
    await remove.press("Enter");
    await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toBeDisabled();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(remove).toBeFocused();
    expect((await read()).content[0].id).toBe(item.id);
    await returnToContent(page);
    await page.getByRole("button", { name: `Actions for ${item.title}`, exact: true }).click();
    await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
    await expect(dialog.locator("p").first()).toHaveText(description!);
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("link", { name: item.title, exact: true }).click();
    await expect(page.locator('.writing-content[contenteditable="true"]')).toContainText("Paragraph 1.");
    await page.locator(".main-shell").evaluate(async (el) => {
      await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {})));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
    if (installed) {
      await page.route("**/api/admin/bulk", async (route) => {
        expect(route.request().postDataJSON()).toMatchObject({ entity: "content", operation: "delete", items: [{ id: item.id, expected: item.revision }] });
        state.content = [];
        state.publishedContent = [];
        await syncAuthoringProvider(page, state);
        await route.fulfill({ json: { results: [{ id: item.id, status: "changed" }] } });
      });
    }
    await remove.click();
    await dialog.getByRole("checkbox").check();
    await page.screenshot({ path: info.outputPath(`delete-${kind}-confirmation.png`) });
    await dialog.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.locator(".editor")).toHaveCount(0);
    await expect(page.getByRole("link", { name: item.title, exact: true })).toHaveCount(0);
    expect((await read()).content).toHaveLength(0);
    if (!installed) expect((await read()).deletedItems).toEqual([expect.objectContaining({ id: item.id, kind })]);
  });
}

test("editor delete failure retains the draft and uses the latest saved revision", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("production"), "Controlled deletion failures use the installed-app provider fixture.");
  const { state } = await open(page, true, "doc");
  const toggle = page.getByRole("button", { name: "Details", exact: true });
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  const remove = page.getByRole("button", { name: "Delete Doc", exact: true });
  let finishSave!: () => void;
  const saving = new Promise<void>((resolve) => { finishSave = resolve; });
  await page.route("**/api/content", async (route) => {
    await saving;
    await route.fallback();
  });
  await page.getByRole("textbox", { name: "Title", exact: true }).fill("Keep this edited draft");
  await expect(remove).toBeDisabled();
  await expect(page.locator(".editor-save-status [role=status] > .sr-only")).toHaveText("Saving…");
  await expect(remove).toBeDisabled();
  finishSave();
  await waitForDraftSaved(page);
  await expect(remove).toBeEnabled();
  await page.route("**/api/admin/bulk", async (route) => {
    expect(route.request().postDataJSON().items).toEqual([{ id: state.content[0].id, expected: 2 }]);
    await route.fulfill({ json: { results: [{ id: state.content[0].id, status: "failed", message: "Synthetic delete failure" }] } });
  });
  await remove.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue("Keep this edited draft");
  await expect(page.locator('[data-slot="alert"]')).toContainText("Synthetic delete failure");
  await expect(remove).toBeEnabled();
});

test.describe("mouse writing controls", () => {
  test.use({ hasTouch: false });
for (const width of [640, 767, 900, 1440]) {
  test(`mouse editor at ${width}px keeps desktop controls and contextual formatting`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await open(page, info.project.name.startsWith("production"), "doc");
    await expect(page.locator(".editor-mobile-toolbar")).toHaveCount(0);
    await expect(page.locator(".editor-canvas-navigation")).toBeVisible();
    await expect(page.locator(".editor-frame")).not.toHaveAttribute("data-cards", "true");
    await expect(page.getByRole("button", { name: "Back to content", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Commands:/ })).toBeHidden();
    const details = page.getByRole("button", { name: "Details", exact: true });
    await expect(details).toBeVisible();
    const writer = page.getByRole("textbox", { name: "Doc content", exact: true });
    await writer.fill("Keep desktop formatting");
    await writer.evaluate((element) => {
      const text = document.createTreeWalker(element.querySelector("p")!, NodeFilter.SHOW_TEXT).nextNode()!;
      const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 4);
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      element.dispatchEvent(new Event("pointerup", { bubbles: true }));
    });
    await expect(page.locator('[data-writing-selection-menu]')).toBeVisible();
    await page.locator('[data-writing-selection-menu]').getByRole("button", { name: "Bold", exact: true }).click();
    await expect(writer.locator("strong")).toHaveText("Keep");
    await page.screenshot({ path: info.outputPath(`mouse-editor-${width}.png`) });
  });
}

});

test("connecting a fine pointer removes mobile controls without remounting writing", async ({ browser }, info) => {
  const context = await browser.newContext({ baseURL: info.project.use.baseURL, hasTouch: true, viewport: { width: 640, height: 1000 } });
  try {
    const page = await context.newPage();
    // Model a device capability change; this does not prove physical attachment.
    await page.addInitScript(() => {
      const native = window.matchMedia.bind(window);
      const queries: { query: MediaQueryList; original: MediaQueryList; media: string }[] = [];
      let fine = false;
      window.matchMedia = (media) => {
        const original = native(media);
        if (!media.includes("any-pointer: fine")) return original;
        const query = new EventTarget() as MediaQueryList;
        Object.defineProperties(query, { media: { value: media }, matches: { get: () => !fine && original.matches } });
        queries.push({ query, original, media });
        return query;
      };
      (window as unknown as { setFinePointer: (value: boolean) => void }).setFinePointer = (value) => {
        fine = value;
        queries.forEach(({ query }) => query.dispatchEvent(new Event("change")));
      };
    });
    await open(page, info.project.name.startsWith("production"), "doc");
    const writer = page.getByRole("textbox", { name: "Doc content", exact: true });
    const mounted = await writer.elementHandle();
    await writer.fill("Preserve my writing");
    await page.getByRole("button", { name: /^Commands:/ }).tap();
    await expect(page.locator(".writing-slash-menu")).toBeVisible();
    await page.evaluate(() => (window as unknown as { setFinePointer: (value: boolean) => void }).setFinePointer(true));
    await expect(page.locator(".editor-mobile-toolbar")).toHaveCount(0);
    await expect(page.locator(".editor-frame")).not.toHaveAttribute("data-cards", "true");
    await expect(page.getByRole("button", { name: "Back to content", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Commands:/ })).toBeHidden();
    await expect(page.locator(".editor-canvas-navigation")).toBeVisible();
    await expect(page.locator(".writing-slash-menu")).toHaveCount(0);
    expect(await mounted!.evaluate((element) => element === document.querySelector('.writing-content[contenteditable="true"]'))).toBe(true);
    await expect(writer).toHaveText("Preserve my writing");
    await page.evaluate(() => (window as unknown as { setFinePointer: (value: boolean) => void }).setFinePointer(false));
    await expect(page.locator(".editor-mobile-toolbar")).toBeVisible();
    await expect(writer).toHaveText("Preserve my writing");
  } finally { await context.close(); }
});

for (const kind of ["doc", "brief", "course"] as const) {
  test(`${kind}: narrow desktop editing retains slash tools, formatting and history`, async ({ page }, info) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await open(page, info.project.name.startsWith("production"), kind, 2, (item) => {
      const body = "Paragraph 1. Keep this writing.";
      if (kind === "course") item.lessons[0].body = body;
      else item.body = body;
    });
    const writer = page.locator('.writing-content[contenteditable="true"]');
    const original = await writer.elementHandle();
    await writer.focus();
    await writer.press(process.platform === "darwin" ? "Meta+ArrowUp" : "Control+Home");
    await page.keyboard.insertText("Narrow desktop edit. ");
    await expect(writer).toContainText("Narrow desktop edit.");
    await writer.press("ControlOrMeta+z");
    await expect(writer).not.toContainText("Narrow desktop edit.");
    await writer.press("ControlOrMeta+Shift+z");
    await expect(writer).toContainText("Narrow desktop edit.");
    await writer.evaluate((element) => {
      const nodes = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let text: Node | null;
      while ((text = nodes.nextNode())) {
        const start = text.textContent!.indexOf("Narrow desktop edit.");
        if (start < 0) continue;
        const range = document.createRange(); range.setStart(text, start); range.setEnd(text, start + 6);
        const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
        element.dispatchEvent(new Event("pointerup", { bubbles: true }));
        break;
      }
    });
    await expect(page.locator("[data-writing-selection-menu]")).toBeVisible();
    await page.getByRole("button", { name: "Bold", exact: true }).click();
    await expect(writer.locator("strong")).toContainText("Narrow");
    await page.keyboard.press("Escape");
    await writer.press(process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End");
    await page.keyboard.press("Enter");
    await expect(writer.locator("p").last()).toHaveText("");
    await expect(writer.locator("p").last()).toBeInViewport({ ratio: 1 });
    await page.keyboard.type("/");
    await page.getByRole("menuitem", { name: "Heading 2", exact: true }).click();
    await page.keyboard.insertText("Narrow heading");
    await expect(writer.locator("h2")).toHaveText("Narrow heading");
    await page.setViewportSize({ width: 320, height: 900 });
    await expect(page.getByRole("button", { name: "Back to content", exact: true })).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: /^Commands:/ })).toBeHidden();
    expect(await original!.evaluate((node) => node.isConnected)).toBe(true);
    await expect(writer.locator("h2")).toHaveText("Narrow heading");
    const exported = await downloadMarkdown(page);
    expect(exported.body).toContain("**Narrow");
    expect(exported.body).toMatch(/^## (Narrow heading|\*\*Narrow heading\*\*)$/m);
    await waitForDraftSaved(page);
    await page.screenshot({ path: info.outputPath(`${kind}-narrow-desktop-edited.png`) });
  });
}

test("desktop code font and Quiz focus keep their existing layout", async ({ page }, info) => {
  test.skip(await page.evaluate(() => matchMedia("(any-pointer: coarse)").matches), "Mouse layout only");
  await page.setViewportSize({ width: 1600, height: 1000 });
  await open(page, info.project.name.startsWith("production"), "course", 1, item => {
    item.lessons = [{ id: "one", title: "First lesson", body: "Paragraph 1.\n\n```js\nconst value = 1;\n```" }];
    item.questions = [{ id: "desktop-one", prompt: "Choose", options: ["Yes", "No"], optionIds: ["yes", "no"], correctOptionIds: ["yes"] }];
  });
  await expect(page.getByRole("textbox", { name: "Code block", exact: true })).toHaveCSS("font-size", "13px");
  const outline = page.getByRole("button", { name: "Outline", exact: true });
  if (await outline.getAttribute("aria-expanded") !== "true") await outline.click();
  await page.getByRole("navigation", { name: "Edit course step", exact: true }).getByRole("button", { name: "Quiz", exact: true }).click();
  await page.getByRole("textbox", { name: "Question", exact: true }).click();
  await expect(page.locator(".course-quiz-focus-space")).toHaveCount(0);
});

test.describe("desktop Course title Return", () => {
  test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 1000 } });
  for (const populated of [false, true]) {
    test(`Course title Return continues through lesson title into ${populated ? "existing" : "empty"} writing`, async ({ page }, info) => {
      const { read } = await open(page, info.project.name.startsWith("production"), "course", 2, item => {
        if (!populated) item.lessons[0].body = "";
      });
      await expectCourseReturnChain(page, read, populated, false);
    });
  }
});

// These tests exercise native document layout and actual browser input. Resizing
// a browser viewport does not emulate an OS keyboard or establish device acceptance.
test.describe("native mobile editing", () => {
  test.use({ hasTouch: true, isMobile: true });

  async function settle(page: Page) {
    await page.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
  }

  async function fixture(page: Page, installed: boolean, options: { kind?: "doc" | "course"; code?: string; source?: boolean; empty?: boolean } = {}) {
    await page.setViewportSize({ width: 390, height: 844 });
    const body = options.empty ? "" : options.source ? "Paragraph 1.\n\n<UnsupportedWidget>Keep exact source.</UnsupportedWidget>"
      : Array.from({ length: 12 }, (_, i) => `Paragraph ${i + 1}. Keep the document and every useful word.`).join("\n\n")
        + `\n\n| Topic | Detail |\n| --- | --- |\n| First | A useful detail. |\n\n\`\`\`js\n${options.code ?? "const value = 1;"}\n\`\`\`\n\nLast paragraph for writing.`;
    const kind = options.kind ?? "course";
    const result = await open(page, installed, kind, 2, item => {
      item.body = body;
      if (kind === "course") {
        item.lessons = [{ id: "one", title: "First lesson", body }, { id: "two", title: "Second lesson", body: "Second lesson writing." }];
        item.questions = [{ id: "native-one", prompt: "Choose a useful response", options: ["Yes", "No"], optionIds: ["yes", "no"], correctOptionIds: ["yes"], explanation: "Keep this explanation." }];
      }
    }, undefined, options.source, true);
    await expect(page.locator(".app")).toHaveAttribute("data-mobile-editor", "true");
    return { ...result, writer: page.getByRole("textbox", { name: kind === "course" ? "Lesson content" : "Doc content", exact: true }) };
  }

  async function expectToolbar(page: Page) {
    const toolbar = page.locator(".editor-mobile-toolbar");
    await expect(toolbar).toBeVisible();
    await expect(page.locator(".editor-mobile-toolbar-slot")).toHaveCSS("position", "sticky");
    await expect(toolbar.getByRole("button", { name: "Back to content", exact: true })).toBeVisible();
    await expect.poll(() => toolbar.evaluate(element => {
      const box = element.getBoundingClientRect();
      const buttons = Array.from(element.querySelectorAll<HTMLButtonElement>(".editor-mobile-navigation button, .editor-frame-controls button"));
      return box.top >= -1 && box.bottom <= (visualViewport?.height ?? innerHeight) && buttons.length > 0 && buttons.every(button => {
        const rect = button.getBoundingClientRect();
        const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
        return rect.height >= 44 && rect.width >= 44 && rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1
          && rect.left >= 0 && rect.right <= innerWidth && (button.disabled || button.contains(hit));
      });
    })).toBe(true);
  }

  async function expectHitTarget(target: Locator) {
    await expect(target).toBeVisible();
    await expect.poll(() => target.evaluate(element => {
      const bounds = element.getBoundingClientRect();
      return bounds.width > 0 && bounds.height > 0 && bounds.left >= 0 && bounds.right <= innerWidth
        && bounds.top >= 0 && bounds.bottom <= innerHeight
        && element.contains(document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2));
    })).toBe(true);
  }

  async function nativeCaret(writer: Locator) {
    return writer.evaluate(node => {
      const selection = window.getSelection();
      if (!selection?.rangeCount || !selection.focusNode || !node.contains(selection.focusNode)) return null;
      const range = selection.getRangeAt(0).cloneRange();
      range.setStart(selection.focusNode, selection.focusOffset); range.collapse(true);
      let rect = Array.from(range.getClientRects()).find(rect => rect.height > 0);
      if (!rect && selection.focusNode instanceof Text && selection.focusNode.length) {
        const offset = Math.min(selection.focusOffset, selection.focusNode.length - 1);
        range.setStart(selection.focusNode, offset); range.setEnd(selection.focusNode, offset + 1);
        rect = range.getBoundingClientRect();
      }
      if (!rect && selection.focusNode instanceof Element) {
        // Safari returns no collapsed Range rect in a blank paragraph. Lexical
        // measures the child at the element offset, normally its trailing BR.
        const child = selection.focusNode.childNodes[selection.focusOffset];
        if (child instanceof Element) rect = child.getBoundingClientRect();
      }
      if (node.matches(".cm-content")) {
        // CodeMirror draws its caret separately, including in an empty line.
        // Focus and DOM selection must still belong to this exact native surface.
        const painted = node.closest(".cm-editor")?.querySelector(".cm-cursor")?.getBoundingClientRect();
        if (painted && painted.height > 0) rect = painted;
      }
      const toolbar = document.querySelector(".editor-mobile-toolbar")!.getBoundingClientRect();
      return { focused: document.activeElement === node, collapsed: selection.isCollapsed,
        text: selection.focusNode.textContent, offset: selection.focusOffset,
        top: rect?.top, bottom: rect?.bottom, toolbarBottom: toolbar.bottom, viewportBottom: visualViewport?.height ?? innerHeight };
    });
  }

  async function expectNativeCaretVisible(writer: Locator) {
    await expect.poll(async () => {
      const caret = await nativeCaret(writer);
      if (!caret?.focused || !caret.collapsed || caret.top === undefined || caret.bottom === undefined) return -Infinity;
      return Math.min(caret.top - caret.toolbarBottom, caret.viewportBottom - caret.bottom);
    }).toBeGreaterThanOrEqual(0);
  }

  for (const pan of [76, 50]) {
    test(`viewport pan ${pan}px keeps the toolbar and Commands in the visible area`, async ({ page }, info) => {
      const { writer } = await fixture(page, info.project.name.startsWith("production"), { kind: "doc", empty: true });
      await writer.tap();
      await expect(page.getByRole("button", { name: /^Commands:/ })).toBeEnabled();
      const mounted = await writer.elementHandle();
      const initial = await page.locator(".editor-mobile-toolbar").boundingBox();
      const scrollBefore = await page.evaluate(() => scrollY);
      await page.evaluate(pan => {
        const viewport = visualViewport!;
        Object.defineProperties(viewport, {
          height: { configurable: true, get: () => 358 },
          offsetTop: { configurable: true, get: () => CSS.supports("-webkit-backdrop-filter", "none") ? pan : 0 },
        });
        // Model the captured native pan in client coordinates. Desktop browser
        // emulation cannot produce the iOS keyboard's compositor movement.
        document.querySelector<HTMLElement>(".main-shell")!.style.transform = `translateY(-${pan}px)`;
        viewport.dispatchEvent(new Event("scroll"));
        viewport.dispatchEvent(new Event("resize"));
      }, pan);
      await expectToolbar(page);
      await expect.poll(async () => (await page.locator(".editor-mobile-toolbar").boundingBox())!.y).toBeCloseTo(Math.max(0, initial!.y - pan), 0);
      expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
      expect(await mounted!.evaluate(node => node === document.querySelector('.writing-content[contenteditable="true"]'))).toBe(true);
      await page.locator(".editor-mobile-toolbar").getByRole("button", { name: /^Commands:/ }).click();
      const commands = page.locator('.writing-slash-menu[data-mobile-palette="true"]');
      await expect(commands).toBeVisible();
      await expect.poll(async () => {
        const bounds = (await commands.boundingBox())!;
        return bounds.y + bounds.height;
      }).toBeLessThanOrEqual(358);
      await page.keyboard.press("Escape");
      await page.evaluate(() => {
        document.querySelector<HTMLElement>(".main-shell")!.style.removeProperty("transform");
        delete (visualViewport as unknown as { height?: number }).height;
        delete (visualViewport as unknown as { offsetTop?: number }).offsetTop;
        visualViewport!.dispatchEvent(new Event("resize"));
      });
      await expect.poll(async () => (await page.locator(".editor-mobile-toolbar").boundingBox())!.y).toBeCloseTo(initial!.y, 0);
    });

    test(`Return reveals blank lines with a ${pan}px visual viewport offset`, async ({ page }, info) => {
      const { writer } = await fixture(page, info.project.name.startsWith("production"), { kind: "doc" });
      await page.setViewportSize({ width: 390, height: 500 });
      await page.evaluate(pan => {
        // Supply desktop scroll range in place of native keyboard panning, then
        // replay the measured visible height/offset independently of layout size.
        const runway = document.createElement("div");
        runway.style.height = "500px";
        runway.inert = true;
        document.querySelector(".editor-frame")!.after(runway);
        Object.defineProperties(visualViewport!, {
          height: { configurable: true, get: () => 358 },
          offsetTop: { configurable: true, get: () => pan },
        });
        visualViewport!.dispatchEvent(new Event("resize"));
      }, pan);
      const last = writer.locator(":scope > p").last();
      await last.tap();
      await last.evaluate(node => {
        const range = document.createRange();
        range.selectNodeContents(node); range.collapse(false);
        const selection = window.getSelection()!;
        selection.removeAllRanges(); selection.addRange(range);
        document.dispatchEvent(new Event("selectionchange"));
      });
      for (let line = 0; line < 6; line++) await page.keyboard.press("Enter");
      const boundary = await page.evaluate(pan => {
        const webkit = CSS.supports("-webkit-backdrop-filter", "none");
        return 358 + (webkit ? 0 : pan) - parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom);
      }, pan);
      await expect.poll(async () => (await nativeCaret(writer))?.bottom ?? Infinity).toBeLessThanOrEqual(boundary + 1);
      await expect(writer.locator(":scope > p").last()).toBeEmpty();
    });
  }

  for (const kind of ["doc", "course"] as const) {
    test(`${kind}: one document scrolls past the header while the toolbar and editor remain usable`, async ({ page }, info) => {
      const { writer } = await fixture(page, info.project.name.startsWith("production"), { kind });
      const mounted = await writer.elementHandle();
      await page.evaluate(() => window.scrollTo(0, 0)); await settle(page);
      await page.screenshot({ path: info.outputPath(`${kind}-native-before-scroll.png`) });
      const last = writer.locator(":scope > p").last();
      await last.evaluate(node => node.scrollIntoView({ block: "center" })); await settle(page);
      expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
      const layout = await page.locator(".main-content").evaluate(main => ({
        scroll: main.scrollTop, overflow: getComputedStyle(main).overflowY,
        bodyPosition: getComputedStyle(document.body).position,
        appPosition: getComputedStyle(document.querySelector(".app")!).position,
        headerBottom: document.querySelector(".topbar")!.getBoundingClientRect().bottom,
      }));
      expect(layout.scroll).toBe(0);
      expect(["auto", "scroll"]).not.toContain(layout.overflow);
      expect(layout.bodyPosition).not.toBe("fixed"); expect(layout.appPosition).not.toBe("fixed");
      expect(layout.headerBottom).toBeLessThanOrEqual(0);
      await expectToolbar(page);
      await page.screenshot({ path: info.outputPath(`${kind}-native-after-scroll.png`) });
      await last.tap(); await page.keyboard.insertText(" Native input.");
      await expect(last).toContainText(" Native input.");
      expect(await mounted!.evaluate(node => node === document.querySelector('.writing-content[contenteditable="true"]'))).toBe(true);
      await waitForDraftSaved(page);
    });
  }

  for (const populated of [false, true]) {
    test(`title and lesson Return preserve immediate input with ${populated ? "existing" : "empty"} content`, async ({ page }, info) => {
      const { read } = await fixture(page, info.project.name.startsWith("production"), { empty: !populated });
      await expectCourseReturnChain(page, read, populated, true);
    });
  }

  test("table taps and Tab preserve each cell without widening the document", async ({ page }, info) => {
    const { writer, read } = await fixture(page, info.project.name.startsWith("production"));
    const cells = writer.locator('tbody td [contenteditable="true"]');
    await cells.first().tap(); await page.keyboard.insertText("cell-marker ");
    await page.keyboard.press("Tab"); await page.keyboard.insertText("next-marker ");
    await expect(cells.first()).toContainText("cell-marker");
    await expect(cells.nth(1)).toContainText("next-marker");
    await expect(cells.nth(1)).not.toContainText("cell-marker");
    await expect(page.locator('[data-writing-selection-menu]')).toHaveCount(0);
    await waitForDraftSaved(page);
    expect((await read()).content[0].lessons[0].body).toContain("cell-marker");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });

  for (const code of ["", "const value = 1;"]) {
    test(`${code ? "short" : "empty"} code takes direct native input and retains accessible touch sizing`, async ({ page }, info) => {
      await fixture(page, info.project.name.startsWith("production"), { code });
      const field = page.getByRole("textbox", { name: "Code block", exact: true });
      await field.tap(); await page.keyboard.insertText("// native edit\n");
      await expect(field).toContainText("// native edit");
      await expect(field).toBeFocused(); await expect(field).toHaveCSS("font-size", "16px");
      await page.evaluate(() => { document.documentElement.style.fontSize = "20px"; });
      await expect(field).toHaveCSS("font-size", "20px");
      expect(await page.locator('meta[name="viewport"]').getAttribute("content")).not.toMatch(/user-scalable=no|maximum-scale=1(?:,|$)/);
      expect((await downloadMarkdown(page)).body).toContain("// native edit");
    });
  }

  test("long code keeps its own scrollport and history while the document scrolls natively", async ({ page }, info) => {
    const code = Array.from({ length: 80 }, (_, i) => `const value${i} = ${i};`).join("\n");
    await fixture(page, info.project.name.startsWith("production"), { code });
    const field = page.getByRole("textbox", { name: "Code block", exact: true });
    await field.tap(); await field.press("ControlOrMeta+End");
    await expect.poll(() => page.locator(".cm-scroller").evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    await page.keyboard.insertText("\n// keep this edit");
    await expect(field).toContainText("// keep this edit");
    await field.press("ControlOrMeta+z"); await expect(field).not.toContainText("// keep this edit");
    await field.press("ControlOrMeta+Shift+z"); await expect(field).toContainText("// keep this edit");
    const port = await page.locator(".cm-scroller").evaluate(node => ({ client: node.clientHeight, content: node.scrollHeight }));
    expect(port.client).toBeLessThanOrEqual(384); expect(port.content).toBeGreaterThan(port.client);
  });

  test("a direct prose tap after code Markdown download moves the native selection before typing", async ({ page }, info) => {
    const { writer, read } = await fixture(page, info.project.name.startsWith("production"));
    const code = page.getByRole("textbox", { name: "Code block", exact: true });
    await code.tap(); await page.keyboard.insertText("/* Before download */");
    await expect(code).toBeFocused();
    await expect.poll(() => code.evaluate(node => node.contains(window.getSelection()?.focusNode ?? null))).toBe(true);
    const codeBefore = (await code.textContent())!;
    const details = page.getByRole("button", { name: "Details", exact: true });
    await details.tap();
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download Markdown", exact: true }).tap();
    const downloaded = await pending;
    expect(downloaded.suggestedFilename()).toMatch(/\.md$/);
    await details.tap(); await expect(details).toHaveAttribute("aria-expanded", "false");
    const paragraph = writer.locator(":scope > p").last();
    await paragraph.tap();
    await expect(writer).toBeFocused();
    await expect.poll(() => paragraph.evaluate(node => {
      const selection = window.getSelection();
      return Boolean(selection?.isCollapsed && node.contains(selection.focusNode));
    })).toBe(true);
    await page.keyboard.insertText(" After download.");
    await expect(paragraph).toContainText(" After download.");
    await expect(code).toHaveText(codeBefore);
    await waitForDraftSaved(page);
    expect((await read()).content[0].lessons[0].body).toContain(" After download.");
  });

  test("native selection and manual document scrolling never open the desktop formatting bubble", async ({ page }, info) => {
    const { writer } = await fixture(page, info.project.name.startsWith("production"));
    const paragraph = writer.locator(":scope > p").last();
    await paragraph.tap();
    await paragraph.evaluate(node => {
      const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode()!;
      window.getSelection()!.setBaseAndExtent(text, 0, text, 4);
      node.dispatchEvent(new Event("pointerup", { bubbles: true }));
    });
    expect(await page.evaluate(() => getSelection()?.toString())).toBe("Last");
    await expect(page.locator('[data-writing-selection-menu], .writing-phone-format')).toHaveCount(0);
    await page.evaluate(() => window.scrollBy(0, -150)); await settle(page);
    const chosen = await page.evaluate(() => window.scrollY);
    await page.evaluate(async () => { for (let i = 0; i < 8; i++) await new Promise(requestAnimationFrame); });
    expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(chosen, 0);
    expect(await page.evaluate(() => getSelection()?.toString())).toBe("Last");
    await expectToolbar(page);
  });

  for (const surface of ["prose", "table"] as const) {
    test(`${surface}: Commands formats the native selection and offers a working link action`, async ({ page }, info) => {
      const errors: string[] = [];
      page.on("pageerror", error => errors.push(error.message));
      const { writer, read } = await fixture(page, info.project.name.startsWith("production"));
      const target = surface === "table" ? writer.locator('tbody td [contenteditable="true"]').first() : writer.locator(":scope > p").first();
      const original = (await target.textContent())!;
      const word = original.slice(0, 4);
      const commands = page.getByRole("button", { name: /^Commands:/ });
      const menu = page.getByRole("menu", { name: "Insert content", exact: true });
      async function selectAndOpen() {
        await target.tap();
        await target.evaluate(node => {
          const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode()!;
          window.getSelection()!.setBaseAndExtent(text, 0, text, 4);
          document.dispatchEvent(new Event("selectionchange"));
        });
        await settle(page);
        expect(await page.evaluate(() => getSelection()?.toString())).toBe(word);
        await expect(page.locator('[data-writing-selection-menu]')).toHaveCount(0);
        await expect(commands).toBeEnabled(); await commands.tap();
        await expect(menu).toBeVisible();
        for (const name of ["Bold", "Italic", "Strikethrough", "Inline code", "Link"])
          await expect(menu.getByRole("menuitem", { name, exact: true })).toBeVisible();
        if (surface === "table") {
          await expect(menu.locator(".writing-slash-options").getByRole("menuitem")).toHaveCount(5);
          for (const name of ["Heading 2", "Table", "Code block", "Image", "Upload video"])
            await expect(menu.getByRole("menuitem", { name, exact: true })).toHaveCount(0);
        }
      }
      const struck = () => target.evaluate(node => {
        const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode();
        return Boolean(text?.parentElement && getComputedStyle(text.parentElement).textDecorationLine.includes("line-through"));
      });
      for (const [name, selector] of [["Bold", "strong"], ["Italic", "em"], ["Strikethrough", ""], ["Inline code", "code"]] as const) {
        await selectAndOpen(); await menu.getByRole("menuitem", { name, exact: true }).tap();
        if (name === "Strikethrough") await expect.poll(struck).toBe(true);
        else await expect(target.locator(selector)).toHaveText(word);
        await expect(target).toHaveText(original);
        await page.getByRole("button", { name: "Undo", exact: true }).tap();
        if (name === "Strikethrough") await expect.poll(struck).toBe(false);
        else await expect(target.locator(selector)).toHaveCount(0);
      }
      await selectAndOpen(); await menu.getByRole("menuitem", { name: "Link", exact: true }).tap();
      const link = page.getByRole("dialog", { name: "Edit link", exact: true });
      await link.getByRole("textbox", { name: "URL", exact: true }).fill("https://example.test/native-selection");
      await link.getByRole("button", { name: "Set URL", exact: true }).tap();
      await expect(target.locator('a[href="https://example.test/native-selection"]')).toHaveText(word);
      await page.keyboard.press("Escape"); await waitForDraftSaved(page);
      expect((await read()).content[0].lessons[0].body).toContain("https://example.test/native-selection");
      await expect(page.locator('[data-writing-selection-menu]')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
  }

  test("Commands insertion keeps the saved prose target and Undo Redo preserve neighboring content", async ({ page }, info) => {
    const { writer } = await fixture(page, info.project.name.startsWith("production"), { kind: "doc", empty: true });
    await writer.fill("Keep neighboring prose."); await writer.press("End"); await page.keyboard.press("Enter");
    await page.getByRole("button", { name: /^Commands:/ }).tap();
    await page.getByRole("menuitem", { name: "Code block", exact: true }).tap();
    const code = page.getByRole("textbox", { name: "Code block", exact: true });
    await code.tap(); await page.keyboard.insertText("const inserted = true;");
    await expect(writer.locator(":scope > p").first()).toHaveText("Keep neighboring prose.");
    await expect(code).toHaveText("const inserted = true;");
    await page.getByRole("button", { name: "Undo", exact: true }).tap();
    await expect(code).not.toHaveText("const inserted = true;");
    await page.getByRole("button", { name: "Redo", exact: true }).tap();
    await expect(code).toHaveText("const inserted = true;");
    const exported = await downloadMarkdown(page);
    expect(exported.body).toMatch(/Keep neighboring prose\.\n\n```[^\n]*\nconst inserted = true;\n```/);
  });

  test("panels and Commands are mutually exclusive and dismissal returns to the toolbar", async ({ page }, info) => {
    const { writer } = await fixture(page, info.project.name.startsWith("production"));
    const paragraph = writer.locator(":scope > p").last();
    await paragraph.tap(); const before = await paragraph.textContent();
    const details = page.getByRole("button", { name: "Details", exact: true });
    await details.tap();
    const panel = page.getByRole("complementary", { name: "Content details", exact: true });
    await expect(panel).toBeVisible();
    await page.keyboard.press("Tab"); await page.keyboard.press("Escape");
    await expect(panel).toBeHidden(); await expect(details).toBeFocused();
    await expect(writer).not.toBeFocused(); await expect(paragraph).toHaveText(before!);
    await paragraph.tap();
    const commands = page.getByRole("button", { name: /^Commands:/ });
    const menu = page.getByRole("menu", { name: "Insert content", exact: true });
    await commands.tap();
    await expect(menu).toBeVisible(); await expect(commands).toHaveAttribute("aria-expanded", "true");
    await commands.tap();
    await expect(menu).toHaveCount(0); await expect(commands).toHaveAttribute("aria-expanded", "false");
    await commands.tap(); await expect(menu).toBeVisible();
    await details.tap();
    await expect(panel).toBeVisible(); await expect(page.locator(".writing-slash-menu")).toHaveCount(0);
    await page.getByRole("button", { name: "Outline", exact: true }).tap();
    await expect(panel).toBeHidden();
    await expect(page.getByRole("complementary", { name: "Course outline", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Outline", exact: true })).toBeFocused();
    await paragraph.tap();
    await expect(commands).toBeEnabled();
    await commands.focus(); await page.keyboard.press("Enter");
    await expect(menu.getByRole("menuitem", { name: "Bold", exact: true })).toBeFocused();
    await page.keyboard.press("ArrowDown");
    await expect(menu.getByRole("menuitem", { name: "Italic", exact: true })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0); await expect(writer).toBeFocused();
    await expectToolbar(page);
  });

  test("native Back saves pending prose and restores navigation before the document is reopened", async ({ page }, info) => {
    const { writer, read, state } = await fixture(page, info.project.name.startsWith("production"), { kind: "doc" });
    const paragraph = writer.locator(":scope > p").last();
    await paragraph.tap(); await page.keyboard.insertText(" Saved by Back.");
    await expect(paragraph).toContainText(" Saved by Back.");
    const back = page.locator(".editor-mobile-toolbar").getByRole("button", { name: "Back to content", exact: true });
    await expectHitTarget(back); await back.tap();
    await expect(page.locator(".editor")).toHaveCount(0);
    await expect(page.locator(".app")).not.toHaveAttribute("data-mobile-editor", "true");
    await expect(page.locator(".editor-mobile-toolbar")).toHaveCount(0);
    expect((await read()).content[0].body).toContain(" Saved by Back.");
    expect((await read()).publishedContent![0].body).not.toContain(" Saved by Back.");
    await page.getByRole("link", { name: state.content[0].title, exact: true }).tap();
    await expect(page.locator(".app")).toHaveAttribute("data-mobile-editor", "true");
    await expect(writer).toContainText(" Saved by Back.");
    await expectToolbar(page);
    await expect(page.getByRole("button", { name: "Back to content", exact: true })).toBeEnabled();
  });

  test("search navigation and a link dialog keep their visible controls above the mobile toolbar", async ({ page }, info) => {
    const { writer } = await fixture(page, info.project.name.startsWith("production"));
    const mounted = await writer.elementHandle();
    await page.evaluate(() => window.scrollTo(0, 0)); await settle(page);
    const search = page.getByRole("button", { name: "Open search", exact: true });
    await expectHitTarget(search); await search.tap();
    const searchInput = page.getByRole("textbox", { name: "Search all content", exact: true });
    await expect(searchInput).toBeFocused(); await expectHitTarget(searchInput);
    await page.keyboard.press("Escape"); await expect(search).toBeFocused();
    const navigation = page.getByRole("button", { name: "Open navigation", exact: true });
    await expectHitTarget(navigation); await navigation.tap();
    const closeNavigation = page.getByRole("button", { name: "Close navigation", exact: true });
    await expectHitTarget(closeNavigation);
    await expectHitTarget(page.locator(".sidebar").getByRole("button", { name: "Account menu", exact: true }));
    await closeNavigation.tap(); await expect(page.locator(".sidebar")).not.toHaveClass(/\bopen\b/);
    const paragraph = writer.locator(":scope > p").last();
    await paragraph.tap();
    await paragraph.evaluate(node => {
      const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode()!;
      window.getSelection()!.setBaseAndExtent(text, 0, text, 4);
      document.dispatchEvent(new Event("selectionchange"));
    });
    await settle(page);
    const commands = page.getByRole("button", { name: /^Commands:/ });
    await expect(commands).toBeEnabled(); await commands.tap();
    await page.getByRole("menuitem", { name: "Link", exact: true }).tap();
    const dialog = page.getByRole("dialog", { name: "Edit link", exact: true });
    await expect(dialog).toBeVisible();
    await expectHitTarget(dialog.getByRole("textbox", { name: "URL", exact: true }));
    const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
    await expectHitTarget(cancel); await cancel.tap();
    await expect(dialog).toHaveCount(0);
    expect(await mounted!.evaluate(node => node.isConnected)).toBe(true);
    await expect(paragraph).toHaveText("Last paragraph for writing.");
    await expectToolbar(page);
  });

  test("repeated visible table header and body taps keep native selection visible without vertical jumps", async ({ page }, info) => {
    const { writer } = await fixture(page, info.project.name.startsWith("production"));
    const table = writer.locator("table");
    await table.evaluate(node => node.scrollIntoView({ block: "center" })); await settle(page);
    const header = table.locator('th [contenteditable="true"]').first();
    const body = table.locator('td [contenteditable="true"]').first();
    await expectHitTarget(header); await expectHitTarget(body);
    const scroll = await page.evaluate(() => window.scrollY);
    for (const cell of [header, body, header, body]) {
      await cell.tap();
      await expectNativeCaretVisible(cell); await settle(page);
      expect(await page.evaluate(() => window.scrollY)).toBeCloseTo(scroll, 0);
      await expectToolbar(page);
    }
  });

  test("media cancellation returns to prose without changing the saved insertion target", async ({ page }, info) => {
    const { writer } = await fixture(page, info.project.name.startsWith("production"));
    const paragraph = writer.locator(":scope > p").last();
    await paragraph.tap(); const before = await nativeCaret(writer);
    await page.getByRole("button", { name: /^Commands:/ }).tap();
    await page.getByRole("menuitem", { name: "Image", exact: true }).tap();
    const chooser = page.getByRole("dialog", { name: "Insert image", exact: true });
    await expect(chooser).toBeVisible();
    await chooser.getByRole("button", { name: "Cancel", exact: true }).tap();
    await expect(chooser).toHaveCount(0); await expect(writer).toBeFocused();
    const after = await nativeCaret(writer);
    expect([after?.text, after?.offset]).toEqual([before?.text, before?.offset]);
    await page.keyboard.insertText(" Resume writing.");
    await expect(paragraph).toContainText(" Resume writing.");
  });

  test("Quiz label focus saves edits and lesson navigation preserves the document", async ({ page }, info) => {
    const { read } = await fixture(page, info.project.name.startsWith("production"));
    const outline = page.getByRole("button", { name: "Outline", exact: true });
    await outline.tap();
    const steps = page.getByRole("navigation", { name: "Edit course step", exact: true });
    await steps.getByRole("button", { name: "Quiz", exact: true }).tap();
    const question = page.getByRole("textbox", { name: "Question", exact: true });
    await page.locator(".course-quiz-content label").filter({ hasText: /^Question$/ }).tap();
    await expect(question).toBeFocused(); await page.keyboard.insertText("Edited ");
    const explanation = page.getByRole("textbox", { name: "Explanation (optional)", exact: true });
    await explanation.tap(); await page.keyboard.insertText("More detail. ");
    await waitForDraftSaved(page);
    expect((await read()).content[0].questions[0].prompt).toContain("Edited");
    expect((await read()).content[0].questions[0].explanation).toContain("More detail.");
    await outline.tap(); await steps.getByRole("button", { name: /Second lesson/ }).tap();
    await expect(page.getByRole("textbox", { name: "Lesson content", exact: true })).toHaveText("Second lesson writing.");
    await outline.tap(); await steps.getByRole("button", { name: /First lesson/ }).tap();
    await expect(page.getByRole("textbox", { name: "Lesson content", exact: true })).toContainText("Paragraph 1.");
  });

  test("Markdown source remains editable downloadable and recoverable in native flow", async ({ page }, info) => {
    const { writer } = await fixture(page, info.project.name.startsWith("production"), { source: true });
    const source = page.locator(".writing-source");
    await source.tap(); await source.fill("Paragraph 1. Recovered native writing.");
    expect((await downloadMarkdown(page)).body).toBe("Paragraph 1. Recovered native writing.");
    await page.getByRole("button", { name: "Retry visual editor", exact: true }).tap();
    await expect(writer).toHaveText("Paragraph 1. Recovered native writing.");
    await expect(source).toHaveCount(0);
  });

  test("a 250px browser viewport keeps the final native caret reachable", async ({ page }, info) => {
    const { writer } = await fixture(page, info.project.name.startsWith("production"));
    await page.setViewportSize({ width: 390, height: 250 });
    const paragraph = writer.locator(":scope > p").last();
    await paragraph.evaluate(node => node.scrollIntoView({ block: "center" }));
    await paragraph.tap(); await page.keyboard.insertText(" Small viewport.");
    await expectNativeCaretVisible(writer);
    await expectToolbar(page);
    await expect(paragraph).toContainText(" Small viewport.");
  });

  for (const kind of ["empty", "short", "internally scrolled"] as const) {
    test(`${kind} code keeps its native caret visible at 250px through typing and Return`, async ({ page }, info) => {
      const code = kind === "empty" ? "" : kind === "short" ? "const value = 1;"
        : Array.from({ length: 80 }, (_, index) => `const value${index} = ${index};`).join("\n");
      await fixture(page, info.project.name.startsWith("production"), { code });
      await page.setViewportSize({ width: 390, height: 250 });
      const field = page.getByRole("textbox", { name: "Code block", exact: true });
      const port = page.locator(".writing-code-block .cm-scroller");
      await field.evaluate(node => node.scrollIntoView({ block: "center" }));
      await field.tap();
      if (kind === "internally scrolled") {
        await field.press("ControlOrMeta+End");
        await expect.poll(() => port.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
      }
      await expectNativeCaretVisible(field);
      await page.keyboard.insertText(" native250");
      await expectNativeCaretVisible(field);
      await page.keyboard.press("Enter");
      await page.keyboard.insertText("continued250");
      await expectNativeCaretVisible(field);
      await expect(field).toContainText("continued250");
      await expectToolbar(page);
      await page.screenshot({ path: info.outputPath(`${kind.replaceAll(" ", "-")}-code-native-250.png`) });
    });
  }

  for (const rootSize of [20, 32]) {
    test(`320px with ${rootSize}px root typography retains every 44px toolbar target without widening the page`, async ({ page }, info) => {
      const { writer } = await fixture(page, info.project.name.startsWith("production"));
      await page.setViewportSize({ width: 320, height: 640 });
      await page.evaluate(size => { document.documentElement.style.fontSize = `${size}px`; }, rootSize);
      const paragraph = writer.locator(":scope > p").last();
      await paragraph.evaluate(node => node.scrollIntoView({ block: "center" }));
      await paragraph.tap(); await page.keyboard.insertText(" Enlarged writing.");
      await expectToolbar(page);
      const toolbar = page.locator(".editor-mobile-toolbar");
      const controls = toolbar.getByRole("group", { name: "Editor controls", exact: true });
      await expect(controls.getByRole("button")).toHaveCount(5);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole("button", { name: /^Commands:/ }).tap();
      await expect(page.getByRole("menu", { name: "Insert content", exact: true })).toBeVisible();
      await page.keyboard.press("Escape");
      await expectToolbar(page);
      const codeHeader = page.locator(".writing-code-block .code-block-header");
      await codeHeader.evaluate(node => node.scrollIntoView({ block: "center" })); await settle(page);
      const language = codeHeader.getByRole("combobox", { name: "Code language", exact: true });
      const copy = codeHeader.getByRole("button", { name: "Copy code", exact: true });
      await expectHitTarget(language); await expectHitTarget(copy);
      const languageBounds = (await language.boundingBox())!;
      const copyBounds = (await copy.boundingBox())!;
      for (const bounds of [languageBounds, copyBounds]) {
        expect(bounds.width).toBeGreaterThanOrEqual(44);
        expect(bounds.height).toBeGreaterThanOrEqual(44);
      }
      expect(languageBounds.x + languageBounds.width).toBeLessThanOrEqual(copyBounds.x);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await expectToolbar(page);
      await page.screenshot({ path: info.outputPath(`native-toolbar-320-root${rootSize}.png`) });
    });
  }

  test("portrait tablet and landscape transitions preserve the same editor and history", async ({ page }, info) => {
    const { writer } = await fixture(page, info.project.name.startsWith("production"));
    const mounted = await writer.elementHandle();
    await writer.fill("Keep the same editor.");
    await page.setViewportSize({ width: 834, height: 1194 });
    await expect(page.locator(".app")).toHaveAttribute("data-mobile-editor", "true");
    await expect(page.locator(".editor-mobile-toolbar")).toBeVisible();
    await page.setViewportSize({ width: 1194, height: 834 });
    await expect(page.locator(".app")).not.toHaveAttribute("data-mobile-editor", "true");
    await expect(page.locator(".editor-mobile-toolbar")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Back to content", exact: true })).toBeVisible();
    expect(await mounted!.evaluate(node => node === document.querySelector('.writing-content[contenteditable="true"]'))).toBe(true);
    await writer.press("ControlOrMeta+z"); await expect(writer).toContainText("Paragraph 1.");
    await writer.press("ControlOrMeta+Shift+z"); await expect(writer).toHaveText("Keep the same editor.");
    await page.setViewportSize({ width: 834, height: 1194 });
    await expect(page.locator(".app")).toHaveAttribute("data-mobile-editor", "true");
    await expect(page.locator('[data-writing-selection-menu]')).toHaveCount(0);
  });
});
