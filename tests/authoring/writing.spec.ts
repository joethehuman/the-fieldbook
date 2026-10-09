import { test, expect, type Page } from "@playwright/test";
import { downloadMarkdown, expectMarkdown, replaceWritingText, waitForDraftSaved, openContentSettings, closeContentSettings, returnToContent } from "./editor-helpers";
import { freshWorkspace, type Workspace } from "../../lib/store";
import { defaultSettings } from "../../lib/settings";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import { equivalentMarkdown } from "../../lib/markdown-compatibility";
import { writeTableWidths } from "../../lib/writing-table";
import {
  authoringUser,
  setupAuthoringProvider,
  syncAuthoringProvider,
} from "./provider-fixture";

const original = `## Working with customers

Start with **context** and *care*. Read [the guide](https://example.com/guide).

- First point
  - Nested point
- Second point

> A useful reminder.

| Topic | Detail |
| --- | --- |
| Product | Customer need |

\`\`\`js
const hello = "world";
\`\`\`

![Product diagram](/api/media/example.png)

[Product walkthrough](/api/media/00000000-0000-4000-8000-000000000010.mp4)
`;

async function pasteWritingText(page: Page, value: string) {
  await page.getByRole("textbox", { name: "Doc content", exact: true }).evaluate((node, text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    const target = document.activeElement?.closest('[contenteditable="true"]');
    (target && node.contains(target) ? target : node).dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, value);
}

for (const [label, markdown, selector] of [
  ["image", "![Product diagram](/api/media/example.png)", '[data-editor-block-type="image"]'],
  ["inline image", "Context ![Product diagram](/api/media/example.png)", '[data-editor-block-type="image"]'],
  ["video", "[Video](https://example.test/final.mp4)", ".writing-media-block"],
  ["code", "```text\nExample\n```", ".writing-code-block"],
  ["table", "| One | Two |\n| --- | --- |\n| A | B |", ".writing-table-block"],
  ["divider", "---", "hr"],
] as const) {
  test(`a saved final ${label} has a clickable writing line below it`, async ({ page }, info) => {
    const body = `Before the block.\n\n${markdown}`;
    const { read, writes } = await setup(page, info.project.name.startsWith("production"), body);
    const editor = page.getByRole("textbox", { name: "Doc content", exact: true });
    await expect(editor.locator(selector)).toBeVisible();
    // Opening a document must not save an editor-only empty paragraph.
    expect((await read()).content[0].body).toBe(body);
    expect(writes()).toBe(0);
    const line = editor.locator(":scope > p").last();
    await expect(line).toBeEmpty();
    await line.scrollIntoViewIfNeeded();
    const block = (await editor.locator(selector).boundingBox())!;
    const bounds = (await line.boundingBox())!;
    expect(bounds.height).toBeGreaterThan(0);
    expect(bounds.y - block.y - block.height).toBeGreaterThanOrEqual(24);
    await line.click();
    await page.keyboard.type("After the block.");
    await expect(line).toHaveText("After the block.");
    await waitForDraftSaved(page);
    expect((await read()).content[0].body).toContain("After the block.");
    await page.reload();
    await expect(editor.locator(selector)).toBeVisible();
    await expect(editor.locator(":scope > p").last()).toHaveText("After the block.");
  });
}

for (const [command, selector] of [
  ["Image", '[data-editor-block-type="image"]'],
  ["Embed video link", ".writing-media-block"],
  ["Code block", ".writing-code-block"],
  ["Table", ".writing-table-block"],
  ["Divider", "hr"],
] as const) {
  test(`inserting a final ${command} keeps the following line writable`, async ({ page }, info) => {
    await setup(page, info.project.name.startsWith("production"), "Before the block.");
    const editor = page.getByRole("textbox", { name: "Doc content", exact: true });
    await editor.locator("p").click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/");
    await page.getByRole("menuitem", { name: command, exact: true }).click();
    if (command === "Image" || command === "Embed video link") {
      const type = command === "Image" ? "image" : "video";
      const chooser = page.getByRole("dialog", { name: `Insert ${type}`, exact: true });
      await chooser.getByRole("button", { name: "Link", exact: true }).click();
      await page.route("https://example.test/final.png", route => route.fulfill({
        contentType: "image/png",
        body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64"),
      }));
      await chooser.getByRole("textbox", { name: type === "image" ? "Image URL" : "Video URL", exact: true })
        .fill(type === "image" ? "https://example.test/final.png" : "https://example.test/final.mp4");
      await chooser.getByRole("button", { name: `Insert ${type}`, exact: true }).click();
      await expect(chooser).toBeHidden();
    }
    await expect(editor.locator(selector)).toBeVisible();
    const line = editor.locator(":scope > p").last();
    await expect(line).toBeEmpty();
    await line.click();
    await page.keyboard.type("After insertion.");
    await expect(line).toHaveText("After insertion.");
    await waitForDraftSaved(page);
    await page.reload();
    await expect(editor.locator(selector)).toBeVisible();
    await expect(editor.locator(":scope > p").last()).toHaveText("After insertion.");
  });
}

test("pasting a URL links selected formatted text, supports undo and survives draft reload", async ({ page }, info) => {
  const { read } = await setup(page, info.project.name.startsWith("production"), "Read **the guide** for context.");
  const editor = page.getByRole("textbox", { name: "Doc content", exact: true });
  await editor.click();
  await editor.locator("strong").selectText();
  await pasteWritingText(page, "https://example.com/guide?from=editor#start");
  const link = editor.getByRole("link", { name: "the guide", exact: true });
  await expect(link).toHaveAttribute("href", "https://example.com/guide?from=editor#start");
  await expect(link.locator("strong")).toHaveText("the guide");
  await expect(editor).toHaveText("Read the guide for context.");
  await editor.press("ControlOrMeta+z");
  await expect(editor.getByRole("link")).toHaveCount(0);
  await expect(editor.locator("strong")).toHaveText("the guide");
  await editor.press("ControlOrMeta+Shift+z");
  await expect(link).toHaveAttribute("href", "https://example.com/guide?from=editor#start");
  await waitForDraftSaved(page);
  expect((await read()).content[0].body).toContain("https://example.com/guide?from=editor#start");
  expect((await downloadMarkdown(page)).body).toMatch(/\[.*the guide.*\]\(https:\/\/example.com\/guide\?from=editor#start\)/);
  await page.reload();
  await expect(link).toHaveAttribute("href", "https://example.com/guide?from=editor#start");
  await expect(link.locator("strong")).toHaveText("the guide");
});

test("URL paste replaces an existing link destination and normalizes a bare domain", async ({ page }, info) => {
  const { read } = await setup(page, info.project.name.startsWith("production"), "Read [the guide](https://example.com/old).");
  const editor = page.getByRole("textbox", { name: "Doc content", exact: true });
  const link = editor.getByRole("link", { name: "the guide", exact: true });
  await editor.click();
  await link.selectText();
  await pasteWritingText(page, " example.org/new?next=yes#section ");
  await expect(link).toHaveAttribute("href", "https://example.org/new?next=yes#section");
  await expect(editor).toHaveText("Read the guide.");
  await waitForDraftSaved(page);
  expect((await read()).content[0].body).toContain("[the guide](https://example.org/new?next=yes#section)");
});

test("ordinary and unsafe text paste still replaces the selection", async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"), "Replace me");
  const editor = page.getByRole("textbox", { name: "Doc content", exact: true });
  for (const value of ["Ordinary pasted words", "javascript:alert(1)", "https://example.com extra words"]) {
    await editor.click();
    await editor.press("ControlOrMeta+A");
    await pasteWritingText(page, value);
    await expect(editor).toHaveText(value);
    await expect(editor.getByRole("link", { name: "Replace me", exact: true })).toHaveCount(0);
  }
});

test("URL paste links table-cell selections and leaves code and caret paste alone", async ({ page }, info) => {
  const { read } = await setup(page, info.project.name.startsWith("production"), "| Topic | Detail |\n| --- | --- |\n| Reference | A guide |\n\n`code example`\n\nCaret: ");
  const editor = page.getByRole("textbox", { name: "Doc content", exact: true });
  const cell = editor.getByRole("table").getByRole("textbox").last();
  await cell.click();
  await cell.press("ControlOrMeta+A");
  await pasteWritingText(page, "https://example.com/table");
  await expect(cell.getByRole("link", { name: "A guide", exact: true })).toHaveAttribute("href", "https://example.com/table");
  await editor.locator("code").click();
  await editor.locator("code").selectText();
  await pasteWritingText(page, "https://example.com/code");
  await expect(editor.locator("code")).toHaveText("https://example.com/code");
  await expect(editor.locator("code a")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("link-dialog-preview")).toHaveCount(0);
  const paragraph = editor.locator(":scope > p").last();
  await paragraph.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => navigator.clipboard.writeText("https://example.com/caret"));
  await page.keyboard.press("ControlOrMeta+v");
  await expect(paragraph).toContainText("Caret:");
  await expect(paragraph).toContainText("https://example.com/caret");
  await waitForDraftSaved(page);
  expect((await read()).content[0].body).toContain("[A guide](https://example.com/table)");
});

test("native clipboard URL paste preserves a fully selected paragraph", async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"), "Read the guide");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(() => navigator.clipboard.writeText("https://example.com/native"));
  const editor = page.getByRole("textbox", { name: "Doc content", exact: true });
  await editor.click();
  await editor.press("ControlOrMeta+A");
  await editor.press("ControlOrMeta+V");
  await expect(editor.getByRole("link", { name: "Read the guide", exact: true })).toHaveAttribute("href", "https://example.com/native");
  await expect(editor).toHaveText("Read the guide");
});

test("link popups follow text through scrolling and panel changes, and bare domains save with HTTPS", async ({ page }, info) => {
  const { read } = await setup(page, info.project.name.startsWith("production"),
    "Before the link.\n\nRead [the guide](google.com) for context.\n\n[Local reference](guide.md), [heading](#next) and [older web link](example.org).\n\n" + Array.from({ length: 30 }, (_, index) => `Paragraph ${index}: More useful context.`).join("\n\n"));
  const editor = page.getByRole("textbox", { name: "Doc content", exact: true });
  const link = editor.getByRole("link", { name: "the guide", exact: true });
  await link.click();
  const popup = page.getByRole("dialog").filter({ has: page.getByTestId("link-dialog-preview") });
  const nearLink = async () => {
    const anchor = await link.boundingBox(); const box = await popup.boundingBox();
    if (!anchor || !box) return false;
    const verticalGap = Math.min(Math.abs(box.y - anchor.y - anchor.height), Math.abs(box.y + box.height - anchor.y));
    return verticalGap <= 32 && box.x <= anchor.x + anchor.width && box.x + box.width >= anchor.x;
  };
  await expect.poll(nearLink).toBe(true);
  await expect(page.getByTestId("link-dialog-preview")).toHaveAttribute("href", "https://google.com");
  const before = await link.boundingBox();
  await editor.evaluate((node) => {
    const owner = node.closest('.editor[data-scroll-layout="workspace"]')
      ? node.closest(".writing-scroll-area")! : node.closest(".main-content")!;
    owner.scrollTop += 12;
  });
  await expect.poll(async () => (await link.boundingBox())!.y).toBeLessThan(before!.y);
  await expect.poll(nearLink).toBe(true);
  if (!info.project.name.endsWith("phone")) {
    await page.getByRole("button", { name: /^Details/ }).evaluate((node) => (node as HTMLElement).click());
    await expect.poll(nearLink).toBe(true);
  }
  await popup.getByRole("button", { name: "Edit link URL", exact: true }).click();
  const edit = page.getByRole("dialog", { name: "Edit link", exact: true });
  await edit.getByRole("textbox", { name: "URL", exact: true }).fill("example.com/guide?next=yes#next");
  await edit.getByRole("button", { name: "Set URL", exact: true }).click();
  await expect(link).toHaveAttribute("href", "https://example.com/guide?next=yes#next");
  await waitForDraftSaved(page);
  expect((await read()).content[0].body).toContain("[the guide](https://example.com/guide?next=yes#next)");
  await page.screenshot({ path: info.outputPath("ui1-link-popup.png") });
  await popup.getByRole("button", { name: "Edit link URL", exact: true }).click();
  await edit.getByRole("textbox", { name: "URL", exact: true }).fill("cancelled.example.com");
  await edit.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(link).toHaveAttribute("href", "https://example.com/guide?next=yes#next");
  await page.getByRole("textbox", { name: "Title", exact: true }).click();
  await expectMarkdown(page, /\[the guide\]\(https:\/\/example.com\/guide\?next=yes#next\)/);
  await expectMarkdown(page, /\[Local reference\]\(guide.md\)/);
  await expectMarkdown(page, /\[heading\]\(#next\)/);

});

test("formatting dropdown focus keeps the owning writing ring and outside focus clears it", async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"), "Keep this selection intact");
  const editor = page.getByRole("textbox", { name: "Doc content", exact: true });
  const ring = () => editor.evaluate((node) => getComputedStyle(node.closest(".writing-surface")!).outlineStyle);
  await editor.click();
  const activeRing = await ring();
  expect(activeRing).toBe("solid");
  await editor.press("ControlOrMeta+A");
  const tools = page.getByRole("dialog", { name: "Format selected text", exact: true });
  await tools.getByRole("button", { name: "Normal Text", exact: true }).click();
  await page.getByRole("menuitem", { name: "Heading 2", exact: true }).focus();
  await expect.poll(ring).toBe(activeRing);
  await page.screenshot({ path: info.outputPath("ui1-formatting-focus.png") });
  await page.keyboard.press("Enter");
  await expect(editor.locator("h2")).toHaveText("Keep this selection intact");
  await page.getByRole("textbox", { name: "Title", exact: true }).click();
  await expect(tools).toBeHidden();
  await expect.poll(ring).not.toBe(activeRing);
});

test("command hover has one immediate highlight and keyboard navigation reveals its selection", async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"), "");
  const editor = page.getByRole("textbox", { name: "Doc content", exact: true });
  await editor.click();
  await page.keyboard.type("/");
  const options = page.locator(".writing-slash-options");
  const items = options.getByRole("menuitem");
  const third = items.nth(2);
  const scrollBefore = await options.evaluate((node) => node.scrollTop);
  await third.hover();
  await expect(third).toHaveAttribute("aria-current", "true");
  expect(await options.evaluate((node) => node.scrollTop)).toBe(scrollBefore);
  const highlights = () => options.evaluate((node) => {
    const accent = getComputedStyle(node).getPropertyValue("--accent").trim();
    const probe = document.createElement("span"); probe.style.backgroundColor = accent; node.append(probe);
    const color = getComputedStyle(probe).backgroundColor; probe.remove();
    return [...node.querySelectorAll("[role=menuitem]")].filter((item) => getComputedStyle(item).backgroundColor === color).length;
  });
  expect(await highlights()).toBe(1);
  expect(await third.evaluate((node) => getComputedStyle(node).transitionDuration)).toBe("0s");
  await page.keyboard.press("ArrowDown");
  await expect(items.nth(3)).toHaveAttribute("aria-current", "true");
  expect(await highlights()).toBe(1);
  for (let index = 0; index < 8; index++) await page.keyboard.press("ArrowDown");
  await expect.poll(() => options.evaluate((node) => {
    const current = node.querySelector('[aria-current="true"]')!.getBoundingClientRect();
    const box = node.getBoundingClientRect(); return current.top >= box.top - 1 && current.bottom <= box.bottom + 1;
  })).toBe(true);
  await page.screenshot({ path: info.outputPath("ui1-command-menu.png") });
  await page.keyboard.press("Escape");
  await expect(options).toBeHidden();
  await expect(editor).toBeFocused();
});

test("Details keeps its contents during motion, hides closed controls and honors reduced motion", async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"));
  const toggle = page.getByRole("button", { name: /^Details/ });
  const slot = page.locator('.editor-frame-panel[data-side="details"]');
  await openContentSettings(page);
  const panel = page.getByRole("complementary", { name: "Content details", exact: true });
  const field = panel.getByRole("textbox", { name: "Short description", exact: true });
  await field.fill("Keep panel state across toggles");
  await expect.poll(() => slot.evaluate((node) => getComputedStyle(node).visibility)).toBe("visible");
  const motion = await toggle.evaluate(async (node) => {
    const panel = document.querySelector('.editor-frame-panel[data-side="details"]')!;
    const content = panel.querySelector("aside")!;
    (node as HTMLElement).click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return { attached: content.isConnected, hidden: panel.getAttribute("aria-hidden"), inert: (panel as HTMLElement).inert, transition: getComputedStyle(content).transitionDuration };
  });
  expect(motion).toEqual({ attached: true, hidden: "true", inert: true, transition: "0.22s, 0.22s" });
  await expect(slot).toHaveCount(0);
  await expect(panel).toHaveCount(0);
  await openContentSettings(page);
  await expect(field).toHaveValue("Keep panel state across toggles");
  await field.focus(); await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await toggle.click();
  expect(await slot.locator("aside").evaluate((node) => getComputedStyle(node).transitionDuration)).toBe("0s");
  await toggle.click();
  await expect(slot).toHaveCount(0);
});
async function setup(
  page: Page,
  production: boolean,
  body = original,
  kind: "doc" | "brief" = "doc",
  itemId = "00000000-0000-4000-8000-000000000011",
) {
  let state = withPublishedSnapshots(freshWorkspace());
  if (kind === "doc") {
    state.settings = {
      ...defaultSettings,
      ...state.settings,
      docCategoryOrder: [],
      docSections: [
        { id: "writing-start", name: "Start here" },
        {
          id: "writing-getting-started",
          name: "Getting started",
          parentId: "writing-start",
        },
      ],
    };
  }
  const source = state.content.find((item) => item.kind === kind)!;
  const item = {
    ...source,
    id: itemId,
    ...(kind === "doc"
      ? {
          category: "Start here",
          folder: "Getting started",
          sectionId: "writing-getting-started",
        }
      : {}),
    title: "Writing fixture",
    body,
    revision: 1,
    publishedRevision: 1,
  };
  state.content = [item];
  state.publishedContent = [structuredClone(item)];
  let writes = 0;
  if (production) {
    await setupAuthoringProvider(page, state);
    await page.route("**/api/admin/snapshot?**", (route) =>
      route.fulfill({
        json: {
          data: state,
          user: authoringUser,
        },
      }),
    );
    await page.route("**/api/settings", (route) => {
      const request = route.request().postDataJSON();
      state.settings = request.settings;
      state.revision = (state.revision || 1) + 1;
      return route.fulfill({ json: { revision: state.revision } });
    });
    await page.route("**/api/content*", async (route) => {
      if (route.request().method() === "GET") {
        const id = new URL(route.request().url()).searchParams.get("id");
        return route.fulfill({ json: state.content.find((item) => item.id === id) || state.content[0] });
      }
      writes++;
      const request = route.request().postDataJSON();
      const current = state.content.find(
        (item) => item.id === request.content.id,
      );
      expect(request.expected).toBe(current?.revision ?? 0);
      const saved = {
        ...request.content,
        revision: (current?.revision || 0) + 1,
        publishedRevision: current?.publishedRevision,
      };
      if (request.publish) {
        saved.publishedRevision = saved.revision;
        state.publishedContent = [structuredClone(saved)];
      }
      if (request.unpublish) {
        state.publishedContent = [];
        saved.publishedRevision = undefined;
      }
      state.content = [
        ...state.content.filter((item) => item.id !== saved.id),
        saved,
      ];
      await syncAuthoringProvider(page, state);
      return route.fulfill({ json: saved });
    });
    await page.route("**/api/admin/bulk", async (route) => {
      const request = route.request().postDataJSON();
      expect(request.entity).toBe("content");
      expect(request.operation).toBe("unpublish");
      expect(request.items).toEqual([{ id: itemId, expected: state.content[0].revision }]);
      state.content = [{ ...state.content[0], status: "draft", publishedRevision: undefined,
        revision: (state.content[0].revision || 0) + 1 }];
      state.publishedContent = [];
      await syncAuthoringProvider(page, state);
      return route.fulfill({ json: { results: [{ id: itemId, status: "changed" }] } });
    });
  } else {
    await page.addInitScript((data) => {
      if (!localStorage.getItem("fieldbook.workspace.v1"))
        localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    }, state);
  }
  await page.route("**/api/media/example.png", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.route("**/api/media/00000000-0000-4000-8000-000000000010.mp4", (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.goto(production ? `/admin/content/${itemId}/edit` : "/#admin");
  if (!production) await page.getByRole("link", { name: item.title, exact: true }).click();
  await expect(page.locator(".editor")).toBeVisible();
  const read = async (): Promise<Workspace> =>
    production
      ? state
      : page.evaluate(() =>
          JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
        );
  return { read, writes: () => writes };
}

test("visual Markdown round trip, autosaved drafts, republish and unpublish", async ({
  page,
}, info) => {
  const production = info.project.name.startsWith("production");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { read, writes } = await setup(page, production);
  const editor = page.getByRole("textbox", {
    name: "Doc content",
    exact: true,
  });
  await expect(editor).toBeVisible();
  await expect(editor.locator("h2")).toHaveText("Working with customers");
  await expect(editor.locator("strong")).toHaveText("context");
  await expect(editor.locator("img")).toHaveAttribute("alt", "Product diagram");
  await expect(editor.locator("video")).toHaveAttribute(
    "src",
    "/api/media/00000000-0000-4000-8000-000000000010.mp4",
  );
  // Opening and normalizing content must never create a draft revision.
  await page.waitForTimeout(1100);
  expect(writes()).toBe(0);
  expect((await read()).content[0].revision).toBe(1);
  await page.getByLabel("Title", { exact: true }).fill("Private title");
  await waitForDraftSaved(page);
  expect((await read()).content[0].body).toBe(original);
  expect((await read()).publishedContent![0].title).toBe("Writing fixture");
  // A second save verifies revision and dirty-baseline handling without reopening.
  await editor.locator("p").filter({ hasText: "Start with" }).click();
  await editor.press("ControlOrMeta+End");
  await editor.press("Enter");
  await editor.pressSequentially("A private addition.");
  await expect(editor).toContainText("A private addition.");
  await waitForDraftSaved(page);
  const draft = (await read()).content[0].body;
  expect(draft).toContain("A private addition.");
  expect(
    equivalentMarkdown(original, draft.replace(/A private addition\./, "")),
  ).toBe(true);
  expect((await read()).publishedContent![0].body).toBe(original);
  await returnToContent(page);
  await expect(
    page.getByText("Unpublished edits", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Private title", exact: true }).click();
  await expect(page.locator(".editor")).toBeVisible();
  await expect(editor).toContainText("A private addition.");
  await page
    .getByRole("button", { name: "Publish", exact: true })
    .click();
  await expect(page.locator('[data-slot="toast"]')).toContainText("published");
  expect((await read()).publishedContent![0].title).toBe("Private title");
  await page.screenshot({
    path: info.outputPath("writing-editor.png"),
    fullPage: true,
  });
  await returnToContent(page);
  await page.getByRole("button", { name: "Actions for Private title", exact: true }).click();
  await page.getByRole("menuitem", { name: "Unpublish", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Unpublish", exact: true })
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Unpublish", exact: true }),
  ).toHaveCount(0);
  await expect.poll(async () => (await read()).publishedContent).toEqual([]);
  expect((await read()).content[0].body).toContain("A private addition.");
  expect(errors).toEqual([]);
});

test("resized Doc tables persist through save, reopen, publish, and reading", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("production"), "Reader persistence is checked with the installed app fixture.");
  const body = "| Short | Detailed paragraph |\n| --- | --- |\n| A | This is a longer sentence that should wrap when the column is narrow. |";
  const itemId = "00000000-0000-4000-8000-000000000099";
  const { read } = await setup(page, true, body, "doc", itemId);
  const resize = page.getByRole("separator", { name: "Resize column 2" });
  await resize.focus();
  await resize.press("ArrowRight");
  await expect.poll(async () => (await read()).content[0].body).toContain("fieldbook-table-widths:v1");
  await waitForDraftSaved(page);
  const saved = (await read()).content[0].body;
  expect(saved).toContain("fieldbook-table-widths:v1");
  await returnToContent(page);
  await page.goto(`/admin/content/${itemId}/edit`);
  await expect(page.getByRole("separator", { name: "Resize column 2" })).toBeVisible();
  expect((await downloadMarkdown(page)).body).toBe(saved);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.locator('[data-slot="toast"]')).toContainText("published");
  expect((await read()).publishedContent![0].body).toBe(saved);
  await page.goto(`/docs/${itemId}`);
  const table = page.locator(".markdown-table table");
  await expect(table.locator("colgroup col")).toHaveCount(2);
  await expect(table.getByRole("cell", { name: /longer sentence/ })).toBeVisible();
  expect(await table.evaluate((node) => getComputedStyle(node).tableLayout)).toBe("fixed");
});

test("resizing the last column keeps earlier columns and their text layout", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("production"), "Editor geometry uses the installed app fixture.");
  const body = "A manager’s credibility comes from closing the loop.\n\n" +
    "| Question | Owner | Next update |\n| --- | --- | --- |\n" +
    "| Which team owns the account? | Sales leadership | Thursday |\n" +
    "| Does approval routing change? | Finance operations | Friday |";
  const { read } = await setup(page, true, body);
  const table = page.locator(".writing-content table");
  const snapshot = () => table.evaluate((node) => {
    const element = node as HTMLTableElement;
    const cells = Array.from(element.tBodies[0].rows[1].cells).filter((cell) => !cell.hasAttribute("data-tool-cell"));
    return {
      layout: getComputedStyle(element).tableLayout,
      widths: cells.map((cell) => cell.getBoundingClientRect().width),
      heights: cells.map((cell) => cell.getBoundingClientRect().height),
    };
  });
  const lastEdge = page.getByRole("separator", { name: "Resize column 3" });
  await lastEdge.scrollIntoViewIfNeeded();
  expect(await lastEdge.evaluate((node) => getComputedStyle(node).cursor)).toBe("grab");
  const before = await snapshot();
  const edge = await lastEdge.boundingBox();
  await page.mouse.move(edge!.x + edge!.width / 2, edge!.y + edge!.height / 2);
  await page.mouse.down();
  await expect(lastEdge).toHaveAttribute("data-resizing", "true");
  const shield = page.locator(".writing-table-drag-shield");
  await expect(shield).toBeVisible();
  expect(await shield.evaluate((node) => getComputedStyle(node).cursor)).toBe("grabbing");
  await page.mouse.move(edge!.x + edge!.width / 2 + 160, edge!.y + edge!.height / 2, { steps: 8 });
  await expect(shield).toBeVisible();
  expect(await shield.evaluate((node) => getComputedStyle(node).cursor)).toBe("grabbing");
  const during = await snapshot();
  await page.screenshot({ path: info.outputPath("table-resize-preview.png") });
  await page.mouse.up();
  await expect(shield).toHaveCount(0);
  expect(await lastEdge.evaluate((node) => getComputedStyle(node).cursor)).toBe("grab");
  await expect.poll(async () => (await read()).content[0].body).toContain("fieldbook-table-widths:v1");
  const after = await snapshot();
  for (const index of [0, 1]) {
    expect(during.widths[index]).toBeGreaterThanOrEqual(before.widths[index] - 1);
    expect(during.heights[index]).toBeLessThanOrEqual(before.heights[index] + 1);
    expect(after.widths[index]).toBeGreaterThanOrEqual(before.widths[index] - 1);
    expect(after.heights[index]).toBeLessThanOrEqual(before.heights[index] + 1);
  }
});

test("resizing beside a naturally wide column preserves that column", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("production"), "Editor geometry uses the installed app fixture.");
  const longWord = "W".repeat(240);
  const { read } = await setup(page, true,
    `| Label | Reference |\n| --- | --- |\n| A | ${longWord} |`);
  const table = page.locator(".writing-content table");
  const secondWidth = () => table.evaluate((node) =>
    (node as HTMLTableElement).tBodies[0].rows[1].cells[2].getBoundingClientRect().width);
  const before = await secondWidth();
  expect(before).toBeGreaterThan(640);
  const resize = page.getByRole("separator", { name: "Resize column 1" });
  await resize.focus();
  await resize.press("ArrowRight");
  await expect.poll(async () => (await read()).content[0].body).toContain("fieldbook-table-widths:v1");
  expect(await secondWidth()).toBeGreaterThanOrEqual(before - 1);
});

test("short tables keep their authored width and many columns scroll without widening the page", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("production"), "Reader layout uses the installed app fixture.");
  const many = Array.from({ length: 8 }, (_, index) => `Column ${index + 1}`);
  const longToken = "averylongunbrokentokenthatneedstowrapinsidethenarrowcolumn";
  const body = writeTableWidths(
    `| Label | Detail |\n| --- | --- |\n| Short | A longer paragraph of prose that wraps as the reading width changes. ${longToken} |\n\n` +
    `| ${many.join(" | ")} |\n| ${many.map(() => "---").join(" | ")} |\n| ${many.join(" | ")} |\n\n` +
    `| Legacy | Table |\n| --- | --- |\n| No saved widths | Stays natural |`,
    [[160, 240], many.map(() => 160), null],
  );
  const itemId = "00000000-0000-4000-8000-000000000098";
  await setup(page, true, body, "doc", itemId);
  await page.goto(`/docs/${itemId}`);
  const regions = page.locator(".markdown-table");
  await expect(regions).toHaveCount(3);
  const short = await regions.nth(0).evaluate((node) => ({
    area: node.clientWidth,
    table: node.querySelector("table")!.getBoundingClientRect().width,
    token: getComputedStyle(node.querySelector("td:last-child")!).overflowWrap,
  }));
  expect(short.table).toBeGreaterThanOrEqual(400 - 2);
  expect(short.table).toBeLessThanOrEqual(400 + 2);
  if (short.area > 402) expect(short.table).toBeLessThan(short.area);
  expect(short.token).toBe("anywhere");
  const wide = await regions.nth(1).evaluate((node) => ({ area: node.clientWidth, content: node.scrollWidth }));
  expect(wide.content).toBeGreaterThan(wide.area);
  const wideFade = regions.nth(1).locator("..");
  await expect(wideFade).toHaveAttribute("data-more-left", "false");
  await expect(wideFade).toHaveAttribute("data-more-right", "true");
  await regions.nth(1).evaluate((node) => { node.scrollLeft = node.scrollWidth; });
  await expect(wideFade).toHaveAttribute("data-more-left", "true");
  await expect(wideFade).toHaveAttribute("data-more-right", "false");
  await page.screenshot({ path: info.outputPath("reader-table-edge-fade.png") });
  const legacy = await regions.nth(2).evaluate((node) => ({
    area: node.clientWidth,
    table: node.querySelector("table")!.getBoundingClientRect().width,
  }));
  expect(legacy.table).toBeLessThan(500);
  if (info.project.name.endsWith("desktop")) expect(legacy.table).toBeLessThan(legacy.area);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(info.project.name.endsWith("phone") ? 375 : 1440);
});

test("formatting controls, keyboard save and responsive settings", async ({
  page,
}, info) => {
  const production = info.project.name.startsWith("production");
  const { read } = await setup(page, production, "A short update", "brief");
  const editor = page.getByRole("textbox", {
    name: "Update content",
    exact: true,
  });
  await editor.fill("Make this bold");
  await editor.press("ControlOrMeta+A");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(editor.locator("strong")).toHaveText("Make this bold");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(editor.locator("strong")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(editor.locator("strong")).toHaveText("Make this bold");
  await page.keyboard.press("Escape");
  await editor.press("ControlOrMeta+s");
  await waitForDraftSaved(page);
  expect((await read()).publishedContent![0].body).toBe("A short update");
  await openContentSettings(page);
  await expect(
    page.getByRole("heading", { name: "Assign", exact: true }),
  ).toBeVisible();
  await closeContentSettings(page);
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("writing-source-recovery.png"),
    fullPage: true,
  });
});

test("contextual headings, links and table cells serialize as reader-compatible Markdown", async ({
  page,
}, info) => {
  const { read } = await setup(
    page,
    info.project.name.startsWith("production"),
    "Write clearly",
  );
  const editor = page.getByRole("textbox", {
    name: "Doc content",
    exact: true,
  });
  await editor.click();
  await page.getByRole("button", { name: /^Commands:/ }).click();
  await page.getByRole("menuitem", { name: "Heading 2", exact: true }).click();
  await expect(editor.locator("h2")).toHaveText("Write clearly");
  await editor.locator("h2").evaluate((node) => {
    const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode()!;
    const range = document.createRange(); range.setStart(text, text.textContent!.length); range.collapse(true);
    const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  });
  await page.keyboard.press("ArrowRight");
  await editor.press("Enter");
  await page.keyboard.type("Reference");
  await expect(editor.locator("h2")).toHaveText("Write clearly");
  await editor.locator("p").last().evaluate((node) => {
    const range = document.createRange(); range.selectNodeContents(node);
    const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  });
  await page.getByRole("button", { name: "Link", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox")
    .first()
    .fill("https://example.com/reference");
  await dialog.getByRole("button", { name: "Set URL", exact: true }).click();
  await expect(editor.getByRole("link", { name: "Reference" })).toHaveAttribute(
    "href",
    "https://example.com/reference",
  );
  await editor.getByRole("link", { name: "Reference" }).evaluate((node) => {
    const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode()!;
    const range = document.createRange(); range.setStart(text, text.textContent!.length); range.collapse(true);
    const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  });
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  await page.keyboard.press("ArrowRight");
  await editor.press("Enter");
  await expect(editor.getByRole("link", { name: "Reference" })).toBeVisible();
  await page.getByRole("button", { name: /^Commands:/ }).click();
  await page.getByRole("menuitem", { name: "Table", exact: true }).click();
  const table = editor.getByRole("table");
  await table.getByRole("textbox").first().fill("Topic");
  await table.getByRole("textbox").nth(3).fill("Useful detail");
  await table.getByRole("textbox").nth(4).click();
  await waitForDraftSaved(page);
  const body = (await read()).content[0].body;
  expect(body).toContain("## Write clearly");
  expect(body).toContain("[Reference](https://example.com/reference)");
  expect(body).toContain("Useful detail");
  const preview = page.getByRole("textbox", { name: "Doc content", exact: true });
  await expect(
    preview.getByRole("heading", { name: "Write clearly" }),
  ).toBeVisible();
  await expect(
    preview.getByRole("cell", { name: "Useful detail" }),
  ).toBeVisible();
});

test("Update category filters, creates, normalizes and survives draft saves", async ({
  page,
}, info) => {
  const { read } = await setup(
    page,
    info.project.name.startsWith("production"),
    "Category example",
    "brief",
  );
  await openContentSettings(page);
  const input = page.getByRole("combobox", { name: "Category", exact: true });
  const existing = await input.inputValue();
  await input.fill(existing.toLowerCase());
  await expect(
    page.getByRole("option", { name: existing, exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("option", { name: /^Add/ })).toHaveCount(0);
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(input).toHaveValue(existing);
  await expect(input).toBeFocused();
  await input.fill("  Customer stories  ");
  await page
    .getByRole("option", { name: "Add “Customer stories”", exact: true })
    .click();
  await expect(input).toHaveValue("Customer stories");
  await expect
    .poll(async () => (await read()).content[0].category)
    .toBe("Customer stories");
  expect((await read()).publishedContent![0].category).toBe(existing);
  await page
    .getByRole("button", { name: "Show categories", exact: true })
    .click();
  await expect(
    page.getByRole("option", { name: "Customer stories", exact: true }),
  ).toBeVisible();
  await input.press("Escape");
  await expect(page.getByRole("listbox", { name: "Categories" })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Show categories", exact: true })
    .click();
  await expect(page.getByRole("listbox", { name: "Categories" })).toBeVisible();
  await page.screenshot({
    path: info.outputPath("category-dropdown.png"),
    fullPage: true,
  });
  await input.press("Tab");
  await expect(page.getByRole("listbox", { name: "Categories" })).toHaveCount(
    0,
  );
});

for (const kind of ["Doc", "Update"]) {
  test(`new ${kind} starts without a placement and saves an explicit choice`, async ({
    page,
  }, info) => {
    const { read } = await setup(
      page,
      info.project.name.startsWith("production"),
      "Existing content",
      kind === "Doc" ? "doc" : "brief",
    );
    await openContentSettings(page);
    if (kind === "Doc") {
      await expect(
        page.getByRole("button", {
          name: "Start here → Getting started",
          exact: true,
          pressed: true,
        }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole("combobox", { name: "Category", exact: true }),
      ).not.toHaveValue("");
    }
    await closeContentSettings(page);
    await returnToContent(page);
    await page.getByRole("button", { name: "Content", exact: true }).click();
    await page.getByRole("menuitem", { name: kind, exact: true }).click();
    await page.getByLabel("Title", { exact: true }).fill(`New ${kind}`);
    await openContentSettings(page);
    await page
      .getByRole("textbox", { name: "Short description", exact: true })
      .fill("A useful introduction.");
    await waitForDraftSaved(page);
    expect((await read()).content.find((item) => item.title === `New ${kind}`)?.category).toBe("");
    await openContentSettings(page);
    if (kind === "Doc") {
      await page.getByRole("button", { name: "Section", exact: true }).click();
      const search = page.getByRole("combobox", { name: "Search sections", exact: true });
      await expect(search).toBeVisible();
      await search.fill("Start here");
      await expect(
        page.getByRole("option", {
          name: "Start here / Getting started",
          exact: true,
        }),
      ).toBeVisible();
      await search.fill("");
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: "Create section", exact: true })
        .first()
        .click();
      await page
        .getByRole("textbox", { name: "New section name" })
        .fill("New organization name");
      await page.getByRole("combobox", { name: "Top-level parent" }).click();
      await page
        .getByRole("option", { name: "Start here", exact: true })
        .click();
      await page
        .locator(".doc-section-create")
        .getByRole("button", { name: "Create section" })
        .click();
      await expect(
        page.getByRole("button", {
          name: "Start here → New organization name",
          exact: true,
          pressed: true,
        }),
      ).toBeVisible();
    } else {
      const control = page.getByRole("combobox", {
        name: "Category",
        exact: true,
      });
      await expect(control).toBeVisible();
      await expect(control).toHaveValue("");
      await control.fill("New organization name");
      await page
        .getByRole("option", {
          name: "Add “New organization name”",
          exact: true,
        })
        .click();
    }
    await waitForDraftSaved(page);
    const saved = (await read()).content.find(
      (item) => item.title === `New ${kind}`,
    );
    expect(saved?.category).toBe(
      kind === "Doc" ? "Start here" : "New organization name",
    );
    if (kind === "Doc") {
      expect(saved?.sectionId).toBeTruthy();
      expect(saved?.folder).toBe("New organization name");
    }
    await closeContentSettings(page);
    await returnToContent(page);
    await page
      .getByRole("row")
      .filter({ hasText: `New ${kind}` })
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Title", exact: true }),
    ).toHaveValue(`New ${kind}`);
    await openContentSettings(page);
    if (kind === "Doc") {
      await expect(
        page.getByRole("button", {
          name: "Start here → New organization name",
          exact: true,
          pressed: true,
        }),
      ).toBeVisible();
    } else {
      await expect(
        page.getByRole("combobox", { name: "Category", exact: true }),
      ).toHaveValue("New organization name");
    }
    await page.screenshot({
      path: info.outputPath(`new-${kind.toLowerCase()}-section.png`),
      fullPage: true,
    });
  });
}

test("slash commands stay visible and normal inline slashes remain text", async ({
  page,
}, info) => {
  await setup(
    page,
    info.project.name.startsWith("production"),
    "First **bold** ending",
  );
  const editor = page.getByRole("textbox", {
    name: "Doc content",
    exact: true,
  });
  await expect(editor.locator("strong")).toBeVisible();
  // Place the caret at the start of a nested text node, in the middle of prose.
  await editor.locator("strong").evaluate((node) => {
    (node.closest("[contenteditable]") as HTMLElement).focus();
    const range = document.createRange();
    range.setStart(node.firstChild!, 0);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.press("/");
  await expect(page.getByRole("menu", { name: /Insert content/ })).toHaveCount(
    0,
  );
  await expect(editor).toHaveText("First /bold ending");

  await editor.press("ControlOrMeta+End");
  await editor.press("Enter");
  await page.keyboard.press("/");
  const menu = page.getByRole("menu", { name: /Insert content/ });
  await expect(menu).toBeVisible();
  const oldScroll = await page
    .locator(".main-content")
    .evaluate((node) => node.scrollTop);
  for (let index = 0; index < 12; index++)
    await page.keyboard.press("ArrowDown");
  const last = menu.getByRole("menuitem", {
    name: "Embed video link",
    exact: true,
  });
  await expect(last).toHaveAttribute("aria-current", "true");
  const options = await menu.locator(".writing-slash-options").boundingBox();
  const selected = await last.boundingBox();
  expect(selected!.y).toBeGreaterThanOrEqual(options!.y - 1);
  expect(selected!.y + selected!.height).toBeLessThanOrEqual(
    options!.y + options!.height + 1,
  );
  expect(
    await page.locator(".main-content").evaluate((node) => node.scrollTop),
  ).toBe(oldScroll);
  await page.screenshot({
    path: info.outputPath("writing-command-keyboard.png"),
  });
  await page.keyboard.type("hea");
  await page.keyboard.press("Tab");
  await expect(menu).toHaveCount(0);
  await expect(editor).not.toBeFocused();
  await expectMarkdown(page, /\/hea/);
});

test("pasting into an inserted list preserves nested lists through a draft save", async ({
  page,
}, info) => {
  const { read } = await setup(
    page,
    info.project.name.startsWith("production"),
    "- Parent point\n  - Nested point\n\nAfter the list",
  );
  const editor = page.getByRole("textbox", {
    name: "Doc content",
    exact: true,
  });
  await expect(editor.locator("ul ul li")).toContainText("Nested point");
  await editor
    .locator(":scope > p")
    .last()
    .evaluate((node) => {
      (node.closest("[contenteditable]") as HTMLElement).focus();
      const range = document.createRange();
      range.selectNodeContents(node);
      range.collapse(false);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    });
  await page.keyboard.press("Enter");
  await page.keyboard.type("/number");
  await page.keyboard.press("Enter");
  await editor.evaluate((node) => {
    const data = new DataTransfer();
    data.setData("text/plain", "Pasted customer context");
    node.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(editor.locator("ol li")).toHaveText("Pasted customer context");
  await expect(editor.locator("ul ul li")).toContainText("Nested point");
  await waitForDraftSaved(page);
  const saved = (await read()).content[0].body;
  expect(saved).toContain("Nested point");
  expect(saved).toMatch(/1\. Pasted customer context/);
  const preview = page.getByRole("textbox", { name: "Doc content", exact: true });
  await expect(preview.locator("ul ul li")).toHaveText("Nested point");
  await expect(preview.locator("ol li")).toHaveText("Pasted customer context");
});

test("inline Details closes with Escape and enlarged text leaves the canvas reachable", async ({
  page,
}, info) => {
  await setup(page, info.project.name.startsWith("production"));
  await page
    .getByRole("textbox", { name: "Title", exact: true })
    .fill(
      "Customer launch readiness and practical product guidance for enterprise teams",
    );
  const settings = page.getByRole("button", { name: /^Details/ });
  const panel = await openContentSettings(page);
  await panel.getByRole("textbox", { name: "Short description", exact: true }).focus();
  await expect(panel.getByRole("textbox", { name: "Short description", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(settings).toBeFocused();
  await page
    .getByRole("textbox", { name: "Title", exact: true })
    .fill(
      "Customer launch readiness and practical product guidance for everyone working with enterprise customers and the teams responsible for successful customer outcomes",
    );
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const writing = page.getByRole("textbox", {
    name: "Doc content",
    exact: true,
  });
  await writing.locator("p").first().scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      writing.evaluate((node) => {
        const canvas = node.querySelector("p")!.getBoundingClientRect();
        const header = document
          .querySelector(".topbar")!
          .getBoundingClientRect();
        const main = document
          .querySelector(".main-content")!
          .getBoundingClientRect();
        return (
          canvas.top < main.bottom &&
          canvas.bottom > main.top &&
          (header.bottom <= canvas.top || header.top >= canvas.bottom)
        );
      }),
    )
    .toBe(true);
  await writing.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" Reachable canvas.");
  await expect(writing).toContainText("Reachable canvas.");
  const formatting = page.getByRole("group", { name: "Writing actions", exact: true });
  await expect.poll(() => formatting.evaluate((node) => {
    const boundary = node.closest(".writing-editor")!.getBoundingClientRect();
    return [...node.querySelectorAll("button")].filter((button) => {
      const box = button.getBoundingClientRect();
      return box.width > 0 && (box.left < boundary.left || box.right > boundary.right);
    }).map((button) => button.getAttribute("aria-label") || button.textContent);
  })).toEqual([]);
  await openContentSettings(page);
  const summary = panel.getByRole("textbox", { name: "Short description", exact: true });
  await summary.scrollIntoViewIfNeeded();
  await expect(summary).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({
    path: info.outputPath("editor-large-text-reachable.png"),
  });
});

test("Escape dismisses slash and toolbar commands from canvas or popup focus", async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"), "");
  const editor = page.getByRole("textbox", { name: "Doc content", exact: true });
  const menu = page.getByRole("menu", { name: /^Insert content/ });
  const commands = page.getByRole("button", { name: /^Commands:/ });
  await editor.click();
  await page.keyboard.type("/hea");
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(editor).toBeFocused();
  await expectMarkdown(page, "/hea");
  await editor.press("ControlOrMeta+A");
  await editor.press("Backspace");
  await expect(editor).toHaveText("");
  await page.keyboard.type("/h3");
  await menu.getByRole("menuitem", { name: "Close menu esc" }).focus();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(editor).toBeFocused();
  await expectMarkdown(page, "/h3");
  if (await page.locator(".editor-frame").getAttribute("data-cards") !== "true") {
    await expect(commands).toBeHidden();
    return;
  }
  await editor.click();
  await expect(commands).toBeEnabled();
  await commands.focus();
  await page.keyboard.press("Enter");
  await expect(menu.getByRole("menuitem", { name: "Normal Text", exact: true })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(menu.getByRole("menuitem", { name: "Heading 1", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(editor).toBeFocused();
});

test("Heading 1–4 commands and selected-text Normal Text preserve authored content", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await setup(page, info.project.name.startsWith("production"), "");
  const editor = page.getByRole("textbox", { name: "Doc content", exact: true });
  for (const level of [1, 2, 3, 4]) {
    await editor.click();
    await page.keyboard.type(`/h${level}`);
    await page.keyboard.press("Enter");
    await page.keyboard.type(`Heading level ${level}`);
    await expect(editor.locator(`h${level}`)).toHaveText(`Heading level ${level}`);
    await editor.press("ControlOrMeta+A");
    const tools = page.getByRole("dialog", { name: "Format selected text", exact: true });
    await tools.getByRole("button", { name: `Heading ${level}`, exact: true }).click();
    await page.getByRole("menuitem", { name: "Normal Text", exact: true }).click();
    await expect(editor.locator("p").first()).toHaveText(`Heading level ${level}`);
    await expectMarkdown(page, `Heading level ${level}`);
    await replaceWritingText(page, "");
  }
  expect(errors).toEqual([]);
});

test("selected-text formatting preserves surrounding text and adjacent list items", async ({ page }, info) => {
  const { read } = await setup(page, info.project.name.startsWith("production"), "Keep this text plain\n\n- First item\n- Selected item\n- Third item");
  const editor = page.getByRole("textbox", { name: "Doc content", exact: true });
  await editor.locator("p").first().evaluate((node) => {
    (node.closest("[contenteditable]") as HTMLElement).focus();
    const range = document.createRange();
    const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode()!;
    range.setStart(text, 5);
    range.setEnd(text, 14);
    const selection = getSelection()!;
    selection.removeAllRanges(); selection.addRange(range);
  });
  const tools = page.getByRole("dialog", { name: "Format selected text", exact: true });
  await tools.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(editor.locator("strong")).toHaveText("this text");
  await expect(editor.locator("p").first()).toHaveText("Keep this text plain");
  await page.keyboard.press("Escape");
  await editor.locator("li").nth(1).evaluate((node) => {
    (node.closest("[contenteditable]") as HTMLElement).focus();
    const range = document.createRange(); range.selectNodeContents(node);
    const selection = getSelection()!;
    selection.removeAllRanges(); selection.addRange(range);
  });
  await tools.getByRole("button", { name: "Bulleted list", exact: true }).click();
  await page.getByRole("menuitem", { name: "Normal Text", exact: true }).click();
  await expect(editor.locator("p").filter({ hasText: "Selected item" })).toBeVisible();
  await expect(editor.locator("li")).toHaveText(["First item", "Third item"]);
  await waitForDraftSaved(page);
  expect((await read()).content[0].body).toContain("Keep **this text** plain");
  expect((await read()).content[0].body).toMatch(/[*-] First item/);
  expect((await read()).content[0].body).toMatch(/[*-] Third item/);
});

test("long writing uses a stationary desktop frame and reachable natural page fallback", async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"), Array.from({ length: 55 }, (_, index) => `Paragraph ${index + 1}. Practical context that keeps growing as the author writes.`).join("\n\n"));
  const editor = page.getByRole("textbox", { name: "Doc content", exact: true });
  await editor.locator("p").first().click();
  const body = page.locator('.writing-viewport[data-state="active"]');
  const surface = page.locator(".writing-editor.writing-surface");
  const bounded = await page.locator(".editor").getAttribute("data-scroll-layout") === "workspace";
  if (!bounded) {
    const main = page.locator(".main-content");
    await expect.poll(() => main.evaluate((node) => node.scrollHeight - node.clientHeight)).toBeGreaterThan(100);
    await page.mouse.wheel(0, 900);
    await expect.poll(() => main.evaluate((node) => node.scrollTop)).toBeGreaterThan(50);
    await editor.locator("p").last().click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(" Final caret remains visible.");
    await expect(editor).toContainText("Final caret remains visible.");
    expect((await downloadMarkdown(page)).body).toContain("Final caret remains visible.");
    await page.screenshot({ path: info.outputPath("editor-natural-page.png") });
    return;
  }
  const before = await surface.boundingBox();
  await body.hover();
  await page.mouse.wheel(0, 900);
  await expect.poll(() => body.evaluate((node) => node.scrollTop)).toBeGreaterThan(50);
  await expect(body).toHaveAttribute("data-scroll-fade-before", "true");
  const after = await surface.boundingBox();
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(2);
  expect(Math.abs(after!.height - before!.height)).toBeLessThan(2);
  const header = await page.locator(".editor-frame-controls").boundingBox();
  expect(after!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  expect(after!.y + after!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await expect(page.getByRole("button", { name: "Back to content", exact: true })).toBeInViewport();
  await expect(page.getByRole("button", { name: /^Commands:/ })).toBeHidden();
  await expect(page.getByRole("button", { name: "More editor actions", exact: true })).toHaveCount(0);
  expect(await surface.evaluate((node) => getComputedStyle(node).borderBottomLeftRadius)).toBe("0px");
  await editor.press("ControlOrMeta+End");
  await page.keyboard.type(" Final caret remains visible.");
  await expect(editor).toContainText("Final caret remains visible.");
  await expect.poll(() => editor.evaluate(() => {
    const selection = getSelection();
    const rect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
    const viewport = document.querySelector('.writing-viewport[data-state="active"]')!.getBoundingClientRect();
    return !!rect && rect.top >= viewport.top && rect.bottom <= viewport.bottom;
  })).toBe(true);
  await page.screenshot({ path: info.outputPath("editor-pinned-frame.png") });
});


test("scroll and pointer dismissal preserve pending slash text at its original line", async ({ page }, info) => {
  await setup(page, info.project.name.startsWith("production"), "\n\n" + Array.from({ length: 40 }, (_, i) => `Existing paragraph ${i + 1}.`).join("\n\n"));
  const editor = page.getByRole("textbox", { name: "Doc content", exact: true });
  const menu = page.getByRole("menu", { name: /^Insert content/ });
  await editor.locator("p").first().click();
  await editor.locator("p").first().evaluate((node) => {
    (node.closest("[contenteditable]") as HTMLElement).focus();
    const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode()!;
    const range = document.createRange(); range.setStart(text, 0); range.collapse(true);
    const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  });
  await page.keyboard.type("/h3");
  await expect(menu).toBeVisible();
  const body = await page.locator(".editor").getAttribute("data-scroll-layout") === "workspace"
    ? page.locator('.writing-viewport[data-state="active"]') : page.locator(".main-content");
  await body.evaluate((node) => { node.scrollTop = 700; });
  await expect(menu).toHaveCount(0);
  await expect.poll(() => body.evaluate((node) => node.scrollTop)).toBeGreaterThan(500);
  await expectMarkdown(page, /^\/h3Existing paragraph 1/);
  await replaceWritingText(page, "First line\n\nLast line");
  await editor.locator("p").first().click();
  await editor.locator("p").first().evaluate((node) => {
    (node.closest("[contenteditable]") as HTMLElement).focus();
    const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT).nextNode()!;
    const range = document.createRange(); range.setStart(text, 0); range.collapse(true);
    const selection = getSelection()!; selection.removeAllRanges(); selection.addRange(range);
  });
  await page.keyboard.type("/hea");
  await expect(menu).toBeVisible();
  await page.getByRole("textbox", { name: "Title", exact: true }).click();
  await expect(menu).toHaveCount(0);
  await expectMarkdown(page, "/heaFirst line\n\nLast line");
});
