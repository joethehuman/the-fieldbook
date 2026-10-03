import { test, expect, type Page } from "@playwright/test";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import { freshWorkspace } from "../../lib/store";
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
  const course = data.content.find((c) => c.kind === "course")!;
  course.title = "Bulk assignment fixture";
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
  await page
    .getByRole("checkbox", {
      name: "Select Bulk assignment fixture",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Bulk actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Assign to teams or groups", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: `Group: ${group.name}`, exact: true }).check();
  await dialog
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await section(page, production ? "People" : "Demo profiles");
  const search = page.getByRole("searchbox", {
    name: /Search (people|profiles)/,
  });
  await search.fill("Pending");
  await expect(
    page.getByRole("row").filter({ hasText: "Pending one" }),
  ).toContainText("Not signed in");
  await expect(
    page.getByRole("row").filter({ hasText: "Pending one" }),
  ).toContainText("Existing user");
  await page
    .getByRole("checkbox", { name: "Select Pending one", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Select Pending two", exact: true })
    .check();
  await page.getByRole("button", { name: "Bulk actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Add to learning groups", exact: true })
    .click();
  await dialog.getByRole("checkbox", { name: group.name, exact: true }).check();
  await dialog
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("row")
    .filter({ hasText: "Pending one" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
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
  if (production) {
    expect(revisions).toEqual([10, 11, 12]);
    expect(
      data.users
        .filter((p) => p.registered === false)
        .every((p) => p.groups.includes(group.id)),
    ).toBe(true);
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
    ).toContainText("Not signed in");
    expect(revisions).toEqual([10, 11, 12, 13]);
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
