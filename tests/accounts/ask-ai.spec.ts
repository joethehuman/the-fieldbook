import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { defaultAskAiSettings } from "../../lib/ai";
const docId = "00000000-0000-4000-8000-000000000021";
const sources = [
  {
    id: "S1",
    contentId: docId,
    passageId: "doc:body",
    publishedRevision: 1,
    kind: "doc",
    title: "Published reference",
    lessonId: null,
    lessonTitle: null,
    href: `/docs/${docId}`,
  },
];
const headers = {
  "Content-Type": "text/event-stream",
  "x-vercel-ai-ui-message-stream": "v1",
  "Cache-Control": "no-store",
};
function stream(text = "Keep the response **brief**. [S1]", fail = false) {
  return (
    [
      { type: "start", messageId: crypto.randomUUID() },
      { type: "text-start", id: "answer" },
      { type: "text-delta", id: "answer", delta: text },
      ...(fail
        ? [
            {
              type: "error",
              errorText:
                "Ask AI could not verify its source links. Try again or use Search.",
            },
          ]
        : [
            { type: "data-sources", data: sources },
            { type: "text-end", id: "answer" },
            { type: "finish", finishReason: "stop" },
          ]),
    ]
      .map((part) => `data: ${JSON.stringify(part)}\n\n`)
      .join("") + "data: [DONE]\n\n"
  );
}
async function fixture(
  page: Page,
  request: APIRequestContext,
  enabled = true,
  signedIn = true,
) {
  const course = freshWorkspace().content.find(
    (item) => item.kind === "course",
  )!;
  const doc = {
    ...course,
    id: docId,
    kind: "doc",
    title: "Published reference",
    body: "A concise explanation.",
    lessons: [],
    questions: [],
  };
  await request.post("http://127.0.0.1:3130/fixture", {
    data: {
      settings: {
        access: "public",
        askAi: { ...defaultAskAiSettings, enabled },
      },
      documents: [doc, course].map((item) => ({
        id: item.id,
        draft: item,
        published: item,
        revision: 1,
        published_revision: 1,
        updated_at: "2026-01-01",
      })),
    },
  });
  if (signedIn) {
    const token = await (
      await request.post("http://127.0.0.1:3130/auth/v1/token", { data: {} })
    ).json();
    await page.context().addCookies([
      {
        name: "sb-test-auth-token",
        value:
          "base64-" +
          Buffer.from(
            JSON.stringify({
              ...token,
              expires_at: Math.floor(Date.now() / 1000) + 3600,
            }),
          ).toString("base64url"),
        domain: "localhost",
        path: "/",
      },
    ]);
  }
  await page.goto("/courses");
}
test("Ask AI search, follow-ups, verified links, navigation and ephemeral reset", async ({
  page,
  request,
}, info) => {
  await fixture(page, request);
  const payloads: any[] = [];
  await page.route("**/api/search?**", (route) =>
    route.fulfill({ json: { results: [], hasMore: false } }),
  );
  await page.route("**/api/ask-ai", async (route) => {
    payloads.push(route.request().postDataJSON());
    await route.fulfill({
      headers,
      body: stream(
        "Keep the response **brief**. [S1] [unsafe](https://example.test) ![remote](https://example.test/image.png)",
      ),
    });
  });
  const input = page.getByRole("textbox", { name: "Search all content" });
  await expect(input).toHaveAttribute(
    "placeholder",
    "Search Fieldbook or Ask AI",
  );
  await input.fill("ordinary search");
  await input.press("Enter");
  await expect(
    page.getByRole("heading", { name: "No results", exact: true }),
  ).toBeVisible();
  expect(payloads).toHaveLength(0);
  await page.getByRole("button", { name: "Ask AI", exact: true }).click();
  await expect(
    page
      .getByRole("region", { name: "Ask AI conversation" })
      .getByRole("status"),
  ).toContainText("Answer ready");
  await expect(
    page.getByRole("link", { name: /Source 1: Published reference/ }),
  ).toBeVisible();
  await expect(
    page.locator('[aria-label="Ask AI conversation"] a[href^="https"]'),
  ).toHaveCount(0);
  await expect(
    page.locator('[aria-label="Ask AI conversation"] img'),
  ).toHaveCount(0);
  await input.press("Escape");
  await expect(page.locator('[data-slot="search-panel"]')).toHaveCount(0);
  await input.click();
  await expect(
    page.getByText("Keep the response", { exact: false }),
  ).toBeVisible();
  const follow = page.getByRole("textbox", { name: "Ask a follow-up" });
  await follow.fill("What about the second option?");
  await follow.press("Enter");
  await expect(page.getByRole("log")).toContainText(
    "What about the second option?",
  );
  await expect(
    page.getByRole("log").getByText("Keep the response", { exact: false }),
  ).toHaveCount(2);
  expect(payloads).toHaveLength(2);
  expect(payloads[1].messages).toHaveLength(3);
  expect(
    payloads[1].messages
      .flatMap((message: any) => message.parts)
      .every((part: any) => part.type === "text"),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("ask-ai-conversation.png") });
  await page
    .getByRole("link", { name: /Source 1: Published reference/ })
    .last()
    .click();
  await expect(page).toHaveURL(new RegExp(`/docs/${docId}`));
  await input.click();
  await expect(page.getByRole("log")).toContainText(
    "What about the second option?",
  );
  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(page.getByRole("log")).not.toContainText(
    "What about the second option?",
  );
  await input.fill("A unique temporary question?   ");
  await input.press("Enter");
  await expect(page.getByRole("log")).toContainText(
    "A unique temporary question?",
  );
  const draft = page.getByRole("textbox", { name: "Ask a follow-up" });
  await draft.fill("An unsent follow-up");
  await input.press("Escape");
  await input.click();
  await expect(draft).toHaveValue("An unsent follow-up");
  const storage = await page.evaluate(() =>
    JSON.stringify({ ...localStorage, ...sessionStorage }),
  );
  expect(storage).not.toContain("A unique temporary question");
  expect(storage).not.toContain("An unsent follow-up");
  await page.reload();
  await input.fill("reopen");
  await page.getByRole("tab", { name: "Ask AI" }).click();
  await expect(page.getByRole("log")).not.toContainText(
    "A unique temporary question",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
test("Ask AI failure, explicit retry, stop and new conversation cancel pending work", async ({
  page,
  request,
}, info) => {
  await fixture(page, request);
  let calls = 0;
  const payloads: any[] = [];
  let release: (() => void) | undefined;
  await page.route("**/api/ask-ai", async (route) => {
    calls++;
    payloads.push(route.request().postDataJSON());
    if (calls === 1)
      return route.fulfill({
        headers,
        body: stream("An unverified partial answer", true),
      });
    if (calls >= 3)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    await route.fulfill({ headers, body: stream() }).catch(() => {});
  });
  const input = page.getByRole("textbox", { name: "Search all content" });
  await input.fill("How does this work?");
  await input.press("Enter");
  await expect(
    page
      .getByRole("region", { name: "Ask AI conversation" })
      .getByRole("alert"),
  ).toContainText("could not verify");
  await expect(page.getByText("Response incomplete.")).toBeVisible();
  await expect(page.getByRole("link", { name: /Source 1/ })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("ask-ai-error.png") });
  await page.getByRole("button", { name: "Retry answer" }).click();
  await expect(
    page
      .getByRole("region", { name: "Ask AI conversation" })
      .getByRole("status"),
  ).toContainText("Answer ready");
  expect(payloads[1].messages).toHaveLength(1);
  await expect(page.getByRole("log")).not.toContainText("unverified partial");
  await input.fill("Slow question?");
  await input.press("Enter");
  await expect(
    page.getByRole("button", { name: "Stop response" }),
  ).toBeVisible();
  await input.press("Enter");
  expect(calls).toBe(3);
  const draft = page.getByRole("textbox", { name: "Ask a follow-up" });
  await draft.fill("An unsent follow-up stays here");
  await page.getByRole("button", { name: "Stop response" }).click();
  release?.();
  await expect(
    page
      .getByRole("region", { name: "Ask AI conversation" })
      .getByRole("status"),
  ).toContainText("Response stopped");
  expect(calls).toBe(3);
  await expect(draft).toHaveValue("An unsent follow-up stays here");
  await input.fill("Another slow question?");
  await input.press("Enter");
  await expect(
    page.getByRole("button", { name: "Stop response" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New conversation" }).click();
  release?.();
  await expect(page.getByRole("log")).not.toContainText("Slow question");
  await expect(page.getByRole("button", { name: "Stop response" })).toHaveCount(
    0,
  );
});
test("Ask AI disabled and guest behavior preserve basic search and avoid inference", async ({
  page,
  request,
}) => {
  await fixture(page, request, false, false);
  let calls = 0;
  page.on("request", (req) => {
    if (req.url().includes("/api/ask-ai")) calls++;
  });
  const input = page.getByRole("textbox", { name: "Search all content" });
  await expect(input).toHaveAttribute("placeholder", "Search Fieldbook");
  await input.fill("A question?");
  await input.press("Enter");
  await expect(page.getByRole("tab", { name: "Ask AI" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Ask AI", exact: true }),
  ).toHaveCount(0);
  expect(calls).toBe(0);
  await fixture(page, request, true, false);
  await input.fill("A question?");
  await input.press("Enter");
  await expect(
    page
      .getByRole("region", { name: "Ask AI conversation" })
      .getByRole("status"),
  ).toContainText("Sign in");
  expect(calls).toBe(0);
});
test("Ask AI demo responds locally, respects composition and clears on profile change", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-learner");
  });
  let calls = 0;
  page.on("request", (req) => {
    if (/ask-ai|ai-gateway/.test(req.url())) calls++;
  });
  await page.goto("http://127.0.0.1:3132/#courses");
  const input = page.getByRole("textbox", { name: "Search all content" });
  await input.fill("Where should I start? ");
  await input.dispatchEvent("keydown", { key: "Enter", isComposing: true });
  await expect(page.getByRole("log")).toHaveCount(0);
  await input.press("Enter");
  await expect(page.getByRole("log")).toContainText(
    "This feature is not available in the demo site.",
  );
  expect(calls).toBe(0);
  await page.screenshot({ path: info.outputPath("ask-ai-demo.png") });
  await input.press("Escape");
  await input.click();
  await expect(page.getByRole("log")).toContainText("Where should I start?");
  if (info.project.name === "phone")
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Switch demo profile" }).click();
  await page.getByRole("button", { name: /Admin/ }).last().click();
  await input.fill("new profile");
  await page.getByRole("tab", { name: "Ask AI" }).click();
  await expect(page.getByRole("log")).not.toContainText(
    "Where should I start?",
  );
  expect(calls).toBe(0);
});
