import { test, expect } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
test("search titles, lessons, filters, keyboard, destinations and empty state", async ({
  page,
}, info) => {
  const data = freshWorkspace();
  const course = data.content.find((c) => c.kind === "course")!;
  course.title = "Distributed systems";
  course.lessons[1].title = "Consensus";
  course.lessons[1].body = "A quorum election chooses the leader.";
  data.content.push({
    ...course,
    id: "draft-only",
    title: "Hidden secret",
    status: "draft",
  });
  await page.addInitScript((data) => {
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
    sessionStorage.setItem("fieldbook.profile.v1", "demo-learner");
  }, data);
  await page.goto("/#courses");
  const input = page.getByRole("textbox", { name: "Search all content" });
  const originalPage = await page.locator("main").innerText();
  await page.locator("main").evaluate((main) => {
    main.firstElementChild!.setAttribute(
      "data-search-preservation",
      "retained",
    );
  });
  await input.fill("quorum");
  const result = page.getByRole("link", { name: /Distributed systems/ });
  await expect(result).toBeVisible();
  expect(await page.locator("main").innerText()).toBe(originalPage);
  await expect(
    page.locator('[data-search-preservation="retained"]'),
  ).toHaveCount(1);
  const panel = page.locator('[data-slot="search-panel"]');
  const bounds = (await panel.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  if (viewport.width >= 768)
    expect(bounds.x).toBeGreaterThanOrEqual(
      await page
        .locator(".sidebar")
        .evaluate((el) => el.getBoundingClientRect().right),
    );
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.height).toBeLessThanOrEqual(viewport.height * 0.65 + 1);
  if (viewport.width > 1000)
    expect(bounds.width).toBeLessThan(viewport.width * 0.8);
  await input.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("quorum");
  await input.blur();
  await input.focus();
  await expect(result).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(panel).toHaveCount(0);
  await input.focus();
  await expect(result).toBeVisible();
  await input.fill("a");
  await expect(panel.getByRole("status")).not.toContainText("Searching");
  const scroll = panel.locator('[data-slot="search-results-scroll"]');
  expect(await scroll.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  await scroll.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const filters = await panel
    .getByRole("group", { name: "Content type" })
    .boundingBox();
  const scrollBounds = (await scroll.boundingBox())!;
  expect(filters!.y).toBeGreaterThanOrEqual(scrollBounds.y);
  expect(filters!.y).toBeLessThan(scrollBounds.y + 50);
  await input.fill("quorum");
  await expect(result).toBeVisible();
  await expect(result.locator("mark")).toContainText(["quorum"]);
  await expect(result).toContainText("Lesson: Consensus");
  await page.screenshot({
    path: info.outputPath("search-results.png"),
    fullPage: false,
  });
  await page
    .getByRole("group", { name: "Content type" })
    .getByRole("button", { name: "Docs", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "No results", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Content type" })
    .getByRole("button", { name: "Courses", exact: true })
    .click();
  await expect(result).toBeVisible();
  await result.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Consensus", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/lesson=/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Consensus", exact: true }),
  ).toBeVisible();
  await input.fill("distrib");
  await expect(result).toBeVisible();
  await input.fill("distrbiuted");
  await expect(result).toBeVisible();
  await input.fill("hidden secret");
  await expect(
    page.getByRole("heading", { name: "No results", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("search-empty.png"),
    fullPage: false,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("search preserves an unsaved editor and guards result navigation", async ({
  page,
}) => {
  const data = freshWorkspace();
  data.content[1].title = "Published destination";
  data.content[1].status = "published";
  await page.addInitScript((data) => {
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
  }, data);
  await page.goto("/#admin");
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  const title = page.getByRole("textbox", { name: "Title", exact: true });
  // Successful autosave allows navigation. Hold a real failed save to exercise
  // the unsaved-work guard while search remains available over the editor.
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "fieldbook.workspace.v1")
        throw new Error("Synthetic save failure");
      setItem.call(this, key, value);
    };
  });
  await title.fill("Unsaved work survives search");
  const input = page.getByRole("textbox", { name: "Search all content" });
  await input.fill("Published destination");
  const result = page.getByRole("link", { name: /Published destination/ });
  await expect(result).toBeVisible();
  await expect(title).toHaveValue("Unsaved work survives search");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await result.click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(title).toHaveValue("Unsaved work survives search");
  await expect(page).toHaveURL(/#admin/);
  await input.click();
  await expect(result).toBeVisible();
  await result.click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Published destination", exact: true }),
  ).toBeVisible();
});

test("Search returns to the first results and chat uses an embedded multiline composer", async ({
  page,
}, info) => {
  const data = freshWorkspace();
  const doc = data.content.find((item) => item.kind === "doc")!;
  data.content.push(
    ...Array.from({ length: 22 }, (_, i) => ({
      ...doc,
      id: `polish-reference-${i}`,
      title: `Customer reference ${String(i).padStart(2, "0")}`,
      status: "published" as const,
      body: "Customer reference instructions for a support conversation.",
    })),
  );
  await page.addInitScript((data) => {
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
    sessionStorage.setItem("fieldbook.profile.v1", "demo-learner");
  }, data);
  const aiRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/ask-ai")) aiRequests.push(request.url());
  });
  await page.goto("/#courses");
  await expect(
    page.getByRole("heading", { name: "Courses", exact: true }),
  ).toBeVisible();
  const openSearch = page.getByRole("button", {
    name: "Open search",
    exact: true,
  });
  if (await openSearch.isVisible()) await openSearch.click();
  const input = page.getByRole("textbox", { name: "Search all content" });
  await input.fill("Customer reference");
  const panel = page.locator('[data-slot="search-panel"]');
  const first = panel.getByRole("link", { name: /Customer reference/ }).first();
  await expect(first).toBeVisible();
  const initialHeight = (await panel.boundingBox())!.height;
  expect(initialHeight).toBeGreaterThan(page.viewportSize()!.height * 0.6);
  const firstY = (await first.boundingBox())!.y;
  await expect(
    panel.getByRole("button", { name: "Ask AI", exact: true }),
  ).toHaveCount(0);
  await panel.getByRole("tab", { name: "Ask AI", exact: true }).click();
  const chat = page.getByRole("region", { name: "Ask AI conversation" });
  const initialQuestion = chat.getByRole("textbox", { name: "Your question" });
  await initialQuestion.fill("Customer reference");
  await initialQuestion.press("Enter");
  await expect(chat.getByRole("status")).toContainText("Answer ready");
  const follow = chat.getByRole("textbox", { name: "Ask a follow-up" });
  await expect(follow).toBeVisible();
  await follow.fill("More detail about this customer reference. ".repeat(45));
  await follow.press("Enter");
  await expect(chat.getByRole("status")).toContainText("Answer ready");
  await expect
    .poll(() =>
      chat
        .locator('[data-slot="conversation-scroll"]')
        .evaluate((element) => element.scrollTop),
    )
    .toBeGreaterThan(0);
  expect((await panel.boundingBox())!.height).toBe(initialHeight);
  await panel.getByRole("tab", { name: "Search", exact: true }).click();
  await expect
    .poll(() =>
      panel
        .locator('[data-slot="search-results-scroll"]')
        .evaluate((element) => element.scrollTop),
    )
    .toBe(0);
  await expect(first).toBeVisible();
  expect(Math.abs((await first.boundingBox())!.y - firstY)).toBeLessThan(2);
  await page.screenshot({ path: info.outputPath("search-return-top.png") });

  await panel.getByRole("tab", { name: "Ask AI", exact: true }).click();
  const reset = panel.getByRole("button", { name: "New conversation" });
  await expect(reset.locator("svg")).toBeVisible();
  await reset.click();
  const question = chat.getByRole("textbox", { name: "Your question" });
  await expect(question).toBeVisible();
  await expect(chat.getByRole("log")).toBeEmpty();
  await expect(chat).not.toContainText("Answers from published");
  await expect(chat).not.toContainText("Ask a question using");
  expect((await panel.boundingBox())!.height).toBe(initialHeight);
  const emptyComposer = (await chat
    .locator('[data-slot="message-composer-field"]')
    .boundingBox())!;
  const emptyComposerBottom = emptyComposer.y + emptyComposer.height;
  await page.mouse.move(0, 0);
  await page.screenshot({ path: info.outputPath("ask-ai-empty-chat.png") });
  await question.fill("Where should I start?");
  await chat.getByRole("button", { name: "Ask AI", exact: true }).click();
  await expect(chat.getByRole("status")).toContainText("Answer ready");
  await follow.fill("A follow-up");
  await follow.press("Shift+Enter");
  await follow.pressSequentially("With more detail");
  await follow.dispatchEvent("keydown", { key: "Enter", isComposing: true });
  await expect(follow).toHaveValue("A follow-up\nWith more detail");
  await expect(
    chat
      .getByRole("log")
      .getByText("This feature is not available in the demo site.", {
        exact: true,
      }),
  ).toHaveCount(1);

  const field = chat.locator('[data-slot="message-composer-field"]');
  const action = chat.getByRole("button", { name: "Ask AI", exact: true });
  await follow.fill(
    "How can I apply the customer conversation guidance to a new account? ".repeat(
      8,
    ),
  );
  const fieldBox = (await field.boundingBox())!;
  const textBox = (await follow.boundingBox())!;
  const actionBox = (await action.boundingBox())!;
  expect(fieldBox.width - textBox.width).toBeLessThan(4);
  const textPadding = await follow.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      left: parseFloat(style.paddingLeft),
      right: parseFloat(style.paddingRight),
    };
  });
  expect(textPadding.left).toBe(textPadding.right);
  expect(textBox.y + textBox.height).toBeLessThan(actionBox.y);
  expect(
    fieldBox.y + fieldBox.height - textBox.y - textBox.height,
  ).toBeGreaterThan(actionBox.height);
  expect(actionBox.x).toBeGreaterThan(fieldBox.x);
  expect(actionBox.x + actionBox.width).toBeLessThan(
    fieldBox.x + fieldBox.width,
  );
  expect(actionBox.y + actionBox.height).toBeLessThan(
    fieldBox.y + fieldBox.height,
  );
  const panelBox = (await panel.boundingBox())!;
  expect(panelBox.height).toBe(initialHeight);
  const leftPadding = fieldBox.x - panelBox.x;
  const rightPadding =
    panelBox.x + panelBox.width - fieldBox.x - fieldBox.width;
  expect(Math.abs(leftPadding - rightPadding)).toBeLessThan(2);
  await page.screenshot({
    path: info.outputPath("ask-ai-full-width-composer.png"),
  });
  await follow.fill("A follow-up\nWith more detail");
  const shortComposer = (await field.boundingBox())!;
  expect(shortComposer.y + shortComposer.height).toBe(emptyComposerBottom);
  await page.screenshot({
    path: info.outputPath("ask-ai-embedded-composer.png"),
  });
  await action.click();
  await expect(chat.getByRole("log")).toContainText("With more detail");
  await expect(chat.getByRole("status")).toContainText("Answer ready");
  for (const question of ["How does that help?", "What should I try next?"]) {
    await follow.fill(question);
    await follow.press("Enter");
    await expect(chat.getByRole("log")).toContainText(question);
    await expect(chat.getByRole("status")).toContainText("Answer ready");
    expect((await panel.boundingBox())!.height).toBe(initialHeight);
    const fieldBox = (await field.boundingBox())!;
    expect(fieldBox.y + fieldBox.height).toBe(emptyComposerBottom);
  }
  await reset.hover();
  await expect
    .poll(() =>
      reset.evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    .not.toBe("rgba(0, 0, 0, 0)");
  await page.screenshot({ path: info.outputPath("ask-ai-steady-chat.png") });
  if (info.project.name === "tablet") {
    await page.setViewportSize({ width: 1180, height: 740 });
    const landscapeHeight = (await panel.boundingBox())!.height;
    expect(landscapeHeight).toBeGreaterThan(740 * 0.6);
    await expect(action).toBeInViewport();
    await expect(
      chat
        .getByRole("log")
        .getByText("What should I try next?", { exact: true }),
    ).toBeInViewport({ ratio: 1 });
    await page.screenshot({
      path: info.outputPath("ask-ai-tablet-landscape.png"),
    });
    await reset.click();
    await expect(chat.getByRole("log")).toBeEmpty();
    expect((await panel.boundingBox())!.height).toBe(landscapeHeight);
    await page.screenshot({
      path: info.outputPath("ask-ai-tablet-landscape-empty.png"),
    });
    await question.fill("Where can I begin?");
    await question.press("Enter");
    await expect(chat.getByRole("status")).toContainText("Answer ready");
    expect((await panel.boundingBox())!.height).toBe(landscapeHeight);
  }
  await input.fill("No matching reference xyzxyzxyz");
  await expect(
    panel.getByRole("heading", { name: "No results" }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("search-steady-empty.png") });
  if (info.project.name !== "tablet") {
    expect((await panel.boundingBox())!.height).toBe(initialHeight);
  }
  expect(aiRequests).toEqual([]);
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(input).toHaveValue("");
  if (await openSearch.isVisible()) {
    await expect(
      panel.getByRole("tab", { name: "Search", exact: true }),
    ).toHaveAttribute("aria-selected", "true");
  } else {
    await expect(panel).toHaveCount(0);
  }
  await expect(chat).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
