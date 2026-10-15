import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import {
  exportBlockMarkdown,
  importMarkdownDocument,
} from "../../lib/block-document";
import type { Content } from "../../lib/types";
import { setupAuthoringProvider } from "./provider-fixture";

const id = "00000000-0000-4000-8000-000000000941";
const portrait = { width: 390, height: 844 };
const landscape = { width: 1024, height: 768 };

async function fixture(
  page: Page,
  installed: boolean,
  kind: Content["kind"] = "doc",
  blocks = true,
) {
  const state = withPublishedSnapshots(freshWorkspace());
  const document = importMarkdownDocument(
    "Keep **saved formatting** and stable content.",
  );
  const body = exportBlockMarkdown(document);
  const item: Content = {
    ...state.content.find((entry) => entry.kind === kind)!,
    id,
    title: "Desktop requirement fixture",
    body,
    bodyDocument: blocks ? document : undefined,
    revision: 1,
    publishedRevision: 1,
    ...(kind === "course"
      ? {
          lessons: [
            {
              id: "first-lesson",
              title: "First lesson",
              body,
              ...(blocks ? { bodyDocument: document } : {}),
            },
          ],
          questions: [],
        }
      : {}),
  };
  state.content = [item];
  state.publishedContent = [structuredClone(item)];
  if (installed) await setupAuthoringProvider(page, state);
  else
    await page.addInitScript((data) => {
      if (!localStorage.getItem("fieldbook.workspace.v1"))
        localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    }, state);
  const go = (path: string) =>
    page.goto(installed ? path : "/#" + path.slice(1));
  const read = async (published = false): Promise<Content> =>
    installed
      ? (
          await page.request.get(
            `/api/content?id=${id}&${published ? "snapshot=published" : "draft=true"}`,
          )
        ).json()
      : page.evaluate(
          ({ id, published }) => {
            const data = JSON.parse(
              localStorage.getItem("fieldbook.workspace.v1")!,
            );
            return (published ? data.publishedContent : data.content).find(
              (entry: Content) => entry.id === id,
            );
          },
          { id, published },
        );
  return { go, read, item };
}

async function expectNotice(page: Page, back = true) {
  await expect(
    page.getByRole("note", { name: "Desktop editing required" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Editing is available on desktop" }),
  ).toBeVisible();
  await expect(
    page.locator(
      'form.editor, .editor-frame, .writing-root, .writing-source, [contenteditable="true"]',
    ),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Publish", exact: true }),
  ).toHaveCount(0);
  if (back)
    await expect(
      page.getByRole("button", { name: "Back to content", exact: true }),
    ).toBeVisible();
}

test.describe("desktop editing requirement", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: portrait });

  for (const kind of ["doc", "brief", "course"] as const) {
    for (const blocks of [false, true]) {
      test(`${kind}: ${blocks ? "structured" : "legacy"} direct edit preserves draft and publication`, async ({
        page,
      }, info) => {
        const { go, read, item } = await fixture(
          page,
          info.project.name.startsWith("production"),
          kind,
          blocks,
        );
        await go(`/admin/content/${id}/edit`);
        await expectNotice(page);
        const draft = await read();
        const published = await read(true);
        expect(draft.body).toBe(item.body);
        expect(draft.bodyDocument).toEqual(item.bodyDocument);
        expect(draft.revision).toBe(1);
        if (kind === "course") expect(draft.lessons).toEqual(item.lessons);
        await page
          .getByRole("button", { name: "Back to content", exact: true })
          .click();
        await page
          .getByRole("link", {
            name: "Desktop requirement fixture",
            exact: true,
          })
          .click();
        await expectNotice(page);
        expect(await read()).toEqual(draft);
        expect(await read(true)).toEqual(published);
      });
    }
    test(`${kind}: creating on a phone mounts the notice without saving a record`, async ({
      page,
    }, info) => {
      const { go, read } = await fixture(
        page,
        info.project.name.startsWith("production"),
        kind,
      );
      await go("/admin/content");
      const before = await read();
      let writes = 0;
      page.on("request", (request) => {
        if (
          request.method() === "POST" &&
          new URL(request.url()).pathname === "/api/content"
        )
          writes++;
      });
      await go(`/admin/content/new/${kind}`);
      await expectNotice(page);
      await page
        .getByRole("button", { name: "Back to content", exact: true })
        .click();
      expect(writes).toBe(0);
      expect(await read()).toEqual(before);
      if (!info.project.name.startsWith("production"))
        expect(
          await page.evaluate(
            () =>
              JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!)
                .content.length,
          ),
        ).toBe(1);
    });
  }

  test("width and orientation retain the existing touch boundary", async ({
    page,
  }, info) => {
    const { go } = await fixture(
      page,
      info.project.name.startsWith("production"),
    );
    await go(`/admin/content/${id}/edit`);
    for (const [width, height, restricted] of [
      [390, 844, true],
      [767, 375, true],
      [768, 1024, true],
      [1279, 1500, true],
      [1280, 1500, false],
      [844, 390, false],
      [1024, 768, false],
    ] as const) {
      await page.setViewportSize({ width, height });
      if (restricted) await expectNotice(page);
      else {
        await expect(
          page.getByRole("textbox", { name: "Doc content", exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole("note", { name: "Desktop editing required" }),
        ).toHaveCount(0);
      }
    }
  });

  test("an edit still saves as a private draft after crossing into the restricted layout", async ({
    page,
  }, info) => {
    const { go, read } = await fixture(
      page,
      info.project.name.startsWith("production"),
    );
    await page.setViewportSize(landscape);
    await go(`/admin/content/${id}/edit`);
    const published = await read(true);
    await page
      .getByRole("textbox", { name: "Title", exact: true })
      .fill("Pending desktop edit");
    await page.setViewportSize(portrait);
    await expectNotice(page);
    await expect
      .poll(async () => (await read()).title)
      .toBe("Pending desktop edit");
    // The installed API reports the current record revision even when returning
    // the older published snapshot. Its content and published revision stay put.
    const afterPublication = await read(true);
    expect(afterPublication).toEqual({
      ...published,
      revision: afterPublication.revision,
    });
    await page.setViewportSize(landscape);
    await expect(
      page.getByRole("textbox", { name: "Title", exact: true }),
    ).toHaveValue("Pending desktop edit");
    expect((await read()).bodyDocument).toEqual(published.bodyDocument);
  });

  test("a failed save retains structured recovery and the navigation guard on a phone", async ({
    page,
  }, info) => {
    const installed = info.project.name.startsWith("production");
    const { go, read } = await fixture(page, installed);
    await page.setViewportSize(landscape);
    await go(`/admin/content/${id}/edit`);
    const before = await read();
    if (installed)
      await page.route("**/api/content", (route) =>
        route.request().method() === "POST"
          ? route.fulfill({
              status: 503,
              json: { error: "Synthetic save failure" },
            })
          : route.continue(),
      );
    else
      await page.evaluate(() => {
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (key === "fieldbook.workspace.v1")
            throw new Error("Synthetic save failure");
          return original.call(this, key, value);
        };
      });
    await page
      .getByRole("textbox", { name: "Title", exact: true })
      .fill("Recover this private draft");
    await expect(
      page.getByText("The save couldn’t be confirmed.", { exact: true }),
    ).toBeVisible();
    await page.setViewportSize(portrait);
    await expectNotice(page);
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download your changes", exact: true })
      .click();
    const file = await download;
    const recovered = JSON.parse(await readFile((await file.path())!, "utf8"));
    expect(recovered.title).toBe("Recover this private draft");
    expect(recovered.bodyDocument).toEqual(before.bodyDocument);
    await page
      .getByRole("button", { name: "Back to content", exact: true })
      .click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("Leave with unsaved changes?");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expectNotice(page);
    expect(await read()).toEqual(before);
    await page.setViewportSize(landscape);
    await expect(
      page.getByRole("textbox", { name: "Title", exact: true }),
    ).toHaveValue("Recover this private draft");
  });

  test("the shared policy writer is restricted while ordinary settings stay available", async ({
    page,
  }, info) => {
    const { go } = await fixture(
      page,
      info.project.name.startsWith("production"),
    );
    await go("/admin/settings/privacy");
    await expect(
      page.getByRole("note", { name: "Desktop editing required" }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Privacy policy draft", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("textbox", { name: "Operator name", exact: true }),
    ).toBeEditable();
  });

  test("a pending upload still blocks leaving after the editor is replaced by the notice", async ({
    page,
  }, info) => {
    test.skip(
      !info.project.name.startsWith("production"),
      "Uploads belong to the installed app.",
    );
    const { go, read } = await fixture(page, true, "course");
    await page.setViewportSize(landscape);
    await go(`/admin/content/${id}/edit`);
    const before = await read();
    let started = false;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/api/upload", async (route) => {
      started = true;
      await pending;
      await route.fulfill({
        status: 503,
        json: { error: "Synthetic upload failure" },
      });
    });
    try {
      await page.getByRole("button", { name: "Details", exact: true }).click();
      await page
        .getByLabel("Upload card artwork", { exact: true })
        .setInputFiles({
          name: "cover.png",
          mimeType: "image/png",
          buffer: Buffer.from("synthetic"),
        });
      await expect.poll(() => started).toBe(true);
      await page.setViewportSize(portrait);
      await expectNotice(page);
      await page
        .getByRole("button", { name: "Back to content", exact: true })
        .click();
      await expectNotice(page);
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      const response = page.waitForResponse("**/api/upload");
      release();
      await response;
      await expect(async () => {
        await page
          .getByRole("button", { name: "Back to content", exact: true })
          .click();
        await expect(
          page.getByRole("note", { name: "Desktop editing required" }),
        ).toHaveCount(0);
      }).toPass();
      expect(await read()).toEqual(before);
    } finally {
      release();
    }
  });

  test("catalog editor examples show the notice on phones", async ({
    page,
  }, info) => {
    test.skip(
      info.project.name.startsWith("production"),
      "The component catalog belongs to the demo.",
    );
    await page.goto("/ui");
    await expect(
      page
        .getByRole("region", { name: "Content editor frame" })
        .getByRole("note", { name: "Desktop editing required" }),
    ).toBeVisible();
    await expect(
      page
        .locator("#writing")
        .getByRole("note", { name: "Desktop editing required" }),
    ).toBeVisible();
    await expect(page.locator(".editor-frame, .writing-root")).toHaveCount(0);
  });

  test.describe("fine pointer", () => {
    test.use({ hasTouch: false, isMobile: false });
    test("narrow mouse windows retain the desktop writer and panels", async ({
      page,
    }, info) => {
      const { go } = await fixture(
        page,
        info.project.name.startsWith("production"),
      );
      await go(`/admin/content/${id}/edit`);
      await expect(
        page.getByRole("textbox", { name: "Doc content", exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole("note", { name: "Desktop editing required" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Back to content", exact: true }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Details", exact: true }).click();
      await expect(
        page.getByRole("complementary", {
          name: "Content details",
          exact: true,
        }),
      ).toBeVisible();
    });
  });
});
