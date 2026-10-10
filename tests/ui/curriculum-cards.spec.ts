import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";

async function start(page: Page) {
  const data = freshWorkspace();
  data.curricula!.push({
    id: "draft-example",
    name: "A draft with a deliberately long curriculum title for a growing international team",
    description: "A short description.",
    courseIds: [],
    status: "draft",
  });
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto("/#admin/curricula");
  await expect(
    page.getByRole("heading", { name: "Curricula", exact: true }),
  ).toBeVisible();
  return data;
}

test("curriculum cards retain selection, editing and guarded menu actions", async ({
  page,
}, info) => {
  const data = await start(page);
  const curriculum = data.curricula![0];
  const card = page.locator('[data-slot="card"]').filter({
    has: page.getByRole("link", { name: curriculum.name, exact: true }),
  });
  await card
    .getByRole("checkbox", { name: `Select ${curriculum.name}`, exact: true })
    .check();
  await expect(
    page.getByRole("heading", { name: "Edit curriculum", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("curriculum-cards.png"),
    fullPage: true,
  });
  const menu = card.getByRole("button", {
    name: `Actions for ${curriculum.name}`,
    exact: true,
  });
  await menu.click();
  await page
    .getByRole("menuitem", { name: "Manage Audience", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Manage Audience",
    exact: true,
  });
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(menu).toBeFocused();
  await menu.click();
  await page
    .getByRole("menuitem", { name: "Delete curriculum", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: "Delete 1 curriculum?",
    exact: true,
  });
  await expect(review).toBeVisible();
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(card).toBeVisible();
  await expect(menu).toBeFocused();
  await card.getByRole("link", { name: curriculum.name, exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue(curriculum.name);
  await page
    .getByRole("button", { name: "Back to curricula", exact: true })
    .click();
  const draft = page.getByRole("button", { name: /^Actions for A draft/ });
  await draft.click();
  await expect(
    page.getByRole("menuitem", { name: "Manage Audience", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("shared menu and nested team highlights keep keyboard access", async ({
  page,
}, info) => {
  await start(page);
  await page.goto("/#admin/content");
  const trigger = page.getByRole("button", { name: /^Actions for/ }).first();
  await trigger.click();
  await page.getByRole("menuitem").first().hover();
  await page.screenshot({ path: info.outputPath("menu-first-hover.png") });
  await page.getByRole("menuitem").last().hover();
  await page.screenshot({ path: info.outputPath("menu-last-hover.png") });
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.goto("/#admin/teams");
  if (info.project.name === "phone") {
    const nested = page.getByRole("button", {
      name: "Customer Success Managers",
      exact: true,
    });
    await nested.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", {
        name: "Customer Success Managers",
        exact: true,
      }),
    ).toBeVisible();
    const subteams = page.getByRole("tab", { name: "Subteams", exact: true });
    await subteams.focus();
    await page.keyboard.press("Enter");
    await expect(subteams).toHaveAttribute("aria-selected", "true");
    await expect(
      page.getByRole("heading", { name: "Subteams", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: info.outputPath("team-nested-keyboard.png"),
    });
  } else {
    await page
      .getByRole("button", {
        name: "Browse Customer Success subteams",
        exact: true,
      })
      .click();
    const nested = page.getByRole("button", {
      name: "Browse Customer Success Managers subteams",
      exact: true,
    });
    await nested.hover();
    await page.screenshot({ path: info.outputPath("team-nested-hover.png") });
    await nested.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByText("Subteams of Customer Success Managers", { exact: true }),
    ).toBeVisible();
  }
});

test("administration keeps the requested order and clear team and group labels", async ({
  page,
}, info) => {
  await start(page);
  const expected = [
    "Content",
    "Curricula",
    "Feedback",
    "Demo profiles",
    "Teams",
    "Groups",
    "Progress",
    "Identity",
    "Access",
    "Docs navigation",
    "External links",
    "Due dates",
    "Ask AI",
    "MCP",
    "Privacy",
    "Recently deleted",
  ];
  const picker = page.getByRole("combobox", {
    name: "Administration section",
    exact: true,
  });
  if (await picker.isVisible()) {
    await picker.click();
    await expect(page.getByRole("option")).toHaveText(expected);
    await page.getByRole("option", { name: "Groups", exact: true }).click();
  } else {
    await expect(page.getByRole("tab")).toHaveText(expected);
    await expect(
      page.getByText("People & Progress", { exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Groups", exact: true }).click();
  }
  await expect(
    page.getByRole("heading", { name: "Groups", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Assign learning to teams directly. Use groups to combine teams and individual people into a custom audience.",
    ),
  ).toBeVisible();
  const metric = page.getByRole("img", {
    name: "50 direct users linked",
    exact: true,
  });
  await metric.hover();
  await expect(
    page.getByRole("tooltip", { name: "50 direct users linked", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("groups-and-navigation.png") });
  await page.goto("/#admin/teams");
  await expect(
    page.getByText(
      "Use teams to manage reporting visibility, assign courses, and target relevant updates.",
    ),
  ).toBeVisible();
});
