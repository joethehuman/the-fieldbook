import { test, expect } from "@playwright/test";

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
