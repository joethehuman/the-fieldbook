import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace, type Workspace } from "../../lib/store";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import { equivalentMarkdown } from "../../lib/markdown-compatibility";

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
  const source = state.content.find((item) => item.kind === kind)!;
  const item = {
    ...source,
    id: "writing-fixture",
    title: "Writing fixture",
    body,
    revision: 1,
    publishedRevision: 1,
  };
  state.content = [item];
  state.publishedContent = [structuredClone(item)];
  let writes = 0;
  if (production) {
    await page.route("**/api/workspace", (route) =>
      route.fulfill({
        json: {
          data: state,
          user: state.users.find((user) => user.id === "demo-admin"),
        },
      }),
    );
    await page.route("**/api/content", (route) => {
      writes++;
      const request = route.request().postDataJSON();
      expect(request.expected).toBe(state.content[0].revision);
      const saved = {
        ...request.content,
        revision: state.content[0].revision! + 1,
        publishedRevision: state.content[0].publishedRevision,
      };
      if (request.publish) {
        saved.publishedRevision = saved.revision;
        state.publishedContent = [structuredClone(saved)];
      }
      if (request.unpublish) {
        state.publishedContent = [];
        saved.publishedRevision = undefined;
      }
      state.content = [saved];
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
  if (await settings.isVisible()) await settings.click();
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
  await page.getByRole("button", { name: "Table", exact: true }).click();
  const table = editor.getByRole("table");
  await table.getByRole("textbox").first().fill("Topic");
  await table.getByRole("textbox").nth(2).fill("Useful detail");
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
