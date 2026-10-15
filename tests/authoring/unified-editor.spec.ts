import { test, expect, type Page } from "@playwright/test";

import { freshWorkspace, type Workspace } from "../../lib/store";

import { withPublishedSnapshots } from "../../lib/demo-publication";

import {
  authoringUser,
  setupAuthoringProvider,
  syncAuthoringProvider,
} from "./provider-fixture";

import { downloadMarkdown, expectMarkdown } from "./editor-helpers";

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
  if (!production)
    await page.getByRole("link", { name: course.title, exact: true }).click();
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

test("Details downloads the latest Markdown without remounting or changing history", async ({
  page,
}, info) => {
  const { writer, title, read } = await setup(
    page,
    info.project.name.startsWith("production"),
    "Original body.",
  );
  await expect(writer).toBeVisible();
  await expect(
    page.getByRole("tab", { name: /^(Write|Markdown|Preview draft)$/ }),
  ).toHaveCount(0);
  const original = await writer.elementHandle();
  await writer.fill("Latest draft — café.");
  await title.fill("Lesson: café / draft");
  const exported = await downloadMarkdown(page);
  // WebKit on macOS may decompose accents in downloaded filenames.
  expect({ ...exported, name: exported.name.normalize("NFC") }).toEqual({
    name: "Lesson- café - draft.md",
    body: "Latest draft — café.",
  });
  expect(await writer.evaluate((node, first) => node === first, original)).toBe(
    true,
  );
  await writer.press("ControlOrMeta+z");
  await expect(writer).toHaveText("Original body.");
  await writer.press("ControlOrMeta+Shift+z");
  await expect(writer).toHaveText("Latest draft — café.");
  await expectMarkdown(page, "Latest draft — café.");
  expect((await read()).publishedContent![0].lessons[0].body).toBe(
    "Original body.",
  );
  await page.screenshot({ path: info.outputPath("details-download.png") });
});

test("unsupported Markdown remains downloadable and recoverable without normal source tabs", async ({
  page,
}, info) => {
  const body = "Keep this footnote[^1].\n\n[^1]: An important detail.\n";
  const { writer } = await setup(
    page,
    info.project.name.startsWith("production"),
    body,
  );
  await expect(
    page.getByRole("alert").filter({ hasText: "This content uses formatting" }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Markdown", exact: true }),
  ).toHaveCount(0);
  await expectMarkdown(page, body);
  const recovery = page.getByRole("textbox", {
    name: "Lesson content Markdown",
    exact: true,
  });
  await expect(recovery).toHaveValue(body);
  await recovery.fill("Recovered visual content.");
  await page
    .getByRole("button", { name: "Retry visual editor", exact: true })
    .click();
  await expect(writer).toHaveText("Recovered visual content.");
  await expect(recovery).toHaveCount(0);
  await expectMarkdown(page, "Recovered visual content.");
});
