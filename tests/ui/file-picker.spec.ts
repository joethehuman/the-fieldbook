import { test, expect } from "@playwright/test";

test("file selection opens natively by keyboard, replaces the same filename and fits long names", async ({
  page,
}, info) => {
  await page.goto("/ui");
  const button = page.getByRole("button", {
    name: "Choose CSV file",
    exact: true,
  });
  await button.scrollIntoViewIfNeeded();
  const picker = page
    .locator('[data-slot="file-picker"]')
    .filter({ has: button });
  await expect(picker.getByRole("status")).toHaveText("No CSV file selected");
  await expect(button).toHaveAccessibleDescription(/Choose a CSV/);
  await button.focus();
  expect(
    await button.evaluate((el) => getComputedStyle(el).boxShadow),
  ).not.toBe("none");
  const name =
    "Regional-organization-and-reporting-teams-with-a-very-long-filename-2026.csv";
  for (const content of ["Name,Email", "Name,Email\nPat,pat@example.test"]) {
    const chooser = page.waitForEvent("filechooser");
    await button.press("Enter");
    await (
      await chooser
    ).setFiles({ name, mimeType: "text/csv", buffer: Buffer.from(content) });
    await expect(picker.getByRole("status")).toHaveText(name);
    await expect(button).toBeEnabled();
    await expect(button).not.toHaveAttribute("aria-busy", "true");
  }
  const bounds = await picker.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
    info.project.use.viewport!.width,
  );
  expect(await picker.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await expect(
    page.getByRole("button", { name: "Choose unavailable file" }),
  ).toBeDisabled();
  await page.screenshot({ path: info.outputPath("file-picker.png") });
});

test("file picker acknowledges before native handoff and recovers from cancellation", async ({
  page,
}, info) => {
  await page.goto("/ui");
  const button = page.getByRole("button", {
    name: "Choose CSV file",
    exact: true,
  });
  const picker = page
    .locator('[data-slot="file-picker"]')
    .filter({ has: button });
  const input = picker.locator('input[type="file"]');
  await input.setInputFiles({
    name: "previous.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Name,Email"),
  });
  await expect(picker.getByRole("status")).toHaveText("previous.csv");
  await button.scrollIntoViewIfNeeded();
  const originalWidth = (await button.boundingBox())!.width;
  await picker.evaluate((element) => {
    const trigger = element.querySelector("button")!;
    element.querySelector("input")!.addEventListener("click", () => {
      element.setAttribute(
        "data-handoff",
        JSON.stringify({
          active: navigator.userActivation.isActive,
          busy: trigger.getAttribute("aria-busy"),
          status: element.querySelector('[role="status"]')!.textContent,
        }),
      );
      element.setAttribute(
        "data-open-count",
        String(Number(element.getAttribute("data-open-count") || 0) + 1),
      );
    });
  });
  const chooser = page.waitForEvent("filechooser");
  await button.press("Enter");
  await chooser;
  expect(JSON.parse((await picker.getAttribute("data-handoff"))!)).toEqual({
    active: true,
    busy: "true",
    status: "Opening file picker…",
  });
  await expect(button).toBeDisabled();
  expect((await button.boundingBox())!.width).toBe(originalWidth);
  await button.dispatchEvent("click");
  await expect(picker).toHaveAttribute("data-open-count", "1");
  await page.screenshot({ path: info.outputPath("file-picker-opening.png") });

  // Playwright intercepts the system dialog; exercise its native cancel event
  // explicitly rather than claiming to press the operating-system Cancel button.
  await input.dispatchEvent("cancel");
  await expect(button).toBeEnabled();
  await expect(button).not.toHaveAttribute("aria-busy", "true");
  await expect(button).toBeFocused();
  await expect(picker.getByRole("status")).toHaveText("previous.csv");
  const reopened = page.waitForEvent("filechooser");
  await button.press("Space");
  await (
    await reopened
  ).setFiles({
    name: "replacement.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Name,Email\nPat,pat@example.test"),
  });
  await expect(picker.getByRole("status")).toHaveText("replacement.csv");
  await expect(button).toBeEnabled();
});

test("file picker clears pending feedback when focus returns without a cancel event", async ({
  page,
}) => {
  await page.goto("/ui");
  const button = page.getByRole("button", {
    name: "Choose CSV file",
    exact: true,
  });
  const picker = page
    .locator('[data-slot="file-picker"]')
    .filter({ has: button });
  // Simulate an older browser's dialog lifecycle without opening a real dialog.
  await picker.locator("input").evaluate((input) => {
    input.addEventListener("click", (event) => event.preventDefault(), {
      once: true,
    });
  });
  await button.press("Enter");
  await expect(button).toHaveAttribute("aria-busy", "true");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(button).toBeEnabled();
  await expect(button).toBeFocused();
  await expect(picker.getByRole("status")).toHaveText("No CSV file selected");
  const chooser = page.waitForEvent("filechooser");
  await button.press("Enter");
  await (await chooser).setFiles([]);
  await expect(button).toBeEnabled();
  await expect(picker.getByRole("status")).toHaveText("No CSV file selected");
});
