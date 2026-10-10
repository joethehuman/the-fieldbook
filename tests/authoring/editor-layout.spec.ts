import { test, expect, type Page } from "@playwright/test";
import type { ElementNode, LexicalEditor, RangeSelection } from "lexical";
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
  if (source) {
    await expect(page.locator(".writing-source")).toBeVisible();
    await expect(page.locator(".writing-source")).toHaveValue(/Paragraph 1\./);
  } else {
    await expect(page.locator('.writing-content[contenteditable="true"]')).toContainText("Paragraph 1.");
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

test("balanced phone gutters keep table actions beside authored cells", async ({ page }, info) => {
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
  expect(button.y).toBeCloseTo(table.y, 0);
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

test("editor controls and app navigation retain the compact layout boundary", async ({ page }, info) => {
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
      // Search can independently become an icon when publication controls need space.
      await expect(page.getByRole("button", { name: "Expand sidebar", exact: true })).toBeVisible();
    }
    if (mobile) await expect(page.locator(".editor-frame")).toHaveAttribute("data-cards", "true");
    else await expect(page.locator(".editor-frame")).not.toHaveAttribute("data-cards", "true");
    if (mobile) {
      const command = page.getByRole("button", { name: "Commands: insert blocks or format selected text", exact: true });
      const showControls = compact;
      if (showControls) await expect(command).toBeVisible(); else await expect(command).toBeHidden();
      const row = (await page.locator(".editor-frame-controls").boundingBox())!;
      await expect(page.getByRole("button", { name: "Back to content", exact: true })).toBeHidden();
      const header = (await page.locator(".topbar").boundingBox())!;
      expect(row.y).toBeGreaterThan(header.y + header.height);
      expect(row.y + row.height).toBeCloseTo(page.viewportSize()!.height - 12, 0);
      expect(row.x + row.width / 2).toBeCloseTo(page.viewportSize()!.width / 2, 0);
      await page.screenshot({ path: info.outputPath(`mobile-canvas-${width}.png`) });
      if (await outline.getAttribute("aria-expanded") !== "true") await outline.click();
      await page.screenshot({ path: info.outputPath(`mobile-outline-${width}.png`) });
      const canvas = (await page.locator(".editor-frame-canvas").boundingBox())!;
      const panel = page.getByRole("complementary", { name: "Course outline", exact: true });
      const box = (await panel.boundingBox())!;
      expect(box.y).toBeGreaterThanOrEqual(header.y + header.height + 7);
      expect(box.y + box.height).toBeLessThanOrEqual(row.y - 7);
      expect(box.width).toBeCloseTo(320, 0);
      expect(box.x).toBeCloseTo(canvas.x, 0);
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
      expect(detailBox.y).toBeGreaterThanOrEqual(header.y + header.height + 7);
      expect(detailBox.y + detailBox.height).toBeLessThanOrEqual(row.y - 7);
      expect(detailBox.x + detailBox.width).toBeCloseTo(canvas.x + canvas.width, 0);
      await page.screenshot({ path: info.outputPath(`mobile-overlays-${width}.png`) });
      await details.click();
      if (await outline.getAttribute("aria-expanded") === "true") await outline.click();
      if (compact) {
        await navigation.click();
        await expect(page.getByRole("button", { name: "Close navigation", exact: true })).toBeVisible();
        await expect(page.locator('.editor-frame-controls[data-cards="true"]')).toBeHidden();
        await page.getByRole("button", { name: "Close navigation", exact: true }).click();
        await expect(page.locator('.editor-frame-controls[data-cards="true"]')).toBeVisible();
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
  test(`${kind}: canvas navigation keeps desktop Back and compact bottom-dock pinning`, async ({ page }, info) => {
    await open(page, info.project.name.startsWith("production"), kind);
    const back = page.getByRole("button", { name: "Back to content", exact: true });
    const title = page.locator("#editor-title");
    const pinnedTitle = kind === "course" ? page.getByRole("textbox", { name: "Lesson title", exact: true }) : title;
    const compact = await page.locator(".editor-frame").getAttribute("data-cards") === "true";
    const nav = page.locator(".editor-canvas-navigation");
    const start = (await (compact ? page.locator(".topbar") : nav).boundingBox())!;
    if (compact) {
      await expect(back).toHaveCount(0);
      await expect(nav).toHaveCount(0);
      const row = (await page.locator('.editor-frame-controls[data-cards="true"]').boundingBox())!;
      expect(row.y + row.height).toBeCloseTo(page.viewportSize()!.height - 12, 0);
    } else {
      await expect(back).toBeVisible();
      expect(Math.abs((await back.locator("svg").boundingBox())!.x - (await title.boundingBox())!.x)).toBeLessThanOrEqual(2);
    }
    expect((await title.boundingBox())!.y).toBeGreaterThanOrEqual(start.y + start.height);
    await page.locator(".editor").evaluate(el => {
      const owner = el.getAttribute("data-scroll-layout") === "workspace" ? el.querySelector(".writing-viewport")! : el.closest(".main-content")!;
      owner.scrollTop = 450;
    });
    const pinned = (await pinnedTitle.boundingBox())!;
    expect(pinned.y).toBeGreaterThanOrEqual((await (compact ? page.locator(".topbar") : nav).boundingBox())!.y + start.height);
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
      const start = stacked ? null : await back.boundingBox();
      if (stacked) await expect(back).toBeHidden();
      if (!stacked) {
        expect(start).not.toBeNull();
        await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toBeHidden();
        const detail = (await page.getByRole("button", { name: "Details", exact: true }).boundingBox())!;
        expect(detail.y + detail.height / 2).toBeCloseTo(start!.y + start!.height / 2, 0);
        if (width >= 1024) expect(Math.abs((await back.locator("svg").boundingBox())!.x - (await title.boundingBox())!.x)).toBeLessThanOrEqual(2);
        if (kind === "course") {
          const outline = (await page.getByRole("button", { name: "Outline", exact: true }).boundingBox())!;
          expect(outline.y + outline.height / 2).toBeCloseTo(start!.y + start!.height / 2, 0);
          expect(start!.x).toBeGreaterThanOrEqual(outline.x + outline.width + 4);
        }
      }
      await page.locator(".editor").evaluate((el) => {
        const owner = el.getAttribute("data-scroll-layout") === "workspace" ? el.querySelector(".writing-viewport")! : el.closest(".main-content")!;
        owner.scrollTop = 450;
      });
      if (stacked) await expect(back).toBeHidden();
      else await expect(back).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole("button", { name: "Details", exact: true })).toBeInViewport({ ratio: 1 });
      if (kind === "course") await expect(page.getByRole("button", { name: "Outline", exact: true })).toBeInViewport({ ratio: 1 });
      await expect(pinned).toBeInViewport({ ratio: 1 });
      const cover = await page.locator(stacked ? ".writing-document-heading" : ".editor-canvas-navigation").evaluate((nav) => {
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
        if (stacked) expect(cover.headingTop).toBeCloseTo(cover.viewportTop + 8, 0);
        else expect(cover.headingTop).toBeCloseTo(cover.bottom, 0);
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
    const nav = (await page.locator(width < 768 ? ".topbar" : ".editor-canvas-navigation").boundingBox())!;
    const pinned = (await page.locator(".course-quiz-canvas > .writing-document-heading").boundingBox())!;
    expect(pinned.y).toBeCloseTo(nav.y + nav.height + (width < 768 ? 8 : 0), 0);
    await page.locator(".editor").evaluate((el) => {
      const owner = el.getAttribute("data-scroll-layout") === "workspace" ? el.querySelector(".editor-frame-canvas")! : el.closest(".main-content")!;
      owner.scrollTop += 150;
    });
    expect((await page.locator(".course-quiz-canvas > .writing-document-heading").boundingBox())!.y).toBeCloseTo(pinned.y, 0);
    await page.screenshot({ path: info.outputPath(`quiz-pinned-${width}.png`), animations: "disabled" });
  }
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
        await expect(page.locator(".editor-frame")).toHaveAttribute("data-cards", "true");
      } else {
        await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toBeHidden();
        await expect(page.locator(".editor-frame")).not.toHaveAttribute("data-cards", "true");
      }
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
      const compact = await page.evaluate(() => matchMedia("(width < 768px), (width < 1280px) and (pointer: coarse) and (orientation: portrait)").matches);
      const frame = (await page.locator(".editor-frame").boundingBox())!;
      const line = (await writer.locator("p").first().boundingBox())!;
      expect(line.x - frame.x).toBeCloseTo(frame.x + frame.width - line.x - line.width, 0);
      expect((await page.locator("#editor-title").boundingBox())!.x).toBeCloseTo(line.x, 0);
      if (kind === "course") expect((await page.getByRole("textbox", { name: "Lesson title", exact: true }).boundingBox())!.x).toBeCloseTo(line.x, 0);
      const back = page.getByRole("button", { name: "Back to content", exact: true });
      if (compact) await expect(back).toBeHidden();
      else expect(Math.abs((await back.locator("svg").boundingBox())!.x - line.x)).toBeLessThanOrEqual(2);
      if (compact) {
        await expect(page.locator(".editor-frame")).toHaveAttribute("data-cards", "true");
        await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toBeVisible();
        const controls = (await page.locator('.editor-frame-controls[data-cards="true"]').boundingBox())!;
        expect(controls.x + controls.width / 2).toBeCloseTo(width / 2, 0);
        expect(controls.width).toBeLessThanOrEqual(width - 24);
        expect(controls.y + controls.height).toBeCloseTo(988, 0);
      } else {
        await expect(page.locator(".editor-frame")).not.toHaveAttribute("data-cards", "true");
        await expect(page.getByRole("button", { name: "Open navigation", exact: true })).toBeHidden();
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
        expect(button.y).toBeCloseTo(anchor.y, 0);
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
    if (width < 768) {
      await expect(wide).toBeHidden();
      await expect(compact.locator('svg')).toBeVisible();
      await expect(compact).toHaveText("");
      const icon = (await compact.boundingBox())!;
      const badge = (await header.locator('.editor-save-status [data-slot="badge"]').boundingBox())!;
      const publish = (await header.getByRole("button", { name: "Publish", exact: true }).boundingBox())!;
      expect(icon.y + icon.height / 2).toBeCloseTo(badge.y + badge.height / 2, 0);
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
      const navigation = (await page.locator(width < 768 ? ".topbar" : ".editor-canvas-navigation").boundingBox())!;
      const pane = (await page.getByRole("complementary", { name: "Content details", exact: true }).boundingBox())!;
      const frame = (await page.locator(".editor-frame").boundingBox())!;
      return pane.y - Math.max(navigation.y + navigation.height, width < 768 ? frame.y - 8 : 0);
    };
    if (width < 768) await expect.poll(panelGap).toBeCloseTo(8, 0);
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
    await alert.getByRole("button", { name: "Dismiss message", exact: true }).click();
    await expect(alert).toHaveCount(0);
    if (width < 768) await expect.poll(panelGap).toBeCloseTo(8, 0);
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
    await remove.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading")).toHaveText("Delete");
    const description = await dialog.locator("p").first().textContent();
    await expect(dialog).toContainText(`${item.title} can be restored for 30 days. After that, it and its related learning records are permanently erased.`);
    await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toBeDisabled();
    await dialog.getByRole("checkbox").check();
    await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toBeEnabled();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
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
  test.skip(!info.project.name.startsWith("production"));
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

test.describe("touch-only writing dock", () => {
  test.use({ hasTouch: true });

type CommandViewport = { height: number; offsetTop: number; clientHeight: number; appPan: number };
type CommandLifecycle = {
  viewport: CommandViewport;
  phase: number;
  closingTimer: number;
  recordRequest: number;
  proseFocusCount: number;
  visibleFrames: { height: number; top: number; bottom: number }[];
};

async function installCommandViewport(page: Page, viewport: CommandViewport) {
  await page.evaluate((viewport) => {
    const fixture: CommandLifecycle = { viewport, phase: 0, closingTimer: 0, recordRequest: 0, proseFocusCount: 0, visibleFrames: [] };
    (window as unknown as { commandLifecycle: CommandLifecycle }).commandLifecycle = fixture;
    for (const key of ["height", "offsetTop"] as const) Object.defineProperty(window.visualViewport, key, { configurable: true, get: () => fixture.viewport[key] });
    Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, get: () => fixture.viewport.clientHeight });
    Object.defineProperty(window, "innerHeight", { configurable: true, get: () => fixture.viewport.clientHeight });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  }, viewport);
}

async function expectKeyboardTopDock(page: Page) {
  const dock = page.getByRole("group", { name: "Editor controls", exact: true });
  await expect(dock).toBeVisible();
  await expect.poll(() => dock.evaluate((element) => {
    const header = element.closest(".app")!.querySelector(".topbar")!.getBoundingClientRect();
    const card = element.getBoundingClientRect();
    const search = element.closest(".app")!.querySelector('[data-slot="search-root"]')!.getBoundingClientRect();
    const publish = element.closest(".app")!.querySelector(".editor-heading-actions > button")!.getBoundingClientRect();
    return card.top >= header.top && card.bottom <= header.bottom && card.left >= search.right
      && card.right <= publish.left && publish.right <= header.right && search.left >= header.left
      && Math.abs(card.left - search.right - (publish.left - card.right)) < 1
      && Math.abs(card.top + card.height / 2 - header.top - header.height / 2) < 1;
  })).toBe(true);
}

async function savedWritingPaint(page: Page) {
  return page.locator('.writing-content[contenteditable="true"]').evaluate((writer) => {
    const registry = (CSS as unknown as { highlights?: Map<string, Set<Range>> }).highlights;
    const ranges = Array.from(registry?.get("fieldbook-writing-target") || []).filter(range => writer.contains(range.startContainer) && writer.contains(range.endContainer));
    return ranges.map(range => ({ text: range.toString(), connected: range.startContainer.isConnected && range.endContainer.isConnected, rectangles: Array.from(range.getClientRects()).filter(rect => rect.height > 0).length, background: getComputedStyle(writer, "::highlight(fieldbook-writing-target)").backgroundColor }));
  });
}

async function prepareCommandLifecycle(page: Page, installed: boolean) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile Safari/604.1" });
    Object.defineProperty(navigator, "platform", { configurable: true, value: "iPhone" });
    Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 5 });
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, installed, "doc");
  const writer = page.locator('.writing-content[contenteditable="true"]');
  const paragraph = writer.locator("p").nth(20);
  const bounds = (await paragraph.boundingBox())!;
  await paragraph.tap({ position: { x: bounds.width - 4, y: bounds.height - 14 } });
  await installCommandViewport(page, { height: 490, offsetTop: 0, clientHeight: 812, appPan: 0 });
  const dock = page.getByRole("group", { name: "Editor controls", exact: true });
  await expectKeyboardTopDock(page);
  const commands = dock.getByRole("button", { name: /^Commands:/ });
  await expect(commands).toBeEnabled();
  return { writer, paragraph, dock, commands };
}

async function animateCommandKeyboardClosing(page: Page) {
  await page.evaluate(() => {
    const fixture = (window as unknown as { commandLifecycle: CommandLifecycle }).commandLifecycle;
    const writer = document.querySelector('.writing-content[contenteditable="true"]')!;
    let started = false;
    const steps = [{ height: 560, wait: 40 }, { height: 650, wait: 40 }, { height: 750, wait: 220 }, { height: 812, wait: 0 }];
    const advance = (index: number) => {
      fixture.phase = index + 1;
      Object.assign(fixture.viewport, { height: steps[index].height, clientHeight: steps[index].height });
      window.visualViewport!.dispatchEvent(new Event("resize"));
      if (index + 1 < steps.length) fixture.closingTimer = window.setTimeout(() => advance(index + 1), steps[index].wait);
    };
    writer.addEventListener("focusout", () => { started = true; advance(0); }, { once: true });
    writer.addEventListener("focusin", () => {
      fixture.proseFocusCount++;
      if (started) clearTimeout(fixture.closingTimer);
    });
  });
}

async function changeCommandViewport(page: Page, next: CommandViewport) {
  await page.evaluate(async (next) => {
    const fixture = (window as unknown as { commandLifecycle: CommandLifecycle }).commandLifecycle;
    Object.assign(fixture.viewport, next);
    const app = document.querySelector<HTMLElement>(".app")!;
    // A CSS transform creates a fixed containing block and is not native pan.
    // Offset the outer shell without changing the editor's viewport reference.
    if (next.appPan) app.style.top = `${next.appPan}px`;
    else app.style.removeProperty("top");
    window.visualViewport!.dispatchEvent(new Event("resize"));
    window.visualViewport!.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("scroll"));
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
  }, next);
}

async function restoredCommandGeometry(page: Page) {
  return page.locator('.writing-content[contenteditable="true"]').evaluate(() => {
    const selection = window.getSelection()!;
    const focus = document.createRange();
    focus.setStart(selection.focusNode!, selection.focusOffset); focus.collapse(true);
    let rect = Array.from(focus.getClientRects()).find(rect => rect.height > 0);
    if (!rect && selection.focusNode instanceof Text && selection.focusNode.length) {
      const offset = Math.min(selection.focusOffset, selection.focusNode.length - 1);
      focus.setStart(selection.focusNode, offset); focus.setEnd(selection.focusNode, offset + 1);
      rect = Array.from(focus.getClientRects()).find(rect => rect.height > 0);
    }
    if (!rect) {
      const node = selection.focusNode;
      const line = (node instanceof Element ? node : node?.parentElement)?.closest("p, li, h1, h2, h3, h4, blockquote");
      if (line && !line.textContent?.trim()) rect = line.getBoundingClientRect();
    }
    const dock = document.querySelector('.editor-frame-controls[data-dock="true"]')!.getBoundingClientRect();
    const native = selection.getRangeAt(0);
    const backward = !selection.isCollapsed && selection.anchorNode === native.endContainer && selection.anchorOffset === native.endOffset;
    const writer = document.querySelector<HTMLElement>('.writing-content[contenteditable="true"]')!;
    const owner = writer.closest<HTMLElement>(".main-content")!;
    const ownerBounds = owner.getBoundingClientRect();
    const margin = parseFloat(getComputedStyle(writer).lineHeight);
    const header = writer.closest(".app")!.querySelector(".topbar")!.getBoundingClientRect();
    const topDock = document.querySelector<HTMLElement>('.editor-frame-controls[data-dock="true"]')!.dataset.dockPosition === "top";
    const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    const nativeBottom = window.visualViewport!.offsetTop + window.visualViewport!.height - (apple ? 128 : 48);
    const rawTop = Math.max(ownerBounds.top, window.visualViewport!.offsetTop, header.bottom + 8);
    const safeTop = rawTop + parseFloat(getComputedStyle(document.documentElement).fontSize);
    const safeBottom = Math.min(ownerBounds.bottom, topDock ? nativeBottom : dock.top) - margin;
    const focusGap = rect!.bottom - (topDock ? nativeBottom : dock.top);
    return { dockTop: dock.top, dockBottom: dock.bottom, topDock, headerBottom: Math.max(header.bottom, window.visualViewport!.offsetTop), nativeBottom, focusGap, selectedText: selection.toString(), rangeText: native.toString(), collapsed: selection.isCollapsed, backward, focusTop: rect!.top, focusBottom: rect!.bottom, focusHeight: rect!.height, rawTop, safeTop, safeBottom, margin, scrollTop: owner.scrollTop, scrollMax: owner.scrollHeight - owner.clientHeight, viewport: (window as unknown as { commandLifecycle?: CommandLifecycle }).commandLifecycle?.viewport };
  });
}

async function expectMobileWritingBand(page: Page, gap = 15) {
  // Native pan and frame compensation settle on the next paint. Require the
  // whole band together; lower clearance alone can pass in an intermediate frame.
  await expect.poll(async () => {
    const geometry = await restoredCommandGeometry(page);
    return geometry.focusGap <= -gap && geometry.focusTop >= geometry.rawTop - 1
      && (!geometry.topDock || geometry.focusTop >= geometry.dockBottom + 7);
  }).toBe(true);
  const geometry = await restoredCommandGeometry(page);
  expect(geometry.focusTop).toBeGreaterThanOrEqual(geometry.rawTop - 1);
  if (geometry.topDock) expect(geometry.focusTop).toBeGreaterThanOrEqual(geometry.dockBottom + 7);
}

async function expectFloatingSurfaceClearDock(page: Page, surface: ReturnType<Page["locator"]>) {
  const box = (await surface.boundingBox())!;
  const lane = (await page.getByRole("group", { name: "Editor controls", exact: true }).boundingBox())!;
  const band = await page.evaluate(() => {
    const header = document.querySelector(".topbar")!.getBoundingClientRect();
    const apple = /iPad|iPhone|iPod/.test(navigator.userAgent) || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    const dock = document.querySelector<HTMLElement>('.editor-frame-controls[data-dock="true"]')!;
    return { top: Math.max(header.bottom, window.visualViewport!.offsetTop), bottom: window.visualViewport!.offsetTop + window.visualViewport!.height - (apple ? 128 : 48), keyboard: dock.dataset.dockPosition === "top" };
  });
  expect(box.y).toBeGreaterThanOrEqual(band.top + 7);
  if (band.keyboard) {
    expect(box.y + box.height).toBeLessThanOrEqual(band.bottom - 7);
  } else expect(box.y + box.height).toBeLessThanOrEqual(lane.y - 7);
}

test("mobile viewport boundary does not accumulate movement from stale outer geometry", async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, info.project.name.startsWith("production"), "course");
  await page.locator('.writing-content[contenteditable="true"] p').nth(20).tap();
  await installCommandViewport(page, { height: 490, offsetTop: 0, clientHeight: 812, appPan: 0 });
  await page.locator(".app").evaluate(app => {
    const bounds = app.getBoundingClientRect();
    // A browser can retain a previous native rectangle during a keyboard frame.
    // The old feedback correction assumed every read acknowledged its own write.
    app.getBoundingClientRect = () => bounds;
  });
  for (let frame = 0; frame < 4; frame++) {
    await changeCommandViewport(page, { height: 490, offsetTop: 120, clientHeight: 812, appPan: 0 });
  }
  expect(await page.locator(".app").evaluate(app => getComputedStyle(app).top)).toBe("0px");
  expect(await page.locator(".app").evaluate(app => (app as HTMLElement).style.getPropertyValue("--editor-viewport-shift"))).toBe("");
  expect(await page.locator(".main-shell").evaluate(shell => parseFloat((shell as HTMLElement).style.getPropertyValue("--editor-viewport-top")))).toBe(120);
  expect((await page.locator(".main-content").boundingBox())!.y).toBe(180);
  expect((await page.locator(".main-shell").boundingBox())!.height).toBe(490);
  expect((await page.locator(".topbar").boundingBox())!.height).toBe(60);
});

test("mobile viewport owns the fixed header and scroller despite outer shell displacement", async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, info.project.name.startsWith("production"), "course");
  const writer = page.locator('.writing-content[contenteditable="true"]');
  await writer.locator("p").nth(20).tap();
  await installCommandViewport(page, { height: 490, offsetTop: 0, clientHeight: 812, appPan: 0 });
  const dock = page.getByRole("group", { name: "Editor controls", exact: true });
  const owner = page.locator(".main-content");
  const cardSize = (await dock.boundingBox())!;
  const expectTogether = async (top: number, keyboard = true) => {
    await expect.poll(() => page.locator(".topbar").evaluate(el => el.getBoundingClientRect().top)).toBeCloseTo(top, 0);
    await expect(dock).toHaveAttribute("data-dock-settled", "true");
    const bounds = await owner.evaluate(owner => {
      const header = document.querySelector(".topbar")!.getBoundingClientRect();
      const dock = document.querySelector('.editor-frame-controls[data-dock="true"]')!.getBoundingClientRect();
      const reserve = parseFloat(getComputedStyle(owner).marginBlockStart);
      const hit = document.elementFromPoint(header.left + 20, header.top + header.height / 2);
      return { headerTop: header.top, headerBottom: header.bottom, dockTop: dock.top, dockBottom: dock.bottom, dockWidth: dock.width, dockHeight: dock.height, ownerTop: owner.getBoundingClientRect().top, shellTop: owner.parentElement!.getBoundingClientRect().top, headerHeight: header.height, clip: parseFloat((owner as HTMLElement).style.getPropertyValue("--editor-header-clip")), reserve, headerHit: !!hit?.closest(".topbar") };
    });
    if (top >= 0) expect(bounds.headerHit).toBe(true);
    expect(bounds.reserve).toBe(0);
    expect(bounds.ownerTop).toBeCloseTo(bounds.shellTop + bounds.headerHeight, 0);
    expect(Number.isNaN(bounds.clip)).toBe(true);
    expect(bounds.ownerTop).toBeCloseTo(bounds.headerBottom, 0);
    await expect.poll(() => owner.evaluate(el => el.clientHeight + document.querySelector(".topbar")!.getBoundingClientRect().height - window.visualViewport!.height)).toBeCloseTo(0, 0);
    expect(bounds.dockWidth).toBe(cardSize.width);
    expect(bounds.dockHeight).toBe(cardSize.height);
    if (keyboard) {
      expect(bounds.dockTop).toBeGreaterThanOrEqual(bounds.headerTop);
      expect(bounds.dockBottom).toBeLessThanOrEqual(bounds.headerBottom);
      await expectKeyboardTopDock(page);
    }
  };
  for (const next of [
    { height: 490, offsetTop: 0, clientHeight: 812, appPan: 84 },
    { height: 490, offsetTop: 35, clientHeight: 490, appPan: -84 },
    { height: 490, offsetTop: 35, clientHeight: 490, appPan: 84 },
    { height: 490, offsetTop: -72, clientHeight: 490, appPan: 84 },
  ]) {
    await changeCommandViewport(page, next);
    await expectTogether(next.offsetTop);
    // A manual scroll owns the writing position even as native panning changes.
    await owner.evaluate(owner => {
      owner.dispatchEvent(new Event("touchstart", { bubbles: true }));
      owner.dispatchEvent(new Event("touchmove", { bubbles: true }));
      owner.scrollTop += 55;
      window.dispatchEvent(new Event("touchend"));
    });
    const scroll = await owner.evaluate(el => el.scrollTop);
    for (let repeat = 0; repeat < 3; repeat++) await changeCommandViewport(page, next);
    await expectTogether(next.offsetTop);
    expect(await owner.evaluate(el => el.scrollTop)).toBeCloseTo(scroll, 0);
  }
  // End the simulated rubberband. The real browser moves its visible origin;
  // mocked offsets alone do not move Playwright's physical tap coordinates.
  await changeCommandViewport(page, { height: 490, offsetTop: 0, clientHeight: 490, appPan: 0 });
  await expectTogether(0);
  await page.screenshot({ path: info.outputPath("mobile-header-after-native-panning.png") });
  await writer.press("ArrowRight");
  for (let index = 0; index < 10; index++) await page.keyboard.press("Shift+ArrowLeft");
  const selected = await page.evaluate(() => window.getSelection()!.toString());
  await animateCommandKeyboardClosing(page);
  await dock.getByRole("button", { name: /^Commands:/ }).tap();
  const menu = page.getByRole("menu", { name: "Insert content", exact: true });
  await expect(menu).toBeVisible();
  await expectTogether(0, false);
  await expectFloatingSurfaceClearDock(page, menu);
  await menu.getByRole("menuitem", { name: "Close menu esc", exact: true }).tap();
  await changeCommandViewport(page, { height: 490, offsetTop: 35, clientHeight: 490, appPan: -84 });
  await expectTogether(35);
  await expect(writer).toBeFocused();
  expect((await restoredCommandGeometry(page)).selectedText).toBe(selected);
  expect((await restoredCommandGeometry(page)).backward).toBe(true);
  await animateCommandKeyboardClosing(page);
  await dock.getByRole("button", { name: "Outline", exact: true }).tap();
  const outline = page.getByRole("complementary", { name: "Course outline", exact: true });
  await expect(outline).toBeVisible();
  await expectTogether(0, false);
  await outline.getByRole("button", { name: "2 Put it into practice", exact: true }).tap();
  await expect(writer).toContainText("The second lesson.");
  await expect.poll(() => savedWritingPaint(page)).toEqual([]);
  if (await outline.isVisible()) await dock.getByRole("button", { name: "Outline", exact: true }).tap();
  await writer.locator("p").first().tap();
  await changeCommandViewport(page, { height: 490, offsetTop: 0, clientHeight: 490, appPan: 84 });
  await expectTogether(0);
  await expect(page.getByRole("textbox", { name: "Lesson title", exact: true })).toHaveValue("Put it into practice");
  // Keyboard dismissal can restore the height before clearing offsetTop or pan.
  await writer.evaluate(el => el.blur());
  for (const appPan of [-84, 84]) {
    await changeCommandViewport(page, { height: 812, offsetTop: 90, clientHeight: 812, appPan });
    await expectTogether(0, false);
    await expect.poll(async () => { const box = (await dock.boundingBox())!; return box.y + box.height; }).toBeCloseTo(800, 0);
  }
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, "scale", { configurable: true, value: 2 });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect.poll(() => page.locator(".main-shell").evaluate(el => (el as HTMLElement).style.getPropertyValue("--editor-viewport-top"))).toBe("");
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, "scale", { configurable: true, value: 1 });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expectTogether(0, false);
  await changeCommandViewport(page, { height: 812, offsetTop: 0, clientHeight: 812, appPan: 0 });
  await expectTogether(0, false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(page.locator('.editor-frame-controls[data-dock="true"]')).toHaveCount(0);
  expect(await page.locator(".main-shell").evaluate(el => (el as HTMLElement).style.getPropertyValue("--editor-viewport-top"))).toBe("");
  await returnToContent(page);
  expect(await page.locator(".main-shell").evaluate(el => (el as HTMLElement).style.getPropertyValue("--editor-viewport-top"))).toBe("");
});

test("mobile dock keeps one size inside the header and hides only metadata that cannot fit", async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, info.project.name.startsWith("production"), "course");
  const dock = page.getByRole("group", { name: "Editor controls", exact: true });
  const app = page.locator(".app");
  const resting = (await dock.boundingBox())!;
  const headerHeight = (await page.locator(".topbar").boundingBox())!.height;
  await expect(app).toHaveAttribute("data-editor-header-metadata", "visible");
  await page.locator('.writing-content[contenteditable="true"] p').nth(20).tap();
  await installCommandViewport(page, { height: 490, offsetTop: 0, clientHeight: 812, appPan: 0 });
  for (const width of [320, 375, 390, 640]) {
    await page.setViewportSize({ width, height: 812 });
    await expectKeyboardTopDock(page);
    const card = (await dock.boundingBox())!;
    expect(card.width).toBe(resting.width);
    expect(card.height).toBe(resting.height);
    expect((await page.locator(".topbar").boundingBox())!.height).toBe(headerHeight);
    await expect(app).toHaveAttribute("data-editor-header-metadata", width < 640 ? "hidden" : "visible");
    expect(await page.locator(".editor-save-status [role=status]").count()).toBe(1);
    for (const button of await dock.getByRole("button").all()) {
      const bounds = (await button.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(24);
      expect(bounds.height).toBeGreaterThanOrEqual(44);
    }
    const owner = page.locator(".main-content");
    const paragraph = page.locator('.writing-content[contenteditable="true"] p').nth(24);
    await paragraph.evaluate(el => {
      const owner = el.closest<HTMLElement>(".main-content")!;
      owner.dispatchEvent(new Event("touchstart", { bubbles: true }));
      owner.dispatchEvent(new Event("touchmove", { bubbles: true }));
      owner.scrollTop += el.getBoundingClientRect().top - 28;
      window.dispatchEvent(new Event("touchend"));
    });
    expect(await owner.evaluate(() => !!document.elementFromPoint(100, 30)?.closest('.writing-content, .document-title'))).toBe(false);
    await page.screenshot({ path: info.outputPath(`header-dock-${width}.png`) });
  }
  await page.setViewportSize({ width: 490, height: 812 });
  await expect(app).toHaveAttribute("data-editor-header-metadata", "hidden");
  const badge = page.locator(".editor-save-status [data-slot=badge]");
  await badge.evaluate(el => { el.textContent = "Draft"; });
  await expect(app).toHaveAttribute("data-editor-header-metadata", "visible");
  await badge.evaluate(el => { el.textContent = "Published"; });
  await expect(app).toHaveAttribute("data-editor-header-metadata", "hidden");
  await expectKeyboardTopDock(page);
  await page.locator('.writing-content[contenteditable="true"]').evaluate(el => el.blur());
  await changeCommandViewport(page, { height: 812, offsetTop: 0, clientHeight: 812, appPan: 0 });
  await expect(dock).toHaveAttribute("data-dock-position", "bottom");
  await expect(app).toHaveAttribute("data-editor-header-metadata", "visible");
  const closed = (await dock.boundingBox())!;
  expect(closed.width).toBe(resting.width);
  expect(closed.height).toBe(resting.height);
});

test("mobile titles scroll behind the fixed header while large selections survive menu return", async ({ page }, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile Safari/604.1" });
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, info.project.name.startsWith("production"), "course", 2, item => {
    item.lessons[0].body = item.body.split("\n\n").map((paragraph, index) => index === 20 ? "# Large focused heading." : paragraph).join("\n\n");
  });
  const writer = page.locator('.writing-content[contenteditable="true"]');
  const originalWriter = await writer.elementHandle();
  const dock = page.getByRole("group", { name: "Editor controls", exact: true });
  const originalDock = await dock.elementHandle();
  const large = writer.locator("h1");
  const bounds = (await large.boundingBox())!;
  await large.tap({ position: { x: bounds.width - 4, y: bounds.height - 14 } });
  await installCommandViewport(page, { height: 490, offsetTop: 0, clientHeight: 812, appPan: 0 });
  await expectKeyboardTopDock(page);
  const title = page.locator(".writing-document-heading");
  await expect(title).toHaveCSS("position", "relative");
  await expect(page.getByRole("textbox", { name: "Lesson title", exact: true })).not.toBeInViewport();
  await expect(page.locator("#editor-title")).not.toBeInViewport();
  for (let index = 0; index < 14; index++) await page.keyboard.press("Shift+ArrowLeft");
  const selected = await page.evaluate(() => window.getSelection()!.toString());
  await animateCommandKeyboardClosing(page);
  await dock.getByRole("button", { name: /^Commands:/ }).tap();
  const menu = page.getByRole("menu", { name: "Insert content", exact: true });
  await expect(menu).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { commandLifecycle: CommandLifecycle }).commandLifecycle.viewport.height)).toBe(812);
  await menu.getByRole("menuitem", { name: "Close menu esc", exact: true }).tap();
  for (const height of [330, 490, 650]) {
    await changeCommandViewport(page, { height, offsetTop: 0, clientHeight: height, appPan: 0 });
    await expectKeyboardTopDock(page);
    await expect.poll(async () => {
      const geometry = await restoredCommandGeometry(page);
      return JSON.stringify({ selectedText: geometry.rangeText, backward: geometry.backward,
        below: geometry.focusGap <= -7, above: geometry.focusTop >= geometry.rawTop - 1 });
    }).toBe(JSON.stringify({ selectedText: selected, backward: true, below: true, above: true }));
    await expect(title).toHaveCSS("position", "relative");
  }
  expect(await originalWriter!.evaluate(el => el.isConnected)).toBe(true);
  expect(await originalDock!.evaluate(el => el.isConnected)).toBe(true);
  // WebKit can report an empty Selection string in a clipped viewport even
  // with the intact, painted DOM Range. Verify the actual replacement too.
  const original = await large.textContent();
  await page.keyboard.insertText("Kept selection.");
  await expect(large).toHaveText(original!.replace(selected, "Kept selection."));
  const owner = page.locator(".main-content");
  const row = writer.locator("p").nth(23);
  await row.evaluate(row => {
    const owner = row.closest<HTMLElement>(".main-content")!;
    owner.dispatchEvent(new Event("touchstart", { bubbles: true }));
    owner.dispatchEvent(new Event("touchmove", { bubbles: true }));
    owner.scrollTop += row.getBoundingClientRect().top - 20;
    window.dispatchEvent(new Event("touchend"));
  });
  expect(await owner.evaluate(() => !!document.elementFromPoint(100, 30)?.closest('.writing-content, .document-title'))).toBe(false);
  await expect(page.locator(".topbar")).toHaveCSS("touch-action", "pinch-zoom");
  await page.screenshot({ path: info.outputPath("mobile-fixed-header-scrolling-titles.png") });
});

test("two-position mobile metadata input keeps its panel below a visible top dock", async ({ page }, info) => {
  const { writer, dock } = await prepareCommandLifecycle(page, info.project.name.startsWith("production"));
  for (let index = 0; index < 14; index++) await page.keyboard.press("Shift+ArrowLeft");
  const selected = await page.evaluate(() => window.getSelection()!.toString());
  await animateCommandKeyboardClosing(page);
  const details = dock.getByRole("button", { name: "Details", exact: true });
  await details.tap();
  const panel = page.getByRole("complementary", { name: "Content details", exact: true });
  await expect(panel).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { commandLifecycle: CommandLifecycle }).commandLifecycle.viewport.height)).toBe(812);
  const closedDock = (await dock.boundingBox())!, closedPanel = (await panel.boundingBox())!;
  expect(closedPanel.y + closedPanel.height).toBeLessThanOrEqual(closedDock.y - 7);
  await page.locator("#editor-summary").fill("The panel keeps its input visible.");
  await changeCommandViewport(page, { height: 490, offsetTop: 0, clientHeight: 490, appPan: 0 });
  await expectKeyboardTopDock(page);
  const topDock = (await dock.boundingBox())!, openPanel = (await panel.boundingBox())!;
  expect(openPanel.y).toBeGreaterThanOrEqual(topDock.y + topDock.height + 7);
  expect(openPanel.y + openPanel.height).toBeLessThanOrEqual(490 - 128 - 7);
  await expect(page.locator("#editor-summary")).toBeFocused();
  expect(await page.evaluate(() => window.getSelection()!.toString())).toBe("");
  const paint = await savedWritingPaint(page);
  expect(paint).toHaveLength(1);
  expect(paint[0].text).toBe(selected);
  expect(paint[0].connected).toBe(true);
  expect(paint[0].rectangles).toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath("top-dock-panel-keyboard-handoff.png") });
  await details.tap();
  await expect(writer).toBeFocused();
  await expect(dock).toBeVisible();
  const restored = await restoredCommandGeometry(page);
  expect(restored.selectedText).toBe(selected);
  expect(restored.backward).toBe(true);
  expect(await savedWritingPaint(page)).toHaveLength(0);
});

test("two-position mobile Commands keeps saved text painted while it owns focus", async ({ page }, info) => {
  const { writer, commands } = await prepareCommandLifecycle(page, info.project.name.startsWith("production"));
  for (let index = 0; index < 14; index++) await page.keyboard.press("Shift+ArrowLeft");
  const selected = await page.evaluate(() => window.getSelection()!.toString());
  await animateCommandKeyboardClosing(page);
  await commands.tap();
  const menu = page.getByRole("menu", { name: "Insert content", exact: true });
  await expect(menu).toBeVisible();
  await expect(writer).not.toBeFocused();
  expect(await page.evaluate(() => window.getSelection()!.toString())).toBe("");
  const paint = await savedWritingPaint(page);
  expect(paint).toHaveLength(1);
  expect(paint[0].text).toBe(selected);
  expect(paint[0].connected).toBe(true);
  expect(paint[0].rectangles).toBeGreaterThan(0);
  expect(paint[0].background).not.toBe("rgba(0, 0, 0, 0)");
  await page.screenshot({ path: info.outputPath("commands-saved-selection-paint.png") });
  await menu.getByRole("menuitem", { name: "Close menu esc", exact: true }).tap();
  await expect(writer).toBeFocused();
  expect(await page.evaluate(() => window.getSelection()!.toString())).toBe(selected);
  expect(await savedWritingPaint(page)).toHaveLength(0);
});

test("two-position mobile canceled panel gesture and pending Escape leave no delayed panel", async ({ page }, info) => {
  const { writer, dock } = await prepareCommandLifecycle(page, info.project.name.startsWith("production"));
  for (let index = 0; index < 14; index++) await page.keyboard.press("Shift+ArrowLeft");
  const selected = await page.evaluate(() => window.getSelection()!.toString());
  const details = dock.getByRole("button", { name: "Details", exact: true });
  await details.dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch", isPrimary: true, button: 0 });
  expect(await savedWritingPaint(page)).toHaveLength(0);
  await details.dispatchEvent("pointercancel", { pointerId: 1, pointerType: "touch", isPrimary: true });
  await expect(details).toHaveAttribute("aria-expanded", "false");
  await expect(writer).toBeFocused();
  expect(await page.evaluate(() => window.getSelection()!.toString())).toBe(selected);
  await details.tap();
  await page.keyboard.press("Escape");
  await expect(details).toHaveAttribute("aria-expanded", "false");
  await expect(writer).toBeFocused();
  await page.waitForTimeout(420);
  await expect(page.getByRole("complementary", { name: "Content details", exact: true })).toHaveCount(0);
  expect(await savedWritingPaint(page)).toHaveLength(0);
});

test("two-position mobile header search yields the dock and Escape restores it", async ({ page }, info) => {
  const { dock } = await prepareCommandLifecycle(page, info.project.name.startsWith("production"));
  await page.getByRole("button", { name: "Open search", exact: true }).tap();
  const input = page.getByRole("textbox", { name: "Search all content", exact: true });
  await expect(input).toBeFocused();
  await expect(dock).toBeHidden();
  const panel = page.locator('[data-slot="search-panel"]');
  await expect.poll(() => panel.evaluate(element => {
    const band = document.querySelector<HTMLElement>('.editor-frame-controls[data-dock="true"]')!;
    return element.getBoundingClientRect().bottom <= parseFloat(band.style.getPropertyValue("--editor-usable-bottom")) + 1;
  })).toBe(true);
  await expect(page.locator(".topbar")).toHaveCSS("touch-action", "auto");
  await expect(page.locator('[data-slot="search-results-scroll"]')).toHaveCSS("overflow-y", "auto");
  await input.press("Escape");
  await expect(page.getByRole("button", { name: "Open search", exact: true })).toBeFocused();
  await expectKeyboardTopDock(page);
});

test("two-position mobile fine-pointer attachment preserves the active writing row", async ({ page }, info) => {
  await page.addInitScript(() => {
    const native = window.matchMedia.bind(window);
    const queries: MediaQueryList[] = [];
    let fine = false;
    window.matchMedia = (media) => {
      const original = native(media);
      if (!media.includes("any-pointer: fine")) return original;
      const query = new EventTarget() as MediaQueryList;
      Object.defineProperties(query, { media: { value: media }, matches: { get: () => !fine && original.matches } });
      queries.push(query);
      return query;
    };
    (window as unknown as { setFinePointer: (value: boolean) => void }).setFinePointer = (value) => {
      fine = value;
      queries.forEach(query => query.dispatchEvent(new Event("change")));
    };
  });
  await page.setViewportSize({ width: 600, height: 1000 });
  await open(page, info.project.name.startsWith("production"), "doc");
  const writer = page.locator('.writing-content[contenteditable="true"]');
  const mounted = await writer.elementHandle();
  const paragraph = writer.locator("p").nth(20);
  const bounds = (await paragraph.boundingBox())!;
  await paragraph.tap({ position: { x: bounds.width - 4, y: bounds.height - 14 } });
  await installCommandViewport(page, { height: 700, offsetTop: 0, clientHeight: 700, appPan: 0 });
  await expectKeyboardTopDock(page);
  await page.locator(".main-content").evaluate(async () => { await new Promise(resolve => setTimeout(resolve, 200)); });
  const before = await restoredCommandGeometry(page);
  const text = await writer.textContent();
  const cursor = await writer.evaluate(() => ({ text: window.getSelection()!.focusNode!.textContent, offset: window.getSelection()!.focusOffset }));
  await page.evaluate(() => (window as unknown as { setFinePointer: (value: boolean) => void }).setFinePointer(true));
  await expect(page.locator('.editor-frame-controls[data-dock="true"]')).toHaveCount(0);
  await expect(page.locator(".editor-canvas-navigation")).toBeVisible();
  await expect(page.locator(".editor")).toHaveAttribute("data-scroll-layout", "page");
  expect(await mounted!.evaluate(element => element.isConnected)).toBe(true);
  await expect(writer).toHaveText(text!);
  expect(await writer.evaluate(() => ({ text: window.getSelection()!.focusNode!.textContent, offset: window.getSelection()!.focusOffset }))).toEqual(cursor);
  const afterTop = await writer.evaluate(() => {
    const range = window.getSelection()!.getRangeAt(0).cloneRange(); range.collapse(false);
    return Array.from(range.getClientRects()).find(rect => rect.height > 0)!.top;
  });
  expect(afterTop).toBeCloseTo(before.focusTop, 0);
  expect(await page.locator(".main-content").evaluate(element => getComputedStyle(element).marginBlockStart)).toBe("0px");
  expect(await page.locator(".main-content").evaluate(element => getComputedStyle(element).clipPath)).toBe("none");
  expect(await page.locator(".writing-document-heading").evaluate(element => getComputedStyle(element).position)).toBe("sticky");
  expect(await savedWritingPaint(page)).toHaveLength(0);
});

test("iPhone Commands insertion retains the keyboard lane after an eager return", async ({ page }, info) => {
  const { writer, paragraph, commands } = await prepareCommandLifecycle(page, info.project.name.startsWith("production"));
  const original = await paragraph.textContent();
  await animateCommandKeyboardClosing(page);
  await commands.tap();
  const menu = page.getByRole("menu", { name: "Insert content", exact: true });
  await expect(menu).toBeVisible();
  // A person can choose a command while the native dismissal is still moving.
  // A pending palette may wait for the background animation to finish first.
  await expect.poll(() => page.evaluate(() => (window as unknown as { commandLifecycle: CommandLifecycle }).commandLifecycle.viewport.height)).toBeGreaterThanOrEqual(750);
  await menu.getByRole("menuitem", { name: "Heading 2", exact: true }).tap();
  await expect(writer).toBeFocused();
  for (const state of [
    { height: 640, offsetTop: 0, clientHeight: 640, appPan: 0 },
    { height: 490, offsetTop: 0, clientHeight: 490, appPan: 84 },
  ]) {
    await changeCommandViewport(page, state);
    const geometry = await restoredCommandGeometry(page);
    await expectKeyboardTopDock(page);
    expect(geometry.focusGap, JSON.stringify(geometry)).toBeLessThanOrEqual(-27);
    expect(geometry.focusTop).toBeGreaterThanOrEqual(geometry.rawTop - 1);
  }
  await page.keyboard.type(" Resumed after Commands.");
  await expect(writer.locator("h2")).toHaveText(`${original} Resumed after Commands.`);
  await page.screenshot({ path: info.outputPath("commands-eager-keyboard-return.png") });
});

test("iPhone Commands closing restores a backward selection above the dock", async ({ page }, info) => {
  const { writer, commands } = await prepareCommandLifecycle(page, info.project.name.startsWith("production"));
  for (let index = 0; index < 14; index++) await page.keyboard.press("Shift+ArrowLeft");
  const selected = await page.evaluate(() => window.getSelection()!.toString());
  expect(selected.length).toBeGreaterThan(5);
  expect((await restoredCommandGeometry(page)).backward).toBe(true);
  await animateCommandKeyboardClosing(page);
  await commands.tap();
  const menu = page.getByRole("menu", { name: "Insert content", exact: true });
  await expect(menu).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { commandLifecycle: CommandLifecycle }).commandLifecycle.viewport.height)).toBe(812);
  await menu.getByRole("menuitem", { name: "Close menu esc", exact: true }).tap();
  await expect(writer).toBeFocused();
  for (const state of [
    { height: 640, offsetTop: 0, clientHeight: 640, appPan: 0 },
    { height: 490, offsetTop: 0, clientHeight: 490, appPan: 84 },
  ]) {
    await changeCommandViewport(page, state);
    const geometry = await restoredCommandGeometry(page);
    expect(geometry.selectedText).toBe(selected);
    expect(geometry.collapsed).toBe(false);
    expect(geometry.backward).toBe(true);
    await expectKeyboardTopDock(page);
    expect(geometry.focusGap).toBeLessThanOrEqual(-27);
  }
  await page.screenshot({ path: info.outputPath("commands-restored-native-selection.png") });
  const owner = page.locator(".main-content");
  await owner.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {})));
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
  });
  const manual = await owner.evaluate((owner) => {
    owner.dispatchEvent(new Event("touchstart", { bubbles: true }));
    owner.dispatchEvent(new Event("touchmove", { bubbles: true }));
    owner.scrollTop = Math.max(0, owner.scrollTop - 180);
    const fixture = (window as unknown as { commandLifecycle: CommandLifecycle }).commandLifecycle;
    fixture.viewport.offsetTop += 1;
    window.visualViewport!.dispatchEvent(new Event("scroll"));
    window.dispatchEvent(new Event("touchend"));
    return owner.scrollTop;
  });
  await page.waitForTimeout(180); // Include geometry events following the manual gesture.
  expect(await owner.evaluate(owner => owner.scrollTop)).toBeCloseTo(manual, 0);
  expect(await page.evaluate(() => window.getSelection()!.toString())).toBe(selected);
});

test("iPhone Commands can cancel while opening without a late palette", async ({ page }, info) => {
  const { writer, paragraph, commands } = await prepareCommandLifecycle(page, info.project.name.startsWith("production"));
  const original = await paragraph.textContent();
  await commands.tap();
  await page.keyboard.press("Escape");
  await expect(writer).toBeFocused();
  await expect(page.locator(".writing-slash-menu")).toHaveCount(0);
  await page.waitForTimeout(420); // Exceeds the pending-palette fallback window.
  await expect(page.locator(".writing-slash-menu")).toHaveCount(0);
  await page.keyboard.type(" Still writing.");
  await expect(paragraph).toHaveText(`${original} Still writing.`);
});

for (const reduced of [false, true]) {
  test(`iPhone Commands paints one full palette and retains chosen focus${reduced ? " with reduced motion" : ""}`, async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
    const { commands } = await prepareCommandLifecycle(page, info.project.name.startsWith("production"));
    await animateCommandKeyboardClosing(page);
    await page.evaluate(() => {
      const fixture = (window as unknown as { commandLifecycle: CommandLifecycle }).commandLifecycle;
      const record = () => {
        const menu = document.querySelector<HTMLElement>(".writing-slash-menu");
        if (menu) {
          const style = getComputedStyle(menu), rect = menu.getBoundingClientRect();
          if (style.display !== "none" && style.visibility === "visible" && parseFloat(style.opacity) > 0.05 && rect.height > 0)
            fixture.visibleFrames.push({ height: rect.height, top: rect.top, bottom: rect.bottom });
        }
        fixture.recordRequest = requestAnimationFrame(record);
      };
      fixture.recordRequest = requestAnimationFrame(record);
    });
    await commands.tap();
    const menu = page.getByRole("menu", { name: "Insert content", exact: true });
    await expect(menu).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as unknown as { commandLifecycle: CommandLifecycle }).commandLifecycle.viewport.height)).toBe(812);
    const first = menu.getByRole("menuitem", { name: "Normal Text", exact: true });
    await expect(first).toBeFocused();
    await menu.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
    const finalHeight = (await menu.boundingBox())!.height;
    const frames = await page.evaluate(() => {
      const fixture = (window as unknown as { commandLifecycle: CommandLifecycle }).commandLifecycle;
      cancelAnimationFrame(fixture.recordRequest);
      return fixture.visibleFrames;
    });
    expect(frames.length).toBeGreaterThan(0);
    expect(finalHeight).toBeGreaterThanOrEqual(320);
    expect(Math.min(...frames.map(frame => frame.height))).toBeGreaterThanOrEqual(finalHeight - 2);
    await page.keyboard.press("ArrowDown"); await page.keyboard.press("ArrowDown");
    const chosen = menu.getByRole("menuitem", { name: "Heading 2", exact: true });
    await expect(chosen).toBeFocused();
    await changeCommandViewport(page, { height: 800, offsetTop: 12, clientHeight: 800, appPan: 18 });
    await expect(chosen).toBeFocused();
    await changeCommandViewport(page, { height: 812, offsetTop: 0, clientHeight: 812, appPan: 0 });
    await expect(chosen).toBeFocused();
    await page.screenshot({ path: info.outputPath(`commands-full-first-paint-${reduced ? "reduced" : "normal"}.png`) });
  });
}

test("iPhone Commands to media does not reopen prose input before Cancel", async ({ page }, info) => {
  const { writer, paragraph, commands } = await prepareCommandLifecycle(page, info.project.name.startsWith("production"));
  const original = await paragraph.textContent();
  await animateCommandKeyboardClosing(page);
  await commands.tap();
  const menu = page.getByRole("menu", { name: "Insert content", exact: true });
  await expect(menu).toBeVisible();
  await expect.poll(() => page.evaluate(() => (window as unknown as { commandLifecycle: CommandLifecycle }).commandLifecycle.viewport.height)).toBe(812);
  await page.evaluate(() => { (window as unknown as { commandLifecycle: CommandLifecycle }).commandLifecycle.proseFocusCount = 0; });
  await menu.getByRole("menuitem", { name: "Image", exact: true }).tap();
  const image = page.getByRole("dialog", { name: "Insert image", exact: true });
  await expect(image).toBeVisible();
  await expect(writer).not.toBeFocused();
  expect(await page.evaluate(() => (window as unknown as { commandLifecycle: CommandLifecycle }).commandLifecycle.proseFocusCount)).toBe(0);
  const alt = image.getByRole("textbox", { name: "Alt text (optional)", exact: true });
  await alt.tap();
  await alt.fill("The chooser retains its current input.");
  await changeCommandViewport(page, { height: 490, offsetTop: 20, clientHeight: 490, appPan: 18 });
  await expect(alt).toBeFocused();
  await expect(alt).toHaveValue("The chooser retains its current input.");
  await image.getByRole("button", { name: "Cancel", exact: true }).tap();
  await expect(writer).toBeFocused();
  await changeCommandViewport(page, { height: 490, offsetTop: 0, clientHeight: 490, appPan: 0 });
  const geometry = await restoredCommandGeometry(page);
  await expectKeyboardTopDock(page);
  expect(geometry.focusGap).toBeLessThanOrEqual(-27);
  await page.keyboard.type(" Returned from the chooser.");
  await expect(paragraph).toHaveText(`${original} Returned from the chooser.`);
});

for (const command of ["Heading 2", "Image"] as const) {
  test(`mobile Commands ${command} rejects a target removed by Undo`, async ({ page }, info) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const { read } = await open(page, info.project.name.startsWith("production"), "doc");
    const writer = page.locator('.writing-content[contenteditable="true"]');
    const paragraph = writer.locator("p").nth(20);
    const bounds = (await paragraph.boundingBox())!;
    await paragraph.tap({ position: { x: bounds.width - 4, y: bounds.height - 14 } });
    await page.keyboard.press("Enter");
    await page.keyboard.type("A temporary command target.");
    const target = writer.locator("p").filter({ hasText: "A temporary command target." });
    await expect(target).toHaveText("A temporary command target.");
    const saved = await target.elementHandle();
    const dock = page.getByRole("group", { name: "Editor controls", exact: true });
    await dock.getByRole("button", { name: /^Commands:/ }).tap();
    const menu = page.getByRole("menu", { name: "Insert content", exact: true });
    await expect(menu).toBeVisible();
    const undo = dock.getByRole("button", { name: "Undo", exact: true });
    // Keyboard activation changes the real model without a pointer gesture
    // dismissing the command palette before the undo can happen.
    // Remove the new paragraph, rather than only detaching its rendered DOM.
    for (let attempt = 0; attempt < 3 && await saved!.evaluate(element => element.isConnected); attempt++) {
      await expect(undo).toBeEnabled();
      await undo.press("Enter");
      await writer.evaluate(async () => { await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame); });
    }
    expect(await saved!.evaluate(element => element.isConnected)).toBe(false);
    await expect(writer).not.toContainText("A temporary command target.");
    await expect(menu).toBeVisible();
    await waitForDraftSaved(page);
    const beforeText = await writer.textContent();
    const beforeCount = await writer.locator("p").count();
    const beforeMarkdown = (await read()).content[0].body;
    await writer.evaluate((element) => {
      (window as unknown as { staleCommandFocusCount: number }).staleCommandFocusCount = 0;
      element.addEventListener("focusin", () => { (window as unknown as { staleCommandFocusCount: number }).staleCommandFocusCount++; });
    });
    await menu.getByRole("menuitem", { name: command, exact: true }).tap();
    await expect(menu).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Insert image", exact: true })).toHaveCount(0);
    await expect(writer.locator("h2")).toHaveCount(0);
    await expect(writer).toHaveText(beforeText!);
    await expect(writer.locator("p")).toHaveCount(beforeCount);
    expect(await page.evaluate(() => (window as unknown as { staleCommandFocusCount: number }).staleCommandFocusCount)).toBe(0);
    const { body } = await downloadMarkdown(page);
    expect(body).toBe(beforeMarkdown);
  });
}

for (const kind of ["doc", "brief", "course"] as const) {
  test(`${kind}: stable dock preserves editing across bottom and keyboard-top positions`, async ({ page }, info) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const { read } = await open(page, info.project.name.startsWith("production"), kind);
    const writing = page.getByRole("textbox", { name: kind === "course" ? "Lesson content" : kind === "doc" ? "Doc content" : "Update content", exact: true });
    const dock = page.getByRole("group", { name: "Editor controls", exact: true });
    await expect(dock).toBeVisible();
    await expect(page.locator(".editor-canvas-navigation")).toHaveCount(0);
    for (const width of [320, 375, 430, 767]) {
      await page.setViewportSize({ width, height: 812 });
      const box = (await dock.boundingBox())!;
      expect(box.x + box.width / 2).toBeCloseTo(width / 2, 0);
      expect(box.y + box.height).toBeCloseTo(800, 0);
      expect(box.width).toBeLessThanOrEqual(width - 24);
      const publish = (await page.locator(".topbar").getByRole("button", { name: "Publish", exact: true }).boundingBox())!;
      expect(publish.x + publish.width).toBeLessThanOrEqual(width);
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await writing.fill("Keep this paragraph");
    await page.keyboard.press("Enter");
    await dock.getByRole("button", { name: /^Commands:/ }).click();
    await page.getByRole("menuitem", { name: "Bulleted list", exact: true }).click();
    await page.keyboard.type("A useful note");
    await expect(writing.locator("li")).toHaveText("A useful note");
    await dock.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(writing).not.toContainText("A useful note");
    await dock.getByRole("button", { name: "Redo", exact: true }).click();
    await page.keyboard.type(" more typing");
    await expect(writing).toContainText("A useful note more typing");
    await writing.evaluate((element) => {
      const text = document.createTreeWalker(element.querySelector("p")!, NodeFilter.SHOW_TEXT).nextNode()!;
      const range = document.createRange();
      range.setStart(text, 0); range.setEnd(text, 4);
      const selection = window.getSelection()!;
      selection.removeAllRanges(); selection.addRange(range);
    });
    await dock.getByRole("button", { name: /^Commands:/ }).click();
    await expect(page.locator('[data-writing-selection-menu]')).toHaveCount(0);
    await expect(page.getByRole("menu", { name: "Insert content", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(writing).toBeFocused();
    await waitForDraftSaved(page);
    const saved = (await read()).content[0];
    expect(kind === "course" ? saved.lessons[0].body : saved.body).toContain("Keep this paragraph");
    await page.screenshot({ path: info.outputPath(`${kind}-bottom-dock.png`) });

    await writing.locator("p").first().click();
    await page.evaluate(() => {
      const state = { height: 490, offsetTop: 0 };
      (window as unknown as { dockViewport: typeof state }).dockViewport = state;
      Object.defineProperty(window.visualViewport, "height", { configurable: true, get: () => state.height });
      Object.defineProperty(window.visualViewport, "offsetTop", { configurable: true, get: () => state.offsetTop });
      window.visualViewport!.dispatchEvent(new Event("resize"));
    });
    for (const { height, offsetTop } of [{ height: 490, offsetTop: 0 }, { height: 400, offsetTop: 35 }, { height: 460, offsetTop: 90 }]) {
      await page.evaluate((next) => {
        Object.assign((window as unknown as { dockViewport: typeof next }).dockViewport, next);
        window.visualViewport!.dispatchEvent(new Event("resize"));
        window.visualViewport!.dispatchEvent(new Event("scroll"));
      }, { height, offsetTop });
      await expectKeyboardTopDock(page);
      const detailsToggle = dock.getByRole("button", { name: "Details", exact: true });
      await detailsToggle.click();
      const details = page.getByRole("complementary", { name: "Content details", exact: true });
      await expect(details).toBeVisible();
      const pane = (await details.boundingBox())!;
      expect(pane.y).toBeGreaterThanOrEqual(offsetTop);
      await expectFloatingSurfaceClearDock(page, details);
      expect(pane.x + pane.width / 2).toBeCloseTo(375 / 2, 0);
      await details.press("Escape");
      await expect(writing).toBeFocused();
    }
    await page.screenshot({ path: info.outputPath(`${kind}-dock-keyboard-viewport.png`) });
  });
}

test("portrait touch tablets keep the existing dock cutoff and desktop returns without remounting", async ({ browser }, info) => {
  test.skip(info.project.name !== "production-desktop", "One installed-app touch context covers this device boundary");
  const context = await browser.newContext({ baseURL: info.project.use.baseURL, hasTouch: true, viewport: { width: 834, height: 1194 } });
  try {
    const page = await context.newPage();
    await open(page, true, "course");
    const writer = await page.getByRole("textbox", { name: "Lesson content", exact: true }).elementHandle();
    await expect(page.locator(".editor-frame")).toHaveAttribute("data-cards", "true");
    await expect(page.getByRole("group", { name: "Editor controls", exact: true })).toBeVisible();
    const outlineToggle = page.getByRole("button", { name: "Outline", exact: true });
    const detailsToggle = page.getByRole("button", { name: "Details", exact: true });
    await outlineToggle.click();
    const outline = page.getByRole("complementary", { name: "Course outline", exact: true });
    await expect(outline).toBeVisible();
    const outlineBox = (await outline.boundingBox())!;
    expect(outlineBox.x + outlineBox.width / 2).toBeCloseTo(417, 0);
    await detailsToggle.click();
    await expect(outline).toBeHidden();
    const details = page.getByRole("complementary", { name: "Content details", exact: true });
    await expect(details).toBeVisible();
    const detailsBox = (await details.boundingBox())!;
    expect(detailsBox.x + detailsBox.width / 2).toBeCloseTo(417, 0);
    await detailsToggle.click();
    await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    await expect(page.locator('.editor-frame-controls[data-cards="true"]')).toBeHidden();
    await page.getByRole("button", { name: "Close navigation", exact: true }).click();
    await expect(page.getByRole("group", { name: "Editor controls", exact: true })).toBeVisible();
    await page.setViewportSize({ width: 1194, height: 834 });
    await expect(page.locator(".editor-frame")).not.toHaveAttribute("data-cards", "true");
    await expect(page.getByRole("group", { name: "Editor controls", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Back to content", exact: true })).toBeVisible();
    expect(await writer!.evaluate((node) => node.isConnected)).toBe(true);
    await page.getByRole("textbox", { name: "Lesson content", exact: true }).evaluate((element) => {
      element.focus();
      const text = document.createTreeWalker(element.querySelector("p")!, NodeFilter.SHOW_TEXT).nextNode()!;
      const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 5);
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      element.dispatchEvent(new Event("pointerup", { bubbles: true }));
    });
    await expect(page.locator('[data-writing-selection-menu], .writing-phone-format')).toHaveCount(0);
  } finally { await context.close(); }
});

for (const kind of ["doc", "brief", "course"] as const) {
  test(`${kind}: compact commands require prose focus and cannot overlap panels`, async ({ page }, info) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, info.project.name.startsWith("production"), kind);
    const writing = page.getByRole("textbox", { name: kind === "course" ? "Lesson content" : kind === "doc" ? "Doc content" : "Update content", exact: true });
    const commands = page.getByRole("button", { name: /^Commands:/ });
    await expect(commands).toBeDisabled();
    await page.locator("#editor-title").click();
    await expect(commands).toBeDisabled();
    if (kind === "course") {
      await page.getByRole("textbox", { name: "Lesson title", exact: true }).click();
      await expect(commands).toBeDisabled();
    }
    const details = page.getByRole("button", { name: "Details", exact: true });
    await details.click();
    await expect(commands).toBeDisabled();
    await page.locator("#editor-summary").click();
    await expect(commands).toBeDisabled();
    await details.click();
    await expect(commands).toBeDisabled();
    await writing.locator("p").first().click();
    await expect(commands).toBeEnabled();
    await commands.click();
    await expect(page.getByRole("menu", { name: "Insert content", exact: true })).toBeVisible();
    // Programmatic opens must coordinate too, not only pointer clicks.
    await details.evaluate((button) => (button as HTMLButtonElement).click());
    await expect(page.getByRole("complementary", { name: "Content details", exact: true })).toBeVisible();
    await expect(page.locator(".writing-slash-menu")).toHaveCount(0);
    await expect(commands).toBeDisabled();
    await details.click();
    for (const media of ["image", "video"] as const) {
      await writing.locator("p").first().click();
      await commands.click();
      await page.getByRole("menuitem", { name: media === "image" ? "Image" : "Upload video", exact: true }).click();
      const chooser = page.getByRole("dialog", { name: `Insert ${media}`, exact: true });
      await expect(chooser).toBeVisible();
      await details.evaluate((button) => (button as HTMLButtonElement).click());
      await expect(chooser).toHaveCount(0);
      await expect(commands).toBeDisabled();
      await details.click();
    }
    await writing.locator("p").first().click();
    await commands.click();
    if (kind === "course") {
      await page.getByRole("button", { name: "Outline", exact: true }).evaluate((button) => (button as HTMLButtonElement).click());
      await expect(page.getByRole("complementary", { name: "Course outline", exact: true })).toBeVisible();
      await expect(page.locator(".writing-slash-menu")).toHaveCount(0);
      await expect(commands).toBeDisabled();
      await page.getByRole("button", { name: "Outline", exact: true }).click();
    } else await page.keyboard.press("Escape");
    await page.locator("#editor-title").click();
    const dock = page.getByRole("group", { name: "Editor controls", exact: true });
    await page.mouse.move(0, 0);
    for (const button of await dock.getByRole("button").all()) {
      const styles = await button.evaluate((element) => {
        const css = getComputedStyle(element);
        return { shadow: css.boxShadow, border: css.borderColor, background: css.backgroundColor, appearance: css.appearance, classes: element.className };
      });
      expect(styles.classes).not.toContain("shadow-surface");
      expect(styles.border).toBe("rgba(0, 0, 0, 0)");
      expect(styles.background).toBe("rgba(0, 0, 0, 0)");
      expect(styles.appearance).toBe("none");
      expect(styles.shadow === "none" || !/rgba?\([^)]*(?:1\)|0\.[1-9])/.test(styles.shadow)).toBe(true);
    }
    await page.screenshot({ path: info.outputPath(`${kind}-flat-disabled-dock.png`) });
  });
}

test("compact selection stays native and Commands only opens insertion tools", async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, info.project.name.startsWith("production"), "course");
  const writing = page.getByRole("textbox", { name: "Lesson content", exact: true });
  await writing.fill("Format this sentence");
  await writing.evaluate((element) => {
    const text = document.createTreeWalker(element.querySelector("p")!, NodeFilter.SHOW_TEXT).nextNode()!;
    const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 6);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    element.dispatchEvent(new Event("pointerup", { bubbles: true }));
  });
  await expect(page.locator('[data-writing-selection-menu]')).toHaveCount(0);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("Format");
  const commands = page.getByRole("button", { name: /^Commands:/ });
  await expect(commands).toBeEnabled();
  if (info.project.use.hasTouch) await commands.tap(); else await commands.click();
  const menu = page.getByRole("menu", { name: "Insert content", exact: true });
  await expect(menu).toBeVisible();
  await expect(page.locator('[data-writing-selection-menu]')).toHaveCount(0);
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe("");
  await menu.getByRole("menuitem", { name: "Heading 2", exact: true }).click();
  await expect(writing.locator("h2")).toHaveText("Format this sentence");
  await expect(page.locator('[data-writing-selection-menu]')).toHaveCount(0);
  await writing.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/hea");
  await expect(page.locator(".writing-slash-menu")).toBeVisible();
  await page.setViewportSize({ width: 900, height: 812 });
  // A touch-first tablet stays compact in portrait; a mouse viewport leaves it.
  if (!info.project.use.hasTouch) {
    await expect(page.locator(".writing-slash-menu")).toHaveCount(0);
    await expect(writing).toContainText("/hea");
  }
});

test("compact dock follows independent viewport sizes, native app panning and dismissal", async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, info.project.name.startsWith("production"), "course");
  const writing = page.getByRole("textbox", { name: "Lesson content", exact: true });
  await writing.locator("p").first().click();
  await page.evaluate(() => {
    const state = { height: 490, offsetTop: 0, innerHeight: 812 };
    (window as unknown as { dockViewport: typeof state }).dockViewport = state;
    for (const key of ["height", "offsetTop"] as const) Object.defineProperty(window.visualViewport, key, { configurable: true, get: () => state[key] });
    Object.defineProperty(window, "innerHeight", { configurable: true, get: () => state.innerHeight });
  });
  const dock = page.getByRole("group", { name: "Editor controls", exact: true });
  for (const state of [
    { height: 490, offsetTop: 0, innerHeight: 812 },
    { height: 430, offsetTop: 30, innerHeight: 490 },
    { height: 390, offsetTop: 60, innerHeight: 720 },
    { height: 470, offsetTop: 80, innerHeight: 812 },
  ]) {
    await page.evaluate((next) => {
      Object.assign((window as unknown as { dockViewport: typeof next }).dockViewport, next);
      window.visualViewport!.dispatchEvent(new Event("resize"));
      window.visualViewport!.dispatchEvent(new Event("scroll"));
      window.dispatchEvent(new Event("scroll"));
    }, state);
    await expectKeyboardTopDock(page);
  }
  // WebKit can pan the app's client rectangle independently of its scrollTop.
  await page.locator(".app").evaluate((app) => { (app as HTMLElement).style.top = "-84px"; window.dispatchEvent(new Event("scroll")); });
  await expectKeyboardTopDock(page);
  await page.getByRole("button", { name: /^Commands:/ }).click();
  const menu = page.locator(".writing-slash-menu");
  await expect(menu).toBeVisible();
  await expectFloatingSurfaceClearDock(page, menu);
  await page.keyboard.press("Escape");
  // The course title scrolls out of the keyboard writing band. Model keyboard
  // dismissal directly instead of trying to tap that clipped title.
  await writing.evaluate(element => element.blur());
  await page.locator(".app").evaluate((app) => { (app as HTMLElement).style.removeProperty("top"); });
  await page.evaluate(() => {
    Object.assign((window as unknown as { dockViewport: { height: number; offsetTop: number; innerHeight: number } }).dockViewport, { height: 812, offsetTop: 90, innerHeight: 490 });
    window.visualViewport!.dispatchEvent(new Event("resize")); window.dispatchEvent(new Event("scroll"));
  });
  await expect.poll(async () => { const box = (await dock.boundingBox())!; return box.y + box.height; }).toBeCloseTo(800, 0);
  await page.screenshot({ path: info.outputPath("dock-after-viewport-dismissal.png") });
});

for (const device of ["iPhone", "iPad", "Android"] as const) {
  test(`${device}: compact dock clears native keyboard controls and centers cards`, async ({ page }, info) => {
    await page.addInitScript((device) => {
      const apple = device !== "Android";
      Object.defineProperty(navigator, "userAgent", { configurable: true, value: device === "iPhone" ? "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile Safari/604.1" : device === "iPad" ? "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15" : "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36" });
      Object.defineProperty(navigator, "platform", { configurable: true, value: device === "iPad" ? "MacIntel" : apple ? "iPhone" : "Linux armv8l" });
      Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 5 });
    }, device);
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, info.project.name.startsWith("production"), "course");
    const writing = page.getByRole("textbox", { name: "Lesson content", exact: true });
    await writing.locator("p").first().click();
    await page.evaluate(() => {
      const state = { height: 490, offsetTop: 0 };
      (window as unknown as { dockViewport: typeof state }).dockViewport = state;
      Object.defineProperty(window.visualViewport, "height", { configurable: true, get: () => state.height });
      Object.defineProperty(window.visualViewport, "offsetTop", { configurable: true, get: () => state.offsetTop });
    });
    const dock = page.getByRole("group", { name: "Editor controls", exact: true });
    for (const state of [
      { height: 490, offsetTop: 0 }, { height: 430, offsetTop: 35 }, { height: 460, offsetTop: 60 },
      ...(device === "Android" ? [{ height: 350, offsetTop: 0 }] : []),
      { height: 320, offsetTop: 0 },
      ...(device === "Android" ? [{ height: 250, offsetTop: 0 }] : []),
    ]) {
      await page.evaluate((next) => {
        Object.assign((window as unknown as { dockViewport: typeof next }).dockViewport, next);
        window.visualViewport!.dispatchEvent(new Event("resize"));
        window.visualViewport!.dispatchEvent(new Event("scroll"));
      }, state);
      await expectKeyboardTopDock(page);
      await expectMobileWritingBand(page, 7);
      await expect(page.locator(".writing-document-heading")).toHaveCSS("position", "relative");
      const padding = await page.locator(".main-content").evaluate((owner) => {
        const style = getComputedStyle(owner);
        return { padding: parseFloat(style.paddingBottom), clearance: parseFloat(style.getPropertyValue("--editor-dock-clearance")) };
      });
      expect(padding.padding).toBeGreaterThanOrEqual(padding.clearance);
    }
    for (const name of ["Outline", "Details"] as const) {
      await dock.getByRole("button", { name, exact: true }).click();
      const card = page.getByRole("complementary", { name: name === "Outline" ? "Course outline" : "Content details", exact: true });
      await expect(card).toBeVisible();
      const box = (await card.boundingBox())!;
      expect(box.x + box.width / 2).toBeCloseTo(187.5, 0);
      await expectFloatingSurfaceClearDock(page, card);
      await dock.getByRole("button", { name, exact: true }).click();
    }
    await page.locator("#editor-title").click();
    await page.evaluate(() => {
      Object.assign((window as unknown as { dockViewport: { height: number; offsetTop: number } }).dockViewport, { height: 812, offsetTop: 0 });
      window.visualViewport!.dispatchEvent(new Event("resize"));
    });
    await expect.poll(async () => { const box = (await dock.boundingBox())!; return box.y + box.height; }).toBeCloseTo(800, 0);
    await page.screenshot({ path: info.outputPath(`${device}-centered-card-keyboard-clearance.png`) });
  });
}

test("bottom toolbar stays steady through wrapped lines, selection and scrolling", async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, info.project.name.startsWith("production"), "doc");
  const writing = page.getByRole("textbox", { name: "Doc content", exact: true });
  const dock = page.getByRole("group", { name: "Editor controls", exact: true });
  await writing.fill("A long paragraph that wraps across several lines so the cursor moves while the controls remain in a predictable place.");
  const canvasLeft = (await writing.boundingBox())!.x;
  for (const offset of [5, 55, 90]) {
    await writing.evaluate((element, offset) => {
      element.focus();
      const text = document.createTreeWalker(element.querySelector("p")!, NodeFilter.SHOW_TEXT).nextNode()!;
      const range = document.createRange(); range.setStart(text, offset); range.collapse(true);
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    }, offset);
    await expect.poll(async () => { const box = (await dock.boundingBox())!; return box.y + box.height; }).toBeCloseTo(800, 0);
  }
  await writing.fill("Final line");
  await writing.press("End");
  await writing.press("Enter");
  await expect(writing.locator("p").last()).toHaveText("");
  expect((await writing.boundingBox())!.x).toBe(canvasLeft);
  await expect.poll(async () => { const box = (await dock.boundingBox())!; return box.y + box.height; }).toBeCloseTo(800, 0);
  await dock.getByRole("button", { name: /^Commands:/ }).tap();
  const menu = page.getByRole("menu", { name: "Insert content", exact: true });
  await expect(menu).toBeVisible();
  const box = (await menu.boundingBox())!, controls = (await dock.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(controls.y - 7);
  await page.keyboard.press("Escape");
  await expect(writing).toBeFocused();
  await page.screenshot({ path: info.outputPath("stable-bottom-toolbar.png") });
});

test("touch selection and manual scrolling do not pull writing back to the caret", async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, info.project.name.startsWith("production"), "doc");
  const writer = page.getByRole("textbox", { name: "Doc content", exact: true });
  await writer.fill(Array.from({ length: 60 }, (_, i) => `Writing paragraph ${i + 1}.`).join("\n\n"));
  const owner = page.locator(".main-content");
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, "height", { configurable: true, get: () => 490 });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  // Allow the resize correction to settle before an intentional scroll gesture.
  await expectKeyboardTopDock(page);
  await expect(page.locator('.editor-frame-controls[data-dock="true"]')).toHaveAttribute("data-dock-settled", "true");
  await expect.poll(() => owner.evaluate((element) => element.scrollTop)).toBeGreaterThan(500);
  await owner.evaluate(async (element) => {
    await Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {})));
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
  });
  await owner.evaluate((element) => {
    element.dispatchEvent(new Event("touchstart", { bubbles: true }));
    element.dispatchEvent(new Event("touchmove", { bubbles: true }));
    element.scrollTop = 300;
    // Mobile selection events can arrive while a scroll gesture is in flight.
    // Change the collapsed selection so this exercises that event, rather than
    // redispatching an unchanged caret which the editor correctly ignores.
    const paragraph = element.querySelector('.writing-content p:last-child')!;
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
    let text = walker.nextNode()!;
    for (let next = walker.nextNode(); next; next = walker.nextNode()) text = next;
    const range = document.createRange(); range.setStart(text, Math.max(0, text.textContent!.length - 1)); range.collapse(true);
    const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    document.dispatchEvent(new Event("selectionchange"));
    window.dispatchEvent(new Event("touchend"));
  });
  await page.waitForTimeout(180); // Check that post-gesture events do not snap the canvas back.
  expect(await owner.evaluate((element) => element.scrollTop)).toBeCloseTo(300, 0);
  // A hardware keyboard on a touch device explicitly returns to the caret.
  // That navigation must resume protection without waiting for typed text.
  await writer.press("End");
  await expectMobileWritingBand(page);
  const commands = page.getByRole("button", { name: /^Commands:/ });
  await commands.dispatchEvent("pointerdown", { pointerId: 1, pointerType: "touch", isPrimary: true, button: 0 });
  await expect(page.locator(".writing-slash-menu")).toHaveCount(0);
  await commands.dispatchEvent("pointercancel", { pointerId: 1, pointerType: "touch", isPrimary: true });
  await expect(page.locator(".writing-slash-menu")).toHaveCount(0);
  await commands.tap();
  await expect(page.locator(".writing-slash-menu")).toBeVisible();
});

test("typing stays above the dock while the keyboard viewport keeps changing", async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, info.project.name.startsWith("production"), "doc");
  const writer = page.getByRole("textbox", { name: "Doc content", exact: true });
  const dock = page.getByRole("group", { name: "Editor controls", exact: true });
  await writer.locator("p").nth(20).click();
  await page.evaluate(() => {
    const state = { height: 600, offsetTop: 0 };
    (window as unknown as { movingKeyboardViewport: typeof state }).movingKeyboardViewport = state;
    for (const key of ["height", "offsetTop"] as const)
      Object.defineProperty(window.visualViewport, key, { configurable: true, get: () => state[key] });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expectKeyboardTopDock(page);
  await writer.locator("p").nth(20).evaluate((paragraph) => {
    const owner = paragraph.closest<HTMLElement>(".main-content")!;
    owner.scrollTop += paragraph.getBoundingClientRect().bottom - (window.visualViewport!.height - 48 - 64);
  });
  // Model visualViewport events continuing through native text input. Inspect
  // the rendered line during the burst, so a correction only after it ends
  // cannot hide the original regression.
  await page.evaluate(() => {
    const state = (window as unknown as { movingKeyboardViewport: { height: number; offsetTop: number } }).movingKeyboardViewport;
    const samples: number[] = [];
    const timer = window.setInterval(() => {
      state.height = Math.max(410, state.height - 7);
      window.visualViewport!.dispatchEvent(new Event("resize"));
      requestAnimationFrame(() => requestAnimationFrame(() => {
        const selection = window.getSelection();
        if (!selection?.isCollapsed || !selection.rangeCount) return;
        const caret = Array.from(selection.getRangeAt(0).getClientRects()).find(rect => rect.height > 0);
        const dock = document.querySelector('.editor-frame-controls[data-dock="true"]');
        if (caret && dock) {
          const bounds = dock.getBoundingClientRect();
          const nativeBottom = window.visualViewport!.offsetTop + window.visualViewport!.height - 48;
          samples.push(Math.max(bounds.bottom + 7 - caret.top, caret.bottom - nativeBottom + 7));
        }
      }));
    }, 16);
    (window as unknown as { movingKeyboardTest: { samples: number[]; timer: number } }).movingKeyboardTest = { samples, timer };
  });
  await page.keyboard.type(" Keep this line visible.", { delay: 25 });
  const samples = await page.evaluate(() => {
    const state = (window as unknown as { movingKeyboardTest: { samples: number[]; timer: number } }).movingKeyboardTest;
    clearInterval(state.timer);
    return state.samples;
  });
  expect(samples.length).toBeGreaterThan(10);
  expect(Math.max(...samples)).toBeLessThanOrEqual(0);
  await expect(writer).toContainText("Keep this line visible.");
  await page.screenshot({ path: info.outputPath("mobile-keyboard-viewport-burst.png") });
});

for (const kind of ["doc", "brief", "course"] as const) {
  test(`${kind}: final mobile writing row clears the dock with independent layout and keyboard bounds`, async ({ page }, info) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, info.project.name.startsWith("production"), kind, 2, item => {
      item.body += "\n\nFinal mobile writing row.";
      if (kind === "course") item.lessons[0].body = item.body;
    });
    const writer = page.locator('.writing-content[contenteditable="true"]');
    await writer.locator("p").last().tap({ position: { x: 4, y: 12 } });
    await expect.poll(() => writer.evaluate((element) => {
      const line = Array.from(element.querySelectorAll(":scope > p")).at(-1)!;
      return line.contains(window.getSelection()?.focusNode || null);
    })).toBe(true);
    await page.evaluate(() => {
      const state = { height: 812, offsetTop: 0, clientHeight: 812 };
      (window as unknown as { independentWritingViewport: typeof state }).independentWritingViewport = state;
      for (const key of ["height", "offsetTop"] as const) Object.defineProperty(window.visualViewport, key, { configurable: true, get: () => state[key] });
      Object.defineProperty(document.documentElement, "clientHeight", { configurable: true, get: () => state.clientHeight });
      Object.defineProperty(window, "innerHeight", { configurable: true, get: () => state.clientHeight });
    });
    for (const state of [
      { height: 812, offsetTop: 0, clientHeight: 812 },
      { height: 490, offsetTop: 0, clientHeight: 812 },
      { height: 390, offsetTop: 35, clientHeight: 390 },
      { height: 812, offsetTop: 0, clientHeight: 812 },
    ]) {
      await page.evaluate((next) => {
        Object.assign((window as unknown as { independentWritingViewport: typeof next }).independentWritingViewport, next);
        window.visualViewport!.dispatchEvent(new Event("resize"));
      }, state);
      await page.locator(".main-content").evaluate((owner) => { owner.scrollTop = owner.scrollHeight; });
      await expect.poll(() => writer.evaluate((element) => {
        const line = Array.from(element.querySelectorAll(":scope > p")).at(-1)!.getBoundingClientRect();
        const dock = element.closest(".app")!.querySelector('.editor-frame-controls[data-dock="true"]')!.getBoundingClientRect();
        const header = element.closest(".app")!.querySelector(".topbar")!.getBoundingClientRect();
        if (dock.top - Math.max(header.bottom, window.visualViewport!.offsetTop) < 32) {
          const nativeBottom = window.visualViewport!.offsetTop + window.visualViewport!.height - 48;
          return Math.max(dock.bottom + 7 - line.top, line.bottom - nativeBottom + 7);
        }
        return line.bottom - dock.top + 7;
      }), { message: `Final ${kind} row with viewport ${state.height}, layout ${state.clientHeight}` }).toBeLessThanOrEqual(0);
      await expect(writer.locator("p").last()).toHaveText("Final mobile writing row.");
    }
    await page.screenshot({ path: info.outputPath(`${kind}-final-mobile-writing-row.png`) });
  });
}

async function nativeWritingSelectionMatches(page: Page) {
  return page.locator('.writing-content[contenteditable="true"]').evaluate(writer => {
    const editor = (writer as HTMLElement & { __lexicalEditor: LexicalEditor }).__lexicalEditor;
    const native = window.getSelection();
    const selection = editor.getEditorState()._selection as RangeSelection | null;
    if (!native?.rangeCount || !selection?.anchor || !selection.focus) return false;
    return editor.getElementByKey(selection.anchor.key)?.contains(native.anchorNode)
      && editor.getElementByKey(selection.focus.key)?.contains(native.focusNode)
      && selection.anchor.offset === native.anchorOffset
      && selection.focus.offset === native.focusOffset
      && selection.isCollapsed() === native.isCollapsed;
  });
}

test("native caret synchronizes after a repeated programmatic selection", async ({ page }, info) => {
  const { writer } = await prepareCommandLifecycle(page, info.project.name.startsWith("production"));
  // A no-op programmatic element selection can leave Lexical waiting for an
  // acknowledgment that WebKit never sends. Its next genuine native caret
  // event must still update editor state. Use the library's real select API;
  // do not manufacture its internal event-suppression flag.
  for (let index = 0; index < 2; index++) {
    await writer.evaluate(writer => {
      const editor = (writer as HTMLElement & { __lexicalEditor: LexicalEditor }).__lexicalEditor;
      editor.update(() => {
        const root = editor.getEditorState()._nodeMap.get("root") as ElementNode;
        root.select(0, root.getChildrenSize());
      }, { discrete: true });
    });
    await page.waitForTimeout(100); // Deliver actual selectionchange tasks, if any.
  }
  const paragraph = writer.locator("p").nth(5);
  await paragraph.evaluate(paragraph => {
    const text = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT).nextNode()!;
    window.getSelection()!.setBaseAndExtent(text, 3, text, 3);
  });
  await expect.poll(() => nativeWritingSelectionMatches(page)).toBe(true);
  expect(await page.evaluate(() => window.getSelection()!.isCollapsed)).toBe(true);
  await page.keyboard.type("SYNC-");
  await expect(paragraph).toHaveText("ParSYNC-agraph 6. Keep the writer and every saved word intact.");
  await writer.dispatchEvent("touchstart", { bubbles: true });
  for (const index of [12, 8, 23, 4, 5]) {
    await writer.locator("p").nth(index).evaluate(paragraph => {
      paragraph.dispatchEvent(new Event("touchmove", { bubbles: true }));
      const text = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT).nextNode()!;
      window.getSelection()!.setBaseAndExtent(text, 3, text, 3);
    });
    await expect.poll(() => nativeWritingSelectionMatches(page)).toBe(true);
  }
  await page.evaluate(() => window.dispatchEvent(new Event("touchend")));
  await page.keyboard.type("DRAG-");
  await expect(paragraph).toHaveText("ParDRAG-SYNC-agraph 6. Keep the writer and every saved word intact.");
});

test("a delayed native caret after a touch tap never reveals the previous paragraph", async ({ page }, info) => {
  const { writer, dock, commands } = await prepareCommandLifecycle(page, info.project.name.startsWith("production"));
  const owner = page.locator(".main-content");
  await animateCommandKeyboardClosing(page);
  await commands.tap();
  const menu = page.getByRole("menu", { name: "Insert content", exact: true });
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Close menu esc", exact: true }).tap();
  await changeCommandViewport(page, { height: 490, offsetTop: 0, clientHeight: 812, appPan: 0 });
  await expectKeyboardTopDock(page);
  await expectMobileWritingBand(page);
  const dockTop = (await dock.boundingBox())!.y;
  // Exercise both native orders: selection committed before touchend, and
  // selection still pointing to the old paragraph for several paints afterward.
  for (const [index, delayed] of [[5, true], [18, false], [3, true], [22, false]] as const) {
    if (index === 18) {
      await animateCommandKeyboardClosing(page);
      const details = dock.getByRole("button", { name: "Details", exact: true });
      await details.tap();
      await expect(page.getByRole("complementary", { name: "Content details", exact: true })).toBeVisible();
      await details.tap();
      await changeCommandViewport(page, { height: 490, offsetTop: 0, clientHeight: 812, appPan: 0 });
      await expect(writer).toBeFocused();
      await expectKeyboardTopDock(page);
    }
    const paragraph = writer.locator("p").nth(index);
    await paragraph.evaluate((paragraph) => {
      const owner = paragraph.closest<HTMLElement>(".main-content")!;
      owner.dispatchEvent(new Event("touchstart", { bubbles: true }));
      owner.dispatchEvent(new Event("touchmove", { bubbles: true }));
      owner.scrollTop += paragraph.getBoundingClientRect().top - 140;
      window.dispatchEvent(new Event("touchend"));
    });
    await expect.poll(async () => (await paragraph.boundingBox())!.y).toBeCloseTo(140, 0);
    const before = await owner.evaluate(element => element.scrollTop);
    const pending = await paragraph.evaluate(async (paragraph, delayed) => {
      const paint = async () => { for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame); };
      const place = () => {
        const text = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT).nextNode()!;
        const range = document.createRange(); range.setStart(text, 2); range.collapse(true);
        const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
        document.dispatchEvent(new Event("selectionchange"));
      };
      paragraph.dispatchEvent(new Event("touchstart", { bubbles: true }));
      if (!delayed) place();
      window.dispatchEvent(new Event("touchend"));
      // Native viewport/owner events can arrive before the new selection.
      window.visualViewport!.dispatchEvent(new Event("scroll"));
      paragraph.closest(".main-content")!.dispatchEvent(new Event("scroll"));
      await paint();
      const pending = paragraph.closest(".main-content")!.scrollTop;
      if (delayed) { place(); await paint(); }
      return pending;
    }, delayed);
    expect(pending).toBeCloseTo(before, 0);
    expect(await owner.evaluate(element => element.scrollTop)).toBeCloseTo(before, 0);
    expect(await paragraph.evaluate(element => element.contains(window.getSelection()!.focusNode))).toBe(true);
    await expect.poll(() => nativeWritingSelectionMatches(page)).toBe(true);
    await page.keyboard.type("tap-check ");
    await expect(paragraph).toContainText("tap-check ");
    await expectMobileWritingBand(page);
    expect((await dock.boundingBox())!.y).toBeCloseTo(dockTop, 0);
  }
});

test("repeated native paragraph taps keep the new cursor and typing target", async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, info.project.name.startsWith("production"), "doc");
  const writer = page.locator('.writing-content[contenteditable="true"]');
  await writer.locator("p").first().tap();
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, "height", { configurable: true, get: () => 490 });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expectKeyboardTopDock(page);
  for (const index of [20, 5, 17, 4, 21, 7]) {
    const paragraph = writer.locator("p").nth(index);
    const before = await paragraph.evaluate((paragraph) => {
      const owner = paragraph.closest<HTMLElement>(".main-content")!;
      owner.dispatchEvent(new Event("touchstart", { bubbles: true }));
      owner.dispatchEvent(new Event("touchmove", { bubbles: true }));
      owner.scrollTop += paragraph.getBoundingClientRect().top - 140;
      window.dispatchEvent(new Event("touchend"));
      return owner.scrollTop;
    });
    // Scrolling puts every target at the same screen point. Keep these single
    // taps outside the browser's double/triple-click word/paragraph selection.
    await page.waitForTimeout(600);
    await paragraph.tap({ position: { x: 8, y: 12 } });
    await expect.poll(() => paragraph.evaluate(element => element.contains(window.getSelection()!.focusNode))).toBe(true);
    await expect.poll(() => nativeWritingSelectionMatches(page)).toBe(true);
    expect(await page.evaluate(() => window.getSelection()!.isCollapsed)).toBe(true);
    await paragraph.evaluate(async () => { for (let i = 0; i < 4; i++) await new Promise(requestAnimationFrame); });
    expect(await page.locator(".main-content").evaluate(element => element.scrollTop)).toBeCloseTo(before, 0);
    await page.keyboard.type(`target-${index} `);
    await expect(paragraph).toContainText(`target-${index} `);
    await expectMobileWritingBand(page);
  }
});

test("a later native owner scroll protects the caret without moving the dock", async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, info.project.name.startsWith("production"), "doc");
  const writer = page.locator('.writing-content[contenteditable="true"]');
  await writer.locator("p").nth(20).tap();
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, "height", { configurable: true, get: () => 490 });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  const dock = page.getByRole("group", { name: "Editor controls", exact: true });
  await expectKeyboardTopDock(page);
  // Native caret alignment can adjust the page after the keyboard has settled,
  // without a new visualViewport event or a touch/wheel gesture.
  const dockTop = (await dock.boundingBox())!.y;
  const owner = page.locator(".main-content");
  await expectMobileWritingBand(page);
  await owner.evaluate((owner) => { owner.scrollTop -= 120; });
  await expectMobileWritingBand(page);
  expect((await dock.boundingBox())!.y).toBeCloseTo(dockTop, 0);
});

test("last writing line stays reachable when innerHeight is already keyboard-sized", async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, info.project.name.startsWith("production"), "doc");
  const writer = page.getByRole("textbox", { name: "Doc content", exact: true });
  await writer.fill(Array.from({ length: 60 }, (_, i) => `Writing line ${i + 1}.`).join("\n\n"));
  await writer.press("End");
  await writer.press("Enter");
  await expect(writer.locator("p").last()).toHaveText("");
  await page.evaluate(() => {
    const state = { height: 390, offsetTop: 35, innerHeight: 390 };
    (window as unknown as { keyboardViewport: typeof state }).keyboardViewport = state;
    for (const key of ["height", "offsetTop"] as const) Object.defineProperty(window.visualViewport, key, { configurable: true, get: () => state[key] });
    Object.defineProperty(window, "innerHeight", { configurable: true, get: () => state.innerHeight });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  for (const pan of [false, true]) {
    if (pan) await page.locator(".app").evaluate((app) => {
      (app as HTMLElement).style.top = "-84px";
      window.visualViewport!.dispatchEvent(new Event("resize"));
    });
    await expectKeyboardTopDock(page);
    await expectMobileWritingBand(page, 7);
  }
  await page.screenshot({ path: info.outputPath("last-line-keyboard-sized-inner-height.png") });
});

for (const device of ["iPhone", "iPad"] as const) {
  for (const missingCaretRect of [false, true]) {
    test(`${device}: typing and caret taps stay inside the protected mobile band${missingCaretRect ? " without collapsed rectangles" : ""}`, async ({ page }, info) => {
      await page.addInitScript(({ device, missingCaretRect }) => {
        Object.defineProperty(navigator, "userAgent", { configurable: true, value: device === "iPhone" ? "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/143.0 Mobile Safari/604.1" : "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15" });
        Object.defineProperty(navigator, "platform", { configurable: true, value: device === "iPhone" ? "iPhone" : "MacIntel" });
        Object.defineProperty(navigator, "maxTouchPoints", { configurable: true, value: 5 });
        if (missingCaretRect) {
          const native = Range.prototype.getClientRects;
          Range.prototype.getClientRects = function () { return this.collapsed ? [] as unknown as DOMRectList : native.call(this); };
        }
      }, { device, missingCaretRect });
      await page.setViewportSize(device === "iPhone" ? { width: 375, height: 812 } : { width: 1024, height: 1366 });
      await open(page, info.project.name.startsWith("production"), "doc");
      const writer = page.getByRole("textbox", { name: "Doc content", exact: true });
      await writer.locator("p").first().tap();
      const visibleHeight = device === "iPhone" ? 490 : 860;
      await page.evaluate((height) => {
        const state = { height, offsetTop: 0 };
        (window as unknown as { caretViewport: typeof state }).caretViewport = state;
        for (const key of ["height", "offsetTop"] as const) Object.defineProperty(window.visualViewport, key, { configurable: true, get: () => state[key] });
        window.visualViewport!.dispatchEvent(new Event("resize"));
      }, visibleHeight);
      const dock = page.getByRole("group", { name: "Editor controls", exact: true });
      await expectKeyboardTopDock(page);
      const lane = (await dock.boundingBox())!;
      const paragraph = writer.locator("p").nth(20);
      const targetTop = await writer.evaluate(() => {
        const dock = document.querySelector('.editor-frame-controls[data-dock="true"]')!.getBoundingClientRect();
        const heading = document.querySelector(".writing-document-heading")!.getBoundingClientRect();
        return Math.max(dock.bottom + 8, heading.bottom) + 32;
      });
      // A manual scroll places a row in the exposed writing area; tapping it
      // must resume caret protection without moving the controls.
      await paragraph.evaluate((paragraph, top) => {
        const owner = paragraph.closest<HTMLElement>(".main-content")!;
        owner.dispatchEvent(new Event("touchstart", { bubbles: true }));
        owner.dispatchEvent(new Event("touchmove", { bubbles: true }));
        owner.scrollTop = Math.round(owner.scrollTop + paragraph.getBoundingClientRect().top - top);
        window.dispatchEvent(new Event("touchend"));
      }, targetTop);
      await expect.poll(async () => (await paragraph.boundingBox())!.y).toBeCloseTo(targetTop, 0);
      expect((await paragraph.boundingBox())!.x + 4).toBeLessThan(lane.x);
      await paragraph.tap({ position: { x: 4, y: 12 } });
      await expectMobileWritingBand(page);
      expect((await dock.boundingBox())!.y).toBeCloseTo(lane.y, 0);
      await page.keyboard.type("Hi. Keep this writing line visible as it wraps across the available space. ");
      await expect(writer).toContainText("Keep this writing line visible");
      await expectMobileWritingBand(page);
      expect((await dock.boundingBox())!.y).toBeCloseTo(lane.y, 0);
      // Model native panning separately from the owner's scroll position.
      await page.locator(".app").evaluate((app) => { (app as HTMLElement).style.top = "84px"; window.dispatchEvent(new Event("scroll")); });
      await expectMobileWritingBand(page);
      await page.keyboard.type("Still visible after panning. ");
      await expectMobileWritingBand(page);
      await expectKeyboardTopDock(page);
      await page.getByRole("button", { name: /^Commands:/ }).tap();
      await expect(page.getByRole("menu", { name: "Insert content", exact: true })).toBeVisible();
      await page.getByRole("menuitem", { name: "Close menu esc", exact: true }).tap();
      await expect(writer).toBeFocused();
      await page.keyboard.type("Returned to writing. ");
      await expectMobileWritingBand(page);
      await page.screenshot({ path: info.outputPath(`${device}-fixed-dock-active-row-${missingCaretRect ? "fallback" : "native"}.png`) });
      const owner = page.locator(".main-content");
      const title = page.locator("#editor-title");
      await title.evaluate(async (input) => {
        (input as HTMLTextAreaElement).focus({ preventScroll: true });
        (input as HTMLTextAreaElement).setSelectionRange(1, 1);
        await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      });
      // Isolate application events from the browser's own native-field scrolling.
      // The old prose caret must not pull the canvas during title-field input.
      const scrolled = await owner.evaluate((owner) => { owner.scrollTop += 300; return owner.scrollTop; });
      await title.dispatchEvent("input", { bubbles: true });
      await page.evaluate(() => document.dispatchEvent(new Event("selectionchange")));
      await page.waitForTimeout(180); // Covers the focus/viewport settling delay.
      expect(await owner.evaluate((owner) => owner.scrollTop)).toBeCloseTo(scrolled, 0);
    });
  }
}

for (const reduced of [false, true]) {
  test(`touch viewport changes preserve immediate geometry and focus${reduced ? " with reduced motion" : ""}`, async ({ page }, info) => {
    await page.emulateMedia({ reducedMotion: reduced ? "reduce" : "no-preference" });
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, info.project.name.startsWith("production"), "doc");
    const writer = page.getByRole("textbox", { name: "Doc content", exact: true });
    await writer.locator("p").first().click();
    await page.evaluate(() => {
      const state = { height: 430, offsetTop: 0 };
      (window as unknown as { motionViewport: typeof state }).motionViewport = state;
      for (const key of ["height", "offsetTop"] as const) Object.defineProperty(window.visualViewport, key, { configurable: true, get: () => state[key] });
      window.visualViewport!.dispatchEvent(new Event("resize"));
    });
    const dock = page.getByRole("group", { name: "Editor controls", exact: true });
    const surface = dock.locator(".editor-controls-surface");
    await expectKeyboardTopDock(page);
    // Native keyboard motion already moves the visual viewport. The controls
    // must follow that anchor without starting a second movement animation.
    const samples = await dock.evaluate(async (element) => {
      (window as unknown as { motionViewport: { height: number } }).motionViewport.height = 700;
      window.visualViewport!.dispatchEvent(new Event("resize"));
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const surface = element.querySelector<HTMLElement>(".editor-controls-surface")!;
      const anchor = element.getBoundingClientRect();
      const frames = [];
      for (let frame = 0; frame < 4; frame++) {
        await new Promise(requestAnimationFrame);
        const box = surface.getBoundingClientRect();
        frames.push({ top: box.top, bottom: box.bottom, width: box.width });
      }
      return { anchorBottom: anchor.bottom, anchorTop: anchor.top, animated: surface.getAnimations().length > 0, frames };
    });
    const headerBottom = (await page.locator(".topbar").boundingBox())!;
    expect(samples.anchorTop + (samples.anchorBottom - samples.anchorTop) / 2).toBeCloseTo(headerBottom.y + headerBottom.height / 2, 0);
    expect(samples.animated).toBe(false);
    for (const frame of samples.frames) {
      expect(frame.top).toBeGreaterThanOrEqual(headerBottom.y);
      expect(frame.bottom).toBeLessThanOrEqual(headerBottom.y + headerBottom.height);
      expect(frame.top).toBeCloseTo(samples.anchorTop, 0);
      expect(frame.bottom).toBeCloseTo(samples.anchorBottom, 0);
    }
    // Opening after viewport movement produces one focused menu; closing
    // synchronously restores the saved editing target.
    await dock.getByRole("button", { name: /^Commands:/ }).evaluate((button) => (button as HTMLButtonElement).click());
    const menu = page.getByRole("menu", { name: "Insert content", exact: true });
    await expect(menu).toBeVisible();
    await expect(writer).not.toBeFocused();
    await expect.poll(() => surface.evaluate((element) => element.getAnimations().length)).toBe(0);
    expect(await menu.evaluate((element) => getComputedStyle(element).animationName)).toBe(reduced ? "none" : "writing-touch-menu-enter");
    await expectFloatingSurfaceClearDock(page, menu);
    await menu.getByRole("menuitem", { name: "Close menu esc", exact: true }).click();
    await expect(writer).toBeFocused();
    await page.keyboard.type("Still writing. ");
    await expect(writer).toContainText("Still writing.");
    await page.screenshot({ path: info.outputPath(`touch-motion-${reduced ? "reduced" : "normal"}.png`) });
  });
}

test("compact insertion palette exposes commands in a short keyboard viewport", async ({ page }, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "userAgent", { configurable: true, value: "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile Safari/604.1" });
  });
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, info.project.name.startsWith("production"), "course");
  const writing = page.getByRole("textbox", { name: "Lesson content", exact: true });
  const dock = page.getByRole("group", { name: "Editor controls", exact: true });
  await writing.locator("p").first().click();
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, "height", { configurable: true, get: () => 390 });
    Object.defineProperty(window.visualViewport, "offsetTop", { configurable: true, get: () => 0 });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expectKeyboardTopDock(page);
  if (info.project.use.hasTouch) await dock.getByRole("button", { name: /^Commands:/ }).tap();
  else await dock.getByRole("button", { name: /^Commands:/ }).click();
  const menu = page.getByRole("menu", { name: "Insert content", exact: true });
  await expect(menu).toBeVisible();
  await expect(dock).toBeVisible();
  const first = menu.getByRole("menuitem", { name: "Normal Text", exact: true });
  await expect(first).toBeInViewport({ ratio: 1 });
  const options = menu.locator(".writing-slash-options");
  expect(await options.evaluate((element) => element.clientHeight)).toBeGreaterThanOrEqual((await first.boundingBox())!.height);
  const box = (await menu.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(262);
  await expectFloatingSurfaceClearDock(page, menu);
  await menu.getByRole("menuitem", { name: "Embed video link", exact: true }).scrollIntoViewIfNeeded();
  await expect(menu.getByRole("menuitem", { name: "Embed video link", exact: true })).toBeInViewport();
  await menu.getByRole("menuitem", { name: "Close menu esc", exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expect(dock).toBeVisible();
  await expect(writing).toBeFocused();
  if (info.project.use.hasTouch) await dock.getByRole("button", { name: /^Commands:/ }).tap();
  else await dock.getByRole("button", { name: /^Commands:/ }).click();
  await menu.getByRole("menuitem", { name: "Heading 2", exact: true }).click();
  await expect(writing.locator("h2").first()).toContainText("Paragraph 1");
  await expect(dock).toBeVisible();
});

for (const kind of ["doc", "course"] as const) {
  test(`${kind}: compact menu gestures blur input and restore the saved cursor`, async ({ page }, info) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await open(page, info.project.name.startsWith("production"), kind);
    const writer = page.getByRole("textbox", { name: kind === "doc" ? "Doc content" : "Lesson content", exact: true });
    await writer.fill("Keep this cursor");
    await writer.evaluate((element) => {
      element.focus();
      const text = document.createTreeWalker(element.querySelector("p")!, NodeFilter.SHOW_TEXT).nextNode()!;
      const range = document.createRange(); range.setStart(text, 5); range.collapse(true);
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
    });
    const dock = page.getByRole("group", { name: "Editor controls", exact: true });
    const details = dock.getByRole("button", { name: "Details", exact: true });
    const activate = (button: typeof details) => info.project.use.hasTouch ? button.tap() : button.click();
    if (kind === "course") {
      await activate(dock.getByRole("button", { name: "Outline", exact: true }));
      await expect(writer).not.toBeFocused();
    }
    await activate(details);
    await expect(writer).not.toBeFocused();
    await page.locator("#editor-summary").fill("Metadata does not alter the saved canvas cursor.");
    await activate(details);
    await expect(writer).toBeFocused();
    expect(await writer.evaluate(() => window.getSelection()!.focusOffset)).toBe(5);
    await page.keyboard.type("returned ");
    await expect(writer).toHaveText("Keep returned this cursor");
    await dock.getByRole("button", { name: /^Commands:/ }).click();
    await expect(writer).not.toBeFocused();
    await page.getByRole("menuitem", { name: "Image", exact: true }).click();
    const image = page.getByRole("dialog", { name: "Insert image", exact: true });
    await expect(image).toBeVisible();
    await expect(image.getByRole("textbox", { name: "Alt text (optional)", exact: true })).not.toBeFocused();
    await activate(image.getByRole("button", { name: "Cancel", exact: true }));
    await expect(writer).toBeFocused();
    await page.keyboard.type("again ");
    await expect(writer).toHaveText("Keep returned again this cursor");
    await page.locator("#editor-title").click();
    const title = page.locator("#editor-title");
    await title.evaluate((input) => { (input as HTMLInputElement).setSelectionRange(2, 2); });
    await activate(details);
    await activate(details);
    await expect(title).toBeFocused();
    expect(await title.evaluate((input) => (input as HTMLInputElement).selectionStart)).toBe(2);
  });
}

test("a typed insertion command hands the current cursor back through Details", async ({ page }, info) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await open(page, info.project.name.startsWith("production"), "doc");
  const writer = page.getByRole("textbox", { name: "Doc content", exact: true });
  await writer.fill("Keep this cursor");
  await writer.press("End");
  await page.keyboard.type(" new writing");
  await page.keyboard.press("Enter");
  await page.keyboard.press("/");
  const insertion = page.getByRole("menu", { name: /^Insert content/ });
  await expect(insertion).toBeVisible();
  await insertion.getByRole("menuitem", { name: "Image", exact: true }).tap();
  const image = page.getByRole("dialog", { name: "Insert image", exact: true });
  await expect(image).toBeVisible();
  await expect(writer).not.toBeFocused();
  const details = page.getByRole("button", { name: "Details", exact: true });
  await details.tap();
  await expect(image).toHaveCount(0);
  await expect(page.getByRole("complementary", { name: "Content details", exact: true })).toBeVisible();
  await details.tap();
  await expect(writer).toBeFocused();
  await page.keyboard.type("Write here again.");
  await expect(writer.locator("p").first()).toHaveText("Keep this cursor new writing");
  await expect(writer.locator("p").last()).toHaveText("Write here again.");
});

});

test.describe("mouse writing controls", () => {
  test.use({ hasTouch: false });
for (const width of [640, 767, 900, 1440]) {
  test(`mouse editor at ${width}px keeps in-page controls and contextual formatting`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 });
    await open(page, info.project.name.startsWith("production"), "doc");
    await expect(page.locator('.editor-frame-controls[data-dock="true"]')).toHaveCount(0);
    await expect(page.locator(".editor-canvas-navigation")).toBeVisible();
    const details = page.getByRole("button", { name: "Details", exact: true });
    await expect(details).toBeVisible();
    if (width < 768) {
      await expect(page.getByRole("button", { name: "Back to content", exact: true })).toHaveCount(0);
      const commands = page.getByRole("button", { name: /^Commands:/ });
      await expect(commands).toBeVisible();
      expect((await details.boundingBox())!.x).toBeGreaterThan((await commands.boundingBox())!.x + (await commands.boundingBox())!.width);
    }
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

test("connecting a fine pointer removes the dock without remounting writing", async ({ browser }, info) => {
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
    await expect(page.locator('.editor-frame-controls[data-dock="true"]')).toHaveCount(0);
    await expect(page.locator(".editor-canvas-navigation")).toBeVisible();
    await expect(page.locator(".writing-slash-menu")).toHaveCount(0);
    expect(await mounted!.evaluate((element) => element === document.querySelector('.writing-content[contenteditable="true"]'))).toBe(true);
    await expect(writer).toHaveText("Preserve my writing");
    await page.evaluate(() => (window as unknown as { setFinePointer: (value: boolean) => void }).setFinePointer(false));
    await expect(page.locator('.editor-frame-controls[data-dock="true"]')).toBeVisible();
    await expect(writer).toHaveText("Preserve my writing");
  } finally { await context.close(); }
});
