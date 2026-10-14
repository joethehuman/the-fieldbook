import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import { setupAuthoringProvider } from "./provider-fixture";
import { downloadMarkdown, waitForDraftSaved } from "./editor-helpers";
import {
  importMarkdownDocument,
  exportBlockMarkdown,
} from "../../lib/block-document";
import type { Content } from "../../lib/types";

const id = "00000000-0000-4000-8000-000000000011";
const source =
  '## Start here\n\nKeep **important** text.\n\n- First\n  - Nested\n\n> A reminder.\n\n| Topic | Detail |\n| --- | --- |\n| Product | Customer |\n\n```js\nconst message = "hello";\n```';
const gripTable =
  "| One | Two | Three |\n| --- | --- | --- |\n| A | B | C |\n| D | E | F |\n| G | H | I |";
async function setup(
  page: Page,
  production: boolean,
  kind: Content["kind"] = "doc",
  body = source,
  structured = false,
) {
  const workspace = withPublishedSnapshots(freshWorkspace());
  const existing = workspace.content.find((c) => c.kind === kind)!;
  const doc = importMarkdownDocument(body);
  const item: Content = {
    ...existing,
    id,
    title: "BlockNote fixture",
    body: structured ? exportBlockMarkdown(doc) : body,
    ...(structured ? { bodyDocument: doc } : {}),
    revision: 1,
    publishedRevision: 1,
    ...(kind === "course"
      ? {
          lessons: [
            {
              id: "lesson-one",
              title: "First lesson",
              body: structured ? exportBlockMarkdown(doc) : body,
              ...(structured ? { bodyDocument: doc } : {}),
            },
          ],
          questions: [],
        }
      : {}),
  };
  workspace.content = [item];
  workspace.publishedContent = [structuredClone(item)];
  if (production) await setupAuthoringProvider(page, workspace);
  else
    await page.addInitScript((data) => {
      if (!localStorage.getItem("fieldbook.workspace.v1"))
        localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    }, workspace);
  await page.goto(production ? `/admin/content/${id}/edit` : "/#admin");
  if (!production)
    await page.getByRole("link", { name: item.title, exact: true }).click();
  const label =
    kind === "course"
      ? "Lesson content"
      : kind === "doc"
        ? "Doc content"
        : "Update content";
  const editor = page.getByRole("textbox", { name: label, exact: true });
  await expect(editor).toBeVisible();
  const read = async (): Promise<Content> =>
    production
      ? await (
          await page.request.get(`/api/content?id=${id}&draft=true`)
        ).json()
      : page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!)
              .content[0],
        );
  return { editor, read };
}

for (const level of [1, 2, 3]) {
  test(`native collapsible heading ${level} keeps its empty and typed line stable`, async ({
    page,
  }, info) => {
    const { editor, read } = await setup(
      page,
      info.project.name.startsWith("production"),
      "doc",
      "Last paragraph.",
      true,
    );
    await editor.locator(".bn-trailing-block").click();
    await page.keyboard.type(`/collapsible heading ${level}`);
    await page
      .getByRole("option", { name: new RegExp(`^Collapsible heading ${level} `) })
      .click();
    const heading = editor.locator(
      '.bn-toggle-slot > [data-content-type="heading"]',
    );
    // Insertion animates the native paragraph-to-heading font size. Measure
    // the settled heading, not an intermediate frame of that transition.
    await waitForDraftSaved(page);
    await heading.evaluate(async (element) => {
      await document.fonts.ready;
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
    const measure = () =>
      heading.evaluate((element) => {
        const inline = element.querySelector(".bn-inline-content")!;
        const content = getComputedStyle(element);
        const text = getComputedStyle(inline);
        return {
          height: element.getBoundingClientRect().height,
          inlineHeight: inline.getBoundingClientRect().height,
          font: text.fontSize,
          placeholderFont: getComputedStyle(element, "::after").fontSize,
          lineHeight: text.lineHeight,
          contentLineHeight: content.lineHeight,
        };
      });
    const empty = await measure();
    expect(empty.font).toBe(empty.placeholderFont);
    expect(empty.lineHeight).toBe(empty.contentLineHeight);
    await page.keyboard.type("a");
    const typed = await measure();
    expect(Math.abs(typed.height - empty.height)).toBeLessThan(1);
    expect(Math.abs(typed.inlineHeight - empty.inlineHeight)).toBeLessThan(1);
    await page.keyboard.press("Backspace");
    expect(Math.abs((await measure()).height - empty.height)).toBeLessThan(1);
    await page.keyboard.type("Optional detail");
    const toggle = editor
      .locator(".bn-toggle-frame")
      .getByRole("button", { name: "Expand or collapse", exact: true });
    await toggle.click();
    await page.keyboard.press("Enter");
    await page.keyboard.type("Child content.");
    await expect(editor.getByText("Child content.", { exact: true })).toBeVisible();
    await toggle.click();
    await expect(editor.getByText("Child content.", { exact: true })).toBeHidden();
    await waitForDraftSaved(page);
    const saved = (await read()).bodyDocument!.blocks.find(
      (block) => block.type === "heading",
    )!;
    expect(saved.props).toMatchObject({ level, isToggleable: true });
    expect(saved.children).toHaveLength(1);
    await page.reload();
    await expect(heading).toHaveText("Optional detail");
  });
}

for (const [ending, body] of Object.entries({
  paragraph: "Last paragraph.",
  table: "| Name | Value |\n| --- | --- |\n| Last | Cell |",
  code: "```text\nlast_code_line\n```",
})) {
  test(`native trailing placeholder adds a stable paragraph after ${ending}`, async ({
    page,
  }, info) => {
    const { editor, read } = await setup(
      page,
      info.project.name.startsWith("production"),
      "doc",
      body,
      true,
    );
    const original = (await read()).bodyDocument!.blocks;
    const widget = editor.locator(".bn-trailing-block");
    await expect(widget).toBeVisible();
    const geometry = await widget.evaluate((element) => {
      const area = element.closest(".bn-editor")!;
      const rect = element.getBoundingClientRect();
      return {
        height: rect.height,
        padding: getComputedStyle(area).paddingBottom,
        gap: area.getBoundingClientRect().bottom - rect.bottom,
      };
    });
    expect(geometry.height).toBeCloseTo(30, 0);
    expect(geometry.padding).toBe("0px");
    expect(Math.abs(geometry.gap)).toBeLessThan(1);
    // Space outside the native editor is workspace layout, not a false line.
    const rect = await widget.boundingBox();
    const point = { x: rect!.x + 80, y: rect!.y + rect!.height + 16 };
    expect(
      await page.evaluate(
        ({ x, y }) => !!document.elementFromPoint(x, y)?.closest(".bn-editor"),
        point,
      ),
    ).toBe(false);
    await page.mouse.click(point.x, point.y);
    expect((await read()).bodyDocument!.blocks).toEqual(original);

    await widget.click();
    await expect
      .poll(async () => (await read()).bodyDocument!.blocks.length)
      .toBe(original.length + 1);
    await expect
      .poll(() =>
        editor.evaluate(() => {
          const node = window.getSelection()?.anchorNode;
          const element =
            node?.nodeType === 1 ? (node as Element) : node?.parentElement;
          return element
            ?.closest("[data-content-type]")
            ?.getAttribute("data-content-type");
        }),
      )
      .toBe("paragraph");
    await page.keyboard.type("Next line.");
    await waitForDraftSaved(page);
    await expect.poll(async () => (await read()).body).toContain("Next line.");
    // BlockNote fills its default props on the first edit; authored values
    // and the original block's identity and content must be retained.
    expect((await read()).bodyDocument!.blocks[0]).toMatchObject(original[0]);
    await page.reload();
    await expect(
      editor.locator('[data-content-type="paragraph"]').last(),
    ).toHaveText("Next line.");
    await expect(widget).toBeVisible();
  });
}

test("media commands share the native file panel and persist their URLs", async ({
  page,
}, info) => {
  const { editor, read } = await setup(
    page,
    info.project.name.startsWith("production"),
    "doc",
    "Media fixture.",
    true,
  );
  await page.route("https://media.example.test/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.route(
    /https:\/\/(?:www\.youtube-nocookie\.com|i\.ytimg\.com)\//,
    (route) => route.fulfill({ status: 200, body: "" }),
  );
  for (const media of [
    {
      command: "Image",
      type: "image",
      action: "Embed image",
      url: "https://media.example.test/image.png",
    },
    {
      command: "Upload video",
      type: "video",
      action: "Embed video",
      url: "https://media.example.test/video.mp4",
    },
    {
      command: "Embed video link",
      type: "videoEmbed",
      action: "Embed video",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    },
  ]) {
    await editor.locator('[data-content-type="paragraph"]').last().click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/");
    await page
      .getByRole("option", {
        name: new RegExp("^" + media.command + "(?: |$)"),
      })
      .click();
    const panel = page.locator(".bn-panel");
    await expect(panel).toHaveCount(1);
    await expect(panel).toBeVisible();
    const embedTab = panel.getByRole("tab", { name: "Embed", exact: true });
    if (await embedTab.isVisible()) await embedTab.click();
    await expect(
      panel.getByRole("textbox", { name: "Enter URL", exact: true }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: media.action, exact: true }),
    ).toHaveCount(1);
    // Demo has one Embed tab; the native two-tab control remains for real uploads.
    if (info.project.name.startsWith("demo"))
      await expect(panel.getByRole("tablist")).toBeHidden();
    await panel
      .getByRole("textbox", { name: "Enter URL", exact: true })
      .fill(media.url);
    await panel
      .getByRole("button", { name: media.action, exact: true })
      .click();
    await expect(panel).toBeHidden();
    await waitForDraftSaved(page);
    await expect
      .poll(async () =>
        (await read()).bodyDocument?.blocks.some(
          (block) => block.type === media.type && block.props.url === media.url,
        ),
      )
      .toBe(true);
    expect((await read()).body).toContain(media.url);
    await page.reload();
    await expect(
      editor.locator(`[data-content-type="${media.type}"]`),
    ).toBeVisible();
  }
  await expect(
    editor.getByRole("textbox", { name: "Video URL", exact: true }),
  ).toHaveCount(0);
});

test("table grips wait for a completed click and retain keyboard and touch activation", async ({
  page,
}, info) => {
  const touch = info.project.use.hasTouch === true;
  const { editor, read } = await setup(
    page,
    info.project.name.startsWith("production"),
    "doc",
    gripTable,
    true,
  );
  const before = (await read()).body;
  const cell = editor.getByRole("columnheader", { name: "One", exact: true });
  for (const orientation of ["Row", "Column"]) {
    await cell.hover();
    const grip = page.getByRole("button", {
      name: `${orientation} actions`,
      exact: true,
    });
    await expect(grip).toBeVisible();
    const box = (await grip.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect(page.getByRole("menu")).toBeHidden();
    await page.mouse.up();
    await expect(
      page.getByRole("menuitem", {
        name: `Delete ${orientation.toLowerCase()}`,
        exact: true,
      }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(editor).toBeFocused();
    for (const key of ["Enter", "Space"]) {
      await cell.hover();
      await grip.focus();
      await page.keyboard.press(key);
      await expect(page.getByRole("menu")).toBeVisible();
      await page.keyboard.press("Escape");
    }
    if (touch) {
      await cell.hover();
      await grip.tap();
      await expect(page.getByRole("menu")).toBeVisible();
      await page.keyboard.press("Escape");
    }
  }
  expect((await read()).body).toBe(before);
});

for (const orientation of ["row", "column"] as const) {
  test(`table grips preserve native ${orientation} dragging without opening a menu`, async ({
    page,
  }, info) => {
    test.skip(
      info.project.use.hasTouch === true,
      "HTML drag-and-drop is checked with a desktop pointer; touch taps are covered separately.",
    );
    const { editor, read } = await setup(
      page,
      info.project.name.startsWith("production"),
      "doc",
      gripTable,
      true,
    );
    const table = editor.getByRole("table");
    const origin =
      orientation === "row"
        ? table.getByRole("cell", { name: "A", exact: true })
        : table.getByRole("columnheader", { name: "One", exact: true });
    await origin.hover();
    const grip = page.getByRole("button", {
      name: orientation === "row" ? "Row actions" : "Column actions",
      exact: true,
    });
    const start = (await grip.boundingBox())!;
    const target = await (
      orientation === "row"
        ? table.getByRole("cell", { name: "G", exact: true })
        : table.getByRole("columnheader", { name: "Three", exact: true })
    ).boundingBox();
    await page.mouse.move(
      start.x + start.width / 2,
      start.y + start.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      start.x + start.width / 2 + 12,
      start.y + start.height / 2 + 12,
      { steps: 5 },
    );
    await expect(page.locator(".bn-table-handle-dragging")).toBeVisible();
    await expect(page.getByRole("menu")).toBeHidden();
    await page.mouse.move(
      target!.x + target!.width / 2,
      target!.y + target!.height / 2,
      { steps: 10 },
    );
    await page.mouse.up();
    await expect(page.getByRole("menu")).toBeHidden();
    if (orientation === "row")
      await expect
        .poll(async () =>
          (await table.getByRole("row").allTextContents()).map((text) =>
            text.replace(/\s/g, ""),
          ),
        )
        .toEqual(["OneTwoThree", "DEF", "GHI", "ABC"]);
    else
      await expect
        .poll(async () =>
          (await table.getByRole("columnheader").allTextContents()).map(
            (text) => text.trim(),
          ),
        )
        .toEqual(["Two", "Three", "One"]);
    await waitForDraftSaved(page);
    const saved = (await read()).body;
    await page.reload();
    await expect(editor).toBeVisible();
    expect((await read()).body).toBe(saved);
    await table.getByRole("columnheader").first().hover();
    await page
      .getByRole("button", { name: "Column actions", exact: true })
      .click();
    await expect(
      page.getByRole("menuitem", { name: "Delete column", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("table-grip-menu.png"),
      fullPage: false,
    });
    await page.keyboard.press("Escape");
    const rowsBeforeCancel = await table.getByRole("row").allTextContents();
    await origin.hover();
    const cancelStart = (await grip.boundingBox())!;
    await page.mouse.move(
      cancelStart.x + cancelStart.width / 2,
      cancelStart.y + cancelStart.height / 2,
    );
    await page.mouse.down();
    await page.mouse.move(
      cancelStart.x + cancelStart.width / 2 + 12,
      cancelStart.y + cancelStart.height / 2 + 12,
      { steps: 5 },
    );
    await expect(page.locator(".bn-table-handle-dragging")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.mouse.up();
    await expect(page.getByRole("menu")).toBeHidden();
    expect(await table.getByRole("row").allTextContents()).toEqual(
      rowsBeforeCancel,
    );
    await origin.hover();
    await grip.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("menuitem", {
        name: `Delete ${orientation}`,
        exact: true,
      }),
    ).toBeVisible();
  });
}
for (const kind of ["doc", "brief", "course"] as const) {
  test(`${kind}: legacy source stays unchanged on open, then blocks persist through save and reload`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const { editor, read } = await setup(
      page,
      info.project.name.startsWith("production"),
      kind,
    );
    const opened = await read();
    const before = kind === "course" ? opened.lessons[0] : opened;
    expect(before.body).toBe(source);
    expect(before.bodyDocument).toBeUndefined();
    await editor.locator('[data-content-type="paragraph"]').first().click();
    await page.keyboard.press("Home");
    await page.keyboard.type("Saved with blocks. ");
    await waitForDraftSaved(page);
    const saved = await read();
    const draft = kind === "course" ? saved.lessons[0] : saved;
    expect(draft.bodyDocument?.format).toBe("fieldbook-blocks");
    expect(draft.bodyDocument?.version).toBe(1);
    expect(draft.body).toContain("Saved with blocks.");
    expect(draft.body).toContain("Nested");
    const blocks = JSON.stringify(draft.bodyDocument);
    await page.reload();
    await expect(editor).toContainText("Saved with blocks.");
    const reopened = await read();
    expect(
      JSON.stringify(
        (kind === "course" ? reopened.lessons[0] : reopened).bodyDocument,
      ),
    ).toBe(blocks);
    const exported = await downloadMarkdown(page);
    expect(exported.body).toContain("Saved with blocks.");
    expect(exported.body).toContain("```js");
    expect(errors).toEqual([]);
    await page.screenshot({
      path: info.outputPath(`blocknote-${kind}.png`),
      fullPage: false,
    });
  });
  test(`${kind}: command menu retains all existing document and media commands`, async ({
    page,
  }, info) => {
    const { editor } = await setup(
      page,
      info.project.name.startsWith("production"),
      kind,
      "A paragraph.",
    );
    await editor.locator('[data-content-type="paragraph"]').first().click();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await page.keyboard.type("/");
    const menu = page.getByRole("listbox");
    await expect(menu).toBeVisible();
    for (const name of [
      "Normal Text",
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Heading 4",
      "Bulleted list",
      "Numbered list",
      "Checklist",
      "Collapsible list",
      "Collapsible heading 1",
      "Collapsible heading 2",
      "Collapsible heading 3",
      "Callout",
      "Table",
      "Code block",
      "Divider",
      "Image",
      "Upload video",
      "Embed video link",
    ])
      await expect(
        menu.getByRole("option", { name: new RegExp("^" + name + "(?: |$)") }),
      ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("commands.png"),
      fullPage: false,
    });
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
  });
}
test("structured tables, code and video can be edited and exported without a second source of truth", async ({
  page,
}, info) => {
  const { editor, read } = await setup(
    page,
    info.project.name.startsWith("production"),
    "doc",
    source + "\n\n[Video](https://www.youtube.com/watch?v=dQw4w9WgXcQ)",
    true,
  );
  const cell = editor.getByRole("cell", { name: "Customer", exact: true });
  await cell.locator("p").dblclick({ position: { x: 8, y: 14 } });
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toBe("Customer");
  await page.keyboard.type("Customer value");
  await expect(
    editor.getByRole("cell", { name: "Customer value", exact: true }),
  ).toBeVisible();
  await waitForDraftSaved(page);
  expect((await read()).body).toContain("Customer value");
  const exported = await downloadMarkdown(page);
  expect(exported.body).toContain("Customer value");
  expect(exported.body).toContain("dQw4w9WgXcQ");
  await page.reload();
  await expect(
    editor.getByRole("cell", { name: "Customer value", exact: true }),
  ).toBeVisible();
});
test("unsupported legacy Markdown retains source recovery without saving away content", async ({
  page,
}, info) => {
  const production = info.project.name.startsWith("production");
  const workspace = withPublishedSnapshots(freshWorkspace());
  const source = workspace.content.find((c) => c.kind === "doc")!;
  const body = "A footnote[^one].\n\n[^one]: Preserve these details.";
  const item = {
    ...source,
    id,
    title: "Unsupported fixture",
    body,
    revision: 1,
    publishedRevision: 1,
  };
  workspace.content = [item];
  workspace.publishedContent = [structuredClone(item)];
  if (production) await setupAuthoringProvider(page, workspace);
  else
    await page.addInitScript((data) => {
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    }, workspace);
  await page.goto(production ? `/admin/content/${id}/edit` : "/#admin");
  if (!production)
    await page.getByRole("link", { name: item.title, exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Doc content Markdown", exact: true }),
  ).toHaveValue(body);
  expect((await downloadMarkdown(page)).body).toBe(body);
});

test("checklists and collapsible blocks persist and export all nested text", async ({
  page,
}, info) => {
  const { editor, read } = await setup(
    page,
    info.project.name.startsWith("production"),
    "doc",
    "Start.",
  );
  await editor.locator('[data-content-type="paragraph"]').first().click();
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/check");
  await page.getByRole("option", { name: /^Checklist(?: |$)/ }).click();
  await page.keyboard.type("Review the course");
  await waitForDraftSaved(page);
  await editor.locator('[data-content-type="checkListItem"] input').check();
  await waitForDraftSaved(page);
  const checklistText = editor.locator(
    '[data-content-type="checkListItem"] .bn-inline-content',
  );
  const checklistBounds = (await checklistText.boundingBox())!;
  await checklistText.click({
    position: { x: checklistBounds.width - 2, y: checklistBounds.height / 2 },
  });
  await page.keyboard.press("End");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/collapsible list");
  await page.getByRole("option", { name: /^Collapsible list(?: |$)/ }).click();
  await page.keyboard.type("More details");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type("Nested explanation");
  await waitForDraftSaved(page);
  const saved = await read();
  expect(
    saved.bodyDocument?.blocks.some(
      (b) => b.type === "checkListItem" && b.props.checked,
    ),
  ).toBe(true);
  expect(
    saved.bodyDocument?.blocks.some((b) => b.type === "toggleListItem"),
  ).toBe(true);
  expect(saved.body).toContain("- [x] Review the course");
  expect(saved.body).toContain("Nested explanation");
  await page.reload();
  await expect(editor).toContainText("More details");
  expect((await downloadMarkdown(page)).body).toContain("Nested explanation");
});
test("native code block and language select preserve editing and saved formatting", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { editor, read } = await setup(
    page,
    info.project.name.startsWith("production"),
    "doc",
    "Intro.\n\n```text\nconst value = 1;\n```",
    true,
  );
  const code = editor.locator('[data-content-type="codeBlock"]');
  const source = code.locator("pre code");
  const picker = code.getByRole("combobox", { name: "Code language" });
  const geometry = await code.evaluate((element) => {
    const header = element
      .querySelector("select")!
      .parentElement!.getBoundingClientRect();
    const pre = element.querySelector("pre")!.getBoundingClientRect();
    const style = getComputedStyle(element.querySelector("pre code")!);
    return {
      headerBottom: header.bottom,
      codeTop: pre.top,
      color: style.color,
      background: getComputedStyle(element).backgroundColor,
    };
  });
  expect(geometry.headerBottom).toBeLessThanOrEqual(geometry.codeTop);
  expect(geometry.color).not.toBe("rgb(255, 255, 255)");
  expect(geometry.background).not.toBe("rgb(22, 22, 22)");
  await source.click({ position: { x: 3, y: 8 } });
  for (const _ of "const value = 1;") await page.keyboard.press("ArrowRight");
  await page.keyboard.type(" // edited");
  await expect(source).toContainText("const value = 1; // edited");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await page.keyboard.type('print("done")');
  await expect(source).toContainText('print("done")');
  await source.dblclick();
  await expect(page.getByRole("listbox")).toHaveCount(0);

  await picker.selectOption("python");
  await expect(picker).toHaveValue("python");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(source).toContainText('print("done")');
  await source.click({ position: { x: 3, y: 8 } });
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.isCollapsed))
    .toBe(true);
  await page.keyboard.type("X");
  await waitForDraftSaved(page);
  await expect
    .poll(async () => (await read()).body.replace("X", ""))
    .toContain('```python\nconst value = 1; // edited\n  print("done")\n```');
  await expect(source.locator(".shiki").first()).toBeVisible();
  const palette = await source
    .locator(".shiki")
    .first()
    .evaluate((token) => {
      const style = getComputedStyle(token);
      return {
        color: style.color,
        light: style.getPropertyValue("--shiki-light").trim(),
      };
    });
  expect(palette.light).not.toBe("");
  expect(palette.color).not.toBe("rgb(255, 255, 255)");
  await page.reload();
  await expect(picker).toHaveValue("python");
  await expect(source).toContainText('print("done")');
  expect((await downloadMarkdown(page)).body).toContain("```python\n");
  expect(errors).toEqual([]);
});

test("native code language menu opens without moving a scrolled canvas", async ({
  page,
}, info) => {
  const { editor } = await setup(
    page,
    info.project.name.startsWith("production"),
    "doc",
    Array.from(
      { length: 24 },
      (_, i) =>
        `Paragraph ${i + 1}. Keep the code block below the initial viewport.`,
    ).join("\n\n") + "\n\n```text\nexample_code\n```",
    true,
  );
  const code = editor.locator('[data-content-type="codeBlock"]');
  const picker = code.getByRole("combobox", { name: "Code language" });
  await picker.scrollIntoViewIfNeeded();
  await code.locator("pre code").click({ position: { x: 3, y: 8 } });
  const measure = () =>
    code.evaluate(async (element) => {
      await new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      );
      return {
        page: scrollY,
        main: element.closest(".main-content")!.scrollTop,
        canvas: element.closest(".writing-viewport")!.scrollTop,
        mobile: element.closest(".bn-scroll-container")?.scrollTop || 0,
        codeY: element.getBoundingClientRect().top,
      };
    });
  const before = await measure();
  const button = (await picker.boundingBox())!;
  // A screen-point click avoids an automation scroll before opening the native popup.
  await page.mouse.click(
    button.x + button.width / 2,
    button.y + button.height / 2,
  );
  const opened = await measure();
  for (const key of Object.keys(before) as (keyof typeof before)[]) {
    expect(Math.abs(opened[key] - before[key]), key).toBeLessThanOrEqual(2);
  }
  await page.keyboard.press("Escape");
  const closed = await measure();
  for (const key of Object.keys(before) as (keyof typeof before)[]) {
    expect(Math.abs(closed[key] - before[key]), key).toBeLessThanOrEqual(2);
  }
  await expect(picker).toHaveValue("text");
  await picker.selectOption("python");
  await expect(picker).toHaveValue("python");
  await expect(code.locator("pre code")).toHaveText("example_code");
});

test("unrecognized code language labels remain editable and export unchanged", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { editor, read } = await setup(
    page,
    info.project.name.startsWith("production"),
    "doc",
    "Intro.\n\n```custom-language\nExact code here\n```",
  );
  await editor.locator('[data-content-type="paragraph"]').first().click();
  await page.keyboard.press("End");
  await page.keyboard.type(" Edited.");
  await waitForDraftSaved(page);
  expect((await read()).body).toContain("```custom-language");
  expect((await downloadMarkdown(page)).body).toContain("Exact code here");
  expect(errors).toEqual([]);
});

test("formatting and undo preserve surrounding blocks", async ({
  page,
}, info) => {
  const { editor, read } = await setup(
    page,
    info.project.name.startsWith("production"),
    "doc",
    "First paragraph.\n\nSecond paragraph.",
  );
  const first = editor.locator('[data-content-type="paragraph"]').first();
  await first.click({ position: { x: 1, y: 14 } });
  await expect
    .poll(() =>
      page.evaluate(() => {
        const selection = window.getSelection();
        return !!selection?.isCollapsed && selection.anchorOffset === 0;
      }),
    )
    .toBe(true);
  await page.keyboard.press("ControlOrMeta+b");
  await expect(editor).toBeFocused();
  await page.keyboard.type("Formatted ");
  await page.keyboard.press("ControlOrMeta+b");
  await waitForDraftSaved(page);
  await expect(first.locator("strong")).toContainText("Formatted");
  const formatted = (await read()).bodyDocument!.blocks[0].content;
  expect(
    Array.isArray(formatted) &&
      formatted.some(
        (item) =>
          item.type === "text" &&
          item.styles.bold &&
          item.text.includes("Formatted"),
      ),
  ).toBe(true);
  expect((await read()).body).toContain("Second paragraph.");
  await page.keyboard.press("ControlOrMeta+z");
  await waitForDraftSaved(page);
  expect((await read()).body).not.toContain("Formatted ");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await waitForDraftSaved(page);
  expect((await read()).body).toContain("Formatted");
  await page.reload();
  await expect(editor).toContainText("Formatted");
});
test("structured reader retains formatting, collapsible children, table alignment and code", async ({
  page,
}, info) => {
  const production = info.project.name.startsWith("production");
  const body =
    '## Heading\n\nA **bold** word and [a guide](https://example.com).\n\n| Left | Center |\n| --- | :---: |\n| A | B |\n\n```js\nconst exact = "copy me";\n```';
  const { read } = await setup(page, production, "doc", body, true);
  const item = await read();
  const workspace = withPublishedSnapshots(freshWorkspace());
  const toggle = importMarkdownDocument("More details").blocks[0];
  toggle.type = "toggleListItem";
  toggle.children = importMarkdownDocument("Nested reader content.").blocks;
  item.bodyDocument!.blocks.push(toggle);
  item.body = exportBlockMarkdown(item.bodyDocument!);
  workspace.content = [item];
  workspace.publishedContent = [structuredClone(item)];
  if (production) await setupAuthoringProvider(page, workspace);
  else {
    await page.evaluate(
      (data) =>
        localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data)),
      workspace,
    );
    await page.reload();
  }
  await page.goto(production ? `/docs/${id}` : `/#docs/${id}`);
  await expect(
    page.locator(".markdown strong").filter({ hasText: "bold" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: /a guide/ })).toHaveAttribute(
    "href",
    "https://example.com",
  );
  await expect(
    page.getByRole("columnheader", { name: "Center", exact: true }),
  ).toHaveCSS("text-align", "center");
  await expect(
    page.getByText("Nested reader content.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Toggle More details", exact: true })
    .click();
  await expect(
    page.getByText("Nested reader content.", { exact: true }),
  ).toBeHidden();
  await page
    .getByRole("button", { name: "Toggle More details", exact: true })
    .click();
  await expect(
    page.getByText("Nested reader content.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".code-block")).toContainText(
    'const exact = "copy me";',
  );
});

test("installed API preserves native blocks for older metadata clients and protects published snapshots", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("production"),
    "The demo has no installed API.",
  );
  const { read } = await setup(
    page,
    true,
    "doc",
    "Original published text.",
    true,
  );
  const previous = await read();
  const { bodyDocument: omitted, ...metadata } = previous;
  const saved = await page.request.post("/api/content", {
    headers: { origin: new URL(page.url()).origin },
    data: {
      content: { ...metadata, title: "Renamed draft" },
      expected: previous.revision,
    },
  });
  expect(saved.status()).toBe(200);
  const updated = await saved.json();
  expect(updated.bodyDocument).toEqual(omitted);
  const published = await (
    await page.request.get(`/api/content?id=${id}`)
  ).json();
  expect(published.title).toBe("BlockNote fixture");
  expect(published.body).toBe(previous.body);
  const rejected = await page.request.post("/api/content", {
    headers: { origin: new URL(page.url()).origin },
    data: {
      content: { ...metadata, body: "Discard the structured document." },
      expected: updated.revision,
    },
  });
  expect(rejected.status()).toBe(400);
  const retained = await read();
  expect(retained.bodyDocument).toEqual(omitted);
  expect(retained.body).toBe(previous.body);
});

test("pasting a web link over selected text preserves the label and survives reload", async ({
  page,
}, info) => {
  const { editor, read } = await setup(
    page,
    info.project.name.startsWith("production"),
    "doc",
    "Selected words stay here.",
  );
  await editor
    .locator('[data-content-type="paragraph"]')
    .first()
    .dblclick({ position: { x: 10, y: 12 } });
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toContain("Selected");
  await editor.evaluate((node) => {
    const data = new DataTransfer();
    data.setData("text/plain", "https://example.com/resource");
    node.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(
    editor.getByRole("link", { name: "Selected", exact: true }),
  ).toHaveAttribute("href", "https://example.com/resource");
  await waitForDraftSaved(page);
  expect((await read()).body).toContain(
    "[Selected](https://example.com/resource)",
  );
  await page.reload();
  await expect(
    editor.getByRole("link", { name: "Selected", exact: true }),
  ).toHaveAttribute("href", "https://example.com/resource");
});

test("Return from the title provides a writing line before media without replacing it", async ({
  page,
}, info) => {
  const { editor, read } = await setup(
    page,
    info.project.name.startsWith("production"),
    "doc",
    "[Video](https://www.youtube.com/watch?v=dQw4w9WgXcQ)\n\nExisting text.",
  );
  await page
    .getByRole("textbox", { name: "Title", exact: true })
    .press("Enter");
  await expect(editor).toBeFocused();
  await page.keyboard.type("Before the media.");
  await waitForDraftSaved(page);
  const saved = await read();
  expect(saved.bodyDocument!.blocks[0].type).toBe("paragraph");
  expect(saved.body).toContain("dQw4w9WgXcQ");
  expect(saved.body).toContain("Existing text.");
  expect(saved.body.indexOf("Before the media.")).toBeLessThan(
    saved.body.indexOf("[Video]"),
  );
  await page.reload();
  await expect(editor).toContainText("Before the media.");
});
