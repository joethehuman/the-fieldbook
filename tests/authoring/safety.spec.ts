import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { authoringUser, setupAuthoringProvider } from "./provider-fixture";

async function setup(
  page: Page,
  production: boolean,
  kind: "doc" | "course" = "doc",
  blankCourse = false,
) {
  const state = freshWorkspace();
  state.content = state.content.filter((c) => c.kind === kind).slice(0, 1);
  state.content[0].revision = 1;
  state.content[0].status = "draft";
  state.content[0].title = "Safety fixture";
  if (kind === "course" && blankCourse) {
    state.content[0].lessons = [{ id: "first", title: "Lesson 1", body: "" }];
    state.content[0].questions = [];
    state.content[0].requirePassing = false;
  }
  state.publishedContent = [];
  const control = {
    failSave: false,
    loseResponse: false,
    failRefresh: false,
    conflict: false,
    saves: 0,
    uploaded: false,
    uploadFailure: false,
    mediaType: "image/png",
    sessionLost: false,
    releaseUpload: () => {},
  };
  if (production) {
    await setupAuthoringProvider(page, state);
    await page.route("**/api/search?**", (route) =>
      route.fulfill({ json: { results: [], hasMore: false } }),
    );
    await page.route("**/api/media/**", (route) =>
      route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
          "base64",
        ),
      }),
    );
    await page.route("**/api/admin/snapshot?**", (route) =>
      route.fulfill({
        status: control.failRefresh ? 503 : 200,
        json: control.failRefresh
          ? { error: "Workspace unavailable" }
          : {
              data: state,
              user: control.sessionLost ? null : authoringUser,
            },
      }),
    );
    await page.route("**/api/content*", async (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({ json: state.content[0] });
      control.saves++;
      if (control.failSave)
        return route.fulfill({
          status: 503,
          json: {
            error: "Database unavailable",
            requestId: "00000000-0000-4000-8000-000000000010",
          },
        });
      if (control.conflict) {
        state.content[0].title = "Another author's change";
        state.content[0].revision = 2;
        return route.fulfill({
          status: 409,
          json: { error: "This item changed since you opened it." },
        });
      }
      const body = route.request().postDataJSON();
      state.content[0] = {
        ...body.content,
        revision: (state.content[0].revision || 0) + 1,
      };
      if (control.loseResponse) return route.abort();
      return route.fulfill({ json: state.content[0] });
    });
    // Hold signing before the Storage request. All provider traffic is synthetic.
    await page.route("**/api/upload", async (route) => {
      const body = route.request().postDataJSON();
      if (body.type) control.mediaType = body.type;
      if (body.complete)
        return route.fulfill({
          json: {
            url: `/api/media/00000000-0000-4000-8000-000000000010.${control.mediaType.startsWith("video/") ? "mp4" : "png"}`,
          },
        });
      await new Promise<void>((resolve) => {
        control.releaseUpload = resolve;
        control.uploaded = true;
      });
      if (control.uploadFailure)
        return route.fulfill({
          status: 503,
          json: { error: "Upload unavailable" },
        });
      return route.fulfill({
        json: {
          id: "00000000-0000-4000-8000-000000000010",
          path: "synthetic/image.png",
          token: "synthetic",
        },
      });
    });
    await page.route("https://test.supabase.co/**", (route) =>
      route.fulfill({ json: { Key: "synthetic/image.png" } }),
    );
  } else {
    await page.addInitScript((data) => {
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    }, state);
  }
  await page.goto(production ? "/admin" : "/#admin");
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  return { state, control };
}
async function openNav(page: Page) {
  const menu = page.getByRole("button", { name: "Open navigation" });
  if ((page.viewportSize()?.width ?? 1000) < 768) {
    await menu.click();
    await expect(
      page.getByRole("button", { name: "Close navigation" }),
    ).toBeVisible();
  }
}

test("search preserves dirty edits; canceled navigation and reload keep them until explicit discard", async ({
  page,
}, info) => {
  await setup(page, info.project.name.startsWith("production"));
  await page.getByLabel("Title", { exact: true }).fill("Keep these edits");
  await page.getByRole("button", { name: "Back to content" }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Keep these edits",
  );
  await page
    .getByRole("textbox", { name: "Search all content" })
    .fill("search");
  await expect(
    page.getByRole("region", { name: "Search results" }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Keep these edits",
  );
  await page
    .getByRole("textbox", { name: "Search all content" })
    .press("Escape");
  await expect(
    page.getByRole("region", { name: "Search results" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Search all content" }),
  ).toBeFocused();
  await openNav(page);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Docs", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const closeNav = page.getByRole("button", { name: "Close navigation" });
  if (await closeNav.isVisible()) await closeNav.click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Keep these edits",
  );
  const dialog = page.waitForEvent("dialog");
  await page.evaluate(() => {
    setTimeout(() => location.reload(), 0);
  });
  await (await dialog).dismiss();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Keep these edits",
  );
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("dirty-editor.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Back to content" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator(".admin-layout")).toBeVisible();
});

test("browser back can be canceled without unmounting the editor", async ({
  page,
}, info) => {
  const production = info.project.name.startsWith("production");
  await setup(page, production);
  await page.getByRole("button", { name: "Back to content" }).click();
  await openNav(page);
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Docs", exact: true })
    .click();
  await expect(page).toHaveURL(production ? /\/docs$/ : /#docs$/);
  await expect(
    page.getByRole("heading", { name: "Docs", exact: true }),
  ).toBeVisible();
  await openNav(page);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page
    .getByRole("menuitem", { name: "Manage organization" })
    .click();
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await page.getByLabel("Title", { exact: true }).fill("History protected");
  await page.evaluate(() => history.back());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "History protected",
  );
  await expect(page).toHaveURL(production ? /\/admin$/ : /#admin$/);
  if (production) {
    await page.evaluate(() => history.back());
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page).toHaveURL(/\/docs$/);
  }
});

test("failed save preserves downloadable text and does not show success", async ({
  page,
}, info) => {
  const production = info.project.name.startsWith("production");
  const { control } = await setup(page, production);
  control.failSave = true;
  if (!production)
    await page.evaluate(() => {
      Storage.prototype.setItem = () => {
        throw new Error("full");
      };
    });
  await page.getByLabel("Title", { exact: true }).fill("Recover my draft");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(
    page.locator("form.editor").getByRole("alert").first(),
  ).toContainText(
    production ? "0 of 1 changes confirmed saved" : "browser could not save",
  );
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Recover my draft",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download draft" }).click();
  expect((await download).suggestedFilename()).toBe(
    "fieldbook-unsaved-draft.json",
  );
});

test("failed learning-group save shows one concise inline error", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("production"),
    "The hosted save response is production-only",
  );
  const { state } = await setup(page, true, "course");
  state.content[0].status = "published";
  state.publishedContent = [state.content[0]];
  state.groups = [{ ...state.groups[0], learningItems: [] }];
  await page.route("**/api/governance", (route) =>
    route.fulfill({
      status: 500,
      json: {
        error: "Unable to complete this request. Please try again.",
        requestId: "00000000-0000-4000-8000-000000000010",
      },
    }),
  );
  await page.goto("/admin");
  if (info.project.name.endsWith("phone")) {
    await page
      .getByRole("combobox", { name: "Administration section" })
      .click();
    await page.getByRole("option", { name: "Learning groups" }).click();
  } else {
    await page.getByRole("tab", { name: "Learning groups" }).click();
  }
  await page
    .getByRole("button", { name: `Manage ${state.groups[0].name}` })
    .click();
  await page
    .getByRole("button", { name: `Add ${state.content[0].title}` })
    .click();
  const saveAlerts = page.locator('[data-slot="alert"]');
  await expect(saveAlerts).toHaveCount(1);
  await expect(saveAlerts).toContainText(
    "Couldn't save this group. Check the current list before trying again.",
  );
  await expect(saveAlerts).toContainText(
    "Reference: 00000000-0000-4000-8000-000000000010",
  );
  await expect(page.getByText("0 of 1 changes confirmed saved")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: `Add ${state.content[0].title}` }),
  ).toBeEnabled();
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("group-save-error.png"),
    fullPage: true,
  });
});

for (const failure of [false, true])
  test(`pending inline upload blocks save and navigation; failure=${failure}`, async ({
    page,
  }, info) => {
    test.skip(
      !info.project.name.startsWith("production"),
      "Uploads are installation-only",
    );
    const { control, state } = await setup(page, true);
    control.uploadFailure = failure;
    await page
      .getByRole("textbox", { name: "Doc content", exact: true })
      .fill("Keep the original body");
    await page.locator('.writing-editor input[type="file"]').setInputFiles({
      name: "example.png",
      mimeType: "image/png",
      buffer: Buffer.from("synthetic"),
    });
    await expect.poll(() => control.uploaded).toBe(true);
    await expect(
      page.getByRole("button", { name: "Save draft", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Back to content" }),
    ).toBeDisabled();
    // Exercise the handler directly too, bypassing the disabled submit button.
    await page
      .locator("form.editor")
      .evaluate((form) =>
        form.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
      );
    expect(control.saves).toBe(0);
    await openNav(page);
    await page
      .getByRole("navigation")
      .getByRole("button", { name: "Docs", exact: true })
      .click();
    const closeNav = page.getByRole("button", { name: "Close navigation" });
    if (await closeNav.isVisible()) await closeNav.click();
    await expect(
      page.getByRole("textbox", { name: "Doc content", exact: true }),
    ).toHaveText("Keep the original body");
    control.releaseUpload();
    await expect(
      page.getByRole("button", { name: "Save draft", exact: true }),
    ).toBeEnabled();
    if (failure)
      await expect(
        page.getByRole("textbox", { name: "Doc content", exact: true }),
      ).toHaveText("Keep the original body");
    else
      await expect(
        page.getByRole("textbox", { name: "Doc content", exact: true }),
      ).toContainText("Keep the original body");
    if (!failure)
      await expect(page.locator(".writing-content img")).toHaveAttribute(
        "src",
        /\/api\/media\//,
      );
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath("upload-result.png"),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(
      page
        .locator("form.editor")
        .getByRole("status")
        .filter({ hasText: "Draft saved" }),
    ).toBeVisible();
    expect(state.content[0].body).toContain("Keep the original body");
    expect(state.content[0].body.includes("/api/media/")).toBe(!failure);
  });

for (const mode of ["refresh", "lost-response", "conflict"] as const)
  test(`${mode}: recover the saved copy without silently resending`, async ({
    page,
  }, info) => {
    test.skip(
      !info.project.name.startsWith("production"),
      "Server failure case",
    );
    const { control } = await setup(page, true);
    await page.getByLabel("Title", { exact: true }).fill("My local edit");
    control.failRefresh = mode === "refresh";
    control.loseResponse = mode === "lost-response";
    control.conflict = mode === "conflict";
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(
      page.locator("form.editor").getByRole("alert").first(),
    ).toContainText(
      mode === "refresh"
        ? "Changes saved, but"
        : mode === "lost-response"
          ? "may have been saved"
          : "rejected change was not saved",
    );
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
      "My local edit",
    );
    control.failRefresh = false;
    await page.getByRole("button", { name: "Review saved copy" }).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
      "My local edit",
    );
    await page.getByRole("button", { name: "Review saved copy" }).click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
      mode === "conflict" ? "Another author's change" : "My local edit",
    );
    expect(control.saves).toBe(1);
  });

for (const media of ["inline-video", "lesson-video", "cover"] as const)
  test(`course ${media} cannot be removed or saved while uploading`, async ({
    page,
  }, info) => {
    test.skip(
      !info.project.name.startsWith("production"),
      "Uploads are installation-only",
    );
    const { control, state } = await setup(page, true, "course");
    const file = {
      name: media === "cover" ? "cover.png" : "lesson.mp4",
      mimeType: media === "cover" ? "image/png" : "video/mp4",
      buffer: Buffer.from("synthetic"),
    };
    const input =
      media === "cover"
        ? page.getByLabel("Upload course cover", { exact: true })
        : media === "lesson-video"
          ? page.getByLabel(/Upload opening video/).first()
          : page.locator('.writing-editor input[type="file"]').first();
    await input.setInputFiles(file);
    await expect.poll(() => control.uploaded).toBe(true);
    await expect(
      page.getByRole("button", { name: "Remove lesson", exact: true }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Save draft", exact: true }),
    ).toBeDisabled();
    await page
      .locator("form.editor")
      .evaluate((form) =>
        form.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
      );
    expect(control.saves).toBe(0);
    control.releaseUpload();
    await expect(
      page.getByRole("button", { name: "Save draft", exact: true }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.locator(".admin-layout")).toBeVisible();
    const saved = state.content[0];
    expect(
      media === "cover"
        ? saved.coverImageUrl
        : media === "lesson-video"
          ? saved.lessons[0].videoUrl
          : saved.lessons[0].body,
    ).toContain("/api/media/");
  });

test("session expiration during recovery cannot replace the editor with a guest screen", async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith("production"), "Server session case");
  const { control } = await setup(page, true);
  await page
    .getByLabel("Title", { exact: true })
    .fill("Keep this after expiry");
  control.failSave = true;
  control.sessionLost = true;
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.locator("form.editor").getByRole("alert")).toContainText(
    "could not be refreshed",
  );
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Keep this after expiry",
  );
  await page.getByRole("button", { name: "Review saved copy" }).click();
  await expect(page.locator("form.editor").getByRole("alert")).toContainText(
    "Administrator access changed",
  );
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Keep this after expiry",
  );
});

test("draft saves and publication share one transient confirmation", async ({
  page,
}, info) => {
  const production = info.project.name.startsWith("production");
  await setup(page, production);
  await page.getByLabel("Title", { exact: true }).fill("Notification fixture");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  const toast = page.locator('[data-slot="toast"]');
  await expect(toast).toContainText("Doc draft saved");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(toast).toHaveCount(1);
  await expect(toast).toContainText("Doc published");
  await page.screenshot({
    path: info.outputPath("published-confirmation.png"),
    fullPage: false,
  });
  await expect(
    page.getByRole("button", { name: "Dismiss message" }),
  ).toHaveCount(0);
  await expect(toast).toHaveCount(0, { timeout: 6000 });
});

test("course builder edits one lesson at a time and keeps one final quiz", async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"), "course", true);
  await expect(page.getByRole("heading", { name: "Lesson 1" })).toBeVisible();
  const metadata = page.getByRole("region", { name: "Course introduction" });
  await expect(metadata.getByRole("textbox", { name: "Title", exact: true })).toBeVisible();
  if ((page.viewportSize()?.width || 0) >= 1024) {
    const details = await metadata.boundingBox();
    const outline = await page.getByRole("navigation", { name: "Edit course step" }).boundingBox();
    expect(details!.x).toBeGreaterThan(outline!.x);
  }
  await page.screenshot({ path: info.outputPath("course-builder-layout.png"), fullPage: true });
  await page.getByRole("button", { name: "Add lesson" }).click();
  await page.getByLabel("Lesson title").fill("Second lesson");
  await expect(page.getByRole("heading", { name: "Lesson 2" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Lesson 1" })).toHaveCount(0);
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  await writing.click({ position: { x: 32, y: 48 } });
  const caret = await page.evaluate(() => {
    const selection = window.getSelection()!;
    const range = selection.getRangeAt(0).getBoundingClientRect();
    const anchor = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement;
    const rect = range.height ? range : anchor?.closest("p, h1, h2, h3, li, blockquote")?.getBoundingClientRect();
    if (!rect) throw new Error("Expected a visible insertion line");
    return { top: rect.top, bottom: rect.bottom };
  });
  const scrollBefore = await page.locator(".main-content").evaluate((node) => node.scrollTop);
  await writing.press("/");
  await expect(page.getByRole("menu", { name: "Insert content" })).toBeVisible();
  await expect(writing.locator(".writing-command-line")).toHaveAttribute("data-slash-query", "Type to search");
  await expect.poll(() => writing.locator(".writing-command-line").evaluate((node) => getComputedStyle(node, "::before").content)).toBe('"/"');
  await expect.poll(() => writing.locator(".writing-command-line").evaluate((node) => getComputedStyle(node, "::after").content)).toBe('"Type to search"');
  await expect(page.locator(".writing-editor .writing-content:not([contenteditable])")).toBeHidden();
  await expect(writing).toBeFocused();
  const menu = (await page.getByRole("menu", { name: "Insert content" }).boundingBox())!;
  expect(Math.min(Math.abs(menu.y - caret.bottom), Math.abs(menu.y + menu.height - caret.top))).toBeLessThan(24);
  expect(menu.y).toBeGreaterThanOrEqual(0);
  expect(menu.y + menu.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(await page.locator(".main-content").evaluate((node) => node.scrollTop)).toBe(scrollBefore);
  await page.screenshot({ path: info.outputPath("course-builder-slash.png"), fullPage: true });
  await page.keyboard.type("hea");
  await expect.poll(() => writing.locator(".writing-command-line").evaluate((node) => getComputedStyle(node, "::after").content)).toBe('"hea"');
  await expect(page.getByRole("menuitem")).toHaveCount(2);
  await page.keyboard.press("Enter");
  await expect(writing).toBeFocused();
  await expect.poll(() => page.evaluate(() => { const anchor = window.getSelection()?.anchorNode; return (anchor instanceof Element ? anchor : anchor?.parentElement)?.closest("h2")?.tagName; })).toBe("H2");
  await page.keyboard.type("A heading here");
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Lesson content Markdown" })).toHaveValue(/## A heading here/);
  await page.getByRole("button", { name: "Add quiz" }).click();
  await expect(page.getByRole("heading", { name: "Quiz", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add quiz" })).toHaveCount(0);
  await page.getByRole("button", { name: "Add answer" }).click();
  await expect(page.getByRole("textbox", { name: "Answer 3 for question 1" })).toBeVisible();
  await page.getByRole("textbox", { name: "Answer 3 for question 1" }).fill("Third choice");
  await page.getByRole("checkbox", { name: "Correct answer 3 for question 1" }).check();
  await page.getByRole("button", { name: "Add question" }).click();
  await expect(page.getByRole("heading", { name: "Question 2" })).toBeVisible();
  if ((page.viewportSize()?.width || 0) < 1120) {
    await page.getByRole("combobox", { name: "Edit course step" }).click();
    await page.getByRole("option", { name: /Second lesson/ }).click();
  } else {
    await page.getByRole("navigation", { name: "Edit course step" }).getByRole("button", { name: /Second lesson/ }).click();
  }
  await expect(page.getByRole("heading", { name: "Lesson 2" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Quiz", exact: true })).toHaveCount(0);
});

test("inline media chooser inserts a video where the slash command was opened", async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"), "course", true);
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  await writing.click();
  await page.keyboard.type("Before the video");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("After the video");
  await writing.locator("p").nth(1).click();
  await page.keyboard.press("/");
  await page.keyboard.type("embed video");
  await page.getByRole("menuitem", { name: "Embed video link" }).click();
  await expect(writing.locator(".writing-media-line")).toBeVisible();
  const chooser = page.getByRole("dialog", { name: "Insert video" });
  await expect(chooser).toBeVisible();
  await chooser.getByRole("textbox", { name: "Video URL" }).fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await chooser.getByRole("button", { name: "Insert video" }).click();
  await expect(chooser).toHaveCount(0);
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Lesson content Markdown" })).toHaveValue(/Before the video[\s\S]*\[Video\]\(https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ\)[\s\S]*After the video/);
});

test("wide course tables scroll inside the editor and show a reading edge", async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"), "course", true);
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await page.getByRole("textbox", { name: "Lesson content Markdown" }).fill("Text above the table.\n\n| One | Two | Three | Four | Five | Six |\n| --- | --- | --- | --- | --- | --- |\n| A | B | C | D | E | F |\n\nText below the table.");
  await page.getByRole("button", { name: "Write", exact: true }).click();
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  const table = writing.locator("table").first();
  await expect(table).toBeVisible();
  const widths = await table.evaluate((node) => {
    const wrapper = node.closest('[data-lexical-decorator="true"]');
    const editor = node.closest(".writing-content");
    return { table: node.scrollWidth, wrapper: wrapper?.clientWidth || 0, wrapperScroll: wrapper?.scrollWidth || 0, editor: editor?.scrollWidth || 0, editorWidth: editor?.clientWidth || 0 };
  });
  expect(widths.table).toBeGreaterThan(widths.wrapper);
  expect(widths.wrapperScroll).toBeGreaterThan(widths.wrapper);
  expect(widths.editor).toBeLessThanOrEqual(widths.editorWidth + 2);
  const trailingControlWidth = await table.locator("tfoot th").last().evaluate((cell) => cell.getBoundingClientRect().width);
  expect(trailingControlWidth).toBeLessThan(50);
  await table.getByRole("button", { name: "Column menu" }).first().click();
  await expect(page.getByTitle("Insert a column to the right of this one")).toBeVisible();
  await table.evaluate((node) => { const scroller = node.closest('[data-lexical-decorator="true"]'); if (scroller) scroller.scrollLeft = 180; });
  await expect(page.getByTitle("Insert a column to the right of this one")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("course-editor-wide-table.png") });
  await page.getByRole("button", { name: "Preview draft" }).click();
  const reader = page.locator(".markdown-table-wrap");
  await expect(reader).toHaveAttribute("data-more-right", "true");
  await page.screenshot({ path: info.outputPath("course-table-more-columns.png") });
  await reader.locator(".markdown-table").evaluate((node) => { node.scrollLeft = node.scrollWidth; });
  await expect(reader).toHaveAttribute("data-more-right", "false");
  await page.screenshot({ path: info.outputPath("course-table-scroll.png") });
});

test("slash Table inserts at the selected line and unmatched searches can return to writing", async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"), "course", true);
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await page.getByRole("textbox", { name: "Lesson content Markdown" }).fill("Before\n\nAfter");
  await page.getByRole("button", { name: "Write", exact: true }).click();
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  await writing.locator("p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("/");
  await page.keyboard.type("table");
  await expect(page.getByRole("menuitem", { name: "Table" })).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(writing.locator("table")).toBeVisible();
  await expect(writing.locator("table tbody tr")).toHaveCount(3);
  await expect(writing.locator("table tbody tr").first().locator(":is(td, th):not([data-tool-cell])")).toHaveCount(3);
  const beforeTable = await writing.locator("table").evaluate((node) => node.closest('[data-lexical-decorator="true"]')?.previousElementSibling?.textContent);
  expect(beforeTable).toBe("Before");
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Lesson content Markdown" })).toHaveValue(/Before[\s\S]*\|[\s\S]*After/);
  await page.getByRole("button", { name: "Write", exact: true }).click();
  await writing.locator("p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("/");
  await page.keyboard.type("unlikely-block-name");
  await expect(page.getByRole("menu", { name: "Insert content" })).toHaveCount(0);
  await expect(writing.locator(".writing-command-line")).toHaveCount(0);
  await expect(writing).toBeFocused();
  await page.keyboard.type(" continues");
  await writing.locator("p", { hasText: "After" }).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("/");
  await page.keyboard.type("another-unknown-block");
  await writing.locator("p", { hasText: "Before" }).click();
  await expect(page.getByRole("menu", { name: "Insert content" })).toHaveCount(0);
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Lesson content Markdown" })).toHaveValue(/\/unlikely-block-name continues/);
});

test("slash Table can be chosen with the pointer", async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"), "course", true);
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  await writing.locator("p").first().click();
  await page.keyboard.type("Before");
  await page.keyboard.press("Enter");
  await page.keyboard.press("/");
  await page.getByRole("menuitem", { name: "Table" }).click();
  const table = writing.locator("table");
  await expect(table).toBeVisible();
  await expect(page.getByRole("menu", { name: "Insert content" })).toHaveCount(0);
  await table.getByRole("button", { name: "Column menu" }).first().click();
  await page.getByTitle("Insert a column to the right of this one").click();
  await expect(table.locator("tbody tr").first().locator(":is(td, th):not([data-tool-cell])")).toHaveCount(4);
  await table.getByRole("button", { name: "Row menu" }).first().click();
  await page.getByTitle("Insert a row below this one").click();
  await expect(table.locator("tbody tr")).toHaveCount(4);
  await table.getByRole("button", { name: "Delete table" }).click();
  await expect(table).toHaveCount(0);
});

test("slash list begins on the chosen line without an extra blank block", async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"), "course", true);
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await page.getByRole("textbox", { name: "Lesson content Markdown" }).fill("Before\n\nAfter");
  await page.getByRole("button", { name: "Write", exact: true }).click();
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  await writing.locator("p").first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("/");
  await page.keyboard.type("bullet");
  await page.keyboard.press("Enter");
  await page.keyboard.type("On this line");
  const listItem = writing.locator("li", { hasText: "On this line" });
  await expect(listItem).toBeVisible();
  const structure = await writing.evaluate((node) => {
    const list = node.querySelector("ul")!;
    const before = list.previousElementSibling;
    const after = list.nextElementSibling;
    return {
      previousText: before?.textContent,
      previousTag: before?.tagName,
      nextText: after?.textContent,
      gap: list.getBoundingClientRect().top - (before?.getBoundingClientRect().bottom || 0),
    };
  });
  expect(structure.previousTag).toBe("P");
  expect(structure.previousText).toBe("Before");
  expect(structure.nextText).toBe("After");
  expect(structure.gap).toBeLessThan(64);
  await writing.screenshot({ path: info.outputPath("slash-list-between-paragraphs.png") });
});

test("pasted image uploads at the editor caret", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("production"), "The browser-local demo has no media storage.");
  const { control } = await setup(page, true, "course", true);
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  await writing.click();
  await page.keyboard.type("Before the image");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("After the image");
  await writing.locator("p").nth(1).click();
  await writing.evaluate((node) => {
    const data = new DataTransfer();
    data.items.add(new File(["synthetic"], "pasted.png", { type: "image/png" }));
    node.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect.poll(() => control.uploaded).toBe(true);
  control.releaseUpload();
  await expect(writing.locator("img")).toHaveAttribute("src", /\/api\/media\//);
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Lesson content Markdown" })).toHaveValue(/Before the image[\s\S]*!\[pasted\]\(\/api\/media\/[\s\S]*After the image/);
});

test("image chooser uploads into the selected lesson line", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("production"), "The browser-local demo has no media storage.");
  const { control } = await setup(page, true, "course", true);
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  await writing.click();
  await page.keyboard.press("/");
  await page.getByRole("menuitem", { name: "Image", exact: true }).click();
  const chooser = page.getByRole("dialog", { name: "Insert image" });
  await expect(writing.locator(".writing-media-line")).toBeVisible();
  await chooser.getByRole("textbox", { name: "Image alternative text" }).fill("Course diagram");
  const fileChooser = page.waitForEvent("filechooser");
  await chooser.getByRole("button", { name: "Choose image" }).click();
  await (await fileChooser).setFiles({ name: "diagram.png", mimeType: "image/png", buffer: Buffer.from("synthetic") });
  await expect.poll(() => control.uploaded).toBe(true);
  control.releaseUpload();
  await expect(writing.locator("img")).toHaveAttribute("alt", "Course diagram");
  await expect(chooser).toHaveCount(0);
});

for (const { command, query, marker } of [
  { command: "Bulleted list", query: "bullet", marker: /[*-] A list item/ },
  { command: "Numbered list", query: "number", marker: /1\. A list item/ },
]) {
  test(`${command} keeps the caret in the new list`, async ({ page }, info) => {
    await setup(page, info.project.name.startsWith("production"), "course", true);
    const writing = page.getByRole("textbox", { name: "Lesson content" });
    await writing.click();
    await page.keyboard.press("/");
    await page.keyboard.type(query);
    await page.keyboard.press("Enter");
    await expect(writing.locator(".writing-pending-list")).toBeVisible();
    await expect.poll(() => writing.locator(".writing-pending-list").evaluate((node) => getComputedStyle(node, "::before").content)).toBe(command === "Bulleted list" ? '"•"' : '"1."');
    await page.keyboard.type("A list item");
    await expect.poll(() => page.evaluate(() => { const anchor = window.getSelection()?.anchorNode; return (anchor instanceof Element ? anchor : anchor?.parentElement)?.closest("li")?.tagName; })).toBe("LI");
    await page.getByRole("button", { name: "Markdown", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Lesson content Markdown" })).toHaveValue(marker);
  });
}

test("Insert menus use full rows and can be dismissed", async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"), "course", true);
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  await writing.locator("p").first().click();
  await page.keyboard.press("/");
  const menu = page.getByRole("menu", { name: "Insert content" });
  await expect(menu.getByRole("menuitem", { name: "Close menu esc" })).toBeVisible();
  const menuWidth = (await menu.boundingBox())!.width;
  const rowWidth = (await menu.getByRole("menuitem", { name: "Heading" }).boundingBox())!.width;
  expect(rowWidth).toBeGreaterThan(menuWidth - 24);
  await page.keyboard.type("hea");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(writing.locator(".writing-command-line")).toHaveCount(0);
  await page.keyboard.type("ding");
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Lesson content Markdown" })).toHaveValue(/\/heading/);
  await page.getByRole("button", { name: "Write", exact: true }).click();
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await expect(menu).toBeVisible();
  await menu.getByRole("menuitem", { name: "Close menu esc" }).click();
  await expect(menu).toHaveCount(0);
});

test("slash insertion stays beside a blank line after lesson prose", async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"), "course", true);
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  await writing.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("First line");
  await page.keyboard.press("Enter");
  await page.screenshot({ path: info.outputPath("blank-lesson-line.png") });
  const oldScroll = await page.locator(".main-content").evaluate((node) => node.scrollTop);
  const line = (await writing.locator("p").last().boundingBox())!;
  await page.keyboard.press("/");
  const menu = page.getByRole("menu", { name: "Insert content" });
  await expect(menu).toBeVisible();
  await expect(writing).toBeFocused();
  const box = (await menu.boundingBox())!;
  const newScroll = await page.locator(".main-content").evaluate((node) => node.scrollTop);
  expect(Math.abs(newScroll - oldScroll)).toBeLessThan(8);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(Math.abs(box.x - line.x)).toBeLessThan(24);
  expect(box.y >= line.y + line.height - 12 || box.y + box.height <= line.y + 12).toBe(true);
  await page.screenshot({ path: info.outputPath("blank-line-commands.png") });
  await page.keyboard.type("call");
  await page.keyboard.press("Enter");
  await expect(writing).toBeFocused();
  await expect.poll(() => page.evaluate(() => { const anchor = window.getSelection()?.anchorNode; return (anchor instanceof Element ? anchor : anchor?.parentElement)?.closest("blockquote")?.tagName; })).toBe("BLOCKQUOTE");
  await page.keyboard.type("A callout here");
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Lesson content Markdown" })).toHaveValue(/First line[\s\S]*> A callout here/);
});
