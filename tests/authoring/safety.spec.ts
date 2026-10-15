import { test, expect, type Page } from "@playwright/test";

import { readFile, writeFile } from "node:fs/promises";

import {
  waitForDraftSaved,
  openContentSettings,
  returnToContent,
} from "./editor-helpers";

import { freshWorkspace } from "../../lib/store";

import { authoringUser, setupAuthoringProvider } from "./provider-fixture";

async function setup(
  page: Page,
  production: boolean,
  kind: "doc" | "course" | "brief" = "doc",
  blankCourse = false,
  assignedCourse = false,
  lessonBody?: string,
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
  if (lessonBody !== undefined) {
    if (kind === "course") state.content[0].lessons[0].body = lessonBody;
    else state.content[0].body = lessonBody;
  }
  state.publishedContent = [];
  if (assignedCourse) {
    const course = state.content[0];
    course.status = "published";
    course.publishedRevision = 1;
    course.groups = [state.groups[0].id];
    state.groups[0].requiredCourseIds = [course.id];
    state.groups[0].learningItems = [{ kind: "course", id: course.id }];
    course.assignments = [
      {
        groupId: state.groups[0].id,
        assignedAt: course.createdAt || course.updatedAt,
        due: { type: "none" },
      },
    ];
    course.lessons[0].videoUrl = "https://example.com/legacy.mp4";
    state.publishedContent = [structuredClone(course)];
  }
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
          upload: {
            url: "https://test.supabase.co/storage/v1/object/upload/sign/fieldbook-media/synthetic/image.png?token=synthetic",
            method: "PUT",
            headers: { "Content-Type": control.mediaType, "x-upsert": "false" },
          },
        },
      });
    });
    await page.route("https://test.supabase.co/**", (route) => {
      expect(route.request().method()).toBe("PUT");
      expect(route.request().headers()["content-type"]).toBe(control.mediaType);
      expect(route.request().headers()["x-upsert"]).toBe("false");
      expect(route.request().postDataBuffer()?.length).toBeGreaterThan(0);
      return route.fulfill({ json: { Key: "synthetic/image.png" } });
    });
  } else {
    await page.addInitScript((data) => {
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    }, state);
  }
  await page.goto(
    production ? `/admin/content/${state.content[0].id}/edit` : "/#admin",
  );
  if (!production)
    await page.getByRole("link", { name: "Safety fixture" }).click();
  return { state, control };
}

async function failDraftWrites(
  page: Page,
  production: boolean,
  control: { failSave: boolean },
) {
  control.failSave = true;
  if (!production)
    await page.evaluate(() => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "fieldbook.workspace.v1")
          throw new Error("Storage is full");
        return setItem.call(this, key, value);
      };
    });
}

async function openCourseOutline(page: Page) {
  const toggle = page.getByRole("button", { name: /^Outline/ });
  if ((await toggle.getAttribute("aria-expanded")) !== "true")
    await toggle.click();
  return page.getByRole("navigation", { name: "Edit course step" });
}

async function openNav(page: Page) {
  const menu = page.getByRole("button", { name: "Open navigation" });
  if (
    (page.viewportSize()?.width ?? 1000) < 768 &&
    (await menu.getAttribute("aria-expanded")) !== "true"
  ) {
    await menu.click();
    await expect(
      page.getByRole("button", { name: "Close navigation" }),
    ).toBeVisible();
  }
}

for (const entry of ["account menu"]) {
  test(`Administration ${entry} preserves a failed draft on Cancel and returns to Content on Confirm`, async ({
    page,
  }, info) => {
    const production = info.project.name.startsWith("production");
    const { control } = await setup(page, production);
    const initialUrl = page.url();
    await failDraftWrites(page, production, control);
    const title = page.getByLabel("Title", { exact: true });
    await title.fill("Keep this exact editor");
    const original = await title.elementHandle();
    const select = async () => {
      await openNav(page);
      await page
        .getByRole("button", { name: "Account menu", exact: true })
        .click();
      await page
        .getByRole("menuitem", { name: "Manage organization", exact: true })
        .click();
    };
    await select();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(
      page.getByRole("status", { name: "Opening page", exact: true }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(title).toHaveValue("Keep this exact editor");
    expect(await original!.evaluate((node) => node.isConnected)).toBe(true);
    await expect(page.locator(".admin-layout")).toHaveCount(0);
    await expect(
      page.getByRole("combobox", {
        name: "Administration section",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(page).toHaveURL(initialUrl);
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`${entry}-cancel-editor.png`),
    });
    await select();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.locator(".admin-layout")).toBeVisible();
    await expect(title).toHaveCount(0);
    await expect(
      page
        .locator('table[data-layout="contentSelection"] tbody tr')
        .first()
        .getByRole("link"),
    ).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(
      page.getByRole("status", { name: "Opening page", exact: true }),
    ).toHaveCount(0);
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`${entry}-confirmed-content.png`),
    });
  });
}

test("failed autosave preserves edits through search, canceled navigation and reload until explicit leave", async ({
  page,
}, info) => {
  const production = info.project.name.startsWith("production");
  const { control } = await setup(page, production);
  await failDraftWrites(page, production, control);
  await page.getByLabel("Title", { exact: true }).fill("Keep these edits");
  await returnToContent(page);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Keep these edits",
  );
  const searchTrigger = page.getByRole("button", { name: "Open search", exact: true });
  const collapsedSearch = await searchTrigger.isVisible();
  if (collapsedSearch) await searchTrigger.click();
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
    collapsedSearch ? searchTrigger : page.getByRole("textbox", { name: "Search all content" }),
  ).toBeFocused();
  await openNav(page);
  await page
    .getByRole("navigation")
    .getByRole(info.project.name.startsWith("production") ? "link" : "button", {
      name: "Docs",
      exact: true,
    })
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
  await returnToContent(page);
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator(".admin-layout")).toBeVisible();
});

test("browser back preserves an unsaved failed draft when leaving is canceled", async ({
  page,
}, info) => {
  const production = info.project.name.startsWith("production");
  const { control } = await setup(page, production);
  await returnToContent(page);
  await openNav(page);
  // This fixture resets published Docs between cases; use a collection route.
  await page
    .getByRole("navigation")
    .getByRole(production ? "link" : "button", { name: "Updates", exact: true })
    .click();
  await expect(page).toHaveURL(production ? /\/updates$/ : /#updates$/);
  await expect(
    page.getByRole("heading", { name: "Updates", exact: true }),
  ).toBeVisible();
  await openNav(page);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("menuitem", { name: "Manage organization" }).click();
  await page
    .locator('table[data-layout="contentSelection"] tbody tr')
    .first()
    .getByRole("link")
    .click();
  await expect(
    page.getByRole("textbox", { name: "Title", exact: true }),
  ).toBeVisible();
  const editorUrl = page.url();
  await failDraftWrites(page, production, control);
  await page.getByLabel("Title", { exact: true }).fill("History protected");
  await page.evaluate(() => history.back());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "History protected",
  );
  await expect(page).toHaveURL(editorUrl);
  if (production) {
    await page.evaluate(() => history.back());
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page).toHaveURL(/\/admin\/content$/);
    await page.evaluate(() => history.back());
    await expect(page).toHaveURL(/\/updates$/);
  }
});

test("failed save preserves downloadable text and does not show success", async ({
  page,
}, info) => {
  const production = info.project.name.startsWith("production");
  if (info.project.name.endsWith("desktop"))
    await page.setViewportSize({ width: 1440, height: 620 });
  const { control } = await setup(page, production);
  if (info.project.name.endsWith("desktop"))
    await expect(page.locator(".editor")).toHaveAttribute(
      "data-scroll-layout",
      "workspace",
    );
  const scrollLayout = await page.locator(".editor").getAttribute("data-scroll-layout");
  await failDraftWrites(page, production, control);
  await page.getByLabel("Title", { exact: true }).fill("Recover my draft");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(
    page.locator("form.editor").getByRole("alert").first(),
  ).toContainText(production ? "Database unavailable" : "Storage is full");
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Recover my draft",
  );
  await expect(
    page.locator(".editor-save-status [role=status] > .sr-only"),
  ).toHaveText("Changes not saved");
  await expect(page.locator(".editor")).toHaveAttribute(
    "data-scroll-layout",
    scrollLayout!,
  );
  await expect(page.locator('[data-slot="toast"]')).toHaveCount(0);
  await page
    .locator("form.editor")
    .getByRole("button", { name: "Dismiss message", exact: true })
    .click();
  await expect(page.locator("form.editor").getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Recover my draft",
  );
  await expect(
    page.locator(".editor-save-status [role=status] > .sr-only"),
  ).toHaveText("Changes not saved");
  await expect(
    page.getByRole("button", { name: "Publish", exact: true }),
  ).toBeDisabled();
  if (production)
    await expect(
      page.getByRole("button", { name: "Retry saving", exact: true }),
    ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download your changes" }).click();
  const downloaded = await download;
  expect(downloaded.suggestedFilename()).toBe("fieldbook-unsaved-draft.json");
  expect(
    JSON.parse(await readFile((await downloaded.path())!, "utf8")).title,
  ).toBe("Recover my draft");
});

test("failed learning-group save shows one concise inline error", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("production"),
    "Controlled save failures use the installed-app provider fixture",
  );
  const { state } = await setup(page, true, "course");
  state.content[0].status = "published";
  state.publishedContent = [state.content[0]];
  state.groups = [{ ...state.groups[0], learningItems: [] }];
  await page.route("**/api/governance", (route) =>
    route.fulfill({
      status: 500,
      json: {
        error: "This action couldn’t be completed. Try again.",
        requestId: "00000000-0000-4000-8000-000000000010",
      },
    }),
  );
  await page.goto("/admin");
  if (info.project.name.endsWith("phone")) {
    await page
      .getByRole("combobox", { name: "Administration section" })
      .click();
    await page.getByRole("option", { name: "Groups" }).click();
  } else {
    await page.getByRole("tab", { name: "Groups" }).click();
  }
  await page
    .getByRole("link", { name: state.groups[0].name, exact: true })
    .click();
  await page
    .getByRole("tab", { name: "Assigned Courses", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Manage Courses", exact: true })
    .click();
  const picker = page.getByRole("dialog");
  await picker
    .getByRole("button", { name: `Add ${state.content[0].title}`, exact: true })
    .click();
  await picker
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await picker
    .getByRole("button", { name: "Save assignments", exact: true })
    .click();
  const saveAlerts = page.locator('[data-slot="alert"]');
  await expect(saveAlerts).toHaveCount(1);
  await expect(saveAlerts).toContainText("0 of 1 changes were confirmed saved");
  await expect(saveAlerts).toContainText(
    "Reference: 00000000-0000-4000-8000-000000000010",
  );
  await expect(
    picker.getByRole("button", { name: "Save assignments", exact: true }),
  ).toBeDisabled();
  await saveAlerts
    .getByRole("button", { name: "Dismiss message", exact: true })
    .click();
  await expect(saveAlerts).toHaveCount(0);
  await expect(
    picker.getByRole("button", { name: "Refresh audience", exact: true }),
  ).toBeVisible();
  await expect(
    picker.getByRole("button", { name: "Save assignments", exact: true }),
  ).toBeDisabled();
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("group-save-error.png"),
    fullPage: true,
  });
});

for (const mode of [
  "recovery-unavailable",
  "lost-response",
  "conflict",
] as const)
  test(`${mode}: recover the saved copy without silently resending`, async ({
    page,
  }, info) => {
    test.skip(
      !info.project.name.startsWith("production"),
      "Server failure case",
    );
    const { control } = await setup(page, true);
    control.failSave = mode === "recovery-unavailable";
    control.failRefresh = mode === "recovery-unavailable";
    control.loseResponse = mode === "lost-response";
    control.conflict = mode === "conflict";
    await page.getByLabel("Title", { exact: true }).fill("My local edit");
    await page.keyboard.press("ControlOrMeta+s");
    await expect(
      page.locator("form.editor").getByRole("alert").first(),
    ).toContainText(
      mode === "recovery-unavailable"
        ? "Database unavailable"
        : mode === "lost-response"
          ? "may have been saved"
          : "This change was not saved",
    );
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
      "My local edit",
    );
    control.failRefresh = false;
    control.failSave = false;
    await page.getByRole("button", { name: "Load saved draft" }).click();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
      "My local edit",
    );
    await page.getByRole("button", { name: "Load saved draft" }).click();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
      mode === "conflict"
        ? "Another author's change"
        : mode === "recovery-unavailable"
          ? "Safety fixture"
          : "My local edit",
    );
    expect(control.saves).toBe(1);
  });

for (const media of ["card-art"] as const)
  test(`course ${media} cannot be removed or saved while uploading`, async ({
    page,
  }, info) => {
    test.skip(
      !info.project.name.startsWith("production"),
      "Uploads are installation-only",
    );
    const { control, state } = await setup(page, true, "course");
    await openContentSettings(page);
    await page
      .getByLabel("Upload card artwork", { exact: true })
      .setInputFiles({
        name: "cover.png",
        mimeType: "image/png",
        buffer: Buffer.from("synthetic"),
      });
    await expect.poll(() => control.uploaded).toBe(true);
    const actions = page.getByRole("button", {
      name: "Lesson actions",
      exact: true,
    });
    if (await actions.isVisible()) await expect(actions).toBeDisabled();
    else
      await expect(
        page.getByRole("button", { name: /^Outline/ }),
      ).toBeDisabled();
    await expect(
      page.locator(".topbar").getByRole("button", {
        name: /Publish|Review requirements/,
        includeHidden: true,
      }),
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
    await expect
      .poll(() => state.content[0].cardArt?.imageUrl || "")
      .toContain("/api/media/");
    if (media === "card-art") await page.keyboard.press("Escape");
    await expect(page.locator("form.editor")).toBeVisible();
    const saved = state.content[0];
    expect(saved.cardArt?.imageUrl).toContain("/api/media/");
  });

test("session expiration during recovery cannot replace the editor with a guest screen", async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith("production"), "Server session case");
  const { control } = await setup(page, true);
  control.failSave = true;
  control.sessionLost = true;
  await page
    .getByLabel("Title", { exact: true })
    .fill("Keep this after expiry");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(page.locator("form.editor").getByRole("alert")).toContainText(
    "Database unavailable",
  );
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Keep this after expiry",
  );
  await page.getByRole("button", { name: "Load saved draft" }).click();
  await expect(page.locator("form.editor").getByRole("alert")).toContainText(
    "Publishing access changed",
  );
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Keep this after expiry",
  );
});

test("autosave stays quiet and explicit publication shows one transient confirmation", async ({
  page,
}, info) => {
  const production = info.project.name.startsWith("production");
  await setup(page, production);
  await page.getByLabel("Title", { exact: true }).fill("Notification fixture");
  await waitForDraftSaved(page);
  const toast = page.locator('[data-slot="toast"]');
  await expect(toast).toHaveCount(0);
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

test("card artwork above 50 MB reaches storage and a rejection preserves existing artwork", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("production"),
    "Uploads are installation-only",
  );
  const { state } = await setup(page, true, "course");
  const original = JSON.stringify(state.content[0].cardArt);
  await openContentSettings(page);
  await page.unroute("**/api/upload");
  let signed = 0,
    completed = 0;
  await page.route("**/api/upload", (route) => {
    const body = route.request().postDataJSON();
    if (body.complete) {
      completed++;
      return route.fulfill({
        json: { url: "/api/media/should-not-be-ready.png" },
      });
    }
    expect(body.size).toBeGreaterThan(50 * 1024 * 1024);
    signed++;
    return route.fulfill({
      json: {
        id: "artwork",
        upload: {
          protocol: "tus",
          url: "https://test.storage.supabase.co/ui4-artwork",
          chunkSize: 6 * 1024 * 1024,
          headers: { "x-signature": "synthetic" },
          metadata: {
            bucketName: "fieldbook-media",
            objectName: "synthetic/artwork.png",
            contentType: "image/png",
          },
        },
      },
    });
  });
  await page.route("https://test.storage.supabase.co/ui4-artwork", (route) =>
    route.fulfill({ status: 413, json: { error: "EntityTooLarge" } }),
  );
  const filePath = info.outputPath("large-artwork.png");
  await writeFile(filePath, Buffer.alloc(54 * 1024 * 1024));
  await page
    .getByLabel("Upload card artwork", { exact: true })
    .setInputFiles(filePath);
  const artwork = page.getByRole("region", {
    name: "Card artwork editor",
    exact: true,
  });
  await expect(artwork.getByRole("alert")).toContainText(
    "exceeds the upload size limit",
  );
  expect(signed).toBe(1);
  expect(completed).toBe(0);
  expect(JSON.stringify(state.content[0].cardArt)).toBe(original);
  await expect(
    artwork.getByRole("combobox", { name: "Artwork source", exact: true }),
  ).toBeEnabled();
  await artwork.getByRole("alert").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("large-artwork-recovery.png"),
    fullPage: true,
  });
});
