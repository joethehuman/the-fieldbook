import { test, expect, type Page, type Locator } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { authoringUser, setupAuthoringProvider } from "./provider-fixture";
import { openContentSettings } from "./editor-helpers";

async function setup(page: Page, installed: boolean) {
  const state = freshWorkspace();
  const course = state.content.find((item) => item.kind === "course")!;
  Object.assign(course, {
    title: "", summary: "", category: "", status: "draft", revision: 1,
    publishedRevision: undefined, cardArt: { source: "generated", shortTitle: "", seed: 1, version: 1 },
    lessons: Array.from({ length: 20 }, (_, index) => ({ id: `navigation-${index}`, title: "", body: "" })),
    questions: [], requirePassing: false,
  });
  state.content = [course]; state.publishedContent = [];
  if (installed) {
    await setupAuthoringProvider(page, state);
    await page.route("**/api/admin/snapshot?**", (route) => route.fulfill({ json: { data: state, user: authoringUser } }));
    await page.route("**/api/content*", (route) => route.fulfill({ json: course }));
  } else {
    await page.addInitScript((data) => {
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
    }, state);
  }
  await page.goto(installed ? "/admin" : "/#admin");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Lesson title", { exact: true })).toHaveAttribute("placeholder", "Untitled lesson");
}

async function withinOwner(target: Locator, owner: Locator) {
  const control = await target.boundingBox(); const panel = await owner.boundingBox();
  expect(control!.y).toBeGreaterThanOrEqual(panel!.y + 12);
  expect(control!.y + control!.height).toBeLessThanOrEqual(panel!.y + panel!.height - 12);
}

test("Outline and Details slide in both directions without remounting the lesson", async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"));
  const lesson = page.getByRole("textbox", { name: "Lesson title", exact: true });
  await lesson.evaluate((node) => { (node as HTMLElement).dataset.ui1MountProbe = "retained"; });
  const phone = info.project.name.endsWith("phone");
  for (const side of ["outline", "details"]) {
    const toggle = page.getByRole("button", { name: side === "outline" ? /^Outline/ : /^Details/ });
    const slot = page.locator(`.editor-frame-panel[data-side="${side}"]`);
    if (await toggle.getAttribute("aria-expanded") === "true") await toggle.click();
    await expect(slot).toHaveCount(0);
    const opening = await toggle.evaluate(async (node, { side, phone }) => {
      (node as HTMLElement).click();
      const sizes: number[] = [];
      for (let frame = 0; frame < 18; frame++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const box = document.querySelector(`.editor-frame-panel[data-side="${side}"]`)!.getBoundingClientRect();
        sizes.push(phone ? box.height : box.width);
      }
      return sizes;
    }, { side, phone });
    expect(Math.max(...opening) - opening[0]).toBeGreaterThan(4);
    await expect(lesson).toHaveAttribute("data-ui1-mount-probe", "retained");
    await page.screenshot({ path: info.outputPath(`ui1-${side}-open.png`) });
    const closing = await toggle.evaluate(async (node, { side, phone }) => {
      (node as HTMLElement).click();
      const sizes: number[] = [];
      for (let frame = 0; frame < 18; frame++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        const box = document.querySelector(`.editor-frame-panel[data-side="${side}"]`)?.getBoundingClientRect();
        sizes.push(box ? phone ? box.height : box.width : 0);
      }
      return sizes;
    }, { side, phone });
    expect(closing[0]).toBeGreaterThan(0);
    expect(closing.some((size) => size > 0 && size < closing[0] - 2)).toBe(true);
    await expect(slot).toHaveCount(0);
    await expect(lesson).toHaveAttribute("data-ui1-mount-probe", "retained");
  }
});

test("requirements smoothly reveal artwork within Details and course title within the main page", async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"));
  const details = await openContentSettings(page);
  const main = page.locator(".main-content");
  // Stacked phone panels also have a local Details scroller; show the readiness list first.
  await details.getByRole("button", { name: "Give artwork a short title of up to 40 characters", exact: true }).scrollIntoViewIfNeeded();
  await details.evaluate((node) => {
    (window as unknown as { revealSamples: number[] }).revealSamples = [];
    node.addEventListener("scroll", () => (window as unknown as { revealSamples: number[] }).revealSamples.push(node.scrollTop));
  });
  const before = await main.evaluate((node) => node.scrollTop);
  await details.getByRole("button", { name: "Give artwork a short title of up to 40 characters", exact: true }).click();
  const art = page.getByRole("textbox", { name: "Short title", exact: true });
  await expect(art).toBeFocused();
  await expect.poll(() => details.evaluate((node) => node.scrollTop)).toBeGreaterThan(100);
  await expect.poll(async () => {
    const a = await art.boundingBox(); const d = await details.boundingBox();
    return !!a && !!d && a.y >= d.y + 12 && a.y + a.height <= d.y + d.height - 12;
  }).toBe(true);
  await withinOwner(art, details);
  const samples = await page.evaluate(() => (window as unknown as { revealSamples: number[] }).revealSamples);
  expect(new Set(samples).size).toBeGreaterThan(3);
  if (info.project.name !== "production-phone") expect(await main.evaluate((node) => node.scrollTop)).toBe(before);
  await details.evaluate((node) => { node.scrollTop = 0; });
  await details.getByRole("button", { name: "Add a title", exact: true }).click();
  const title = page.getByRole("textbox", { name: "Title", exact: true });
  await expect(title).toBeFocused();
  await expect(title).toBeInViewport();
  await expect.poll(async () => {
    const t = await title.boundingBox(); const m = await main.boundingBox();
    return !!t && !!m && t.y >= m.y && t.y + t.height <= m.y + m.height;
  }).toBe(true);
  await page.screenshot({ path: info.outputPath("targeted-requirement-reveal.png") });
});

test("a distant lesson requirement selects its canvas and scrolls the Outline to that lesson", async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"));
  const details = await openContentSettings(page);
  await details.getByRole("button", { name: "Lesson 20: add a title", exact: true }).click();
  const title = page.getByLabel("Lesson title", { exact: true });
  await expect(title).toBeFocused();
  await expect(page.getByRole("button", { name: /^Outline.*Lesson 20 of 20/ })).toBeVisible();
  const toggle = page.getByRole("button", { name: /^Outline/ });
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  const outline = page.getByRole("complementary", { name: "Course outline", exact: true });
  const selected = outline.locator('[aria-current="step"]');
  await expect(selected).toContainText("Lesson 20");
  await expect.poll(() => outline.evaluate((node) => node.scrollTop)).toBeGreaterThan(100);
  await expect.poll(async () => {
    const s = await selected.boundingBox(); const o = await outline.boundingBox();
    return !!s && !!o && s.y >= o.y && s.y + s.height <= o.y + o.height;
  }).toBe(true);
  await expect(outline).toHaveAttribute("data-scroll-fade-before", "true");
  if (info.project.name === "production-phone") await expect(page.getByRole("button", { name: /^Details/ })).toHaveAttribute("aria-expanded", "false");
  await page.screenshot({ path: info.outputPath("distant-lesson-outline.png") });
});

test("blank writing keeps its height and first-line placeholder position when focus moves to the title", async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"));
  const editor = page.getByRole("textbox", { name: "Lesson content", exact: true });
  const surface = page.locator(".writing-editor.writing-surface");
  const placeholder = surface.locator('.writing-content:not([contenteditable])');
  await editor.click();
  await expect(editor).toBeFocused();
  const focused = await surface.boundingBox();
  const focusedHint = await editor.locator("p").first().boundingBox();
  const color = await editor.locator("p").first().evaluate((node) => getComputedStyle(node, "::before").color);
  await page.getByLabel("Lesson title", { exact: true }).click();
  const blurred = await surface.boundingBox();
  const blurredHint = await placeholder.evaluate((node) => {
    const box = node.getBoundingClientRect();
    return { y: box.top + parseFloat(getComputedStyle(node).paddingTop) };
  });
  expect(Math.abs(focused!.height - blurred!.height)).toBeLessThan(2);
  expect(Math.abs((focusedHint!.y - focused!.y) - (blurredHint!.y - blurred!.y))).toBeLessThan(2);
  expect(await placeholder.evaluate((node) => getComputedStyle(node).color)).toBe(color);
  expect(blurredHint!.y - blurred!.y).toBeLessThan(200);
  await page.screenshot({ path: info.outputPath("blank-writing-blurred.png") });
});
