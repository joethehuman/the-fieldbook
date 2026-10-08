import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import {
  authoringUser,
  setupAuthoringProvider,
  syncAuthoringProvider,
} from "./provider-fixture";
import { downloadMarkdown, waitForDraftSaved } from "./editor-helpers";

const code =
  'def greet(name):\n    message = f"Hello, {name}"\n    print(message)\n    return message';
const fence = (code: string, language = "") =>
  `\`\`\`${language}\n${code}\n\`\`\``;

async function open(
  page: Page,
  installed: boolean,
  kind: "doc" | "brief" | "course",
  body: string,
  reader = false,
) {
  const state = withPublishedSnapshots(freshWorkspace());
  const item = state.content.find((item) => item.kind === kind)!;
  item.id = "00000000-0000-4000-8000-000000000191";
  item.title = "Code blocks example";
  item.body = body;
  item.status = "published";
  item.revision = 1;
  item.publishedRevision = 1;
  if (kind === "course")
    item.lessons = [{ id: "one", title: "Code examples", body }];
  state.content = [item];
  state.publishedContent = [structuredClone(item)];
  if (installed) {
    await setupAuthoringProvider(page, state);
    await page.route("**/api/admin/snapshot?**", (route) =>
      route.fulfill({ json: { data: state, user: authoringUser } }),
    );
    await page.route("**/api/content*", async (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({ json: state.content[0] });
      const request = route.request().postDataJSON();
      expect(request.expected).toBe(state.content[0].revision);
      const saved = {
        ...request.content,
        revision: state.content[0].revision! + 1,
        publishedRevision: 1,
      };
      state.content = [saved];
      await syncAuthoringProvider(page, state);
      return route.fulfill({ json: saved });
    });
  } else {
    await page.addInitScript((data) => {
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    }, state);
  }
  // Observe the browser clipboard API without changing the operator's system clipboard.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          if (document.documentElement.dataset.rejectCopy)
            throw new Error("Copy denied");
          document.documentElement.dataset.copied = value;
        },
      },
    });
  });
  if (reader)
    await page.goto(installed ? `/docs/${item.id}` : `/#docs/${item.id}`);
  else {
    await page.goto(installed ? `/admin/content/${item.id}/edit` : "/#admin");
    if (!installed)
      await page.getByRole("link", { name: item.title, exact: true }).click();
    await expect(
      page.locator(".writing-code .cm-content").first(),
    ).toBeVisible();
  }
}

for (const kind of ["doc", "brief", "course"] as const) {
  test(`${kind}: auto detection, language override, copy and exact Markdown survive authoring`, async ({
    page,
  }, info) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await open(
      page,
      info.project.name.startsWith("production"),
      kind,
      `Paragraph 1.\n\n${fence(code)}\n\nAfter the code.`,
    );
    const block = page.locator(".writing-code-block");
    await expect(block.locator(".code-detected-language")).toHaveText("Python");
    await expect(
      block.locator(".cm-content .hljs-keyword").first(),
    ).toBeVisible();
    await block.getByRole("button", { name: "Copy code", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-copied", code);
    await expect(block.getByRole("status")).toHaveText("Code copied");
    expect((await downloadMarkdown(page)).body).toContain(fence(code));

    await block.getByRole("combobox", { name: "Code language" }).click();
    await page.getByRole("option", { name: "Plain text", exact: true }).click();
    await expect(block.locator(".code-block")).toHaveAttribute(
      "data-language",
      "text",
    );
    await expect(block.locator(".cm-content [class*=hljs-]")).toHaveCount(0);
    expect((await downloadMarkdown(page)).body).toContain(fence(code, "text"));
    await block.getByRole("combobox", { name: "Code language" }).click();
    await page.getByRole("option", { name: "TypeScript", exact: true }).click();
    expect((await downloadMarkdown(page)).body).toContain(
      fence(code, "typescript"),
    );

    const input = block.locator(".cm-content");
    await input.click();
    await page.keyboard.press("ControlOrMeta+End");
    await page.keyboard.press("Enter");
    await page.keyboard.insertText("// ordinary code, not a slash command");
    await expect(
      page.getByRole("menu", { name: /^Insert content/ }),
    ).toHaveCount(0);
    await expect(input).toContainText("// ordinary code");
    await waitForDraftSaved(page);
    const exported = (await downloadMarkdown(page)).body;
    expect(exported).toContain("// ordinary code, not a slash command");
    expect(exported).toContain("After the code.");
    await page.screenshot({
      path: info.outputPath(`${kind}-code-editor.png`),
      animations: "disabled",
    });
    expect(errors).toEqual([]);
  });
}

test("long code scrolls within its block, retains horizontal layout, and undo restores editing", async ({
  page,
}, info) => {
  const long = Array.from(
    { length: 60 },
    (_, i) => `const value${i} = "${"long code ".repeat(24)}";`,
  ).join("\n");
  await open(
    page,
    info.project.name.startsWith("production"),
    "doc",
    `Paragraph 1.\n\n${fence(long, "javascript")}\n\nAfter the code.`,
  );
  const block = page.locator(".writing-code-block");
  const scroller = block.locator(".cm-scroller");
  const geometry = await scroller.evaluate((el) => ({
    height: el.clientHeight,
    fullHeight: el.scrollHeight,
    width: el.clientWidth,
    fullWidth: el.scrollWidth,
  }));
  expect(geometry.height).toBeLessThanOrEqual(384);
  expect(geometry.fullHeight).toBeGreaterThan(geometry.height);
  expect(geometry.fullWidth).toBeGreaterThan(geometry.width);
  await scroller.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.scrollLeft = 100;
  });
  await expect(
    block.getByRole("button", { name: "Copy code" }),
  ).toBeInViewport();
  const input = block.locator(".cm-content");
  await input.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.insertText(" END");
  await expect(input).toContainText(" END");
  await page.keyboard.press("ControlOrMeta+z");
  await expect(input).not.toContainText(" END");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(input).toContainText(" END");
  await block
    .getByRole("button", { name: "Code block actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Write after code block", exact: true })
    .click();
  await page.keyboard.insertText("Still in the document.");
  expect((await downloadMarkdown(page)).body).toContain(
    "Still in the document.",
  );
});

test("a newly inserted code block starts on Auto-detect and accepts focus, typing and paste", async ({
  page,
}, info) => {
  await open(
    page,
    info.project.name.startsWith("production"),
    "doc",
    `Paragraph 1.\n\n${fence(code, "py")}\n\nAfter the code.`,
  );
  await page
    .getByRole("button", { name: "Code block actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Write after code block", exact: true })
    .click();
  await page.keyboard.type("/");
  await page.getByRole("menuitem", { name: "Code block", exact: true }).click();
  const block = page.locator(".writing-code-block").last();
  const input = block.locator(".cm-content");
  await expect(input).toBeFocused();
  await expect(
    block.getByRole("combobox", { name: "Code language" }),
  ).toHaveText("Auto-detect");
  await page.keyboard.type("x");
  await page.keyboard.press("Backspace");
  await input.evaluate((el) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData(
      "text/plain",
      'def greet(name):\n    message = f"Hello, {name}"\n    print(message)\n    return message',
    );
    el.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(block.locator(".code-detected-language")).toHaveText("Python");
  const result = (await downloadMarkdown(page)).body;
  expect(result).toContain(fence(code, "py"));
  expect(result).toContain(fence(code));
});

test("reader highlights fenced code, copies exactly, leaves inline code alone, and handles copy denial", async ({
  page,
}, info) => {
  const markup = "<script>window.codeShouldNeverRun = true</script>";
  const long = Array.from(
    { length: 60 },
    (_, i) => `const value${i} = "${"long code ".repeat(24)}";`,
  ).join("\n");
  await open(
    page,
    info.project.name.startsWith("production"),
    "doc",
    `Use \`inline code\`.\n\n${fence(code)}\n\n${fence(markup, "html")}\n\n${fence(long, "javascript")}`,
    true,
  );
  const block = page.locator(".markdown .code-block").first();
  await expect(block).toHaveAttribute("data-language", "python");
  await expect(block.locator("pre .hljs-keyword").first()).toBeVisible();
  await block.getByRole("button", { name: "Copy code" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-copied", code);
  await expect(page.locator(".markdown > p > code")).toHaveText("inline code");
  const html = page.locator(".markdown .code-block").nth(1);
  await expect(html.locator("pre")).toHaveText(markup);
  await expect(html.locator("script")).toHaveCount(0);
  const scroller = page
    .locator(".markdown .code-block")
    .last()
    .locator(".code-block-scroll");
  const geometry = await scroller.evaluate((el) => ({
    height: el.clientHeight,
    fullHeight: el.scrollHeight,
    width: el.clientWidth,
    fullWidth: el.scrollWidth,
  }));
  expect(geometry.height).toBeLessThanOrEqual(384);
  expect(geometry.fullHeight).toBeGreaterThan(geometry.height);
  expect(geometry.fullWidth).toBeGreaterThan(geometry.width);
  await page.locator("html").evaluate((el) => {
    el.dataset.rejectCopy = "true";
  });
  await block.getByRole("button", { name: "Copy code" }).click();
  await expect(block.getByRole("alert")).toContainText(
    "Select the code and copy it manually.",
  );
  await block
    .getByRole("button", { name: "Dismiss message", exact: true })
    .click();
  await expect(block.getByRole("alert")).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("code-reader.png"),
    animations: "disabled",
  });
});
