import { test, expect } from "@playwright/test";

test("long quiz review filters saved verdicts, keeps original numbering and handles long answers", async ({ page }, info) => {
  await page.goto("/ui/quiz-review");
  await expect(page.getByRole("heading", { name: "7 of 10 correct" })).toBeVisible();
  const answers = page.getByRole("list", { name: "Reviewed answers" });
  const rows = answers.locator(":scope > li");
  await expect(rows).toHaveCount(10);
  await expect(rows.nth(5).getByText("Your answers:", { exact: true })).toBeVisible();
  await expect(rows.nth(5).getByRole("listitem")).toHaveCount(2);
  const snapshot = await page.evaluate(() => localStorage.getItem("fieldbook.workspace.v1"));
  const filter = page.getByRole("group", { name: "Answer review filter" });
  await filter.getByRole("button", { name: "Incorrect 3", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(filter.getByRole("button", { name: "Incorrect 3", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(rows).toHaveCount(3);
  for (const [index, number] of [1, 4, 8].entries()) {
    await expect(rows.nth(index)).toContainText(`Question ${number}`);
    await expect(rows.nth(index).getByText("Incorrect", { exact: true })).toBeVisible();
  }
  await page.screenshot({ path: info.outputPath("incorrect-only.png"), fullPage: true });
  await filter.getByRole("button", { name: "All 10", exact: true }).click();
  await expect(rows).toHaveCount(10);
  await rows.nth(8).scrollIntoViewIfNeeded();
  await expect(rows.nth(8)).toContainText("implementation team has not yet confirmed");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath("ten-questions.png"), fullPage: true });

  const review = page.getByRole("button", { name: "Review answers", exact: true });
  await review.click();
  await expect(answers).not.toBeVisible();
  await page.keyboard.press("Space");
  await expect(answers).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("fieldbook.workspace.v1"))).toBe(snapshot);

  await page.getByRole("button", { name: "All correct", exact: true }).click();
  await expect(page.getByRole("heading", { name: "10 of 10 correct" })).toBeVisible();
  await expect(page.getByText("Course complete.", { exact: true })).toBeVisible();
  await expect(filter).toHaveCount(0);
  await expect(rows).toHaveCount(10);
  await expect(answers.getByText("Correct", { exact: true })).toHaveCount(10);
});

test("short quiz reviews keep simple grouping and support enlarged text", async ({ page }, info) => {
  await page.goto("/ui/quiz-review");
  await page.getByRole("button", { name: "2 questions", exact: true }).click();
  await expect(page.getByRole("heading", { name: "1 of 2 correct" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Answer review filter" })).toHaveCount(0);
  const answers = page.getByRole("list", { name: "Reviewed answers" });
  await expect(answers.locator(":scope > li")).toHaveCount(2);
  await page.screenshot({ path: info.outputPath("two-questions.png"), fullPage: true });
  await page.getByRole("button", { name: "1 question", exact: true }).click();
  await expect(page.getByRole("heading", { name: "0 of 1 correct" })).toBeVisible();
  await expect(answers.locator(":scope > li")).toHaveCount(1);
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect(answers.getByRole("heading")).toBeVisible();
  await page.screenshot({ path: info.outputPath("single-enlarged.png"), fullPage: true });
});
