import { test, expect } from "@playwright/test";

test.use({ hasTouch: true, isMobile: true });

test("touching the chat field focuses without cancelling caret gestures during keyboard resizing", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone", "Phone search dialog.");
  await page.addInitScript(() =>
    sessionStorage.setItem("fieldbook.profile.v1", "demo-learner"),
  );
  await page.goto("/#courses");
  await page.getByRole("button", { name: "Open search", exact: true }).tap();
  const panel = page.getByRole("dialog", {
    name: "Search Fieldbook",
    exact: true,
  });
  await panel.getByRole("tab", { name: "Ask AI", exact: true }).tap();
  const draft = panel.getByRole("textbox", {
    name: "Your question",
    exact: true,
  });
  await expect(draft).toBeVisible();
  // The first touch should establish focus before the browser's default caret
  // gesture, without cancelling that gesture. Later touches must remain native.
  await draft.evaluate((element) => {
    element.addEventListener("pointerup", (event) => {
      element.dataset.touchFocus = String(document.activeElement === element);
      element.dataset.touchCancelled = String(event.defaultPrevented);
    });
  });
  await draft.tap();
  await expect(draft).toBeFocused();
  await expect(draft).toHaveAttribute("data-touch-focus", "true");
  await expect(draft).toHaveAttribute("data-touch-cancelled", "false");
  await page.keyboard.type("Help me prepare for a customer conversation.");
  for (const [height, top] of [
    [650, 0],
    [510, 120],
    [420, 40],
    [365, 70],
  ]) {
    const geometry = await panel.evaluate(
      async (element, { height, top }) => {
        Object.defineProperty(window.visualViewport!, "height", {
          configurable: true,
          value: height,
        });
        Object.defineProperty(window.visualViewport!, "offsetTop", {
          configurable: true,
          value: top,
        });
        window.visualViewport!.dispatchEvent(new Event("resize"));
        window.visualViewport!.dispatchEvent(new Event("scroll"));
        await new Promise(requestAnimationFrame);
        const header = element
          .querySelector('[data-slot="search-compact-header"]')!
          .getBoundingClientRect();
        const composer = element
          .querySelector('[data-slot="message-composer"]')!
          .getBoundingClientRect();
        return {
          headerTop: header.top,
          headerBottom: header.bottom,
          composerTop: composer.top,
          composerBottom: composer.bottom,
        };
      },
      { height, top },
    );
    expect(geometry.headerTop).toBeCloseTo(top, 0);
    expect(geometry.composerTop).toBeGreaterThan(geometry.headerBottom);
    expect(geometry.composerBottom).toBeLessThanOrEqual(top + height);
    await expect(draft).toBeFocused();
  }
  // A tap within the already focused field still places the caret normally.
  await draft.tap({ position: { x: 14, y: 15 } });
  const caret = await draft.evaluate(
    (element: HTMLTextAreaElement) => element.selectionStart,
  );
  expect(caret).toBeLessThan(8);
  await page.keyboard.type("Please ");
  await expect(draft).toHaveValue(/^Please .*customer conversation\.$/);
  await page.screenshot({
    path: info.outputPath("chat-focus-keyboard-transition.png"),
  });
  await panel.getByRole("button", { name: "Ask AI", exact: true }).tap();
  await expect(
    panel.getByRole("log", { name: "Conversation messages" }),
  ).toContainText("customer conversation");
  await expect(
    panel.getByRole("textbox", { name: "Ask a follow-up", exact: true }),
  ).toHaveValue("");
  await panel.getByRole("button", { name: "Close search", exact: true }).tap();
  await expect(panel).toHaveCount(0);
  await page.getByRole("button", { name: "Open search", exact: true }).tap();
  await expect(
    panel.getByRole("log", { name: "Conversation messages" }),
  ).toContainText("customer conversation");
});

test("phone search tracks keyboard space, keeps controls pinned and preserves the chat draft", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone", "Phone search dialog.");
  await page.addInitScript(() =>
    sessionStorage.setItem("fieldbook.profile.v1", "demo-learner"),
  );
  await page.goto("/#courses");
  const main = page.locator("main");
  const originalScroll = await main.evaluate((element) => {
    element.scrollTop = 200;
    return element.scrollTop;
  });
  const trigger = page.getByRole("button", {
    name: "Open search",
    exact: true,
  });
  await trigger.click();
  const panel = page.getByRole("dialog", {
    name: "Search Fieldbook",
    exact: true,
  });
  const input = panel.getByRole("textbox", {
    name: "Search all content",
    exact: true,
  });
  await expect(input).toBeFocused();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    expect(
      await panel.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
  }
  // The visual viewport changes independently of the layout viewport when the
  // software keyboard opens or Safari pans the focused field into view.
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, "height", {
      configurable: true,
      value: 420,
    });
    Object.defineProperty(window.visualViewport!, "offsetTop", {
      configurable: true,
      value: 40,
    });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect
    .poll(async () => (await panel.boundingBox())!.y)
    .toBeCloseTo(40, 0);
  await expect
    .poll(async () => (await panel.boundingBox())!.height)
    .toBeCloseTo(420, 0);
  const close = panel.getByRole("button", {
    name: "Close search",
    exact: true,
  });
  const closeBox = (await close.boundingBox())!;
  expect(closeBox.width).toBeGreaterThanOrEqual(44);
  expect(closeBox.height).toBeGreaterThanOrEqual(44);
  await panel.getByRole("tab", { name: "Ask AI", exact: true }).click();
  const chat = panel.getByRole("region", { name: "Ask AI conversation" });
  const draft = chat.getByRole("textbox", {
    name: "Your question",
    exact: true,
  });
  const question = "Help me prepare for a customer conversation.";
  await draft.fill(question);
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, "height", {
      configurable: true,
      value: 365,
    });
    Object.defineProperty(window.visualViewport!, "offsetTop", {
      configurable: true,
      value: 70,
    });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await expect
    .poll(async () => (await panel.boundingBox())!.y)
    .toBeCloseTo(70, 0);
  await expect
    .poll(async () => (await panel.boundingBox())!.height)
    .toBeCloseTo(365, 0);
  const action = chat.getByRole("button", { name: "Ask AI", exact: true });
  const actionBox = (await action.boundingBox())!;
  expect(actionBox.y + actionBox.height).toBeLessThanOrEqual(435);
  expect((await close.boundingBox())!.y).toBeLessThan(100);
  await page.screenshot({
    path: info.outputPath("phone-search-with-keyboard-space.png"),
  });
  await page.keyboard.press("Control+k");
  await expect(input).toBeFocused();
  await expect(draft).toHaveValue(question);
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, "height", {
      configurable: true,
      value: innerHeight,
    });
    Object.defineProperty(window.visualViewport!, "offsetTop", {
      configurable: true,
      value: 0,
    });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  });
  await close.click();
  await expect(panel).toHaveCount(0);
  await expect(trigger).toBeFocused();
  expect(await main.evaluate((element) => element.scrollTop)).toBe(
    originalScroll,
  );
  await trigger.click();
  await expect(draft).toHaveValue(question);
  await expect(close).toBeInViewport();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});
