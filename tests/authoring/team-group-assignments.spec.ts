import { test, expect } from "@playwright/test";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import { freshWorkspace } from "../../lib/store";
import {
  setupAuthoringProvider,
  syncAuthoringProvider,
  authoringUser,
} from "./provider-fixture";

test("installed mixed picker saves one complete governance mutation and blocks stale retry", async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith("production"));
  const data = withPublishedSnapshots(freshWorkspace());
  data.governanceRevision = 10;
  const course = data.content.find((c) => c.kind === "course")!;
  course.title = "Installed mixed picker";
  data.publishedContent!.find((c) => c.id === course.id)!.title = course.title;
  data.groups = [{ id: "same", name: "Sales", learningItems: [] }];
  data.teams = [{ id: "same", name: "Sales", learningItems: [] }];
  let calls = 0;
  await setupAuthoringProvider(page, data);
  await page.route("**/api/admin/snapshot?**", (route) =>
    route.fulfill({ json: { user: authoringUser, data } }),
  );
  await page.route("**/api/governance", (route) => {
    calls++;
    const body = route.request().postDataJSON();
    expect(body.expected).toBe(10);
    expect(body.users).toHaveLength(data.users.length);
    expect(body.teams[0].learningItems).toEqual([
      { kind: "course", id: course.id },
    ]);
    // Another session wins. Recovery adopts the new revision but cannot reuse stale selections.
    data.governanceRevision = 11;
    data.groups[0].learningItems = [{ kind: "course", id: course.id }];
    return route.fulfill({
      status: 409,
      json: { error: "Organization data changed. Review current assignments." },
    });
  });
  await page.goto("/admin");
  await page
    .getByRole("searchbox", { name: "Search content" })
    .fill(course.title);
  await page
    .getByRole("row")
    .filter({ hasText: course.title })
    .getByRole("button", { name: "Assign", exact: true })
    .click();
  const panel = page.getByRole("dialog", {
    name: "Course audience",
    exact: true,
  });
  await expect(
    panel.getByRole("checkbox", {
      name: "Assign directly to Group: Sales",
      exact: true,
    }),
  ).toBeVisible();
  await panel
    .getByRole("checkbox", {
      name: "Assign directly to Team: Sales",
      exact: true,
    })
    .check();
  await panel
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: "Course audience",
    exact: true,
  });
  await expect(review).toBeVisible();
  expect(calls).toBe(0);
  await review.getByRole("button", { name: "← Back", exact: true }).click();
  await expect(
    panel.getByRole("checkbox", {
      name: "Assign directly to Team: Sales",
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    panel.getByRole("button", { name: "Review changes", exact: true }),
  ).toBeVisible();
  expect(calls).toBe(0);
  await panel
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Course audience", exact: true })
    .getByRole("button", { name: "Save assignments", exact: true })
    .click();
  await expect(panel.getByRole("alert")).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Save assignments", exact: true }),
  ).toBeDisabled();
  expect(calls).toBe(1);
  await panel
    .getByRole("button", { name: "Refresh audience", exact: true })
    .click();
  await expect(
    panel.getByRole("checkbox", {
      name: "Assign directly to Team: Sales",
      exact: true,
    }),
  ).toBeChecked();
  await panel
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Save assignments", exact: true }),
  ).toBeEnabled();
  expect(calls).toBe(1);
  await page.screenshot({
    path: info.outputPath("mixed-assignment-stale-recovery.png"),
  });
  await panel
    .getByRole("button", { name: "Close audience editor", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(panel).not.toBeVisible();
  await page
    .getByRole("row")
    .filter({ hasText: course.title })
    .getByRole("button", { name: "Assign", exact: true })
    .click();
  await expect(
    panel.getByRole("checkbox", {
      name: "Assign directly to Group: Sales",
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    panel.getByRole("checkbox", {
      name: "Assign directly to Team: Sales",
      exact: true,
    }),
  ).not.toBeChecked();
  await expect(panel.getByRole("alert")).toHaveCount(0);
  expect(calls).toBe(1);
});

test("installed editor saves after assignments change its document revision", async ({
  page,
}, info) => {
  test.skip(!info.project.name.startsWith("production"));
  const data = withPublishedSnapshots(freshWorkspace());
  data.governanceRevision = 10;
  const course = structuredClone(
    data.content.find((c) => c.kind === "course")!,
  );
  course.id = "00000000-0000-4000-8000-000000000103";
  course.title = "Assignment then edit fixture";
  course.revision = 1;
  course.publishedRevision = 1;
  course.assignments = [];
  course.groups = [];
  data.content = [course];
  data.publishedContent = [structuredClone(course)];
  data.groups = [];
  data.curricula = [];
  data.teams = [{ id: "sales", name: "Sales", learningItems: [] }];
  await setupAuthoringProvider(page, data);
  await page.route("**/api/admin/snapshot?**", (route) =>
    route.fulfill({
      json: {
        user: authoringUser,
        data: {
          ...data,
          content: data.content.map((item) => ({
            ...item,
            body: "",
            lessons: [],
            questions: [],
          })),
        },
      },
    }),
  );
  await page.route("**/api/governance", async (route) => {
    const body = route.request().postDataJSON();
    data.teams = body.teams;
    data.governanceRevision = 11;
    course.revision = 2;
    course.assignments = [
      {
        teamId: "sales",
        due: { type: "none" },
        assignedAt: "2026-10-02T12:00:00Z",
      },
    ];
    data.publishedContent = [structuredClone(course)];
    await syncAuthoringProvider(page, data);
    await route.fulfill({ json: { revision: 11 } });
  });
  await page.goto("/admin");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Lesson content", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await page
    .getByRole("button", { name: /^(?:Assign audience|Edit Audience|Edit audience)$/, exact: true })
    .click();
  const panel = page.getByRole("dialog", {
    name: "Course audience",
    exact: true,
  });
  await panel
    .getByRole("checkbox", {
      name: "Assign directly to Team: Sales",
      exact: true,
    })
    .check();
  await panel
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Course audience", exact: true })
    .getByRole("button", { name: "Save assignments", exact: true })
    .click();
  await expect(panel).not.toBeVisible();
  const save = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/content") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Edited after assignment");
  const response = await save;
  expect(response.request().postDataJSON().expected).toBe(2);
  expect(response.status()).toBe(200);
  const persisted = await response.json();
  expect(persisted.title).toBe("Edited after assignment");
  expect(persisted.assignments[0].teamId).toBe("sales");
  expect(persisted.lessons).toEqual(course.lessons);
  expect(persisted.questions).toEqual(course.questions);
  await expect(
    page.locator(".editor-heading [role=status] .sr-only"),
  ).toHaveText("Saved. Unpublished edits");
});
