import { test, expect, type Locator, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { expectMarkdown, waitForDraftSaved, openContentSettings, returnToContent } from "./editor-helpers";
import { freshWorkspace } from "../../lib/store";
import { authoringUser, setupAuthoringProvider, syncAuthoringProvider } from "./provider-fixture";

async function tableActionPlacement(table: Locator) {
  return table.evaluate((node) => {
    const host = node.closest<HTMLElement>('[data-lexical-decorator="true"]')!;
    const button = document.querySelector<HTMLButtonElement>('button[aria-label="Table actions"]')!;
    const tableBounds = node.getBoundingClientRect();
    const hostBounds = host.getBoundingClientRect();
    const buttonBounds = button.getBoundingClientRect();
    const visibleLeft = Math.max(tableBounds.left, hostBounds.left + 16);
    return {
      gap: visibleLeft - buttonBounds.right,
      withinViewport: buttonBounds.left >= 0 && buttonBounds.right <= window.innerWidth,
      tableRight: tableBounds.right,
      hostRight: hostBounds.right,
    };
  });
}

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
  await page.goto(production ? `/admin/content/${state.content[0].id}/edit` : "/#admin");
  if (!production) await page.getByRole("link", { name: "Safety fixture" }).click();
  return { state, control };
}
async function failDraftWrites(page: Page, production: boolean, control: { failSave: boolean }) {
  control.failSave = true;
  if (!production) await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "fieldbook.workspace.v1") throw new Error("Storage is full");
      return setItem.call(this, key, value);
    };
  });
}

async function openCourseOutline(page: Page) {
  const toggle = page.getByRole("button", { name: /^Outline/ });
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
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
  test(`Administration ${entry} preserves a failed draft on Cancel and returns to Content on Confirm`, async ({ page }, info) => {
    const production = info.project.name.startsWith("production");
    const { control } = await setup(page, production);
    await failDraftWrites(page, production, control);
    const title = page.getByLabel("Title", { exact: true });
    await title.fill("Keep this exact editor");
    const original = await title.elementHandle();
    const select = async () => {
      await openNav(page);
      await page.getByRole("button", { name: "Account menu", exact: true }).click();
      await page.getByRole("menuitem", { name: "Manage organization", exact: true }).click();
    };
    await select();
    await expect(page.getByRole("alertdialog")).toBeVisible();
    await expect(page.getByRole("status", { name: "Opening page", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(title).toHaveValue("Keep this exact editor");
    expect(await original!.evaluate((node) => node.isConnected)).toBe(true);
    await expect(page.locator(".admin-layout")).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Administration section", exact: true })).toHaveCount(0);
    await expect(page).toHaveURL(production ? /\/admin$/ : /#admin$/);
    await page.screenshot({ animations: "disabled", path: info.outputPath(`${entry}-cancel-editor.png`) });
    await select();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.locator(".admin-layout")).toBeVisible();
    await expect(title).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("alertdialog")).toHaveCount(0);
    await expect(page.getByRole("status", { name: "Opening page", exact: true })).toHaveCount(0);
    await page.screenshot({ animations: "disabled", path: info.outputPath(`${entry}-confirmed-content.png`) });
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
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await failDraftWrites(page, production, control);
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
    await expect(page).toHaveURL(/\/updates$/);
  }
});

test("failed save preserves downloadable text and does not show success", async ({
  page,
}, info) => {
  const production = info.project.name.startsWith("production");
  if (info.project.name.endsWith("desktop")) await page.setViewportSize({ width: 1440, height: 620 });
  const { control } = await setup(page, production);
  if (info.project.name.endsWith("desktop")) await expect(page.locator(".editor")).toHaveAttribute("data-scroll-layout", "workspace");
  await failDraftWrites(page, production, control);
  await page.getByLabel("Title", { exact: true }).fill("Recover my draft");
  await page.keyboard.press("ControlOrMeta+s");
  await expect(
    page.locator("form.editor").getByRole("alert").first(),
  ).toContainText(
    production ? "Database unavailable" : "Storage is full",
  );
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "Recover my draft",
  );
  await expect(page.locator(".editor-save-status [role=status] > .sr-only")).toHaveText("Changes not saved");
  await expect(page.locator(".editor")).toHaveAttribute("data-scroll-layout", "page");
  await expect(page.locator('[data-slot="toast"]')).toHaveCount(0);
  await page.locator("form.editor").getByRole("button", { name: "Dismiss message", exact: true }).click();
  await expect(page.locator("form.editor").getByRole("alert")).toHaveCount(0);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Recover my draft");
  await expect(page.locator(".editor-save-status [role=status] > .sr-only")).toHaveText("Changes not saved");
  await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
  if (production) await expect(page.getByRole("button", { name: "Retry saving", exact: true })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download your changes" }).click();
  const downloaded = await download;
  expect(downloaded.suggestedFilename()).toBe("fieldbook-unsaved-draft.json");
  expect(JSON.parse(await readFile((await downloaded.path())!, "utf8")).title).toBe("Recover my draft");
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
  await page.getByRole("tab", { name: "Assigned Courses", exact: true }).click();
  await page.getByRole("button", { name: "Assign Courses", exact: true }).click();
  const picker = page.getByRole("dialog");
  await picker
    .getByRole("checkbox", { name: new RegExp(state.content[0].title) })
    .check();
  await picker
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await picker.getByRole("button", { name: "Save assignments", exact: true }).click();
  const saveAlerts = page.locator('[data-slot="alert"]');
  await expect(saveAlerts).toHaveCount(1);
  await expect(saveAlerts).toContainText("0 of 1 changes were confirmed saved");
  await expect(saveAlerts).toContainText(
    "Reference: 00000000-0000-4000-8000-000000000010",
  );
  await expect(
    picker.getByRole("button", { name: "Save assignments", exact: true }),
  ).toBeDisabled();
  await saveAlerts.getByRole("button", { name: "Dismiss message", exact: true }).click();
  await expect(saveAlerts).toHaveCount(0);
  await expect(picker.getByRole("button", { name: "Refresh audience", exact: true })).toBeVisible();
  await expect(picker.getByRole("button", { name: "Save assignments", exact: true })).toBeDisabled();
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
    await waitForDraftSaved(page);
    const savesBeforeUpload = control.saves;
    await page.locator('.writing-editor input[type="file"]').setInputFiles({
      name: "example.png",
      mimeType: "image/png",
      buffer: Buffer.from("synthetic"),
    });
    await expect.poll(() => control.uploaded).toBe(true);
    await expect(
      page.locator(".topbar").getByRole("button", { name: /^(Publish( changes)?|Review requirements)$/ }),
    ).toBeDisabled();
    await expect(page.getByRole("button", { name: "Details", exact: true })).toBeDisabled();
    // Exercise the handler directly too, bypassing the disabled submit button.
    await page
      .locator("form.editor")
      .evaluate((form) =>
        form.dispatchEvent(
          new Event("submit", { bubbles: true, cancelable: true }),
        ),
      );
    expect(control.saves).toBe(savesBeforeUpload);
    await openNav(page);
    await page
      .getByRole("navigation")
      .getByRole(
        info.project.name.startsWith("production") ? "link" : "button",
        { name: "Docs", exact: true },
      )
      .click();
    const closeNav = page.getByRole("button", { name: "Close navigation" });
    if (await closeNav.isVisible()) await closeNav.click();
    await expect(
      page.getByRole("textbox", { name: "Doc content", exact: true }),
    ).toHaveText("Keep the original bodyLoading…");
    expect(state.content[0].body).toBe("Keep the original body");
    control.releaseUpload();
    await expect(
      page.locator(".topbar").getByRole("button", { name: /^(Publish( changes)?|Review requirements)$/ }),
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
    await waitForDraftSaved(page);
    expect(state.content[0].body).toContain("Keep the original body");
    expect(state.content[0].body.includes("/api/media/")).toBe(!failure);
  });

for (const mode of ["recovery-unavailable", "lost-response", "conflict"] as const)
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
      mode === "conflict" ? "Another author's change" : mode === "recovery-unavailable" ? "Safety fixture" : "My local edit",
    );
    expect(control.saves).toBe(1);
  });

for (const media of ["inline-video", "card-art"] as const)
  test(`course ${media} cannot be removed or saved while uploading`, async ({
    page,
  }, info) => {
    test.skip(
      !info.project.name.startsWith("production"),
      "Uploads are installation-only",
    );
    const { control, state } = await setup(page, true, "course");
    const file = {
      name: media === "card-art" ? "cover.png" : "lesson.mp4",
      mimeType: media === "card-art" ? "image/png" : "video/mp4",
      buffer: Buffer.from("synthetic"),
    };
    if (media === "card-art") {
      await openContentSettings(page);
    }
    const input =
      media === "card-art"
        ? page.getByLabel("Upload card artwork", { exact: true })
        : page.locator('.writing-editor input[type="file"]').first();
    await input.setInputFiles(file);
    await expect.poll(() => control.uploaded).toBe(true);
    const actions = page.getByRole("button", { name: "Lesson actions", exact: true });
    if (await actions.isVisible()) await expect(actions).toBeDisabled();
    else await expect(page.getByRole("button", { name: /^Outline/ })).toBeDisabled();
    await expect(
      page.locator(".topbar").getByRole("button", { name: /Publish|Review requirements/, includeHidden: true }),
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
    await expect.poll(() => media === "card-art"
      ? state.content[0].cardArt?.imageUrl || ""
      : state.content[0].lessons[0].body).toContain("/api/media/");
    if (media === "card-art") await page.keyboard.press("Escape");
    await expect(page.locator("form.editor")).toBeVisible();
    const saved = state.content[0];
    expect(
      media === "card-art" ? saved.cardArt?.imageUrl : saved.lessons[0].body,
    ).toContain("/api/media/");
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

test("course builder edits one lesson at a time and keeps one final quiz", async ({
  page,
}, info) => {
  await setup(page, info.project.name.startsWith("production"), "course", true);
  await expect(page.getByLabel("Lesson title", { exact: true })).toHaveValue("Lesson 1");
  const metadata = page.getByRole("region", { name: "Course introduction" });
  await expect(
    metadata.getByRole("textbox", { name: "Title", exact: true }),
  ).toBeVisible();
  if (await page.getByRole("navigation", { name: "Edit course step" }).isVisible()) {
    const details = await metadata.boundingBox();
    const outline = await page
      .getByRole("navigation", { name: "Edit course step" })
      .boundingBox();
    expect(details!.y + details!.height).toBeLessThanOrEqual(outline!.y);
  }
  await expect(
    page.getByLabel("Opening video URL", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Upload opening video", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("course-builder-layout.png"),
    fullPage: true,
  });
  await openCourseOutline(page);
  await page.getByRole("button", { name: "Add lesson" }).click();
  await page.getByLabel("Lesson title").fill("Second lesson");
  await expect(page.getByLabel("Lesson title", { exact: true })).toHaveValue("Second lesson");
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  await writing.click({ position: { x: 32, y: 48 } });
  const caret = await page.evaluate(() => {
    const selection = window.getSelection()!;
    const range = selection.getRangeAt(0).getBoundingClientRect();
    const anchor =
      selection.anchorNode instanceof Element
        ? selection.anchorNode
        : selection.anchorNode?.parentElement;
    const rect = range.height
      ? range
      : anchor
          ?.closest("p, h1, h2, h3, li, blockquote")
          ?.getBoundingClientRect();
    if (!rect) throw new Error("Expected a visible insertion line");
    return { top: rect.top, bottom: rect.bottom };
  });
  const scrollBefore = await page
    .locator(".main-content")
    .evaluate((node) => node.scrollTop);
  await writing.press("/");
  await expect(
    page.getByRole("menu", { name: /^Insert content/ }),
  ).toBeVisible();
  await expect(writing.locator(".writing-command-line")).toHaveAttribute(
    "data-slash-query",
    "Type to search",
  );
  await expect
    .poll(() =>
      writing
        .locator(".writing-command-line")
        .evaluate((node) => getComputedStyle(node, "::before").content),
    )
    .toBe('"/"');
  await expect
    .poll(() =>
      writing
        .locator(".writing-command-line")
        .evaluate((node) => getComputedStyle(node, "::after").content),
    )
    .toBe('"Type to search"');
  await expect
    .poll(() =>
      writing.locator(".writing-command-line").evaluate((node) => {
        const lineBreak = node.querySelector("br");
        return !lineBreak || getComputedStyle(lineBreak).display === "none";
      }),
    )
    .toBe(true);
  await expect(
    page.locator(".writing-editor .writing-content:not([contenteditable])"),
  ).toBeHidden();
  await expect(writing).toBeFocused();
  const menu = (await page
    .getByRole("menu", { name: /^Insert content/ })
    .boundingBox())!;
  expect(
    Math.min(
      Math.abs(menu.y - caret.bottom),
      Math.abs(menu.y + menu.height - caret.top),
    ),
  ).toBeLessThan(24);
  expect(menu.y).toBeGreaterThanOrEqual(0);
  expect(menu.y + menu.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(
    await page.locator(".main-content").evaluate((node) => node.scrollTop),
  ).toBe(scrollBefore);
  await page.screenshot({
    path: info.outputPath("course-builder-slash.png"),
    fullPage: true,
  });
  await page.keyboard.type("h2");
  await expect
    .poll(() =>
      writing
        .locator(".writing-command-line")
        .evaluate((node) => getComputedStyle(node, "::after").content),
    )
    .toBe('"h2"');
  await expect(page.getByRole("menuitem")).toHaveCount(2);
  await page.keyboard.press("Enter");
  await expect(writing).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const anchor = window.getSelection()?.anchorNode;
        return (
          anchor instanceof Element ? anchor : anchor?.parentElement
        )?.closest("h2")?.tagName;
      }),
    )
    .toBe("H2");
  await page.keyboard.type("A heading here");
  await expectMarkdown(page, /## A heading here/);
  await openCourseOutline(page);
  await page.getByRole("button", { name: "Add quiz" }).click();
  await expect(
    page.getByRole("heading", { name: "Quiz", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Add quiz" })).toHaveCount(0);
  await page.getByRole("button", { name: "Add answer" }).click();
  await expect(
    page.getByRole("textbox", { name: "Answer 3 for question 1" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Answer 3 for question 1" })
    .fill("Third choice");
  await page
    .getByRole("checkbox", { name: "Correct answer 3 for question 1" })
    .check();
  await page.getByRole("button", { name: "Add question" }).click();
  await expect(page.getByRole("heading", { name: "Question 2" })).toBeVisible();
  const outline = await openCourseOutline(page);
  await outline.getByRole("button", { name: /Second lesson/ }).click();
  await expect(page.getByLabel("Lesson title", { exact: true })).toHaveValue("Second lesson");
  await expect(
    page.getByRole("heading", { name: "Quiz", exact: true }),
  ).toHaveCount(0);
});

test("inline media chooser inserts a video where the slash command was opened", async ({
  page,
}, info) => {
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
  await chooser
    .getByRole("textbox", { name: "Video URL" })
    .fill("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  await chooser.getByRole("button", { name: "Insert video" }).click();
  await expect(chooser).toHaveCount(0);
  await expectMarkdown(page,
    /Before the video[\s\S]*\[Video\]\(https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ\)[\s\S]*After the video/,
  );
});

test("wide course tables scroll inside the editor and show a reading edge", async ({
  page,
}, info) => {
  await setup(page, info.project.name.startsWith("production"), "course", true, false,
    "Text above the table.\n\n| One | Two | Three | Four | Five | Six |\n| --- | --- | --- | --- | --- | --- |\n| A | B | C | D | E | F |\n\nText below the table.");
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  const table = writing.locator("table").first();
  await expect(table).toBeVisible();
  const widths = await table.evaluate((node) => {
    const wrapper = node.closest('[data-lexical-decorator="true"]');
    const editor = node.closest(".writing-content");
    return {
      table: node.scrollWidth,
      wrapper: wrapper?.clientWidth || 0,
      wrapperScroll: wrapper?.scrollWidth || 0,
      editor: editor?.scrollWidth || 0,
      editorWidth: editor?.clientWidth || 0,
    };
  });
  expect(widths.table).toBeGreaterThan(widths.wrapper);
  expect(widths.wrapperScroll).toBeGreaterThan(widths.wrapper);
  expect(widths.editor).toBeLessThanOrEqual(widths.editorWidth + 2);
  await expect.poll(async () => {
    const placement = await tableActionPlacement(table);
    return placement.gap >= -2 && placement.gap <= 16 && placement.withinViewport;
  }).toBe(true);
  const trailingControlWidth = await table
    .locator("tfoot th")
    .last()
    .evaluate((cell) => cell.getBoundingClientRect().width);
  expect(trailingControlWidth).toBeLessThan(50);
  await page.getByRole("button", { name: "Column 1 actions and drag handle" }).first().click();
  await expect(
    page.getByRole("menuitem", { name: "Insert column after" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await table.evaluate((node) => {
    const scroller = node.closest('[data-lexical-decorator="true"]');
    if (scroller) scroller.scrollLeft = 180;
  });
  await expect.poll(async () => {
    const placement = await tableActionPlacement(table);
    return placement.gap >= -2 && placement.gap <= 16 && placement.withinViewport;
  }).toBe(true);
  await expect(
    page.getByRole("menuitem", { name: "Insert column after" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("course-editor-wide-table.png"),
  });
  const restoredTable = page.getByRole("textbox", { name: "Lesson content", exact: true }).getByRole("table");
  await expect(restoredTable).toBeVisible();
  expect(await restoredTable.evaluate((node) => {
    const owner = node.closest('[data-lexical-decorator="true"]')!;
    return owner.scrollWidth > owner.clientWidth;
  })).toBe(true);

});

test("table actions stay beside the table across editor widths", async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"), "course", true, false,
    "| Symptom | Next check |\n| --- | --- |\n| No Ask AI option | Saved feature setting |");
  const table = page.getByRole("textbox", { name: "Lesson content" }).locator("table");
  await expect(table).toBeVisible();
  await expect.poll(async () => {
    const placement = await tableActionPlacement(table);
    return (info.project.name.endsWith("phone") || placement.tableRight < placement.hostRight - 40)
      && placement.gap >= -2 && placement.gap <= 16 && placement.withinViewport;
  }).toBe(true);
  const tableActions = page.getByRole("button", { name: "Table actions" });
  await table.getByText("No Ask AI option").hover();
  await expect.poll(() => tableActions.evaluate((node) => getComputedStyle(node.closest(".writing-block-gutter-actions")!).opacity)).toBe("1");
  await tableActions.hover();
  await expect.poll(() => tableActions.evaluate((node) => getComputedStyle(node.closest(".writing-block-gutter-actions")!).opacity)).toBe("1");
  await tableActions.click();
  await expect(page.getByRole("menuitem", { name: "Write after table" })).toBeVisible();
  const menu = await page.getByRole("menu").boundingBox();
  const canvas = await page.getByRole("textbox", { name: "Lesson content" }).boundingBox();
  expect(menu!.x).toBeGreaterThanOrEqual(canvas!.x);
  await page.screenshot({ path: info.outputPath("table-gutter-menu.png") });
});

test("non-text block menus sit in the left writing gutter", async ({ page }, info) => {
  await page.route("https://example.com/fixture.png", (route) => route.fulfill({
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64"),
  }));
  await setup(page, info.project.name.startsWith("production"), "course", true, false,
    "Before\n\n[Video](https://www.youtube.com/watch?v=dQw4w9WgXcQ)\n\n![Fixture](https://example.com/fixture.png)\n\n```js\nconst value = 1;\n```\n\n---\n\nAfter");
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  const blocks = [
    { label: "Video actions", block: writing.locator(".writing-media-block") },
    { label: "Image actions", block: writing.locator('[data-editor-block-type="image"]') },
    { label: "Code block actions", block: writing.locator(".writing-code-block") },
    { label: "Divider actions", block: writing.locator("hr") },
  ];
  for (const { label, block } of blocks) {
    await expect(block).toBeVisible();
    const action = page.getByRole("button", { name: label });
    await expect(action).toHaveCount(1);
    await expect.poll(async () => {
      const button = await action.boundingBox();
      const target = await block.boundingBox();
      const canvas = await writing.boundingBox();
      if (!button || !target || !canvas) return false;
      const gap = target.x - (button.x + button.width);
      return button.x >= canvas.x - 1 && gap >= -2 && gap <= 24;
    }).toBe(true);
    await action.click();
    await expect(page.getByRole("menuitem", { name: new RegExp(`Write after ${label.split(" ")[0].toLowerCase()}`) })).toBeVisible();
    await page.keyboard.press("Escape");
  }
  await blocks[0].block.hover();
  await page.screenshot({ path: info.outputPath("block-gutter.png") });
});

test("slash Table inserts at the selected line and unmatched searches can return to writing", async ({
  page,
}, info) => {
  await setup(page, info.project.name.startsWith("production"), "course", true, false, "Before\n\nAfter");
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
  await expect(
    writing
      .locator("table tbody tr")
      .first()
      .locator(":is(td, th):not([data-tool-cell])"),
  ).toHaveCount(3);
  const beforeTable = await writing
    .locator("table")
    .evaluate(
      (node) =>
        node.closest('[data-lexical-decorator="true"]')?.previousElementSibling
          ?.textContent,
    );
  expect(beforeTable).toBe("Before");
  await expectMarkdown(page, /Before[\s\S]*\|[\s\S]*After/);
  await writing.locator("p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("/");
  await page.keyboard.type("unlikely-block-name");
  await expect(page.getByRole("menu", { name: /^Insert content/ })).toHaveCount(
    0,
  );
  await expect(writing.locator(".writing-command-line")).toHaveCount(0);
  await expect(writing).toBeFocused();
  await page.keyboard.type(" continues");
  await writing.locator("p", { hasText: "After" }).click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("/");
  await page.keyboard.type("another-unknown-block");
  await writing.locator("p", { hasText: "Before" }).click();
  await expect(page.getByRole("menu", { name: /^Insert content/ })).toHaveCount(
    0,
  );
  await expectMarkdown(page, /\/unlikely-block-name continues/);
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
  await expect(page.getByRole("menu", { name: /^Insert content/ })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Column 1 actions and drag handle" }).first().click();
  await page.getByRole("menuitem", { name: "Insert column after" }).click();
  await expect(
    table
      .locator("tbody tr")
      .first()
      .locator(":is(td, th):not([data-tool-cell])"),
  ).toHaveCount(4);
  await page.getByRole("button", { name: "Row 1 actions and drag handle" }).first().click();
  await page.getByRole("menuitem", { name: "Insert row after" }).click();
  await expect(table.locator("tbody tr")).toHaveCount(4);
  await page.getByRole("button", { name: "Table actions" }).click();
  await page.getByRole("menuitem", { name: "Remove table" }).click();
  await expect(table).toHaveCount(0);
});

test("slash list begins on the chosen line without an extra blank block", async ({
  page,
}, info) => {
  await setup(page, info.project.name.startsWith("production"), "course", true, false, "Before\n\nAfter");
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
      gap:
        list.getBoundingClientRect().top -
        (before?.getBoundingClientRect().bottom || 0),
    };
  });
  expect(structure.previousTag).toBe("P");
  expect(structure.previousText).toBe("Before");
  expect(structure.nextText).toBe("After");
  expect(structure.gap).toBeLessThan(64);
  await writing.screenshot({
    path: info.outputPath("slash-list-between-paragraphs.png"),
  });
});

for (const kind of ["doc", "brief", "course"] as const) {
  test(`${kind}: a pasted final image stays writable after reopening`, async ({ page }, info) => {
    test.skip(!info.project.name.startsWith("production"), "Uploads are installation-only");
    const { state, control } = await setup(page, true, kind, true, false, "Before the image.");
    const writing = page.locator('.writing-content[contenteditable="true"]');
    await writing.locator("p").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("Enter");
    await writing.evaluate(node => {
      const data = new DataTransfer();
      data.items.add(new File(["synthetic"], "final.png", { type: "image/png" }));
      node.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect.poll(() => control.uploaded).toBe(true);
    control.releaseUpload();
    await expect(writing.locator("img")).toBeVisible();
    const line = writing.locator(":scope > p").last();
    await expect(line).toBeEmpty();
    await line.click();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(writing.locator("img")).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect(writing.locator("img")).toBeVisible();
    await expect(line).toBeEmpty();
    await waitForDraftSaved(page);
    await syncAuthoringProvider(page, state);
    await page.reload();
    await expect(writing.locator("img")).toBeVisible();
    await expect(line).toBeEmpty();
    await line.click();
    await page.keyboard.type("After the image.");
    await expect(line).toHaveText("After the image.");
    await waitForDraftSaved(page);
    await expectMarkdown(page, /Before the image\.[\s\S]*!\[final\][\s\S]*After the image\./);
  });
}

for (const failure of [false, true]) test(`multiple pasted images preserve order and undo as one edit; failure=${failure}`, async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("production"), "Uploads are installation-only");
  await setup(page, true, "doc", false, false, "Before both images.");
  let prepared = 0;
  await page.route("**/api/upload", route => {
    const request = route.request().postDataJSON();
    if (request.complete) return route.fulfill({ json: { url: `/api/media/${request.complete}.png` } });
    prepared++;
    if (failure && prepared === 2) return route.fulfill({ status: 503, json: { error: "Second image unavailable" } });
    const id = `00000000-0000-4000-8000-${String(prepared).padStart(12, "0")}`;
    return route.fulfill({ json: { id, upload: { url: `https://test.supabase.co/storage/${id}.png`, method: "PUT", headers: { "Content-Type": "image/png", "x-upsert": "false" } } } });
  });
  const writer = page.locator('.writing-content[contenteditable="true"]');
  await writer.locator("p").click();
  await writer.locator("p").selectText();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => writer.evaluate(() => window.getSelection()?.isCollapsed)).toBe(true);
  await page.keyboard.press("Enter");
  await writer.evaluate(element => {
    const data = new DataTransfer();
    for (const name of ["first.png", "second.png"]) data.items.add(new File(["synthetic"], name, { type: "image/png" }));
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect.poll(() => prepared).toBe(2);
  if (failure) {
    await expect(page.locator(".writing-editor").getByRole("alert")).toContainText("Second image unavailable");
    await expect(writer.locator("img")).toHaveCount(0);
    await expect(writer).toHaveText("Before both images.");
    await expectMarkdown(page, "Before both images.");
  } else {
    await expect(writer.locator("img")).toHaveCount(2);
    expect(await writer.locator("img").evaluateAll(images => images.map(image => image.getAttribute("alt")))).toEqual(["first", "second"]);
    await writer.locator(":scope > p").last().click();
    await page.keyboard.press("ControlOrMeta+z");
    await expect(writer.locator("img")).toHaveCount(0);
    await page.keyboard.press("ControlOrMeta+Shift+z");
    await expect(writer.locator("img")).toHaveCount(2);
    await writer.locator(":scope > p").last().click();
    await page.keyboard.type("After both images.");
    await expect(writer.locator(":scope > p").last()).toHaveText("After both images.");
    await waitForDraftSaved(page);
    await expectMarkdown(page, /Before both images\.[\s\S]*!\[first\][\s\S]*!\[second\][\s\S]*After both images\./);
  }
});

test("pasted image uploads at the editor caret", async ({ page }, info) => {
  test.skip(
    !info.project.name.startsWith("production"),
    "The browser-local demo has no media storage.",
  );
  const { control } = await setup(page, true, "course", true);
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  await writing.click();
  await page.keyboard.type("Before the image");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("After the image");
  await writing.locator("p").nth(1).click();
  await waitForDraftSaved(page);
  const beforeTitle = await page.getByRole("textbox", { name: "Lesson title", exact: true }).boundingBox();
  let releaseImage!: () => void;
  let imageRequested = false;
  await page.route("**/api/media/**", async (route) => {
    imageRequested = true;
    await new Promise<void>((resolve) => { releaseImage = resolve; });
    await route.fulfill({ contentType: "image/png", body: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64",
    ) });
  });
  await writing.evaluate((node) => {
    const data = new DataTransfer();
    data.items.add(
      new File(["synthetic"], "pasted.png", { type: "image/png" }),
    );
    node.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect.poll(() => control.uploaded).toBe(true);
  await expect(writing.getByRole("status")).toHaveText("Loading…");
  await expect(page.getByText("Uploading media. Keep this page open until the draft is saved.", { exact: true })).toHaveCount(0);
  const uploadingTitle = await page.getByRole("textbox", { name: "Lesson title", exact: true }).boundingBox();
  expect(uploadingTitle?.y).toBe(beforeTitle?.y);
  await expect(writing.locator("p").first()).toHaveText("Before the image");
  await expect(writing.locator("p").last()).toHaveText("After the image");
  await page.screenshot({ path: info.outputPath("quiet-image-upload.png") });
  control.releaseUpload();
  await expect.poll(() => imageRequested).toBe(true);
  await expect(writing.getByRole("status")).toHaveText("Loading…");
  await expect(writing.locator("img")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("quiet-image-fetch.png") });
  releaseImage();
  await expect(writing.locator("img")).toHaveAttribute("src", /\/api\/media\//);
  await expect(writing.getByRole("status")).toHaveCount(0);
  await expectMarkdown(page,
    /Before the image[\s\S]*!\[pasted\]\(\/api\/media\/[\s\S]*After the image/,
  );
  await writing.click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(writing.locator("img")).toHaveCount(0);
  await expect(writing).toHaveText(/Before the image[\s\S]*After the image/);
  await expect(writing.getByRole("status")).toHaveCount(0);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(writing.locator("img")).toHaveCount(1);
  await expect(writing.getByRole("status")).toHaveCount(0);
});

test("image paste splits a paragraph at the caret without dropping text", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("production"), "Uploads are installation-only");
  const { control } = await setup(page, true, "course", true);
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  await writing.fill("BeforeAfter");
  await waitForDraftSaved(page);
  for (let index = 0; index < 5; index++) await writing.press("ArrowLeft");
  expect(await writing.evaluate(() => window.getSelection()?.anchorOffset)).toBe(6);
  await writing.evaluate((node) => {
    const data = new DataTransfer();
    data.items.add(new File(["synthetic"], "middle.png", { type: "image/png" }));
    node.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect.poll(() => control.uploaded).toBe(true);
  await expect(writing).toHaveText("BeforeLoading…After");
  control.releaseUpload();
  await expect(writing.locator("img")).toHaveAttribute("src", /\/api\/media\//);
  await expectMarkdown(page, /Before[\s\S]*!\[middle\]\(\/api\/media\/[\s\S]*After/);
});

test("failed image paste restores selected text without saving a loading block", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("production"), "Uploads are installation-only");
  const { state, control } = await setup(page, true, "course", true);
  control.uploadFailure = true;
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  await writing.fill("Keep the selected text");
  await waitForDraftSaved(page);
  const before = state.content[0].lessons[0].body;
  await writing.press("ControlOrMeta+a");
  await writing.evaluate((node) => {
    const data = new DataTransfer();
    data.items.add(new File(["synthetic"], "failed.png", { type: "image/png" }));
    node.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect.poll(() => control.uploaded).toBe(true);
  await expect(writing.getByRole("status")).toHaveText("Loading…");
  expect(state.content[0].lessons[0].body).toBe(before);
  control.releaseUpload();
  await expect(page.locator(".writing-editor").getByRole("alert")).toBeVisible();
  await expect(writing).toHaveText("Keep the selected text");
  await expect(writing.getByRole("status")).toHaveCount(0);
  await expectMarkdown(page, before);
  expect(state.content[0].lessons[0].body).toBe(before);
});

test("image chooser uploads into the selected lesson line", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("production"),
    "The browser-local demo has no media storage.",
  );
  const { control } = await setup(page, true, "course", true);
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  await writing.locator("p").first().click();
  await page.keyboard.press("/");
  await page.getByRole("menuitem", { name: "Image", exact: true }).click();
  const chooser = page.getByRole("dialog", { name: "Insert image" });
  await expect(writing.locator(".writing-media-line")).toBeVisible();
  await chooser
    .getByRole("textbox", { name: "Alt text (optional)" })
    .fill("Course diagram");
  const fileChooser = page.waitForEvent("filechooser");
  await chooser.getByRole("button", { name: "Choose image" }).click();
  await (
    await fileChooser
  ).setFiles({
    name: "diagram.png",
    mimeType: "image/png",
    buffer: Buffer.from("synthetic"),
  });
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
    await setup(
      page,
      info.project.name.startsWith("production"),
      "course",
      true,
    );
    const writing = page.getByRole("textbox", { name: "Lesson content" });
    await writing.click();
    await page.keyboard.press("/");
    await page.keyboard.type(query);
    await page.keyboard.press("Enter");
    const item = writing.locator(command === "Bulleted list" ? "ul > li" : "ol > li").last();
    await expect(item).toBeVisible();
    await expect(item).toHaveText("");
    await page.keyboard.type("A list item");
    await expect
      .poll(() =>
        page.evaluate(() => {
          const anchor = window.getSelection()?.anchorNode;
          return (
            anchor instanceof Element ? anchor : anchor?.parentElement
          )?.closest("li")?.tagName;
        }),
      )
      .toBe("LI");
    await expectMarkdown(page, marker);
  });
}

test("Insert menus use full rows and can be dismissed", async ({
  page,
}, info) => {
  await setup(page, info.project.name.startsWith("production"), "course", true);
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  await writing.locator("p").first().click();
  await page.keyboard.press("/");
  const menu = page.getByRole("menu", { name: /^Insert content/ });
  await expect(
    menu.getByRole("menuitem", { name: "Close menu esc" }),
  ).toBeVisible();
  const options = menu.locator(".writing-slash-options");
  const overflows = await options.evaluate(
    (node) => node.scrollHeight - node.clientHeight > 2,
  );
  await expect(options).toHaveAttribute(
    "data-scroll-fade-after",
    String(overflows),
  );
  if (overflows) {
    await options.evaluate((node) => {
      node.scrollTop = node.scrollHeight;
      node.dispatchEvent(new Event("scroll"));
    });
    await expect(options).toHaveAttribute("data-scroll-fade-before", "true");
    await expect(options).toHaveAttribute("data-scroll-fade-after", "false");
  }
  const menuWidth = (await menu.boundingBox())!.width;
  const rowWidth = (await menu
    .getByRole("menuitem", { name: "Heading 2", exact: true })
    .boundingBox())!.width;
  expect(rowWidth).toBeGreaterThan(menuWidth - 24);
  await page.keyboard.type("hea");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(writing.locator(".writing-command-line")).toHaveCount(0);
  await page.keyboard.type("ding");
  await expectMarkdown(page, /\/heading/);
  await page.getByRole("button", { name: /^Commands:/ }).click();
  await expect(menu).toBeVisible();
  await expect(
    menu.getByRole("menuitem", { name: "Heading 2", exact: true }),
  ).not.toBeFocused();
  await menu.getByRole("menuitem", { name: "Close menu esc" }).click();
  await expect(menu).toHaveCount(0);
  await page.getByRole("button", { name: /^Commands:/ }).focus();
  await page.keyboard.press("Enter");
  await expect(menu.getByRole("menuitem", { name: "Normal Text", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});

test("slash insertion stays beside a blank line after lesson prose", async ({
  page,
}, info) => {
  await setup(page, info.project.name.startsWith("production"), "course", true);
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  await writing.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("First line");
  await page.keyboard.press("Enter");
  await page.screenshot({ path: info.outputPath("blank-lesson-line.png") });
  const oldScroll = await page
    .locator(".main-content")
    .evaluate((node) => node.scrollTop);
  const line = (await writing.locator("p").last().boundingBox())!;
  await page.keyboard.press("/");
  const menu = page.getByRole("menu", { name: /^Insert content/ });
  await expect(menu).toBeVisible();
  await expect(writing).toBeFocused();
  const box = (await menu.boundingBox())!;
  const newScroll = await page
    .locator(".main-content")
    .evaluate((node) => node.scrollTop);
  expect(Math.abs(newScroll - oldScroll)).toBeLessThan(8);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(Math.abs(box.x - line.x)).toBeLessThan(24);
  expect(
    box.y >= line.y + line.height - 12 || box.y + box.height <= line.y + 12,
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("blank-line-commands.png") });
  await page.keyboard.type("call");
  await page.keyboard.press("Enter");
  await expect(writing).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const anchor = window.getSelection()?.anchorNode;
        return (
          anchor instanceof Element ? anchor : anchor?.parentElement
        )?.closest("blockquote")?.tagName;
      }),
    )
    .toBe("BLOCKQUOTE");
  await page.keyboard.type("A callout here");
  await expectMarkdown(page, /First line[\s\S]*> A callout here/);
});

test("an assigned course retains learning state and legacy media when its inline lesson is edited", async ({
  page,
}, info) => {
  const production = info.project.name.startsWith("production");
  const { state } = await setup(page, production, "course", false, true);
  const before = structuredClone(state);
  await expect(
    page.getByLabel("Opening video URL", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Upload opening video", { exact: true }),
  ).toHaveCount(0);
  const writing = page.getByRole("textbox", { name: "Lesson content", exact: true });
  await writing.press("ControlOrMeta+End");
  await writing.press("Enter");
  await page.keyboard.insertText("A small wording correction.");
  await expect.poll(async () => production
    ? state.content[0].lessons[0].body
    : page.evaluate(() => JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!).content[0].lessons[0].body))
    .toContain("A small wording correction.");
  await expect(page.locator("form.editor")).toBeVisible();
  const after = production
    ? state
    : await page.evaluate(() =>
        JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
      );
  expect(after.content[0].assignments).toEqual(before.content[0].assignments);
  expect(after.content[0].groups).toEqual(before.content[0].groups);
  expect(after.content[0].version).toBe(before.content[0].version);
  expect(after.content[0].publishedRevision).toBe(
    before.content[0].publishedRevision,
  );
  expect(after.content[0].lessons[0].videoUrl).toBeUndefined();
  expect(after.content[0].lessons[0].body).toContain(`[Video](${before.content[0].lessons[0].videoUrl})`);
  expect(after.content[0].lessons[0].body).toContain(
    "A small wording correction.",
  );
  expect(after.progress).toEqual(before.progress);
});

// Protocol behavior and document safety, including a lost acknowledgement after a chunk persisted.
test("large media resumes a lost chunk acknowledgement and inserts only verified media", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("production"), "Uploads are installation-only");
  const { state } = await setup(page, true);
  const editor = page.getByRole("textbox", { name: "Doc content", exact: true });
  await editor.fill("Keep my original draft");
  await waitForDraftSaved(page);
  await page.unroute("**/api/upload");
  const endpoint = "https://test.storage.supabase.co/storage/v1/upload/resumable/sign";
  const uploadUrl = `${endpoint}/synthetic-upload`;
  let signedSize = 0, offset = 0, heads = 0, completes = 0, interrupted = false;
  let release!: () => void;
  const chunks: Buffer[] = [];
  await page.route("**/api/upload", async (route) => {
    const body = route.request().postDataJSON();
    if (body.complete) {
      expect(offset).toBe(signedSize); completes++;
      return route.fulfill({ json: { url: "/api/media/verified-large.png" } });
    }
    signedSize = body.size;
    expect(signedSize).toBeGreaterThan(50 * 1024 * 1024);
    return route.fulfill({ json: { id: "reserved-large", upload: {
      protocol: "tus", url: endpoint, chunkSize: 6 * 1024 * 1024,
      headers: { "x-signature": "path-scoped-test", "x-upsert": "false" },
      metadata: { bucketName: "fieldbook-media", objectName: "synthetic/large.png", contentType: "image/png" },
    } } });
  });
  await page.route("https://test.storage.supabase.co/**", async (route) => {
    const req = route.request();
    const headers = { "Tus-Resumable": "1.0.0", "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Location,Upload-Offset,Upload-Length,Tus-Resumable" };
    expect(req.headers()["x-signature"]).toBe("path-scoped-test");
    expect(req.headers()["x-upsert"]).toBe("false");
    if (req.method() === "HEAD") {
      heads++;
      return route.fulfill({ status: 200, headers: { ...headers, "Upload-Offset": String(offset), "Upload-Length": String(signedSize) } });
    }
    expect(["POST", "PATCH"]).toContain(req.method());
    if (req.method() === "PATCH") expect(Number(req.headers()["upload-offset"])).toBe(offset);
    const bytes = req.postDataBuffer()!;
    expect(bytes.length).toBeLessThanOrEqual(6 * 1024 * 1024);
    chunks.push(bytes); offset += bytes.length;
    if (req.method() === "PATCH" && !interrupted) {
      interrupted = true;
      await new Promise<void>((resolve) => { release = resolve; });
      return route.abort("failed");
    }
    return route.fulfill({ status: req.method() === "POST" ? 201 : 204, headers: { ...headers, Location: uploadUrl, "Upload-Offset": String(offset) } });
  });
  const file = Buffer.alloc(54 * 1024 * 1024);
  const filePath = info.outputPath("large.png");
  await writeFile(filePath, file);
  await page.locator('.writing-editor input[type="file"]').setInputFiles(filePath);
  await expect.poll(() => !!release).toBe(true);
  await expect(editor.getByRole("status")).toHaveText("Loading…");
  await expect(page.getByRole("button", { name: "Details", exact: true })).toBeDisabled();
  expect(completes).toBe(0);
  expect(state.content[0].body).toBe("Keep my original draft");
  await page.screenshot({ path: info.outputPath("large-upload-progress.png"), fullPage: true });
  release();
  await expect.poll(() => completes).toBe(1);
  await waitForDraftSaved(page);
  expect(heads).toBeGreaterThan(0);
  expect(createHash("sha256").update(Buffer.concat(chunks)).digest("hex")).toBe(createHash("sha256").update(file).digest("hex"));
  expect(state.content[0].body).toContain("Keep my original draft");
  expect(state.content[0].body).toContain("/api/media/verified-large.png");
  await expect(page.getByRole("progressbar", { name: "File upload progress" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Details", exact: true })).toBeEnabled();
});

for (const failure of ["storage limit", "expired permission", "verification"] as const) {
  test(`${failure} upload failure preserves the draft and can retry without a failed reference`, async ({ page }, info) => {
    test.skip(!info.project.name.startsWith("production"), "Uploads are installation-only");
    const { state } = await setup(page, true);
    const editor = page.getByRole("textbox", { name: "Doc content", exact: true });
    await editor.fill("Keep this draft intact");
    await waitForDraftSaved(page);
    await page.unroute("**/api/upload");
    let failed = true, completed = 0;
    await page.route("**/api/upload", async (route) => {
      if (route.request().postDataJSON().complete) {
        completed++;
        if (failed && failure === "verification") return route.fulfill({ status: 400, json: { error: "Upload verification failed. Retry with a supported file." } });
        return route.fulfill({ json: { url: "/api/media/retry-ready.png" } });
      }
      return route.fulfill({ json: { id: "retry", upload: { url: "https://test.supabase.co/ui4-upload", method: "PUT", headers: { "Content-Type": "image/png" } } } });
    });
    await page.route("https://test.supabase.co/ui4-upload", (route) => route.fulfill({ status: failed && failure !== "verification" ? (failure === "storage limit" ? 413 : 403) : 200, json: { message: "private token details must never reach the UI" } }));
    const file = { name: "retry.png", mimeType: "image/png", buffer: Buffer.from("synthetic") };
    await page.locator('.writing-editor input[type="file"]').setInputFiles(file);
    const alert = page.locator(".writing-editor").getByRole("alert");
    await expect(alert).toContainText(failure === "storage limit" ? "exceeds the upload size limit" : failure === "expired permission" ? "permission expired or was denied" : "upload couldn’t be verified");
    await expect(alert).not.toContainText("private token");
    await expect(editor).toHaveText("Keep this draft intact");
    expect(state.content[0].body).toBe("Keep this draft intact");
    expect(completed).toBe(failure === "verification" ? 1 : 0);
    await page.screenshot({ path: info.outputPath("upload-recovery.png"), fullPage: true });
    failed = false;
    await page.locator('.writing-editor input[type="file"]').setInputFiles(file);
    await expect(editor.locator("img")).toHaveAttribute("src", "/api/media/retry-ready.png");
    await waitForDraftSaved(page);
    expect(state.content[0].body).toContain("Keep this draft intact");
    expect(state.content[0].body).toContain("/api/media/retry-ready.png");
  });
}

test("card artwork above 50 MB reaches storage and a rejection preserves existing artwork", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("production"), "Uploads are installation-only");
  const { state } = await setup(page, true, "course");
  const original = JSON.stringify(state.content[0].cardArt);
  await openContentSettings(page);
  await page.unroute("**/api/upload");
  let signed = 0, completed = 0;
  await page.route("**/api/upload", (route) => {
    const body = route.request().postDataJSON();
    if (body.complete) { completed++; return route.fulfill({ json: { url: "/api/media/should-not-be-ready.png" } }); }
    expect(body.size).toBeGreaterThan(50 * 1024 * 1024); signed++;
    return route.fulfill({ json: { id: "artwork", upload: {
      protocol: "tus", url: "https://test.storage.supabase.co/ui4-artwork", chunkSize: 6 * 1024 * 1024,
      headers: { "x-signature": "synthetic" }, metadata: { bucketName: "fieldbook-media", objectName: "synthetic/artwork.png", contentType: "image/png" },
    } } });
  });
  await page.route("https://test.storage.supabase.co/ui4-artwork", (route) => route.fulfill({ status: 413, json: { error: "EntityTooLarge" } }));
  const filePath = info.outputPath("large-artwork.png");
  await writeFile(filePath, Buffer.alloc(54 * 1024 * 1024));
  await page.getByLabel("Upload card artwork", { exact: true }).setInputFiles(filePath);
  const artwork = page.getByRole("region", { name: "Card artwork editor", exact: true });
  await expect(artwork.getByRole("alert")).toContainText("exceeds the upload size limit");
  expect(signed).toBe(1); expect(completed).toBe(0);
  expect(JSON.stringify(state.content[0].cardArt)).toBe(original);
  await expect(artwork.getByRole("button", { name: "Upload image", exact: true })).toBeEnabled();
  await artwork.getByRole("alert").scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("large-artwork-recovery.png"), fullPage: true });
});

async function paragraphBoundary(page: Page, writing: Locator, backward = false, rootBoundary = false) {
  await writing.click();
  await writing.evaluate((surface, { backward, rootBoundary }) => {
    const text = surface.querySelector("p span")!.firstChild!;
    const end = rootBoundary ? surface : surface.querySelector("h2 span")!.firstChild!;
    const offset = rootBoundary ? 1 : 0;
    const selection = window.getSelection()!;
    selection.setBaseAndExtent(backward ? end : text, backward ? offset : 0,
      backward ? text : end, backward ? 0 : offset);
  }, { backward, rootBoundary });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

async function pasteText(writing: Locator, html = "", clipboard?: Record<string, string>) {
  await writing.evaluate((surface, { html, clipboard }) => {
    const data = new DataTransfer();
    for (const [type, value] of Object.entries(clipboard || {
      "text/plain": "Paste sentence", ...(html ? { "text/html": html } : {}),
    })) data.setData(type, value);
    surface.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, { html, clipboard });
}

for (const backward of [false, true]) for (const action of ["Backspace", "Delete", "cut", "typing", "paste"] as const) {
  test(`paragraph boundary ${action} preserves the following heading; backward=${backward}`, async ({ page }, info) => {
    await setup(page, info.project.name.startsWith("production"), "course", true, false,
      "Paragraph one.\n\n## Heading below\n\nBody after.");
    const writing = page.getByRole("textbox", { name: "Lesson content" });
    await paragraphBoundary(page, writing, backward, !backward);
    if (action === "cut") await writing.evaluate((surface) => {
      surface.dispatchEvent(new ClipboardEvent("cut", { clipboardData: new DataTransfer(), bubbles: true, cancelable: true }));
    });
    else if (action === "typing") await page.keyboard.type("Replacement");
    else if (action === "paste") await pasteText(writing);
    else await page.keyboard.press(action);
    await expect(writing.locator("h2")).toHaveText("Heading below");
    await expect(writing).not.toContainText("Paragraph one.");
    if (action === "typing") await expect(writing.locator("p").first()).toHaveText("Replacement");
    if (action === "paste") await expect(writing.locator("p").first()).toHaveText("Paste sentence");
    await expect(writing.locator("p").last()).toHaveText("Body after.");
    await expectMarkdown(page, /## Heading below\n\nBody after\./);
  });
}

for (const placement of ["middle", "blank"] as const) for (const payload of ["plain", "HTML", "ghost heading", "leading ghost", "Lexical ghost", "Lexical leading ghost"] as const) {
  test(`text paste ${payload} at ${placement} keeps paragraph style and adds no heading`, async ({ page }, info) => {
    await setup(page, info.project.name.startsWith("production"), "course", true, false,
      "BeforeAfter\n\n## Heading below");
    const writing = page.getByRole("textbox", { name: "Lesson content" });
    await writing.click();
    await writing.evaluate((surface, placement) => {
      const text = surface.querySelector("p span")!.firstChild!;
      window.getSelection()!.setBaseAndExtent(text, placement === "middle" ? 6 : 11, text, placement === "middle" ? 6 : 11);
    }, placement);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    if (placement === "blank") await page.keyboard.press("Enter");
    if (payload.startsWith("Lexical")) await pasteText(writing, "", {
      "text/plain": "Paste sentence\n",
      "application/x-lexical-editor": JSON.stringify({ namespace: "MDXEditor", nodes: (payload === "Lexical leading ghost" ? [
        { type: "heading", version: 1, tag: "h2", children: [], direction: null, format: "", indent: 0 },
        { type: "paragraph", version: 1, children: [{ type: "text", version: 1, text: "Paste sentence", format: 0, detail: 0, mode: "normal", style: "" }], direction: null, format: "", indent: 0 },
      ] : [
        { type: "paragraph", version: 1, children: [{ type: "text", version: 1, text: "Paste sentence", format: 0, detail: 0, mode: "normal", style: "" }], direction: null, format: "", indent: 0 },
        { type: "heading", version: 1, tag: "h2", children: [], direction: null, format: "", indent: 0 },
      ]) }),
    });
    else await pasteText(writing, payload === "plain" ? "" : `${payload === "leading ghost" ? "<h2></h2>" : ""}<p>Paste sentence</p>${payload === "ghost heading" ? "<h2><span></span></h2>" : ""}`);
    await expect(writing.locator("h2")).toHaveText("Heading below");
    if (placement === "middle") await expect(writing.locator("p").first()).toHaveText("BeforePaste sentenceAfter");
    else {
      await expect(writing.locator("p").nth(0)).toHaveText("BeforeAfter");
      await expect(writing.locator("p").nth(1)).toHaveText("Paste sentence");
      await expect(writing.locator("p")).toHaveCount(3); // Includes the editor's existing trailing writing line.
    }
    await expectMarkdown(page, placement === "middle"
      ? "BeforePaste sentenceAfter\n\n## Heading below"
      : "BeforeAfter\n\nPaste sentence\n\n## Heading below");
  });
}

for (const operation of ["copy", "format"] as const) for (const backward of [false, true]) test(`paragraph boundary ${operation} excludes the next heading; backward=${backward}`, async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"), "course", true, false,
    "Paragraph one.\n\n## Heading below\n\nBody after.");
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  await paragraphBoundary(page, writing, backward);
  if (operation === "copy") {
    const clipboard = await writing.evaluate((surface) => {
      const data = new DataTransfer();
      surface.dispatchEvent(new ClipboardEvent("copy", { clipboardData: data, bubbles: true, cancelable: true }));
      return Object.fromEntries(Array.from(data.types).map((type) => [type, data.getData(type)]));
    });
    expect(clipboard["text/html"]).not.toMatch(/<h[1-6]/);
    expect(JSON.parse(clipboard["application/x-lexical-editor"]).nodes).toHaveLength(1);
    expect(clipboard["text/plain"]).toBe("Paragraph one.");
    await expect.poll(() => writing.evaluate(() => {
      const selection = window.getSelection()!;
      return selection.anchorNode === selection.focusNode && selection.anchorOffset > selection.focusOffset;
    })).toBe(backward);
  } else {
    const tools = page.getByRole("dialog", { name: "Format selected text", exact: true });
    // This project has a mouse, including at phone width; selection opens its
    // contextual tools automatically. Touch devices retain their native menu.
    await tools.getByRole("button", { name: "Normal Text", exact: true }).click();
    await page.getByRole("menuitem", { name: "Heading 3", exact: true }).click();
    await expect(writing.locator("h3")).toHaveText("Paragraph one.");
  }
  await expect(writing.locator("h2")).toHaveText("Heading below");
});

test("rich paste preserves real headings and the untouched paragraph suffix", async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"), "course", true, false,
    "BeforeAfter\n\n## Heading below");
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  await writing.click();
  await writing.evaluate((surface) => {
    const text = surface.querySelector("p span")!.firstChild!;
    window.getSelection()!.setBaseAndExtent(text, 6, text, 6);
  });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await pasteText(writing, "<p>Paste sentence</p><h2>Real pasted heading</h2>");
  await expect(writing.locator("p").first()).toHaveText("BeforePaste sentence");
  await expect(writing.locator("h2").first()).toHaveText("Real pasted heading");
  await expect(writing.locator("p").nth(1)).toHaveText("After");
  await expect(writing.locator("h2").last()).toHaveText("Heading below");
  await expectMarkdown(page, "BeforePaste sentence\n\n## Real pasted heading\n\nAfter\n\n## Heading below");
  await writing.click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(writing.locator("p").first()).toHaveText("BeforeAfter");
  await expect(writing.locator("h2")).toHaveText("Heading below");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(writing.locator("h2").first()).toHaveText("Real pasted heading");
});

for (const next of ["# Heading below", "### Heading below", "#### Heading below", "##### Heading below", "###### Heading below", "> Callout below", "- List below", "1. List below"] as const) {
  test(`paragraph boundary preserves the next ${next.split(" ")[0]} block`, async ({ page }, info) => {
    await setup(page, info.project.name.startsWith("production"), "course", true, false, `Paragraph one.\n\n${next}\n\nBody after.`);
    const writing = page.getByRole("textbox", { name: "Lesson content" });
    await writing.click();
    await writing.evaluate((surface) => {
      const start = surface.querySelector("p span")!.firstChild!;
      const nextBlock = surface.children[1];
      const end = document.createTreeWalker(nextBlock, NodeFilter.SHOW_TEXT).nextNode()!;
      window.getSelection()!.setBaseAndExtent(start, 0, end, 0);
    });
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    await page.keyboard.press("Backspace");
    await expectMarkdown(page, `${next.replace(/^- /, "* ")}\n\nBody after.`);
  });
}

test("explicit paragraph joining and selecting real heading text retain normal editing behavior", async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"), "course", true, false, "Paragraph one.\n\n## Heading below");
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  await writing.click();
  await writing.evaluate((surface) => {
    const text = surface.querySelector("p span")!.firstChild!;
    const heading = surface.querySelector("h2 span")!.firstChild!;
    window.getSelection()!.setBaseAndExtent(text, text.textContent!.length, heading, 0);
  });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await page.keyboard.press("Backspace");
  await expect(writing.locator("p").first()).toHaveText("Paragraph one.Heading below");
  await writing.click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(writing.locator("h2")).toHaveText("Heading below");
  await writing.evaluate((surface) => {
    const text = surface.querySelector("p span")!.firstChild!;
    const heading = surface.querySelector("h2 span")!.firstChild!;
    window.getSelection()!.setBaseAndExtent(text, 0, heading, 1);
  });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await page.keyboard.press("Backspace");
  await expect(writing).not.toContainText("Paragraph one.");
  await expect(writing.locator("p").first()).toHaveText("eading below");
});

for (const block of ["code", "table", "divider", "image", "video"] as const) test(`paragraph boundary preserves the following ${block} element`, async ({ page }, info) => {
  const content = {
    code: "```\nKeep this code\n```",
    table: "| Column |\n| --- |\n| Keep this cell |",
    divider: "***",
    image: "![Diagram](https://example.com/diagram.png)",
    video: "[Video](https://example.com/clip.mp4)",
  }[block];
  await page.route("https://example.com/diagram.png", (route) => route.fulfill({ contentType: "image/png", body: Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64",
  ) }));
  await page.route("https://example.com/clip.mp4", (route) => route.fulfill({ contentType: "video/mp4", body: "synthetic" }));
  await setup(page, info.project.name.startsWith("production"), "course", true, false, `Paragraph one.\n\n${content}\n\n## Heading below`);
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  await paragraphBoundary(page, writing, false, true);
  await page.keyboard.press("Backspace");
  await expect(writing.locator("h2")).toHaveText("Heading below");
  await expectMarkdown(page, block === "table" ? /Keep this cell[\s\S]*## Heading below/ : `${content}\n\n## Heading below`);
  if (block === "table") await expect(writing.locator("table")).toHaveCount(1);
  if (block === "code") await expect(writing.locator(".writing-code-block .cm-content")).toHaveText("Keep this code");
  if (block === "divider") await expect(writing.locator("hr")).toHaveCount(1);
  if (block === "image") await expect(writing.locator("img")).toHaveAttribute("src", "https://example.com/diagram.png");
  if (block === "video") await expect(writing.locator("video")).toHaveAttribute("src", "https://example.com/clip.mp4");
});

for (const block of ["callout", "bullet", "numbered"] as const) test(`rich paste of a ${block} keeps the untouched paragraph suffix plain`, async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"), "course", true, false, "BeforeAfter\n\n## Heading below");
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  await writing.click();
  await writing.evaluate((surface) => {
    const text = surface.querySelector("p span")!.firstChild!;
    window.getSelection()!.setBaseAndExtent(text, 6, text, 6);
  });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const element = { callout: "<blockquote>Real pasted callout</blockquote>", bullet: "<ul><li>Real pasted list</li></ul>", numbered: "<ol><li>Real pasted list</li></ol>" }[block];
  await pasteText(writing, `<p>Paste sentence</p>${element}`);
  await expect(writing.locator("p").first()).toHaveText("BeforePaste sentence");
  await expect(writing.locator("p").nth(1)).toHaveText("After");
  await expect(writing.locator("h2")).toHaveText("Heading below");
  if (block === "callout") await expect(writing.locator("blockquote")).toHaveText("Real pasted callout");
  else await expect(writing.locator("li")).toHaveText("Real pasted list");
});

for (const failure of [false, true]) test(`image paste at a paragraph boundary preserves the following heading; failure=${failure}`, async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("production"), "Uploads are installation-only");
  const { control } = await setup(page, true, "course", true, false, "Paragraph one.\n\n## Heading below");
  control.uploadFailure = failure;
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  await paragraphBoundary(page, writing);
  await writing.evaluate((surface) => {
    const data = new DataTransfer();
    data.items.add(new File(["synthetic"], "boundary.png", { type: "image/png" }));
    surface.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect.poll(() => control.uploaded).toBe(true);
  await expect(writing.locator("h2")).toHaveText("Heading below");
  control.releaseUpload();
  if (failure) {
    await expect(page.locator(".writing-editor").getByRole("alert")).toBeVisible();
    await expect(writing.locator("p").first()).toHaveText("Paragraph one.");
  } else await expect(writing.locator("img")).toHaveAttribute("src", /\/api\/media\//);
  await expect(writing.locator("h2")).toHaveText("Heading below");
});

for (const backward of [false, true]) for (const action of ["copy", "typing", "paste", "Backspace", "format"] as const) {
  test(`both paragraph boundaries ${action} exclude surrounding headings; backward=${backward}`, async ({ page }, info) => {
    await setup(page, info.project.name.startsWith("production"), "course", true, false,
      "## Heading above\n\nParagraph one.\n\n## Heading below");
    const writing = page.getByRole("textbox", { name: "Lesson content" });
    await writing.click();
    await writing.evaluate((surface, backward) => {
      const before = surface.querySelectorAll("h2 span")[0].firstChild!;
      const after = surface.querySelectorAll("h2 span")[1].firstChild!;
      window.getSelection()!.setBaseAndExtent(backward ? after : before, backward ? 0 : before.textContent!.length,
        backward ? before : after, backward ? before.textContent!.length : 0);
    }, backward);
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    if (action === "copy") {
      const data = await writing.evaluate((surface) => {
        const clipboard = new DataTransfer();
        surface.dispatchEvent(new ClipboardEvent("copy", { clipboardData: clipboard, bubbles: true, cancelable: true }));
        return Object.fromEntries(Array.from(clipboard.types).map((type) => [type, clipboard.getData(type)]));
      });
      expect(data["text/plain"]).toBe("Paragraph one.");
      expect(data["text/html"]).not.toMatch(/<h[1-6]/);
      expect(JSON.parse(data["application/x-lexical-editor"]).nodes).toHaveLength(1);
    } else if (action === "format") {
      if (info.project.name.endsWith("phone")) await page.getByRole("button", { name: "Commands: insert blocks or format selected text" }).click();
      const tools = page.getByRole("dialog", { name: "Format selected text", exact: true });
      await tools.getByRole("button", { name: "Normal Text", exact: true }).click();
      await page.getByRole("menuitem", { name: "Heading 3", exact: true }).click();
      await expect(writing.locator("h3")).toHaveText("Paragraph one.");
    } else if (action === "typing") await page.keyboard.type("Replacement");
    else if (action === "paste") await pasteText(writing);
    else await page.keyboard.press("Backspace");
    await expect(writing.locator("h2")).toHaveText(["Heading above", "Heading below"]);
    if (action === "typing") await expect(writing.locator("p").first()).toHaveText("Replacement");
    if (action === "paste") await expect(writing.locator("p").first()).toHaveText("Paste sentence");
  });
}

for (const kind of ["doc", "brief"] as const) test(`${kind === "brief" ? "update" : kind} shares paragraph boundary deletion and paste protection`, async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"), kind, false, false, "Paragraph one.\n\n## Heading below");
  const writing = page.getByRole("textbox", { name: kind === "doc" ? "Doc content" : "Update content", exact: true });
  await paragraphBoundary(page, writing);
  await page.keyboard.press("Backspace");
  await expect(writing.locator("h2")).toHaveText("Heading below");
  await writing.click();
  await page.keyboard.press("ControlOrMeta+z");
  await expect(writing.locator("p").first()).toHaveText("Paragraph one.");
  await writing.evaluate((surface) => {
    const text = surface.querySelector("p span")!.firstChild!;
    window.getSelection()!.setBaseAndExtent(text, 6, text, 6);
  });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await pasteText(writing, "<p>Paste sentence</p><h2></h2>");
  await expect(writing.locator("p").first()).toHaveText("ParagrPaste sentenceaph one.");
  await expect(writing.locator("h2")).toHaveText("Heading below");
});

for (const placement of ["empty", "next line", "between paragraphs", "existing blank lines"] as const) {
  test(`pasted image uses the first following writing line without a skipped row; ${placement}`, async ({ page }, info) => {
    test.skip(!info.project.name.startsWith("production"), "Uploads are installation-only");
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const { control } = await setup(page, true, "course", true);
    await page.route("**/api/media/**", (route) => route.fulfill({ contentType: "image/svg+xml", body:
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="160"><rect width="640" height="160" fill="#d8e5ed"/></svg>',
    }));
    const writing = page.getByRole("textbox", { name: "Lesson content" });
    await writing.click();
    if (placement !== "empty") {
      await page.keyboard.type("Before the image");
      await page.keyboard.press("Enter");
      if (placement === "between paragraphs") {
        await page.keyboard.press("Enter");
        await page.keyboard.type("After the image");
        await writing.locator("p").nth(1).click();
      } else if (placement === "existing blank lines") {
        await page.keyboard.press("Enter");
        await page.keyboard.press("Enter");
        await writing.locator("p").nth(1).click();
      }
    }
    await writing.evaluate((surface) => {
      const data = new DataTransfer();
      data.items.add(new File(["synthetic"], "caret.png", { type: "image/png" }));
      surface.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect.poll(() => control.uploaded).toBe(true);
    control.releaseUpload();
    await expect(writing.locator("img")).toBeVisible();
    await expect(writing.locator("img")).toHaveJSProperty("complete", true);
    const geometry = await writing.locator("img").evaluate((image) => {
      const wrapper = image.closest<HTMLElement>('[data-editor-block-type="image"]')!;
      const paragraph = image.closest("p")!;
      const next = paragraph.nextElementSibling!;
      return {
        wrapperHeight: wrapper.getBoundingClientRect().height,
        paragraphHeight: paragraph.getBoundingClientRect().height,
        gap: next.getBoundingClientRect().top - image.getBoundingClientRect().bottom,
        lineBreak: getComputedStyle(paragraph.querySelector("br")!).display,
      };
    });
    expect(geometry.lineBreak).toBe("none");
    expect(Math.abs(geometry.paragraphHeight - geometry.wrapperHeight)).toBeLessThan(1);
    expect(geometry.gap).toBeGreaterThan(0); // Retain the standard non-writing block space.
    expect(geometry.gap).toBeLessThan(56);
    await page.keyboard.type("First line. "); // No click: exercise the caret left by paste.
    const imageParagraph = writing.locator("p:has(img)");
    await expect(imageParagraph.locator("xpath=following-sibling::*[1]")).toHaveText(
      placement === "between paragraphs" ? "First line. After the image" : "First line. ",
    );
    if (placement !== "empty") await expect(writing.locator("p").first()).toHaveText("Before the image");
    await expect(writing.locator("p")).toHaveCount(placement === "empty" ? 2 : placement === "existing blank lines" ? 4 : 3);
    expect(errors).toEqual([]);
    await page.screenshot({ path: info.outputPath(`image-first-writing-line-${placement}.png`) });
  });
}

test("image layout keeps the caret line in paragraphs with real text", async ({ page }, info) => {
  await page.route("https://example.com/diagram.png", (route) => route.fulfill({ contentType: "image/svg+xml", body:
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80"><rect width="320" height="80" fill="#d8e5ed"/></svg>',
  }));
  await setup(page, info.project.name.startsWith("production"), "course", true, false, "Prefix ![Diagram](https://example.com/diagram.png)");
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  await expect(writing.locator("img")).toBeVisible();
  const display = await writing.locator("img").evaluate((image) => {
    const paragraph = image.closest("p")!;
    const lineBreak = paragraph.querySelector("br");
    return lineBreak ? getComputedStyle(lineBreak).display : null;
  });
  expect(display).not.toBe("none");
  await expect(writing.locator("p").first()).toContainText("Prefix");
});

for (const next of ["table", "image"] as const) test(`image paste leaves a writing line before the following ${next}`, async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("production"), "Uploads are installation-only");
  const following = next === "table" ? "| Column |\n| --- |\n| Keep this cell |" : "![Existing](/api/media/existing.png)";
  const { control } = await setup(page, true, "course", true, false, `Before\n\n${following}`);
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  await writing.locator("p").first().click();
  await writing.evaluate((surface) => {
    const text = surface.querySelector("p span")!.firstChild!;
    window.getSelection()!.setBaseAndExtent(text, text.textContent!.length, text, text.textContent!.length);
  });
  await page.keyboard.press("Enter");
  await writing.evaluate((surface) => {
    const data = new DataTransfer();
    data.items.add(new File(["synthetic"], "caret.png", { type: "image/png" }));
    surface.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect.poll(() => control.uploaded).toBe(true);
  control.releaseUpload();
  const pasted = writing.locator('img[alt="caret"]');
  await expect(pasted).toBeVisible();
  await page.keyboard.type("First line after paste");
  const imageParagraph = writing.locator('p:has(img[alt="caret"])');
  await expect(imageParagraph.locator("xpath=following-sibling::*[1]")).toHaveText("First line after paste");
  await expect(writing.locator("p").first()).toHaveText("Before");
  if (next === "table") await expect(writing.locator("table")).toContainText("Keep this cell");
  else await expect(writing.locator('img[alt="Existing"]')).toHaveAttribute("src", "/api/media/existing.png");
});

for (const backward of [false, true]) test(`URL paste links only the selected paragraph across block boundaries; backward=${backward}`, async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"), "course", true, false,
    "## Heading above\n\nParagraph one.\n\n## Heading below");
  const writing = page.getByRole("textbox", { name: "Lesson content" });
  await writing.click();
  await writing.evaluate((surface, backward) => {
    const before = surface.querySelectorAll("h2 span")[0].firstChild!;
    const after = surface.querySelectorAll("h2 span")[1].firstChild!;
    window.getSelection()!.setBaseAndExtent(backward ? after : before, backward ? 0 : before.textContent!.length,
      backward ? before : after, backward ? before.textContent!.length : 0);
  }, backward);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await pasteText(writing, "", { "text/plain": "https://example.com/guide" });
  await expect(writing.locator("p").getByRole("link")).toHaveText("Paragraph one.");
  await expect(writing.locator("p").getByRole("link")).toHaveAttribute("href", "https://example.com/guide");
  await expect(writing.locator("h2")).toHaveText(["Heading above", "Heading below"]);
  await expect(writing.locator("h2 a")).toHaveCount(0);
});
