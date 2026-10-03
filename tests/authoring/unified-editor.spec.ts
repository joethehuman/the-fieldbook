import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace, type Workspace } from "../../lib/store";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import {
  authoringUser,
  setupAuthoringProvider,
  syncAuthoringProvider,
} from "./provider-fixture";
import { downloadMarkdown, expectMarkdown, waitForDraftSaved } from "./editor-helpers";

const video = "https://www.youtube.com/watch?v=69V__a49xtw";
const media = "/api/media/00000000-0000-4000-8000-000000000001";
async function setup(
  page: Page,
  production: boolean,
  body = `First paragraph.\n\n[Video](${video})\n\nAfter the video.`,
  legacy = false,
) {
  let state = withPublishedSnapshots(freshWorkspace());
  const course = state.content.find((c) => c.kind === "course")!;
  course.title = "Unified editor fixture";
  course.revision = 1;
  course.publishedRevision = 1;
  course.lessons = [
    {
      id: "one",
      title: "A lesson written in place",
      body,
      ...(legacy ? { videoUrl: video } : {}),
    },
    { id: "two", title: "Next lesson", body: "Another lesson." },
  ];
  state.content = [course];
  state.publishedContent = [structuredClone(course)];
  if (production) {
    await setupAuthoringProvider(page, state);
    await page.route("**/api/admin/snapshot?**", (route) =>
      route.fulfill({ json: { data: state, user: authoringUser } }),
    );
    await page.route("**/api/content*", async (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({ json: state.content[0] });
      const request = route.request().postDataJSON();
      expect(request.publish).not.toBe(true);
      expect(request.expected).toBe(state.content[0].revision);
      const saved = {
        ...request.content,
        revision: (state.content[0].revision || 0) + 1,
        publishedRevision: state.content[0].publishedRevision,
      };
      state.content = [saved];
      await syncAuthoringProvider(page, state);
      return route.fulfill({ json: saved });
    });
  } else {
    await page.addInitScript((data) => {
      if (!localStorage.getItem("fieldbook.workspace.v1"))
        localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    }, state);
  }
  await page.route("https://www.youtube-nocookie.com/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<button>Play fixture video</button>",
    }),
  );
  await page.route(`**${media}.png`, (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.goto(production ? "/admin" : "/#admin");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Lesson title", exact: true }),
  ).toBeVisible();
  return {
    read: async (): Promise<Workspace> =>
      production
        ? state
        : page.evaluate(() =>
            JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
          ),
    writer: page.getByRole("textbox", { name: "Lesson content", exact: true }),
    title: page.getByRole("textbox", { name: "Lesson title", exact: true }),
  };
}

test("focus preserves the mounted document, undo, title flow and publication", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { read, writer, title } = await setup(
    page,
    info.project.name.startsWith("production"),
  );
  await title.fill("A renamed lesson");
  await title.press("Enter");
  await expect(writer).toBeFocused();
  await page.keyboard.type("Keep this edit. ");
  const before = await writer.elementHandle();
  await page.getByRole("button", { name: "Focus mode", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Exit focus mode", exact: true }),
  ).toBeVisible();
  await expect(title).toBeVisible();
  await expect(page.getByRole("button", { name: /^Outline/ })).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Publish", exact: true }),
  ).toBeHidden();
  expect(
    await writer.evaluate((node, original) => node === original, before),
  ).toBe(true);
  await expect(writer).toContainText("Keep this edit.");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(writer).not.toContainText("Keep this edit.");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(writer).toContainText("Keep this edit.");
  await page.screenshot({ path: info.outputPath("focus-mode.png") });
  await page
    .getByRole("button", { name: "Exit focus mode", exact: true })
    .click();
  expect(
    await writer.evaluate((node, original) => node === original, before),
  ).toBe(true);
  await expect(page.getByRole("button", { name: /^Outline/ })).toBeVisible();
  await waitForDraftSaved(page);
  const data = await read();
  expect(data.content[0].lessons[0].title).toBe("A renamed lesson");
  expect(data.publishedContent![0].lessons[0].title).toBe(
    "A lesson written in place",
  );
  await expect(
    page.getByRole("tab", { name: "Preview draft", exact: true }),
  ).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("inline video can be edited, written around, removed and undone without losing source", async ({
  page,
}, info) => {
  const { writer } = await setup(
    page,
    info.project.name.startsWith("production"),
  );
  await page.getByRole("button", { name: "Focus mode", exact: true }).click();
  const frame = writer.locator("iframe");
  await expect(frame).toHaveAttribute(
    "src",
    "https://www.youtube-nocookie.com/embed/69V__a49xtw",
  );
  await page.getByRole("button", { name: "Video actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Write after video", exact: true })
    .click();
  await page.keyboard.type("Between video and prose.");
  await expect(writer).toContainText("Between video and prose.");
  await page.getByRole("button", { name: "Video actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Edit video", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Edit video", exact: true });
  await dialog
    .getByRole("textbox", { name: "Video URL", exact: true })
    .fill("https://youtu.be/dQw4w9WgXcQ");
  await dialog.getByRole("button", { name: "Save video", exact: true }).click();
  await expect(frame).toHaveAttribute(
    "src",
    "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
  );
  await page.getByRole("button", { name: "Video actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Remove video", exact: true }).click();
  await expect(frame).toHaveCount(0);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(frame).toHaveCount(1);
  expect((await downloadMarkdown(page)).body).toContain("[Video](https://youtu.be/dQw4w9WgXcQ)");
  expect((await downloadMarkdown(page)).body).toContain("Between video and prose.");
  await expect(writer.locator("iframe")).toHaveCount(1);
});

test("legacy video and title remain distinct from Markdown and survive lesson switches", async ({
  page,
}, info) => {
  const { read, title } = await setup(
    page,
    info.project.name.startsWith("production"),
    "Original body.",
    true,
  );
  await expect(page.locator(".writing-content iframe")).toHaveCount(1);
  await title.fill("Legacy lesson renamed");
  await waitForDraftSaved(page);
  await page
    .getByRole("button", { name: "2 Next lesson", exact: true })
    .click();
  await expect(title).toHaveValue("Next lesson");
  if (
    !(await page
      .getByRole("button", { name: "1 Legacy lesson renamed", exact: true })
      .isVisible())
  ) {
    await page.getByRole("button", { name: /^Outline/ }).click();
  }
  await page
    .getByRole("button", { name: "1 Legacy lesson renamed", exact: true })
    .click();
  await expect(title).toHaveValue("Legacy lesson renamed");
  await expectMarkdown(page, `[Video](${video})\n\nOriginal body.`);
  const data = await read();
  expect(data.content[0].lessons[0].videoUrl).toBe(video);
  expect(data.content[0].lessons[0].body).toBe("Original body.");
});

test("image and table remain editable and focus has a reachable short-screen fallback", async ({
  page,
}, info) => {
  const { writer } = await setup(
    page,
    info.project.name.startsWith("production"),
    `Before.\n\n![Diagram](${media}.png)\n\n| Topic | Detail |\n| --- | --- |\n| Product | Customer need |\n\nAfter.`,
  );
  await page.getByRole("button", { name: "Focus mode", exact: true }).click();
  await expect(
    writer.getByRole("img", { name: "Diagram", exact: true }),
  ).toBeVisible();
  await expect(writer.getByRole("table")).toHaveCount(1);
  await page.setViewportSize({ width: 375, height: 480 });
  await expect(
    page.getByRole("button", { name: "Exit focus mode", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".editor")).toHaveAttribute(
    "data-scroll-layout",
    "page",
  );
  const last = writer.locator("p").last();
  await last.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Still reachable.");
  await expect(writer).toContainText("Still reachable.");
  await page
    .getByRole("button", { name: "Exit focus mode", exact: true })
    .click();
  await expect(page.getByRole("button", { name: /^Outline/ })).toBeVisible();
  await page.screenshot({ path: info.outputPath("short-screen.png") });
});


test("title Enter reuses an empty line above legacy video and saves typed content in order", async ({ page }, info) => {
  const { writer, title, read } = await setup(page, info.project.name.startsWith("production"), "Original body.", true);
  await title.press("Enter");
  await expect(writer).toBeFocused();
  const first = writer.locator(":scope > p").first();
  await expect(first).toHaveText("");
  await expect(first).not.toHaveAttribute("data-lexical-decorator", "true");
  const count = await writer.locator(":scope > p").count();
  await title.press("Enter");
  await expect(writer.locator(":scope > p")).toHaveCount(count);
  await expect.poll(() => first.evaluate(node => getComputedStyle(node, "::before").content)).toContain("Type / for commands");
  await page.keyboard.type("Introduction before the video.");
  await waitForDraftSaved(page);
  const saved = (await read()).content[0].lessons[0];
  expect(saved.videoUrl).toBeUndefined();
  expect(saved.body).toMatch(/^Introduction before the video\.[\s\S]*\[Video\]/);
  expect(saved.body).toContain("Original body.");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(writer.locator("iframe")).toHaveCount(1);
  await expect(writer).toContainText("Original body.");
});

test("Focus animates both directions and honors reduced motion", async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"));
  const surface = page.locator(".writing-surface");
  for (const name of ["Focus mode", "Exit focus mode"]) {
    await page.getByRole("button", { name, exact: true }).click();
    await expect.poll(() => surface.evaluate(node => node.getAnimations().some(animation => animation.effect?.getTiming().duration === 260))).toBe(true);
    await surface.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished)));
    await expect(page.locator(".editor")).not.toHaveAttribute("data-focus-transition", "true");
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Focus mode", exact: true }).click();
  expect(await surface.evaluate(node => node.getAnimations().length)).toBe(0);
  await page.getByRole("button", { name: "Exit focus mode", exact: true }).click();
  expect(await surface.evaluate(node => node.getAnimations().length)).toBe(0);
});


test("Focus returns each panel arrangement without exposing controls through the canvas", async ({ page }, info) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  const { writer } = await setup(page, info.project.name.startsWith("production"));
  const frame = page.locator(".editor-frame");
  const form = page.locator(".editor");
  const original = await writer.elementHandle();
  for (const arrangement of ["both", "details", "none", "outline"]) {
    for (const [label, open] of [[/^Outline/, ["both", "outline"].includes(arrangement)], ["Details", ["both", "details"].includes(arrangement)]] as const) {
      const button = page.getByRole("button", { name: label });
      if ((await button.getAttribute("aria-expanded") === "true") !== open) await button.click();
    }
    await expect(frame).toHaveAttribute("data-panels", arrangement);
    await page.getByRole("button", { name: "Focus mode", exact: true }).click();
    await expect(form).toHaveAttribute("data-focus-mode", "true");
    await expect(form).not.toHaveAttribute("data-focus-transition", "true");
    await page.getByRole("button", { name: "Exit focus mode", exact: true }).click();
    const during = await page.locator(".writing-surface").evaluate(surface => {
      const controls = document.querySelector(".editor-frame-controls")!;
      return { background: getComputedStyle(surface).backgroundColor, opacity: +getComputedStyle(controls).opacity,
        canvasLayer: +getComputedStyle(surface.closest(".editor-frame-canvas")!).zIndex,
        controlsLayer: +getComputedStyle(controls).zIndex };
    });
    expect(during.background).not.toBe("rgba(0, 0, 0, 0)");
    expect(during.opacity).toBeLessThan(0.1);
    expect(during.canvasLayer).toBeGreaterThan(during.controlsLayer);
    await expect(form).not.toHaveAttribute("data-focus-transition", "true");
    await expect(frame).toHaveAttribute("data-panels", arrangement);
    expect(await writer.evaluate((node, before) => node === before, original)).toBe(true);
  }
});


test("a second Focus click during movement is honored after the transition", async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"));
  await page.getByRole("button", { name: "Focus mode", exact: true }).click();
  await expect(page.locator(".editor")).toHaveAttribute("data-focus-mode", "true");
  await page.getByRole("button", { name: "Exit focus mode", exact: true }).dispatchEvent("click");
  await expect(page.locator(".editor")).not.toHaveAttribute("data-focus-mode", "true");
  await expect(page.locator(".editor")).not.toHaveAttribute("data-focus-transition", "true");
  await expect(page.getByRole("button", { name: /^Outline/ })).toBeVisible();
});

test("contracting canvas keeps text unscaled and media aligned at intermediate frames", async ({ page }, info) => {
  await page.setViewportSize({ width: 1920, height: 1000 });
  const { writer } = await setup(page, info.project.name.startsWith("production"));
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await page.getByRole("button", { name: "Focus mode", exact: true }).click();
  await expect(page.locator(".editor")).toHaveAttribute("data-focus-mode", "true");
  await expect(page.locator(".editor")).not.toHaveAttribute("data-focus-transition", "true");
  const original = await writer.elementHandle();
  await page.getByRole("button", { name: "Exit focus mode", exact: true }).click();
  const samples = await page.locator(".writing-surface").evaluate(surface => {
    const animations = surface.getAnimations({ subtree: true }).filter(animation => animation.effect?.getTiming().duration === 260);
    animations.forEach(animation => animation.pause());
    const samples = [0, 65, 130, 195, 259].map(time => {
      animations.forEach(animation => animation.currentTime = time);
      const style = getComputedStyle(surface);
      const bounds = surface.getBoundingClientRect();
      const title = surface.querySelector<HTMLElement>(".document-title")!;
      const paragraph = surface.querySelector(".writing-content[contenteditable] > p")!;
      const text = document.createRange(); text.setStart(paragraph.firstChild!, 0); text.setEnd(paragraph.firstChild!, 1);
      const glyph = text.getBoundingClientRect();
      const matrix = new DOMMatrixReadOnly(style.transform);
      const video = surface.querySelector("iframe")!.getBoundingClientRect();
      return { width: bounds.width, layoutWidth: parseFloat(style.width), scaleX: matrix.a, scaleY: matrix.d,
        textHeight: glyph.height, titleLeft: title.getBoundingClientRect().left, textLeft: glyph.left, videoLeft: video.left,
        aspect: video.width / video.height };
    });
    animations.forEach(animation => animation.play());
    return samples;
  });
  expect(samples[0].width).toBeGreaterThan(samples.at(-1)!.width);
  for (const sample of samples) {
    expect(sample.width).toBeCloseTo(sample.layoutWidth, 0);
    expect(sample.scaleX).toBe(1); expect(sample.scaleY).toBe(1);
    expect(sample.textHeight).toBeCloseTo(samples[0].textHeight, 0);
    expect(Math.abs(sample.titleLeft - sample.textLeft)).toBeLessThan(2);
    expect(Math.abs(sample.videoLeft - sample.textLeft)).toBeLessThan(2);
    expect(sample.aspect).toBeCloseTo(16 / 9, 1);
  }
  await expect(page.locator(".editor")).not.toHaveAttribute("data-focus-transition", "true");
  expect(await writer.evaluate((node, before) => node === before, original)).toBe(true);
});

test("minimal toolbar downloads the latest Markdown without remounting or changing history", async ({ page }, info) => {
  const { writer, title, read } = await setup(page, info.project.name.startsWith("production"), "Original body.");
  await expect(writer).toBeVisible();
  await expect(page.getByRole("tab", { name: /^(Write|Markdown|Preview draft)$/ })).toHaveCount(0);
  await expect(page.locator(".writing-toolbar button")).toHaveText(["", "", " Commands", "Focus mode", ""]);
  const original = await writer.elementHandle();
  await writer.fill("Latest draft — café.");
  await title.fill("Lesson: café / draft");
  const more = page.getByRole("button", { name: "More editor actions", exact: true });
  await more.focus();
  await more.press("Enter");
  await expect(page.getByRole("menuitem")).toHaveText(["Download Markdown"]);
  await page.keyboard.press("Escape");
  await expect(more).toBeFocused();
  const exported = await downloadMarkdown(page);
  expect(exported).toEqual({ name: "Lesson- café - draft.md", body: "Latest draft — café." });
  expect(await writer.evaluate((node, first) => node === first, original)).toBe(true);
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(writer).toHaveText("Original body.");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(writer).toHaveText("Latest draft — café.");
  await page.getByRole("button", { name: "Focus mode", exact: true }).click();
  await expect(page.getByRole("button", { name: "Exit focus mode", exact: true })).toBeVisible();
  await expectMarkdown(page, "Latest draft — café.");
  expect((await read()).publishedContent![0].lessons[0].body).toBe("Original body.");
  await page.screenshot({ path: info.outputPath("minimal-toolbar.png") });
});

test("unsupported Markdown remains downloadable and recoverable without normal source tabs", async ({ page }, info) => {
  const body = "Keep this footnote[^1].\n\n[^1]: An important detail.\n";
  const { writer } = await setup(page, info.project.name.startsWith("production"), body);
  await expect(page.getByRole("alert").filter({ hasText: "original text is preserved" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Markdown", exact: true })).toHaveCount(0);
  await expectMarkdown(page, body);
  const recovery = page.getByRole("textbox", { name: "Lesson content Markdown", exact: true });
  await expect(recovery).toHaveValue(body);
  await recovery.fill("Recovered visual content.");
  await page.getByRole("button", { name: "Retry visual editor", exact: true }).click();
  await expect(writer).toHaveText("Recovered visual content.");
  await expect(recovery).toHaveCount(0);
  await expectMarkdown(page, "Recovered visual content.");
});
