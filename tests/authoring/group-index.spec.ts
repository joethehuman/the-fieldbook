import { test, expect } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { authoringUser, setupAuthoringProvider } from "./provider-fixture";

test("installed group directory cancels bulk deletion intact and sends one revision-checked governance save", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("production"),
    "Synthetic installed provider flow.",
  );
  const state = freshWorkspace();
  state.groups = [
    { id: "remove-a", name: "Audience A", learningItems: [] },
    { id: "remove-b", name: "Audience B", learningItems: [] },
    { id: "keep", name: "Keep audience", learningItems: [] },
  ];
  state.users = [
    { ...authoringUser },
    {
      ...authoringUser,
      id: "00000000-0000-4000-8000-000000000011",
      name: "Synthetic Learner",
      email: "learner@example.test",
      role: "learner",
      groups: ["remove-a", "keep"],
    },
  ];
  state.content = [];
  state.publishedContent = [];
  state.curricula = [];
  state.progress = {};
  state.governanceRevision = 12;
  await setupAuthoringProvider(page, state);
  await page.route("**/api/admin/snapshot?**", (route) =>
    route.fulfill({ json: { data: state, user: authoringUser } }),
  );
  let writes = 0;
  await page.route("**/api/governance", (route) => {
    const input = route.request().postDataJSON();
    writes++;
    expect(input.expected).toBe(12);
    expect(input.groups.map((group: { id: string }) => group.id)).toEqual([
      "keep",
    ]);
    expect(
      input.users.find((person: { role: string }) => person.role === "learner")
        .groups,
    ).toEqual(["keep"]);
    expect(input.teams).toEqual(state.teams);
    state.groups = input.groups;
    state.users = input.users;
    state.governanceRevision = 13;
    return route.fulfill({ json: { revision: 13 } });
  });
  await page.goto("/admin");
  await expect(page.locator(".admin-layout")).toBeVisible();
  const section = page.getByRole("combobox", {
    name: "Administration section",
    exact: true,
  });
  if (await section.isVisible()) {
    await section.click();
    await page
      .getByRole("option", { name: "Groups", exact: true })
      .click();
  } else
    await page
      .getByRole("tab", { name: "Groups", exact: true })
      .click();
  const table = page.getByRole("table", {
    name: "Groups",
    exact: true,
  });
  for (const name of ["Audience A", "Audience B"])
    await table
      .getByRole("checkbox", { name: `Select ${name}`, exact: true })
      .check();
  const remove = async () => {
    await page
      .getByRole("button", { name: "Bulk actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Delete groups", exact: true })
      .click();
  };
  await remove();
  const review = page.getByRole("dialog", {
    name: "Delete 2 learning groups?",
    exact: true,
  });
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(writes).toBe(0);
  await expect(
    page.getByRole("button", { name: "Bulk actions", exact: true }),
  ).toBeFocused();
  await expect(
    table.getByRole("checkbox", { name: "Select Audience A", exact: true }),
  ).toBeChecked();
  await remove();
  await review
    .getByRole("button", { name: "Delete groups", exact: true })
    .click();
  await expect(
    table.getByRole("button", { name: "Keep audience", exact: true }),
  ).toBeVisible();
  await expect(table.getByRole("row")).toHaveCount(2);
  expect(writes).toBe(1);
  await page.screenshot({
    path: info.outputPath("installed-group-index.png"),
    fullPage: true,
  });
});
