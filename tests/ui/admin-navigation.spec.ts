import { test, expect, type Page, type Locator } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";

async function section(page: Page, name: string) {
  const picker = page.getByRole("combobox", {
    name: "Administration section",
    exact: true,
  });
  if (await picker.isVisible()) {
    await picker.click();
    await page.getByRole("option", { name, exact: true }).click();
  } else await page.getByRole("tab", { name, exact: true }).click();
}
async function revealed(target: Locator) {
  await expect
    .configure({ soft: true })
    .poll(async () =>
      target.evaluate((el) => {
        const top = el.getBoundingClientRect().top;
        const panel = el.closest(".admin-panel")?.getBoundingClientRect();
        const bar =
          parseFloat(
            getComputedStyle(document.documentElement).getPropertyValue(
              "--app-bar-height",
            ),
          ) || 64;
        return (
          top >= Math.max(bar, panel?.top ?? bar) &&
          top < (panel?.bottom ?? innerHeight)
        );
      }),
    )
    .toBe(true);
}

test("admin destinations reveal details and keep filters and fieldset footers coherent", async ({
  page,
}, info) => {
  // Exercise animated desktop navigation and the reduced-motion mobile path.
  await page.emulateMedia({
    reducedMotion: info.project.name === "phone" ? "reduce" : "no-preference",
  });
  const data = freshWorkspace();
  const content = data.content[0];
  content.title =
    "Your weekly updates and an intentionally long content title for wrapping";
  data.feedback = data.users.slice(0, 2).map((u, index) => ({
    id: `admin-navigation-${index}`,
    userId: u.id,
    contentId: content.id,
    version: content.version,
    rating: index ? "down" : "up",
    comment: "Navigation fixture",
    updatedAt: "2026-09-23T12:00:00Z",
  }));
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto("/#admin");
  await expect(page.locator(".admin-layout")).toBeVisible();
  await section(page, "Progress");
  const person = page.locator("[data-person-id]").first();
  const personName = await person.innerText();
  await person.click();
  const assignments = page.getByRole("heading", {
    name: `${personName}’s assignments`,
    exact: true,
  });
  await revealed(assignments);
  await expect.soft(assignments).toBeFocused();
  // Returning and reopening the same person must reveal and focus the detail again.
  await page
    .getByRole("button", { name: "Back to progress", exact: true })
    .click();
  await page.getByRole("button", { name: personName, exact: true }).click();
  await revealed(assignments);
  await expect.soft(assignments).toBeFocused();

  await section(page, "Teams");
  await revealed(page.getByRole("tabpanel"));
  const team = data.teams!.find((item) => item.id === "sales-team")!;
  await page
    .getByRole("searchbox", { name: "Find teams", exact: true })
    .fill(team.name);
  await page
    .getByRole("button", { name: `Actions for ${team.name}`, exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Open team", exact: true }).click();
  const detail = page.getByRole("heading", {
    name: team.name,
    exact: true,
  });
  await revealed(detail);
  const edit = page.getByRole("button", {
    name: "Edit team details",
    exact: true,
  });
  await edit.focus();
  await page.keyboard.press("Enter");
  const editor = page.getByRole("dialog");
  await expect(
    editor.getByRole("textbox", { name: "Team name", exact: true }),
  ).toBeFocused();
  await expect(editor.locator('[data-slot="dialog-footer"]')).toContainText(
    "The manager sees this team and its subteams",
  );
  await expect(
    editor.getByRole("combobox", { name: "Manager", exact: true }),
  ).toHaveAttribute("aria-describedby", /team-manager-guidance/);
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();

  if (info.project.name === "desktop") {
    await page.setViewportSize({ width: 1280, height: 1000 });
  }
  await section(page, "Feedback");
  const filters = page.getByRole("button", { name: /^Filters/ });
  await filters.click();
  const rating = page.getByRole("combobox", {
    name: "Feedback rating",
    exact: true,
  });
  await rating.click();
  await page.getByRole("option", { name: "Useful", exact: true }).click();
  await page.keyboard.press("Escape");
  const feedbackRows = page
    .getByRole("region", { name: "Feedback table" })
    .locator("tbody tr");
  await expect(feedbackRows).toHaveCount(1);
  await feedbackRows
    .first()
    .getByRole("button", { name: /^Actions for feedback/ })
    .click();
  await page
    .getByRole("menuitem", {
      name: "View all feedback for this item",
      exact: true,
    })
    .click();
  const heading = page.getByRole("heading", {
    name: `Feedback for ${content.title}`,
    exact: true,
  });
  await revealed(heading);
  await expect(heading).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Remove Useful filter", exact: true }),
  ).toHaveCount(0);
  await expect(feedbackRows).toHaveCount(2);
  await expect(
    page.getByRole("menuitem", { name: "View all feedback for this item" }),
  ).toHaveCount(0);
  await filters.click();
  await expect(rating).toContainText("All ratings");
  const filterPanel = page.getByRole("dialog", {
    name: "Collection filters",
    exact: true,
  });
  await expect(filterPanel).toBeVisible();
  const bounds = await filterPanel.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width + 1,
  );
  await page.keyboard.press("Escape");

  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("feedback-scope.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "All feedback", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Feedback", exact: true }),
  ).toBeFocused();
});
