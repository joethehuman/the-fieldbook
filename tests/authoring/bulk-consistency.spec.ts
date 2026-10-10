import { test, expect, type Page } from "@playwright/test";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import { freshWorkspace, type Workspace } from "../../lib/store";
import { learningStage } from "../../lib/learning";
import { setupAuthoringProvider, authoringUser } from "./provider-fixture";
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
test("bulk group edits preserve the organization and preregistered people use the normal roster", async ({
  page,
}, info) => {
  const production = info.project.name.startsWith("production");
  const data = withPublishedSnapshots(freshWorkspace());
  data.governanceRevision = 10;
  data.pendingUsers = [];
  data.users.push(
    ...["Pending one", "Pending two"].map((name, i) => ({
      id: `00000000-0000-4000-8000-00000000002${i}`,
      name,
      email: `pending${i}@example.test`,
      role: "manager" as const,
      active: true,
      registered: false,
      groups: [],
      hireDate: "2020-01-01",
      onboardingDays: 45,
    })),
  );
  const courses = data.content.filter((c) => c.kind === "course").slice(0, 2);
  for (const [index, course] of courses.entries()) {
    course.title = `Bulk assignment fixture ${index + 1}`;
    // Keep both owned fixtures on the initial newest-created page.
    course.createdAt = "2026-10-01T12:00:00.000Z";
  }
  const group = data.groups[0];
  const revisions: number[] = [];
  if (production) {
    await setupAuthoringProvider(page, data);
    await page.route("**/api/admin/snapshot?**", (route) =>
      route.fulfill({ json: { user: authoringUser, data } }),
    );
    await page.route("**/api/governance", (route) => {
      const body = route.request().postDataJSON();
      revisions.push(body.expected);
      expect(body.expected).toBe(data.governanceRevision);
      if (body.operation === "pending") {
        data.users.push({
          ...body,
          id: "00000000-0000-4000-8000-000000000099",
          active: true,
          registered: false,
          onboardingDays: data.settings!.onboardingDays,
        });
      } else {
        expect(body.users).toHaveLength(data.users.length);
        expect(body.teams).toHaveLength(data.teams!.length);
        data.users = body.users;
        data.groups = body.groups;
        data.curricula = body.curricula;
        data.teams = body.teams;
      }
      data.governanceRevision!++;
      return route.fulfill({ json: { revision: data.governanceRevision } });
    });
  } else
    await page.addInitScript((workspace) => {
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
    }, data);
  await page.goto(production ? "/admin" : "/#admin");
  for (const course of courses)
    await page
      .getByRole("checkbox", { name: `Select ${course.title}`, exact: true })
      .check();
  await page.getByRole("button", { name: "Bulk actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Assign to teams or groups", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: `Add group: ${group.name}`, exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "Save assignments", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await section(page, production ? "People" : "Demo profiles");
  const search = page.getByRole("searchbox", {
    name: /Search (people|profiles)/,
  });
  await search.fill("Pending");
  const pendingOne = page.getByRole("row").filter({ hasText: "Pending one" });
  await expect(pendingOne).toContainText("Manager");
  const roster: Workspace = production
    ? data
    : await page.evaluate(() =>
        JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
      );
  const preregistered = roster.users.find(
    (person) => person.name === "Pending one",
  )!;
  expect(preregistered.registered).toBe(false);
  expect(learningStage(preregistered, roster.settings, "2026-10-10")).toBe(
    "Existing user",
  );
  await page
    .getByRole("checkbox", { name: "Select Pending one", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Select Pending two", exact: true })
    .check();
  await page.getByRole("button", { name: "Bulk actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Add to groups", exact: true })
    .click();
  await dialog.getByRole("checkbox", { name: group.name, exact: true }).check();
  await dialog
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Review changes", exact: true })
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("row")
    .filter({ hasText: "Pending one" })
    .getByRole("button", { name: "Actions for Pending one", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  if (production)
    await expect(dialog).toContainText(
      "This preregistered user can activate their account with verified Google sign-in",
    );
  await expect(dialog.getByLabel("Hire date", { exact: true })).toHaveValue(
    "2020-01-01",
  );
  await dialog.getByLabel("Hire date", { exact: true }).fill("2026-10-01");
  await expect(dialog).toContainText("2026-11-15");
  await page.screenshot({
    path: info.outputPath("roster-hire-date-review.png"),
    fullPage: true,
  });
  await dialog.getByRole("button", { name: /Save (person|profile)/ }).click();
  await expect(dialog).toHaveCount(0);
  const savedRoster: Workspace = production
    ? data
    : await page.evaluate(() =>
        JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
      );
  const savedPending = savedRoster.users.filter((person) =>
    ["Pending one", "Pending two"].includes(person.name),
  );
  expect(savedPending).toHaveLength(2);
  expect(
    savedPending.every(
      (person) =>
        person.registered === false && person.groups.includes(group.id),
    ),
  ).toBe(true);
  if (production) {
    expect(revisions).toEqual([10, 11, 12]);
    await search.fill("");
    await page
      .getByRole("button", { name: "Pre-register person", exact: true })
      .click();
    const form = page.locator("#preregister-person");
    await form.getByLabel("Name", { exact: true }).fill("New person");
    await form
      .getByLabel("Google email", { exact: true })
      .fill("new@example.test");
    await form.getByLabel("Hire date", { exact: true }).fill("2026-10-01");
    await form
      .getByRole("button", { name: "Save person", exact: true })
      .click();
    await expect(
      form.getByRole("button", { name: "Pre-register person" }),
    ).toBeVisible();
    await search.fill("new@example.test");
    await expect(
      page.getByRole("row").filter({ hasText: "New person" }),
    ).toBeVisible();
    expect(
      data.users.find((person) => person.name === "New person")?.registered,
    ).toBe(false);
    expect(revisions).toEqual([10, 11, 12, 13]);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
