import { test, expect, type Page } from "@playwright/test";
import type { Content } from "../../lib/types";
import { freshWorkspace } from "../../lib/store";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import {
  authoringUser,
  setupAuthoringProvider,
  syncAuthoringProvider,
} from "./provider-fixture";
import { downloadMarkdown, waitForDraftSaved } from "./editor-helpers";

async function open(
  page: Page,
  installed: boolean,
  kind: "doc" | "brief" | "course",
  lessonCount = 2,
  prepare?: (item: Content) => void,
  prepareWorkspace?: (state: ReturnType<typeof freshWorkspace>) => void,
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
    await page.addInitScript((data) => {
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    }, state);
  await page.goto(installed ? `/admin/content/${item.id}/edit` : "/#admin");
  if (!installed)
    await page.getByRole("link", { name: item.title, exact: true }).click();
  await expect(
    page.locator('.writing-content[contenteditable="true"]'),
  ).toContainText("Paragraph 1.");
  await expect(page.locator('.writing-content[contenteditable="true"]')).toBeInViewport();
  await expect(page.locator(".app")).toHaveClass(/sidebar-collapsed/);
  await page.locator(".main-shell").evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {})));
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  return {
    read: async () =>
      installed
        ? state
        : await page.evaluate(() =>
            JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
          ),
  };
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
      await expect.poll(async () => (await firstLine.boundingBox())!.width).toBeCloseTo(Math.min(704, available - (compact ? 0 : 148)), 0);
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

test("balanced phone padding keeps table actions clear of authored cells", async ({ page }, info) => {
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
  expect(button.y + button.height).toBeLessThanOrEqual(table.y + 1);
  await actions.click();
  await expect(page.getByRole("menuitem", { name: "Remove table", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.screenshot({ path: info.outputPath("phone-table-actions.png") });
});

test("writing buttons follow phone width and portrait touch-tablet orientation", async ({ page }, info) => {
  await page.setViewportSize({ width: 1024, height: 1366 });
  await open(page, info.project.name.startsWith("production"), "course");
  const controls = page.getByRole("button", { name: "Commands: insert blocks or format selected text", exact: true });
  if (info.project.use.hasTouch) await expect(controls).toBeVisible(); else await expect(controls).toBeHidden();
  await page.setViewportSize({ width: 1180, height: 820 });
  await expect(controls).toBeHidden();
  await page.setViewportSize({ width: 600, height: 900 });
  await expect(controls).toBeVisible();
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
    await page.setViewportSize({ width: 900, height: 700 });
    await expect(panel).toHaveCount(0);
    await expect(input).toHaveValue(query);
    await page.setViewportSize({ width: 600, height: 900 });
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toHaveCount(0);
  }
  await trigger.click();
  await expect(input).toHaveValue("context");
});

test("editor controls and app navigation share the compact layout boundary", async ({ page }, info) => {
  await open(page, info.project.name.startsWith("production"), "course");
  const writer = page.locator('.writing-content[contenteditable="true"]');
  const original = await writer.elementHandle();
  const outline = page.getByRole("button", { name: "Outline", exact: true });
  const details = page.getByRole("button", { name: "Details", exact: true });
  for (const width of [375, 767, 768, 1024, 1279, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.locator(".main-shell").evaluate(async (el) => {
      await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {})));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const compact = width <= 767 || (!!info.project.use.hasTouch && width < 900);
    const mobile = compact;
    const navigation = page.getByRole("button", { name: "Open navigation", exact: true });
    const search = page.getByRole("button", { name: "Open search", exact: true });
    if (compact) {
      await expect(navigation).toBeVisible();
      await expect(search).toBeVisible();
      await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toBeHidden();
    } else {
      await expect(navigation).toBeHidden();
      await expect(search).toBeHidden();
      await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toBeVisible();
    }
    if (mobile) await expect(page.locator(".editor-frame")).toHaveAttribute("data-cards", "true");
    else await expect(page.locator(".editor-frame")).not.toHaveAttribute("data-cards", "true");
    if (mobile) {
      const command = page.getByRole("button", { name: "Commands: insert blocks or format selected text", exact: true });
      const showControls = compact;
      if (showControls) await expect(command).toBeVisible(); else await expect(command).toBeHidden();
      const row = (await page.locator(".editor-frame-controls").boundingBox())!;
      const back = (await page.getByRole("button", { name: "Back to content", exact: true }).boundingBox())!;
      expect(back.y + back.height).toBeLessThanOrEqual(row.y);
      expect(row.y).toBeLessThan(200);
      await page.screenshot({ path: info.outputPath(`mobile-canvas-${width}.png`) });
      if (await outline.getAttribute("aria-expanded") !== "true") await outline.click();
      await page.screenshot({ path: info.outputPath(`mobile-outline-${width}.png`) });
      const canvas = (await page.locator(".editor-frame-canvas").boundingBox())!;
      const panel = page.getByRole("complementary", { name: "Course outline", exact: true });
      const box = (await panel.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(row.y + row.height + 7);
      expect(box.width).toBeCloseTo(320, 0);
      expect(box.x).toBeCloseTo((await outline.boundingBox())!.x, 0);
      if (showControls) await expect(command).toBeVisible(); else await expect(command).toBeHidden();
      const bothFit = (await page.locator(".editor-frame").boundingBox())!.width >= 656;
      await details.click();
      await expect(outline).toHaveAttribute("aria-expanded", bothFit ? "true" : "false");
      expect((await page.locator(".editor-frame-canvas").boundingBox())!.width).toBeCloseTo(canvas.width, 0);
      if (!bothFit) {
        await outline.click();
        await expect(details).toHaveAttribute("aria-expanded", "false");
        await details.click();
        await expect(outline).toHaveAttribute("aria-expanded", "false");
      }
      const detailBox = (await page.getByRole("complementary", { name: "Content details", exact: true }).boundingBox())!;
      expect(detailBox.y).toBeGreaterThanOrEqual(row.y + row.height + 7);
      const detailToggle = (await details.boundingBox())!;
      expect(detailBox.x + detailBox.width).toBeCloseTo(detailToggle.x + detailToggle.width, 0);
      await page.screenshot({ path: info.outputPath(`mobile-overlays-${width}.png`) });
      await details.click();
      if (await outline.getAttribute("aria-expanded") === "true") await outline.click();
      if (compact) {
        await navigation.click();
        await expect(page.getByRole("button", { name: "Close navigation", exact: true })).toBeVisible();
        await page.getByRole("button", { name: "Close navigation", exact: true }).click();
      }
    } else {
      await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toBeHidden();
      await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Commands: insert blocks or format selected text", exact: true })).toBeHidden();
    }
    expect(await original!.evaluate((node) => node.isConnected)).toBe(true);
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

test("mobile writing actions stay usable with the outline open", async ({ page }, info) => {
  await page.setViewportSize({ width: 600, height: 900 });
  await open(page, info.project.name.startsWith("production"), "course");
  const writer = page.locator('.writing-content[contenteditable="true"]');
  await page.getByRole("textbox", { name: "Lesson title", exact: true }).press("Enter");
  await page.keyboard.insertText("Keep this new paragraph.");
  await expect(writer).toContainText("Keep this new paragraph.");
  await page.getByRole("button", { name: "Outline", exact: true }).click();
  const undo = page.getByRole("button", { name: "Undo", exact: true });
  const redo = page.getByRole("button", { name: "Redo", exact: true });
  await expect(undo).toBeEnabled();
  if (info.project.use.hasTouch) await undo.tap(); else await undo.click();
  await expect(writer).not.toContainText("Keep this new paragraph.");
  await expect(redo).toBeEnabled();
  if (info.project.use.hasTouch) await redo.tap(); else await redo.click();
  await expect(writer).toContainText("Keep this new paragraph.");
  const commands = page.getByRole("button", { name: "Commands: insert blocks or format selected text", exact: true });
  if (info.project.use.hasTouch) await commands.tap(); else await commands.click();
  await expect(page.getByRole("menuitem", { name: "Heading 2", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Outline", exact: true })).toHaveAttribute("aria-expanded", "true");
});

test("small-screen search opens a full field and restores its trigger on Escape", async ({ page }, info) => {
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
});

for (const kind of ["doc", "brief", "course"] as const)
  test(`${kind}: canvas back navigation remains above the pinned heading`, async ({ page }, info) => {
    await open(page, info.project.name.startsWith("production"), kind);
    const back = page.getByRole("button", { name: "Back to content", exact: true });
    await expect(page.locator(".topbar").getByRole("button", { name: "Back to content", exact: true })).toHaveCount(0);
    const start = (await back.boundingBox())!;
    const title = page.locator("#editor-title");
    expect((await title.boundingBox())!.y).toBeGreaterThan(start.y + start.height);
    if (await page.locator(".editor-frame").getAttribute("data-cards") !== "true")
      expect(Math.abs((await back.locator("svg").boundingBox())!.x - (await title.boundingBox())!.x)).toBeLessThanOrEqual(2);
    if (await page.locator(".editor-frame").getAttribute("data-cards") !== "true") {
      expect((await page.getByRole("button", { name: "Details", exact: true }).boundingBox())!.y).toBeCloseTo(start.y, 0);
      if (kind === "course") expect((await page.getByRole("button", { name: "Outline", exact: true }).boundingBox())!.y).toBeCloseTo(start.y, 0);
    }
    await page.locator(".editor").evaluate((el) => {
      const owner = el.getAttribute("data-scroll-layout") === "workspace" ? el.querySelector(".writing-viewport")! : el.closest(".main-content")!;
      owner.scrollTop = 450;
    });
    await expect.poll(async () => (await back.boundingBox())!.y).toBeCloseTo(start.y, 0);
    const pinnedTitle = kind === "course" ? page.getByRole("textbox", { name: "Lesson title", exact: true }) : title;
    const pinned = (await pinnedTitle.boundingBox())!;
    expect(pinned.y).toBeGreaterThanOrEqual(start.y + start.height);
    if (kind === "course") await expect(title).not.toBeInViewport();
    await page.locator(".editor").evaluate((el) => {
      const owner = el.getAttribute("data-scroll-layout") === "workspace" ? el.querySelector(".writing-viewport")! : el.closest(".main-content")!;
      owner.scrollTop += 200;
    });
    await expect.poll(async () => (await pinnedTitle.boundingBox())!.y).toBeCloseTo(pinned.y, 0);
    await expect(back).toBeInViewport();
    await page.screenshot({ path: info.outputPath(`${kind}-canvas-back.png`) });
    if (kind === "course") {
      const outline = page.getByRole("button", { name: "Outline", exact: true });
      if (await outline.getAttribute("aria-expanded") === "false") await outline.click();
      await page.getByRole("button", { name: /^Quiz/ }).click();
      await expect(page.getByRole("heading", { name: "Quiz", exact: true })).toBeVisible();
      if (await page.locator(".editor-frame").getAttribute("data-cards") !== "true")
      expect(Math.abs((await back.locator("svg").boundingBox())!.x - (await title.boundingBox())!.x)).toBeLessThanOrEqual(2);
      await expect(back).toBeInViewport();
    }
    await back.click();
    await expect(page.locator(".editor")).toHaveCount(0);
  });

for (const kind of ["doc", "brief"] as const)
  test(`${kind}: app-header actions, stable canvas and pinned title`, async ({
    page,
  }, info) => {
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
  test.skip((page.viewportSize()?.width || 0) < 1280);
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
  test.skip((page.viewportSize()?.width || 0) < 1280);
  await open(page, info.project.name.startsWith("production"), "doc");
  const app = page.locator(".app");
  await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
  await expect(app).not.toHaveClass(/sidebar-collapsed/);
  await page.locator("#editor-title").focus();
  await expect(app).not.toHaveClass(/sidebar-collapsed/);
  await page.getByRole("button", { name: "Back to content", exact: true }).click();
  await page.getByRole("link", { name: "A clear place to write", exact: true }).click();
  await expect(app).toHaveClass(/sidebar-collapsed/);
  for (const kind of ["Doc", "Update", "Course"]) {
    await page.getByRole("button", { name: "Back to content", exact: true }).click();
    await page.getByRole("button", { name: "Expand sidebar", exact: true }).click();
    await page.getByRole("button", { name: kind, exact: true }).click();
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
    name: "Commands: insert blocks or format selected text",
    exact: true,
  });
  const extraControls = await page.evaluate(() => matchMedia("(width < 768px), (width < 1280px) and (pointer: coarse) and (orientation: portrait)").matches);
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
  if (await page.evaluate(() => matchMedia("(width < 768px), (width < 1280px) and (pointer: coarse) and (orientation: portrait)").matches))
    await page
      .getByRole("button", {
        name: "Commands: insert blocks or format selected text",
        exact: true,
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
        await page.getByRole("button", { name: "Back to content", exact: true }).focus();
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
  if (
    await page.evaluate(() => matchMedia("(width < 768px), (width < 1280px) and (pointer: coarse) and (orientation: portrait)").matches)
  )
    await page
      .getByRole("button", {
        name: "Commands: insert blocks or format selected text",
        exact: true,
      })
      .click();
  const tools = page.getByRole("dialog", {
    name: "Format selected text",
    exact: true,
  });
  await expect(tools).toBeVisible();
  await tools.getByRole("button", { name: "Normal Text", exact: true }).click();
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
        headings.push("Audience");
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
  await page.getByRole("button", { name: "Back to content", exact: true }).click();
  await page.getByRole("button", { name: "Course", exact: true }).click();
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
      const compact = width <= 767 || (!!info.project.use.hasTouch && width <= 900);
      const frame = page.locator(".editor-frame");
      const stacked = compact;
      if (stacked) await expect(frame).toHaveAttribute("data-cards", "true");
      else await expect(frame).not.toHaveAttribute("data-cards", "true");
      await page.locator(".editor").evaluate((el) => {
        el.closest(".main-content")!.scrollTop = 0;
        const writer = el.querySelector(".writing-viewport");
        if (writer) writer.scrollTop = 0;
      });
      await page.locator(".main-shell").evaluate(async (el) => {
        await Promise.all(el.getAnimations().map((animation) => animation.finished.catch(() => {})));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      });
      const start = (await back.boundingBox())!;
      if (!stacked) {
        await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toBeHidden();
        const detail = (await page.getByRole("button", { name: "Details", exact: true }).boundingBox())!;
        expect(detail.y + detail.height / 2).toBeCloseTo(start.y + start.height / 2, 0);
        if (width >= 1024) expect(Math.abs((await back.locator("svg").boundingBox())!.x - (await title.boundingBox())!.x)).toBeLessThanOrEqual(2);
        if (kind === "course") {
          const outline = (await page.getByRole("button", { name: "Outline", exact: true }).boundingBox())!;
          expect(outline.y + outline.height / 2).toBeCloseTo(start.y + start.height / 2, 0);
          expect(start.x).toBeGreaterThanOrEqual(outline.x + outline.width + 4);
        }
      }
      await page.locator(".editor").evaluate((el) => {
        const owner = el.getAttribute("data-scroll-layout") === "workspace" ? el.querySelector(".writing-viewport")! : el.closest(".main-content")!;
        owner.scrollTop = 450;
      });
      await expect(back).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole("button", { name: "Details", exact: true })).toBeInViewport({ ratio: 1 });
      if (kind === "course") await expect(page.getByRole("button", { name: "Outline", exact: true })).toBeInViewport({ ratio: 1 });
      await expect(pinned).toBeInViewport({ ratio: 1 });
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

test("course Quiz settings follow Audience, save the passing rule and hide without a quiz", async ({ page }, info) => {
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
  expect(headings.indexOf("Quiz")).toBe(headings.indexOf("Audience") + 1);
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
