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
  course.id = "00000000-0000-4000-8000-000000000104";
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
  await page.goto(production ? `/admin/content/${course.id}/edit` : "/#admin");
  if (!production) await page.getByRole("link", { name: course.title, exact: true }).click();
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

test("inline video can be edited, written around, removed and undone without losing source", async ({
  page,
}, info) => {
  const { writer } = await setup(
    page,
    info.project.name.startsWith("production"),
  );
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
  await writer.press("ControlOrMeta+z");
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
  const outline = page.getByRole("button", { name: "Outline", exact: true });
  if (await outline.getAttribute("aria-expanded") !== "true") await outline.click();
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

test("image and table remain editable on short screens", async ({
  page,
}, info) => {
  const { writer } = await setup(
    page,
    info.project.name.startsWith("production"),
    `Before.\n\n![Diagram](${media}.png)\n\n| Topic | Detail |\n| --- | --- |\n| Product | Customer need |\n\nAfter.`,
  );
  await expect(
    writer.getByRole("img", { name: "Diagram", exact: true }),
  ).toBeVisible();
  await expect(writer.getByRole("table")).toHaveCount(1);
  await page.setViewportSize({ width: 375, height: 480 });
  await expect(page.locator(".editor")).toHaveAttribute(
    "data-scroll-layout",
    "page",
  );
  const last = writer.locator("p").last();
  await last.click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Still reachable.");
  await expect(writer).toContainText("Still reachable.");
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
  await writer.press("ControlOrMeta+z");
  await expect(writer.locator("iframe")).toHaveCount(1);
  await expect(writer).toContainText("Original body.");
});

test("Details downloads the latest Markdown without remounting or changing history", async ({ page }, info) => {
  const { writer, title, read } = await setup(page, info.project.name.startsWith("production"), "Original body.");
  await expect(writer).toBeVisible();
  await expect(page.getByRole("tab", { name: /^(Write|Markdown|Preview draft)$/ })).toHaveCount(0);
  const original = await writer.elementHandle();
  await writer.fill("Latest draft — café.");
  await title.fill("Lesson: café / draft");
  const exported = await downloadMarkdown(page);
  expect(exported).toEqual({ name: "Lesson- café - draft.md", body: "Latest draft — café." });
  expect(await writer.evaluate((node, first) => node === first, original)).toBe(true);
  await writer.press("ControlOrMeta+z");
  await expect(writer).toHaveText("Original body.");
  await writer.press("ControlOrMeta+Shift+z");
  await expect(writer).toHaveText("Latest draft — café.");
  await expectMarkdown(page, "Latest draft — café.");
  expect((await read()).publishedContent![0].lessons[0].body).toBe("Original body.");
  await page.screenshot({ path: info.outputPath("details-download.png") });
});

test("unsupported Markdown remains downloadable and recoverable without normal source tabs", async ({ page }, info) => {
  const body = "Keep this footnote[^1].\n\n[^1]: An important detail.\n";
  const { writer } = await setup(page, info.project.name.startsWith("production"), body);
  await expect(page.getByRole("alert").filter({ hasText: "Continue editing in Markdown below" })).toBeVisible();
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
