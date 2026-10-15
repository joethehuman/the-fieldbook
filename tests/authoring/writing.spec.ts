import { test, expect, type Page } from "@playwright/test";

import {
  downloadMarkdown,
  waitForDraftSaved,
  openContentSettings,
  closeContentSettings,
  returnToContent,
} from "./editor-helpers";

import { freshWorkspace, type Workspace } from "../../lib/store";

import { defaultSettings } from "../../lib/settings";

import { withPublishedSnapshots } from "../../lib/demo-publication";

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

![Product diagram](/api/media/00000000-0000-4000-8000-000000000105.png)

[Product walkthrough](/api/media/00000000-0000-4000-8000-000000000010.mp4)
`;

test("Details keeps its contents during motion, hides closed controls and honors reduced motion", async ({
  page,
}, info) => {
  await setup(page, info.project.name.startsWith("production"));
  const toggle = page.getByRole("button", { name: /^Details/ });
  const slot = page.locator('.editor-frame-panel[data-side="details"]');
  await openContentSettings(page);
  const panel = page.getByRole("complementary", {
    name: "Content details",
    exact: true,
  });
  const field = panel.getByRole("textbox", {
    name: "Short description",
    exact: true,
  });
  await field.fill("Keep panel state across toggles");
  await expect
    .poll(() => slot.evaluate((node) => getComputedStyle(node).visibility))
    .toBe("visible");
  const motion = await toggle.evaluate(async (node) => {
    const panel = document.querySelector(
      '.editor-frame-panel[data-side="details"]',
    )!;
    const content = panel.querySelector("aside")!;
    (node as HTMLElement).click();
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    return {
      attached: content.isConnected,
      hidden: panel.getAttribute("aria-hidden"),
      inert: (panel as HTMLElement).inert,
    };
  });
  expect(motion).toEqual({ attached: true, hidden: "true", inert: true });
  await expect(slot).toHaveCount(0);
  await expect(panel).toHaveCount(0);
  await openContentSettings(page);
  await expect(field).toHaveValue("Keep panel state across toggles");
  await field.focus();
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await toggle.click();
  expect(
    await slot
      .locator("aside")
      .evaluate((node) => getComputedStyle(node).transitionDuration),
  ).toBe("0s");
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
        return route.fulfill({
          json:
            state.content.find((item) => item.id === id) || state.content[0],
        });
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
      expect(request.items).toEqual([
        { id: itemId, expected: state.content[0].revision },
      ]);
      state.content = [
        {
          ...state.content[0],
          status: "draft",
          publishedRevision: undefined,
          revision: (state.content[0].revision || 0) + 1,
        },
      ];
      state.publishedContent = [];
      await syncAuthoringProvider(page, state);
      return route.fulfill({
        json: { results: [{ id: itemId, status: "changed" }] },
      });
    });
  } else {
    await page.addInitScript((data) => {
      if (!localStorage.getItem("fieldbook.workspace.v1"))
        localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    }, state);
  }
  await page.route(
    "**/api/media/00000000-0000-4000-8000-000000000105.png",
    (route) =>
      route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
          "base64",
        ),
      }),
  );
  await page.route(
    "**/api/media/00000000-0000-4000-8000-000000000010.mp4",
    (route) => route.fulfill({ status: 204 }),
  );
  await page.goto(production ? `/admin/content/${itemId}/edit` : "/#admin");
  if (!production)
    await page.getByRole("link", { name: item.title, exact: true }).click();
  await expect(page.locator(".editor")).toBeVisible();
  const read = async (): Promise<Workspace> =>
    production
      ? state
      : page.evaluate(() =>
          JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
        );
  return { read, writes: () => writes };
}

async function createCategory(page: Page, name: string) {
  await page.getByRole("button", { name: "Create category", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Create category", exact: true });
  await dialog.getByRole("textbox").fill(name);
  await dialog.getByRole("button", { name: "Create category", exact: true }).click();
  await expect(dialog).toBeHidden();
}

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
  const category = page.getByRole("button", { name: "Category", exact: true });
  const existing = (await read()).content[0].category;
  await category.click();
  const input = page.getByRole("combobox", { name: "Categories", exact: true });
  await input.fill(existing.toLowerCase());
  await expect(page.getByRole("option", { name: existing, exact: true })).toBeVisible();
  await expect(page.getByRole("option", { name: /^Add/ })).toHaveCount(0);
  await input.press("ArrowDown");
  await input.press("Enter");
  await expect(category).toHaveText(existing);
  await expect(category).toBeFocused();
  await createCategory(page, "  Customer stories  ");
  await expect(category).toHaveText("Customer stories");
  await expect.poll(async () => (await read()).content[0].category).toBe("Customer stories");
  expect((await read()).publishedContent![0].category).toBe(existing);
  await category.click();
  await expect(page.getByRole("option", { name: "Customer stories", exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("category-dropdown.png"), fullPage: true });
  await input.press("Escape");
  await expect(page.getByRole("listbox", { name: "Categories" })).toHaveCount(0);
  await expect(category).toBeFocused();
  await category.click();
  await input.press("Tab");
  // The native popover loops focus within its single search control.
  await expect(input).toBeFocused();
  await expect(page.getByRole("listbox", { name: "Categories" })).toBeVisible();
  await input.press("Escape");
  await expect(page.getByRole("listbox", { name: "Categories" })).toHaveCount(0);
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
        page.getByRole("button", { name: "Section", exact: true }),
      ).toHaveText("Getting started");
      expect((await read()).content[0]).toMatchObject({
        category: "Start here",
        folder: "Getting started",
        sectionId: "writing-getting-started",
      });
    } else {
      await expect(
        page.getByRole("button", { name: "Category", exact: true }),
      ).not.toHaveText("Choose a category…");
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
    expect(
      (await read()).content.find((item) => item.title === `New ${kind}`)
        ?.category,
    ).toBe("");
    await openContentSettings(page);
    if (kind === "Doc") {
      await page.getByRole("button", { name: "Section", exact: true }).click();
      const search = page.getByRole("combobox", {
        name: "Search sections",
        exact: true,
      });
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
        page.getByRole("button", { name: "Section", exact: true }),
      ).toHaveText("New organization name");
    } else {
      const control = page.getByRole("button", { name: "Category", exact: true });
      await expect(control).toBeVisible();
      await expect(control).toHaveText("Choose a category…");
      await createCategory(page, "New organization name");
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
    await page.getByRole("link", { name: `New ${kind}`, exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Title", exact: true }),
    ).toHaveValue(`New ${kind}`);
    await openContentSettings(page);
    if (kind === "Doc") {
      await expect(
        page.getByRole("button", { name: "Section", exact: true }),
      ).toHaveText("New organization name");
    } else {
      await expect(
        page.getByRole("button", { name: "Category", exact: true }),
      ).toHaveText("New organization name");
    }
    await page.screenshot({
      path: info.outputPath(`new-${kind.toLowerCase()}-section.png`),
      fullPage: true,
    });
  });
}

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
  await panel
    .getByRole("textbox", { name: "Short description", exact: true })
    .focus();
  await expect(
    panel.getByRole("textbox", { name: "Short description", exact: true }),
  ).toBeFocused();
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
  await expect(page.locator(".editor")).toHaveAttribute(
    "data-flowing-heading",
    "",
  );
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
  await writing.locator("p").first().click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" Reachable canvas.");
  await expect(writing).toContainText("Reachable canvas.");
  // Desktop formatting is contextual in the native editor, with no retired
  // app-wide writing-actions toolbar to measure here.
  await expect(page.locator('[role="group"][aria-label="Writing actions"]')).toHaveCount(0);
  await expect(writing).toBeInViewport();
  await openContentSettings(page);
  const summary = panel.getByRole("textbox", {
    name: "Short description",
    exact: true,
  });
  await summary.scrollIntoViewIfNeeded();
  await expect(summary).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("editor-large-text-reachable.png"),
  });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "";
  });
  await page
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Compact title");
  await expect(page.locator(".editor")).not.toHaveAttribute(
    "data-flowing-heading",
    "",
  );
  await expect
    .poll(() =>
      page
        .locator(".writing-document-heading")
        .evaluate((el) => getComputedStyle(el).position),
    )
    .toBe("sticky");
  await expect(writing).toContainText("Reachable canvas.");
});

test("long writing uses a stationary desktop frame and reachable natural page fallback", async ({
  page,
}, info) => {
  await setup(
    page,
    info.project.name.startsWith("production"),
    Array.from(
      { length: 55 },
      (_, index) =>
        `Paragraph ${index + 1}. Practical context that keeps growing as the author writes.`,
    ).join("\n\n"),
  );
  const editor = page.getByRole("textbox", {
    name: "Doc content",
    exact: true,
  });
  await editor.locator("p").first().click();
  const body = page.locator('.writing-viewport');
  const surface = page.locator(".writing-editor.writing-surface");
  const bounded =
    (await page.locator(".editor").getAttribute("data-scroll-layout")) ===
    "workspace";
  if (!bounded) {
    const main = page.locator(".main-content");
    await expect
      .poll(() =>
        main.evaluate((node) => node.scrollHeight - node.clientHeight),
      )
      .toBeGreaterThan(100);
    await page.mouse.wheel(0, 900);
    await expect
      .poll(() => main.evaluate((node) => node.scrollTop))
      .toBeGreaterThan(50);
    await editor.locator("p").last().click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.type(" Final caret remains visible.");
    await expect(editor).toContainText("Final caret remains visible.");
    expect((await downloadMarkdown(page)).body).toContain(
      "Final caret remains visible.",
    );
    await page.screenshot({ path: info.outputPath("editor-natural-page.png") });
    return;
  }
  const before = await surface.boundingBox();
  await body.hover();
  await page.mouse.wheel(0, 900);
  await expect
    .poll(() => body.evaluate((node) => node.scrollTop))
    .toBeGreaterThan(50);
  await expect(body).toHaveAttribute("data-scroll-fade-before", "true");
  const after = await surface.boundingBox();
  expect(Math.abs(after!.y - before!.y)).toBeLessThan(2);
  expect(Math.abs(after!.height - before!.height)).toBeLessThan(2);
  const header = await page.locator(".editor-frame-controls").boundingBox();
  expect(after!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
  expect(after!.y + after!.height).toBeLessThanOrEqual(
    page.viewportSize()!.height,
  );
  await expect(
    page.getByRole("button", { name: "Back to content", exact: true }),
  ).toBeInViewport();
  await expect(page.getByRole("button", { name: "Commands", exact: true })).toBeHidden();
  await expect(
    page.getByRole("button", { name: "More editor actions", exact: true }),
  ).toHaveCount(0);
  expect(
    await surface.evaluate(
      (node) => getComputedStyle(node).borderBottomLeftRadius,
    ),
  ).toBe("0px");
  await editor.press("ControlOrMeta+End");
  await page.keyboard.type(" Final caret remains visible.");
  await expect(editor).toContainText("Final caret remains visible.");
  await expect
    .poll(() =>
      editor.evaluate(() => {
        const selection = getSelection();
        const rect = selection?.rangeCount
          ? selection.getRangeAt(0).getBoundingClientRect()
          : null;
        const viewport = document
          .querySelector('.writing-viewport')!
          .getBoundingClientRect();
        return (
          !!rect && rect.top >= viewport.top && rect.bottom <= viewport.bottom
        );
      }),
    )
    .toBe(true);
  await page.screenshot({ path: info.outputPath("editor-pinned-frame.png") });
});
