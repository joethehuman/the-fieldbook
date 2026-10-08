import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { defaultAskAiSettings } from "../../lib/ai";

// Discover production chunks by feature signatures, independent of build hashes.
const chunksDirectory = join(process.cwd(), ".next/static/chunks");
const aiChunks = readdirSync(chunksDirectory, { recursive: true })
  .filter(
    (file): file is string => typeof file === "string" && file.endsWith(".js"),
  )
  .filter((file) =>
    /Response stopped\.|Ask AI conversation|Failed to fetch the chat response\./.test(
      readFileSync(join(chunksDirectory, file), "utf8"),
    ),
  )
  .map((file) => `/_next/static/chunks/${file}`);

async function fixture(page: Page, request: APIRequestContext, enabled = true) {
  expect(aiChunks.length).toBeGreaterThan(0);
  await request.post("http://127.0.0.1:3130/fixture", {
    data: {
      settings: {
        access: "public",
        askAi: { ...defaultAskAiSettings, enabled, model: "test/primary" },
      },
    },
  });
  await page.route("**/api/search?**", (route) =>
    route.fulfill({ json: { results: [], hasMore: false } }),
  );
  await page.goto("/courses");
  await openSearch(page);
}

async function openSearch(page: Page) {
  const input = page.getByRole("textbox", { name: "Search all content" });
  const trigger = page.getByRole("button", {
    name: "Open search",
    exact: true,
  });
  await expect
    .poll(async () => (await input.isVisible()) || (await trigger.isVisible()))
    .toBe(true);
  if (await trigger.isVisible()) await trigger.click();
  else await input.click();
}

function response() {
  return {
    headers: {
      "Content-Type": "text/event-stream",
      "x-vercel-ai-ui-message-stream": "v1",
    },
    body:
      [
        { type: "start", messageId: crypto.randomUUID() },
        { type: "text-start", id: "answer" },
        {
          type: "text-delta",
          id: "answer",
          delta: "The delayed answer is ready.",
        },
        { type: "text-end", id: "answer" },
        { type: "finish", finishReason: "stop" },
      ]
        .map((part) => `data: ${JSON.stringify(part)}\n\n`)
        .join("") + "data: [DONE]\n\n",
  };
}

async function holdAiChunks(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requested: string[] = [];
  await page.route(
    (url) => aiChunks.includes(url.pathname),
    async (route) => {
      requested.push(route.request().url());
      await gate;
      await route.continue();
    },
  );
  return { release, requested };
}

for (const enabled of [false, true]) {
  test(`ordinary search does not load AI SDK or renderer when AI is ${enabled ? "enabled" : "disabled"}`, async ({
    page,
    request,
  }) => {
    const requested: string[] = [];
    page.on("request", (request) => {
      if (aiChunks.includes(new URL(request.url()).pathname))
        requested.push(request.url());
    });
    await fixture(page, request, enabled);
    const input = page.getByRole("textbox", { name: "Search all content" });
    await input.fill("ordinary search");
    await input.press("Enter");
    await expect(
      page.getByRole("heading", { name: "No results", exact: true }),
    ).toBeVisible();
    expect(requested).toEqual([]);
    if (enabled) {
      await page.getByRole("tab", { name: "Ask AI", exact: true }).click();
      await expect(
        page.getByRole("textbox", { name: "Your question" }),
      ).toBeVisible();
      expect(requested.length).toBeGreaterThan(0);
    }
  });
}

test("first question survives delayed AI chunks, repeated Enter, query edits and dismissal exactly once", async ({
  page,
  request,
}) => {
  const chunks = await holdAiChunks(page);
  const payloads: { messages: { parts: { text?: string }[] }[] }[] = [];
  await page.route("**/api/ask-ai", (route) => {
    payloads.push(route.request().postDataJSON());
    return route.fulfill(response());
  });
  await fixture(page, request);
  const input = page.getByRole("textbox", { name: "Search all content" });
  await input.fill("Remember this first question?");
  await input.press("Enter");
  await expect.poll(() => chunks.requested.length).toBeGreaterThan(0);
  await input.press("Enter");
  await input.fill("A later search query");
  await input.press("Escape");
  await expect(page.locator('[data-slot="search-panel"]')).toHaveCount(0);
  expect(payloads).toHaveLength(0);
  chunks.release();
  await expect.poll(() => payloads.length).toBe(1);
  expect(payloads[0].messages[0].parts).toEqual([
    { type: "text", text: "Remember this first question?" },
  ]);
  await openSearch(page);
  await page.getByRole("tab", { name: "Ask AI", exact: true }).click();
  await expect(page.getByRole("log")).toContainText(
    "Remember this first question?",
  );
  await expect(page.getByRole("log")).toContainText(
    "The delayed answer is ready.",
  );
  expect(payloads).toHaveLength(1);
  // Portaled conversation events still reach the search panel's Escape handler.
  await page.getByRole("textbox", { name: "Ask a follow-up" }).press("Escape");
  await expect(page.locator('[data-slot="search-panel"]')).toHaveCount(0);
  await openSearch(page);
  await page.getByRole("textbox", { name: "Ask a follow-up" }).focus();
  const navigation = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  const outside = (await navigation.isVisible())
    ? navigation
    : page
        .getByRole("navigation", { name: "Primary", exact: true })
        .getByRole("link", { name: "Updates", exact: true });
  await outside.focus();
  await expect(page.locator('[data-slot="search-panel"]')).toHaveCount(0);
});

test("new conversation cancels a first question while its AI chunk is still loading", async ({
  page,
  request,
}) => {
  const chunks = await holdAiChunks(page);
  let calls = 0;
  await page.route("**/api/ask-ai", (route) => {
    calls++;
    return route.fulfill(response());
  });
  await fixture(page, request);
  const input = page.getByRole("textbox", { name: "Search all content" });
  await input.fill("Cancel this queued question?");
  await input.press("Enter");
  await expect.poll(() => chunks.requested.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "New conversation" }).click();
  chunks.release();
  const question = page.getByRole("textbox", { name: "Your question" });
  await expect(question).toBeVisible();
  expect(calls).toBe(0);
  await expect(page.getByRole("log")).not.toContainText(
    "Cancel this queued question?",
  );
  await question.fill("A fresh question?");
  await question.press("Enter");
  await expect(page.getByRole("log")).toContainText(
    "The delayed answer is ready.",
  );
  expect(calls).toBe(1);
});

test("AI request survives search tabs, dismissal and ordinary navigation", async ({
  page,
  request,
}) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  await page.route("**/api/ask-ai", async (route) => {
    calls++;
    await gate;
    await route.fulfill(response());
  });
  await fixture(page, request);
  const input = page.getByRole("textbox", { name: "Search all content" });
  await input.fill("Continue while I navigate?");
  await input.press("Enter");
  await expect(
    page.getByRole("button", { name: "Stop response" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Search", exact: true }).click();
  await input.press("Escape");
  const navigation = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await navigation.isVisible()) await navigation.click();
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Updates", exact: true })
    .click();
  await expect(page).toHaveURL(/\/updates$/);
  await openSearch(page);
  await page.getByRole("tab", { name: "Ask AI", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop response" }),
  ).toBeVisible();
  release();
  await expect(page.getByRole("log")).toContainText(
    "The delayed answer is ready.",
  );
  await expect(
    page.getByText("Response incomplete.", { exact: true }),
  ).toHaveCount(0);
  expect(calls).toBe(1);
});

test("failed AI chunk leaves ordinary search available", async ({
  page,
  request,
}) => {
  const isAiChunk = (url: URL) => aiChunks.includes(url.pathname);
  await page.route(isAiChunk, (route) => route.abort("failed"));
  await fixture(page, request);
  const input = page.getByRole("textbox", { name: "Search all content" });
  await input.fill("Can this still search?");
  await input.press("Enter");
  const aiPanel = page.getByRole("tabpanel", { name: "Ask AI", exact: true });
  await expect(aiPanel.getByRole("alert")).toContainText("Ask AI couldn’t load");
  await page
    .getByRole("button", { name: "Dismiss message", exact: true })
    .click();
  await expect(aiPanel.getByRole("alert")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Reload page", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Search", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "No results", exact: true }),
  ).toBeVisible();
  await input.fill("another ordinary search");
  await input.press("Enter");
  await expect(
    page.getByRole("heading", { name: "No results", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Ask AI", exact: true }).click();
  await page.unroute(isAiChunk);
  await page.getByRole("button", { name: "Reload page", exact: true }).click();
  await openSearch(page);
  await input.fill("Try loading again");
  await page.getByRole("tab", { name: "Ask AI", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Your question" }),
  ).toBeVisible();
});
