import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { defaultAskAiSettings, aiUnavailableMessage } from "../../lib/ai";
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
function stream(
  text = "Keep the response **brief**. [S1]",
  fail = false,
  citations = sources,
) {
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
            { type: "data-sources", data: citations },
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
  aiFailure = "",
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
        askAi: { ...defaultAskAiSettings, enabled, model: "test/primary" },
      },
      aiFailure,
      aiPassages: [
        {
          content_id: docId,
          passage_id: "doc:body",
          kind: "doc",
          title: doc.title,
          lesson_id: null,
          lesson_title: null,
          source_text: "The setup check code is ready.",
          published_revision: 1,
          content_date: null,
        },
      ],
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
test("citations use consecutive clickable numbers, compact titles and safe destinations", async ({
  page,
  request,
}, info) => {
  await fixture(page, request);
  const citations = [2, 4, 3, 6, 5].map((id, index) => ({
    ...sources[0],
    id: `S${id}`,
    passageId: `doc:part-${id}`,
    contentId:
      id === 5
        ? docId
        : `00000000-0000-4000-8000-${String(21 + index).padStart(12, "0")}`,
    href:
      id === 5
        ? `/docs/${docId}`
        : `/docs/00000000-0000-4000-8000-${String(21 + index).padStart(12, "0")}`,
    title:
      index === 0
        ? "Published reference"
        : `A helpful published reference with a long title and clear instructions ${index}`,
  }));
  await page.route("**/api/ask-ai", (route) =>
    route.fulfill({
      headers,
      body: stream(
        "Start with the published setup steps. [S2][S4]\n\nApply the required changes and verify the installation. [S3][S5][S6] [fake](/__fieldbook-citation/1) [unsafe](javascript:alert(1)) `literal [S4]`",
        false,
        citations,
      ),
    }),
  );
  const input = page.getByRole("textbox", { name: "Search all content" });
  await input.fill("How do I set this up?");
  await input.press("Enter");
  const chat = page.getByRole("region", { name: "Ask AI conversation" });
  await expect(chat.getByRole("status")).toContainText("Answer ready");
  const refs = chat.getByRole("link", { name: /^Source \d+:/ });
  await expect(refs).toHaveText(["[1]", "[2]", "[3]", "[1]", "[4]"]);
  await expect(refs.first()).toHaveAttribute("href", `/docs/${docId}`);
  await expect(
    chat.getByRole("link", { name: "fake", exact: true }),
  ).toHaveCount(0);
  await expect(
    chat.getByRole("link", { name: "unsafe", exact: true }),
  ).toHaveCount(0);
  await expect(chat.getByRole("list", { name: "Answer sources" })).toHaveCount(
    0,
  );
  await expect(chat.locator('a[href^="/__fieldbook-citation/"]')).toHaveCount(
    0,
  );
  await page.screenshot({
    path: info.outputPath("ask-ai-citations-compact.png"),
  });
  const toggle = chat.getByRole("button", { name: "4 sources" });
  await toggle.focus();
  await toggle.press("Enter");
  const list = chat.getByRole("list", { name: "Answer sources" });
  await expect(list.getByRole("link")).toHaveCount(4);
  await expect(list.getByRole("link").first()).toHaveAttribute(
    "href",
    `/docs/${docId}`,
  );
  await page.screenshot({
    path: info.outputPath("ask-ai-citations-expanded.png"),
  });
  await toggle.press("Enter");
  await refs.first().focus();
  await refs.first().press("Enter");
  await expect(page).toHaveURL(new RegExp(`/docs/${docId}`));
  await input.click();
  await expect(refs).toHaveCount(5);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("uncited replies finish quietly and clearing Search closes the panel until typing resumes", async ({
  page,
  request,
}, info) => {
  await fixture(page, request);
  await page.route("**/api/ask-ai", (route) =>
    route.fulfill({
      headers,
      body: stream("Hi! What would you like to know?", false, []),
    }),
  );
  const input = page.getByRole("textbox", { name: "Search all content" });
  const panel = page.locator('[data-slot="search-panel"]');
  await input.click();
  await input.press("Enter");
  await input.press("ArrowDown");
  await expect(panel).toHaveCount(0);
  await input.fill("Hi?");
  await input.press("Enter");
  const chat = page.getByRole("region", { name: "Ask AI conversation" });
  await expect(chat.getByRole("status")).toContainText("Answer ready");
  await expect(chat).toContainText("Hi! What would you like to know?");
  await expect(chat.getByRole("alert")).toHaveCount(0);
  await expect(chat.getByText("Response incomplete.")).toHaveCount(0);
  await expect(chat.getByRole("link")).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("ask-ai-uncited.png") });
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(input).toHaveValue("");
  await expect(input).toBeFocused();
  await expect(panel).toHaveCount(0);
  await input.click();
  await input.press("Enter");
  await input.press("ArrowDown");
  await expect(panel).toHaveCount(0);
  await input.fill("   ");
  await expect(panel).toHaveCount(0);
  await input.fill("reference");
  await expect(panel).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(panel).toHaveCount(0);
  await input.click();
  await expect(panel).toHaveCount(0);
  await input.fill("reopen");
  await page.getByRole("tab", { name: "Ask AI", exact: true }).click();
  await expect(chat).toContainText("Hi! What would you like to know?");
  await input.fill("");
  await expect(panel).toHaveCount(0);
  await input.click();
  await expect(panel).toHaveCount(0);
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
test("Ask AI public guests receive answers; disabled and private requests make no model call", async ({
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
  ).toContainText("Answer ready");
  await expect(
    page.getByRole("link", { name: /Source 1: Published reference/ }),
  ).toBeVisible();
  expect(calls).toBe(1);
  expect(
    (await (await request.get("http://127.0.0.1:3130/reads")).json())
      .aiGenerations,
  ).toBe(2);
  const data = {
    messages: [
      { role: "user", parts: [{ type: "text", text: "What is ready?" }] },
    ],
  };
  for (const mode of ["private", "off"] as const) {
    await request.post("http://127.0.0.1:3130/fixture", {
      data: {
        settings: {
          access: mode === "private" ? "private" : "public",
          askAi: {
            ...defaultAskAiSettings,
            enabled: mode !== "off",
            model: "test/primary",
          },
        },
      },
    });
    const rejected = await page.request.post("/api/ask-ai", {
      data,
      headers: { Origin: "http://localhost:3131" },
    });
    expect(rejected.status()).toBe(mode === "private" ? 401 : 403);
    expect(
      (await (await request.get("http://127.0.0.1:3130/reads")).json())
        .aiGenerations,
    ).toBe(0);
  }
});
test("Gateway budget refusals show safe unavailable feedback and preserve Search for guests", async ({
  page,
  request,
}) => {
  for (const failure of ["budget-planning", "budget-answer"]) {
    await fixture(page, request, true, false, failure);
    const input = page.getByRole("textbox", { name: "Search all content" });
    await input.fill("What is ready?");
    await input.press("Enter");
    await expect(
      page
        .getByRole("region", { name: "Ask AI conversation" })
        .getByRole("alert"),
    ).toContainText(aiUnavailableMessage);
    await expect(page.getByRole("link", { name: /Source 1/ })).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Ask AI conversation" }),
    ).not.toContainText("PRIVATE");
    await page.getByRole("tab", { name: "Search", exact: true }).click();
    await expect(
      page.getByRole("tab", { name: "Search", exact: true }),
    ).toHaveAttribute("data-state", "active");
    expect(
      (await (await request.get("http://127.0.0.1:3130/reads")).json())
        .aiGenerations,
    ).toBe(failure === "budget-planning" ? 1 : 2);
  }
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

test("thinking stays in one assistant position from submission through first streamed text", async ({
  page,
  request,
}, info) => {
  await fixture(page, request, true, true, "staged-answer");
  const input = page.getByRole("textbox", { name: "Search all content" });
  await input.fill("hello?");
  await input.press("Enter");
  const region = page.getByRole("region", { name: "Ask AI conversation" });
  const dots = region.locator('[data-slot="loading-dots"]');
  const composer = region.getByRole("textbox", { name: "Ask a follow-up" });
  await expect(dots).toHaveCount(1);
  await expect(dots).toBeVisible();
  await expect
    .poll(
      async () =>
        (await (await request.get("http://127.0.0.1:3130/reads")).json())
          .aiGenerations,
    )
    .toBe(1);
  const before = {
    dots: await dots.boundingBox(),
    panel: await region.boundingBox(),
    composer: await composer.boundingBox(),
  };
  const animation = await dots
    .locator("span")
    .first()
    .evaluate((el) => getComputedStyle(el).animationName);
  expect(animation).toBe("loading-dot");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() =>
      dots
        .locator("span")
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
    )
    .toBe("none");
  const headersReceived = page.waitForResponse((response) =>
    response.url().endsWith("/api/ask-ai"),
  );
  await request.post("http://127.0.0.1:3130/ai-stage", { data: { stage: 1 } });
  await headersReceived;
  await expect
    .poll(
      async () =>
        (await (await request.get("http://127.0.0.1:3130/reads")).json())
          .aiGenerations,
    )
    .toBe(2);
  await expect(dots).toHaveCount(1);
  const started = await dots.boundingBox();
  expect(Math.abs(started!.y - before.dots!.y)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("thinking.png") });
  await request.post("http://127.0.0.1:3130/ai-stage", { data: { stage: 2 } });
  const answer = region.getByText("Hi! What would you like to know?", {
    exact: true,
  });
  await expect(answer).toBeVisible();
  await expect(dots).toHaveCount(0);
  const after = {
    answer: await answer.boundingBox(),
    panel: await region.boundingBox(),
    composer: await composer.boundingBox(),
  };
  expect(Math.abs(after.answer!.y - before.dots!.y)).toBeLessThanOrEqual(1);
  for (const key of ["x", "y", "width", "height"] as const) {
    expect(
      Math.abs(after.panel![key] - before.panel![key]),
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(after.composer![key] - before.composer![key]),
    ).toBeLessThanOrEqual(1);
  }
  await request.post("http://127.0.0.1:3130/ai-stage", { data: { stage: 3 } });
  await expect(region.getByRole("status")).toHaveText("Answer ready.");
  await expect(
    region.getByText("Response incomplete.", { exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("greeting.png") });
});
