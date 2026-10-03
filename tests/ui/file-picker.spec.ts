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
