import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace, type Workspace } from "../../lib/store";
import { defaultSettings } from "../../lib/settings";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import { equivalentMarkdown } from "../../lib/markdown-compatibility";
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

[Product walkthrough](/api/media/example.mp4)
`;
async function setup(
  page: Page,
  production: boolean,
  body = original,
  kind: "doc" | "brief" = "doc",
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
    id: "writing-fixture",
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
    await page.route("**/api/content", async (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({ json: state.content[0] });
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
  await page.route("**/api/media/example.mp4", (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.goto(production ? "/admin" : "/#admin");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Back to content", exact: true }),
  ).toBeVisible();
  const read = async (): Promise<Workspace> =>
    production
      ? state
      : page.evaluate(() =>
          JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
        );
  return { read, writes: () => writes };
}

test("visual Markdown round trip, explicit draft saves, republish and unpublish", async ({
  page,
}, info) => {
  const production = info.project.name.startsWith("production");
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const { read } = await setup(page, production);
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
    "/api/media/example.mp4",
  );
  // Mounting the visual editor must not turn normalization into unsaved changes.
  await expect(page.getByText("Unsaved changes", { exact: true })).toHaveCount(
    0,
  );
  await page.getByLabel("Title", { exact: true }).fill("Private title");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  expect((await read()).content[0].body).toBe(original);
  expect((await read()).publishedContent![0].title).toBe("Writing fixture");
  // A second save verifies revision and dirty-baseline handling without reopening.
  await editor.locator("p").filter({ hasText: "Start with" }).click();
  await editor.press("ControlOrMeta+End");
  await editor.press("Enter");
  await editor.pressSequentially("A private addition.");
  await expect(editor).toContainText("A private addition.");
  await expect(
    page.getByText("Unsaved changes", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  const draft = (await read()).content[0].body;
  expect(draft).toContain("A private addition.");
  expect(
    equivalentMarkdown(original, draft.replace(/A private addition\./, "")),
  ).toBe(true);
  expect((await read()).publishedContent![0].body).toBe(original);
  await page
    .getByRole("button", { name: "Back to content", exact: true })
    .click();
  await expect(
    page.getByText("Unpublished edits", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Back to content", exact: true }),
  ).toBeVisible();
  await expect(editor).toContainText("A private addition.");
  await page
    .getByRole("button", { name: "Publish changes", exact: true })
    .click();
  await expect(page.locator('[data-slot="toast"]')).toContainText("published");
  expect((await read()).publishedContent![0].title).toBe("Private title");
  await page.screenshot({
    path: info.outputPath("writing-editor.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Back to content", exact: true })
    .click();
  await page.getByRole("button", { name: "Unpublish", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Unpublish", exact: true }),
  ).toHaveCount(0);
  expect((await read()).publishedContent).toEqual([]);
  expect((await read()).content[0].body).toContain("A private addition.");
  expect(errors).toEqual([]);
});

test("formatting controls, keyboard save, source fallback and responsive settings", async ({
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
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(editor.locator("strong")).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(editor.locator("strong")).toHaveText("Make this bold");
  await editor.press("ControlOrMeta+s");
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  expect((await read()).publishedContent![0].body).toBe("A short update");
  const settings = page.getByRole("button", { name: "Content settings" });
  if ((page.viewportSize()?.width ?? 1000) < 768) await settings.click();
  await expect(
    page.getByRole("heading", { name: "For you", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  const unsupported = "Keep this footnote[^1].\n\n[^1]: An important detail.\n";
  await page
    .getByRole("textbox", { name: "Update content Markdown" })
    .fill(unsupported);
  await page.getByRole("button", { name: "Write", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "original text is preserved" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Update content Markdown" }),
  ).toHaveValue(unsupported);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  expect((await read()).content[0].body).toBe(unsupported);
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
  await page.getByRole("combobox", { name: "Block type", exact: true }).click();
  await page.getByRole("option", { name: "Heading 2", exact: true }).click();
  await expect(editor.locator("h2")).toHaveText("Write clearly");
  await editor.press("ControlOrMeta+End");
  await editor.press("Enter");
  await page.getByRole("button", { name: "Link", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox")
    .first()
    .fill("https://example.com/reference");
  await dialog
    .getByRole("textbox", { name: "Anchor text", exact: true })
    .fill("Reference");
  await dialog.getByRole("button", { name: "Set URL", exact: true }).click();
  await expect(editor.getByRole("link", { name: "Reference" })).toHaveAttribute(
    "href",
    "https://example.com/reference",
  );
  await editor.press("ControlOrMeta+End");
  await editor.press("Enter");
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await page.getByRole("menuitem", { name: "Table", exact: true }).click();
  const table = editor.getByRole("table");
  await table.getByRole("textbox").first().fill("Topic");
  await table.getByRole("textbox").nth(3).fill("Useful detail");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  const body = (await read()).content[0].body;
  expect(body).toContain("## Write clearly");
  expect(body).toContain("[Reference](https://example.com/reference)");
  expect(body).toContain("Useful detail");
  await page
    .getByRole("button", { name: "Preview draft", exact: true })
    .click();
  const preview = page.getByLabel("Draft preview", { exact: true });
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
  const settings = page.getByRole("button", { name: "Content settings" });
  if ((page.viewportSize()?.width ?? 1000) < 768) await settings.click();
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
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  expect((await read()).content[0].category).toBe("Customer stories");
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
    const settings = page.getByRole("button", { name: "Content settings" });
    if ((page.viewportSize()?.width ?? 1000) < 768) await settings.click();
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
    await page
      .getByRole("button", { name: "Back to content", exact: true })
      .click();
    await page.getByRole("button", { name: kind, exact: true }).click();
    await page.getByLabel("Title", { exact: true }).fill(`New ${kind}`);
    await page
      .getByLabel("Short description", { exact: true })
      .fill("A useful introduction.");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    if (kind === "Doc") {
      await expect(
        page.getByText("Choose a Docs section before saving."),
      ).toBeVisible();
      const search = page.getByRole("searchbox", { name: "Search sections" });
      await expect(search).toBeVisible();
      await search.fill("Start here");
      await expect(
        page.getByRole("button", {
          name: "Start here → Getting started",
          exact: true,
          pressed: false,
        }),
      ).toBeVisible();
      await search.fill("");
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
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
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
    await page
      .getByRole("button", { name: "Back to content", exact: true })
      .click();
    await page
      .getByRole("row")
      .filter({ hasText: `New ${kind}` })
      .getByRole("button", { name: "Edit", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Title", exact: true }),
    ).toHaveValue(`New ${kind}`);
    if ((page.viewportSize()?.width ?? 1000) < 768) await settings.click();
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
  for (let index = 0; index < 9; index++)
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
  await page.getByRole("button", { name: "Markdown", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Doc content Markdown" }),
  ).toHaveValue(/\/hea/);
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
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  const saved = (await read()).content[0].body;
  expect(saved).toContain("Nested point");
  expect(saved).toMatch(/1\. Pasted customer context/);
  await page
    .getByRole("button", { name: "Preview draft", exact: true })
    .click();
  const preview = page.getByLabel("Draft preview", { exact: true });
  await expect(preview.locator("ul ul li")).toHaveText("Nested point");
  await expect(preview.locator("ol li")).toHaveText("Pasted customer context");
});

test("settings reveal clears the sticky header and enlarged text leaves the canvas reachable", async ({
  page,
}, info) => {
  await setup(page, info.project.name.startsWith("production"));
  await page
    .getByRole("textbox", { name: "Title", exact: true })
    .fill(
      "Customer launch readiness and practical product guidance for enterprise teams",
    );
  const settings = page.getByRole("button", { name: "Settings", exact: true });
  if (await settings.isVisible()) {
    await settings.click();
    const panel = page.getByRole("complementary", {
      name: "Content settings",
      exact: true,
    });
    await expect(panel).toBeFocused();
    await expect
      .poll(() =>
        panel.evaluate(
          (node) =>
            node.getBoundingClientRect().top >=
            document.querySelector(".editor-heading")!.getBoundingClientRect()
              .bottom,
        ),
      )
      .toBe(true);
  }
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
  await writing.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      writing.evaluate((node) => {
        const canvas = node.getBoundingClientRect();
        const header = document
          .querySelector(".editor-heading")!
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
  const formatting = page.getByRole("group", { name: "Formatting", exact: true });
  await expect.poll(() => formatting.evaluate((node) => {
    const boundary = node.closest(".writing-editor")!.getBoundingClientRect();
    return [...node.querySelectorAll("button")].filter((button) => {
      const box = button.getBoundingClientRect();
      return box.width > 0 && (box.left < boundary.left || box.right > boundary.right);
    }).map((button) => button.getAttribute("aria-label") || button.textContent);
  })).toEqual([]);
  if (await settings.isVisible()) {
    await settings.click();
    const panel = page.getByRole("complementary", { name: "Content settings", exact: true });
    await expect(panel).toBeFocused();
    await expect.poll(() => panel.evaluate((node) => {
      const box = node.getBoundingClientRect();
      const main = document.querySelector(".main-content")!.getBoundingClientRect();
      return box.top >= main.top && box.top < main.bottom;
    })).toBe(true);
  }
  await page.screenshot({
    path: info.outputPath("editor-large-text-reachable.png"),
  });
});
