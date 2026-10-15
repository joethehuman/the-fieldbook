import { test, expect, type Page } from "@playwright/test";

import { freshWorkspace } from "../../lib/store";

import { withPublishedSnapshots } from "../../lib/demo-publication";

import {
  authoringUser,
  setupAuthoringProvider,
  syncAuthoringProvider,
} from "./provider-fixture";

import { downloadMarkdown } from "./editor-helpers";

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
      page.locator('[data-content-type="codeBlock"] pre code').first(),
    ).toBeVisible();
  }
}

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

test("pasting an image in code leaves the code editor in control and does not upload into prose", async ({
  page,
}, info) => {
  await open(
    page,
    info.project.name.startsWith("production"),
    "doc",
    `Before the code.\n\n${fence(code)}\n\nAfter the code.`,
  );
  let uploads = 0;
  await page.route("**/api/upload", (route) => {
    uploads++;
    return route.fulfill({
      status: 500,
      json: { error: "Unexpected prose upload" },
    });
  });
  const input = page.locator('[data-content-type="codeBlock"] pre code');
  await input.click();
  await input.evaluate((node) => {
    const data = new DataTransfer();
    data.items.add(
      new File(["synthetic"], "code-paste.png", { type: "image/png" }),
    );
    node.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect(input).toHaveText(code);
  await expect(page.locator(".writing-editor").getByRole("alert")).toHaveCount(
    0,
  );
  await expect(page.locator(".writing-content img")).toHaveCount(0);
  expect(uploads).toBe(0);
  expect((await downloadMarkdown(page)).body).toContain(fence(code));
});
