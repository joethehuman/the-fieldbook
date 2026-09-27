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
  await page
    .getByRole("button", { name: "View courses", exact: true })
    .first()
    .click();
  const assignments = page.locator(
    '[data-reveal-target][aria-label$="’s assignments"]',
  );
  await revealed(assignments);
  await expect(assignments).toBeFocused();
  // A second click on the same person must reveal the already-mounted panel.
  await page
    .getByRole("button", { name: "View courses", exact: true })
    .first()
    .click();
  await revealed(assignments);

  await section(page, "Teams");
  await revealed(page.getByRole("tabpanel"));
  await page
    .getByRole("button", { name: "Manage Sales team", exact: true })
    .click();
  const detail = page.getByRole("region", {
    name: "Sales team management",
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
    "Assigning a manager",
  );
  await expect(
    editor.getByRole("combobox", { name: "Manager", exact: true }),
  ).toHaveAttribute("aria-describedby", /team-manager-guidance/);
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();

  if (info.project.name === "desktop") {
    await page.setViewportSize({ width: 1280, height: 1000 });
  }
  await section(page, "Feedback");
  const rating = page.getByRole("combobox", { name: "Rating", exact: true });
  await rating.click();
  await page.getByRole("option", { name: "Useful", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(1);
  await page
    .getByRole("button", { name: "View all feedback for this item" })
    .click();
  const heading = page.getByRole("heading", {
    name: `Feedback for ${content.title}`,
    exact: true,
  });
  await revealed(heading);
  await expect(heading).toBeFocused();
  await expect(rating).toHaveText("All ratings");
  await expect(page.locator("article")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "View all feedback for this item" }),
  ).toHaveCount(0);
  if (info.project.name === "desktop") {
    const controls = page.locator(
      '[data-slot="filter-bar"] [role="combobox"], [data-slot="filter-bar"] input',
    );
    const bounds = await controls.evaluateAll((nodes) =>
      nodes.map((node) => {
        const { top, left, right } = node.getBoundingClientRect();
        const bar = node
          .closest('[data-slot="filter-bar"]')!
          .getBoundingClientRect();
        return { top, left, right, barLeft: bar.left, barRight: bar.right };
      }),
    );
    const rowTops: number[] = [];
    for (const { top } of bounds) {
      if (!rowTops.some((rowTop) => Math.abs(rowTop - top) < 2)) {
        rowTops.push(top);
      }
    }
    expect(rowTops.length).toBeGreaterThan(1);
    expect(rowTops.length).toBeLessThan(bounds.length);
    for (const bound of bounds) {
      expect(bound.left).toBeGreaterThanOrEqual(bound.barLeft);
      expect(bound.right).toBeLessThanOrEqual(bound.barRight);
    }
    for (const rowTop of rowTops) {
      const row = bounds
        .filter(({ top }) => Math.abs(top - rowTop) < 2)
        .sort((a, b) => a.left - b.left);
      for (let index = 1; index < row.length; index += 1) {
        expect(row[index - 1].right).toBeLessThanOrEqual(row[index].left);
      }
    }
  }
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
