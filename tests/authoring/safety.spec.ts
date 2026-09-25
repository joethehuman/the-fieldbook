import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";

async function setup(
  page: Page,
  production: boolean,
  kind: "doc" | "course" = "doc",
) {
  const state = freshWorkspace();
  state.content = state.content.filter((c) => c.kind === kind).slice(0, 1);
  state.content[0].revision = 1;
  state.content[0].status = "draft";
  state.content[0].title = "Safety fixture";
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
    await page.route("**/api/workspace", (route) =>
      route.fulfill({
        status: control.failRefresh ? 503 : 200,
        json: control.failRefresh
          ? { error: "Workspace unavailable" }
          : {
              data: state,
              user: control.sessionLost
                ? null
                : state.users.find((u) => u.id === "demo-admin"),
            },
      }),
    );
    await page.route("**/api/content", async (route) => {
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
  await page.goto(production ? "/team" : "/#admin");
  if (production) {
    const menu = page.getByRole("button", { name: "Open navigation" });
    if ((page.viewportSize()?.width ?? 1000) < 768) await menu.click();
    await page.getByRole("button", { name: "Manage organization" }).click();
  }
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  return { state, control };
}
async function openNav(page: Page) {
  const menu = page.getByRole("button", { name: "Open navigation" });
  if ((page.viewportSize()?.width ?? 1000) < 768) await menu.click();
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
  await openNav(page);
  await page.getByRole("button", { name: "Manage organization" }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await page.getByLabel("Title", { exact: true }).fill("History protected");
  await page.evaluate(() => history.back());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "History protected",
  );
  await expect(page).toHaveURL(production ? /\/admin$/ : /#admin$/);
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
  await page.goto("/team");
  const menu = page.getByRole("button", { name: "Open navigation" });
  if ((page.viewportSize()?.width ?? 1000) < 768) await menu.click();
  await page.getByRole("button", { name: "Manage organization" }).click();
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
          ? page.getByLabel(/Upload lesson video/).first()
          : page.locator('.markdown-editor input[type="file"]').first();
    await input.setInputFiles(file);
    await expect.poll(() => control.uploaded).toBe(true);
    await expect(
      page.getByRole("button", { name: "Remove lesson 1", exact: true }),
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
    "sign-in or account access changed",
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
