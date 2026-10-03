import { test, expect } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { authoringUser, setupAuthoringProvider } from "./provider-fixture";

test("installed deadline review paginates 500 people and retains a stale review until reopened", async ({
  page,
}, info) => {
  test.skip(
    info.project.name.startsWith("demo"),
    "Installed API contract; demo parity has its own test.",
  );
  const state = freshWorkspace();
  await setupAuthoringProvider(page, state);
  await page.route("**/api/admin/snapshot?**", (route) =>
    route.fulfill({ json: { data: state, user: authoringUser } }),
  );
  await page.route("**/api/search?**", (route) =>
    route.fulfill({ json: { results: [], hasMore: false } }),
  );
  let previews = 0,
    applies = 0,
    stale = true;
  const token = "a".repeat(32),
    review = {
      token,
      onboardingDays: 90,
      catchUpDays: 7,
      clocks: [],
      courses: Array.from({ length: 500 }, (_, i) => ({
        personId: `person-${i}`,
        name: `Person ${String(i).padStart(3, "0")}`,
        contentId: "course",
        title: "Course",
        before: "2026-01-01",
        after: "2026-02-01",
      })),
    };
  await page.route("**/api/admin/deadlines", async (route) => {
    const input = route.request().postDataJSON();
    if (input.token) {
      applies++;
      expect(input).toEqual({ token });
      if (stale)
        return route.fulfill({
          status: 409,
          json: { error: "Deadlines changed. Review them again." },
        });
    } else {
      previews++;
      expect(input).toEqual({});
    }
    return route.fulfill({ json: review });
  });
  await page.goto("/admin");
  const picker = page.getByRole("combobox", {
    name: "Administration section",
    exact: true,
  });
  if (await picker.isVisible()) {
    await picker.click();
    await page.getByRole("option", { name: "Due dates", exact: true }).click();
  } else
    await page.getByRole("tab", { name: "Due dates", exact: true }).click();
  const open = page.getByRole("button", {
    name: "Review existing deadlines",
    exact: true,
  });
  await open.click();
  const dialog = page.getByRole("dialog", {
    name: "Recalculate existing deadlines",
    exact: true,
  });
  await expect(dialog).toContainText("500 unfinished course deadlines");
  await expect(dialog.getByRole("row")).toHaveCount(26);
  await dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(dialog).toContainText("Person 025");
  await dialog
    .getByRole("textbox", { name: "Find a person or course", exact: true })
    .fill("Person 499");
  await expect(dialog.getByRole("row")).toHaveCount(2);
  await expect(dialog).toContainText("Person 499");
  const bounds = await dialog.boundingBox(),
    width = page.viewportSize()!.width;
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width + 1);
  await page.screenshot({
    path: info.outputPath("installed-deadline-review.png"),
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(applies).toBe(0);
  await open.click();
  await dialog
    .getByRole("button", { name: "Apply recalculation", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toHaveText(
    "Deadlines changed. Review them again.",
  );
  await expect(
    dialog.getByRole("button", { name: "Apply recalculation", exact: true }),
  ).toBeDisabled();
  await expect(dialog).toContainText("Person 000");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  stale = false;
  await open.click();
  await dialog
    .getByRole("button", { name: "Apply recalculation", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(previews).toBe(3);
  expect(applies).toBe(2);
});
