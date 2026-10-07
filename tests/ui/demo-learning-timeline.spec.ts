import { expect, test } from "@playwright/test";

test("a built demo keeps its deadline mix on fresh and returning visits months apart", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date("2026-10-07T12:00:00Z"));
  await page.addInitScript(() =>
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin"),
  );
  await page.goto("/#courses/all");
  const future = page
    .locator(".course-card")
    .filter({
      has: page.getByRole("heading", {
        name: "Managing Through Reorganization",
        exact: true,
      }),
    });
  await expect(future).toContainText("Due in 5 days");
  await expect(future).not.toContainText("Past due");
  await expect(future.locator("time")).toHaveCSS("color", "rgb(102, 102, 102)");
  // Use any overdue original course rather than depending on editorial titles.
  await expect(
    page.locator(".course-card").filter({ hasText: "28 days past due" }),
  ).toHaveCount(3);
  const progress = await page.evaluate(
    () => JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!).progress,
  );

  await page.clock.setFixedTime(new Date("2027-04-07T12:00:00Z"));
  await page.reload();
  await expect(future).toContainText("Due in 5 days");
  const pastCards = page
    .locator(".course-card")
    .filter({ hasText: "28 days past due" });
  await expect(pastCards).toHaveCount(3);
  for (const past of await pastCards.all()) {
    await expect(past).toContainText("Past due");
    await expect(past.locator("time")).toContainText("28 days past due");
    await expect(past.locator("time")).toHaveCSS("color", "rgb(180, 35, 24)");
  }
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
  );
  expect(saved.demoLearningDay).toBe("2027-04-07");
  expect(saved.progress).toEqual(progress);
  await future.screenshot({ path: info.outputPath("due-in-five-days.png") });
  await pastCards.first().screenshot({ path: info.outputPath("past-due.png") });
  await page.reload();
  await expect(future).toContainText("Due in 5 days");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!)
          .demoLearningDay,
    ),
  ).toBe("2027-04-07");

  // A brand-new visitor years after the same static build gets the same mix.
  await page.evaluate(() => localStorage.clear());
  await page.clock.setFixedTime(new Date("2032-09-30T12:00:00Z"));
  await page.reload();
  await expect(future).toContainText("Due in 5 days");
  await expect(pastCards).toHaveCount(3);
  expect(errors).toEqual([]);
});
