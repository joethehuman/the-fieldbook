import { expect, test, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { authoringUser, setupAuthoringProvider } from "./provider-fixture";

async function section(page: Page) {
  const picker = page.getByRole("combobox", {
    name: "Administration section",
    exact: true,
  });
  if (await picker.isVisible()) {
    await picker.click();
    await page.getByRole("option", { name: "Teams", exact: true }).click();
  } else await page.getByRole("tab", { name: "Teams", exact: true }).click();
}

test("installed Teams keeps its organization team manageable and reveals a newly saved child", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("production"),
    "Installed browser uses a synthetic authenticated provider.",
  );
  const state = freshWorkspace();
  state.content = [];
  state.publishedContent = [];
  state.groups = [];
  state.curricula = [];
  state.progress = {};
  state.teams = [
    { id: "organization", name: "Company", system: "organization" },
    { id: "sales", name: "Sales", parentId: "organization" },
  ];
  state.users = [{ ...authoringUser, teamId: "organization" }];
  state.settings!.organizationTeamId = "organization";
  state.revision = 3;
  state.governanceRevision = 9;
  await setupAuthoringProvider(page, state);
  await page.route("**/api/admin/snapshot?**", (route) =>
    route.fulfill({ json: { data: state, user: authoringUser } }),
  );
  let teamWrites = 0;
  await page.route("**/api/settings", () => {
    throw new Error("Organization identity is not a settings choice.");
  });
  await page.route("**/api/governance", (route) => {
    teamWrites++;
    const input = route.request().postDataJSON();
    expect(
      input.teams.find((team: { name: string }) => team.name === "New region")
        .parentId,
    ).toBe("organization");
    state.teams = input.teams;
    state.governanceRevision = 10;
    return route.fulfill({ json: { revision: 10 } });
  });
  await page.goto("/admin");
  await section(page);
  const browser = page.locator('[data-slot="hierarchy-browser"]');
  await expect(
    browser.getByRole("button", { name: "Open Company", exact: true }),
  ).toHaveCount(0);
  await expect(
    browser.getByRole("button", { name: "Open Sales", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Teams page actions", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Manage organization team", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Organization", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Direct members", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Team actions", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("table", { name: "Team members", exact: true }),
  ).toContainText(authoringUser.name);
  await page.getByRole("button", { name: "Edit manager", exact: true }).click();
  const manager = page.getByRole("dialog", {
    name: "Organization manager",
    exact: true,
  });
  await expect(
    manager.getByRole("combobox", { name: "Manager", exact: true }),
  ).toBeVisible();
  await expect(
    manager.getByRole("textbox", { name: "Team name", exact: true }),
  ).toHaveCount(0);
  await expect(
    manager.getByRole("combobox", { name: "Parent team", exact: true }),
  ).toHaveCount(0);
  await manager.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Back to teams", exact: true })
    .click();
  await page.getByRole("button", { name: "Add team", exact: true }).click();
  const create = page.getByRole("dialog", { name: "New team", exact: true });
  await expect(
    create.getByRole("combobox", { name: "Parent team", exact: true }),
  ).toHaveText("Organization");
  await create
    .getByRole("textbox", { name: "Team name", exact: true })
    .fill("New region");
  await create.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(create).not.toBeVisible();
  expect(teamWrites).toBe(1);
  await expect(
    browser.getByRole("button", {
      name: "Browse New region subteams",
      exact: true,
    }),
  ).toBeFocused();
  await expect(
    browser.getByRole("button", { name: "Edit New region", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("installed-team-browser.png"),
    fullPage: true,
  });
});
