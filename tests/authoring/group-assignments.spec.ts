import { test, expect } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import { reconcileLearning } from "../../lib/learning-groups";
import { authoringUser, setupAuthoringProvider } from "./provider-fixture";

test("installed Content prepares the full audience and saves only after final assignment review", async ({
  page,
}, info) => {
  test.skip(
    info.project.name.startsWith("demo"),
    "Demo assignment entry points have their own coverage.",
  );
  let state = withPublishedSnapshots(freshWorkspace());
  const course = state.content.find((c) => c.kind === "course")!;
  state.content = [
    { ...course, title: "Assignment preparation", groups: [], assignments: [] },
  ];
  state.publishedContent = structuredClone(state.content);
  state.groups = [{ id: "pilot", name: "Pilot", learningItems: [] }];
  state.curricula = [];
  state.users = state.users.map((u) => ({
    ...u,
    groups: ["pilot"],
    learningAssignments: [],
  }));
  state.governanceRevision = 12;
  await setupAuthoringProvider(page, state);
  let prepares = 0,
    writes = 0;
  await page.route("**/api/admin/snapshot?**", (route) => {
    if (
      new URL(route.request().url()).searchParams.get("scope") === "governance"
    )
      prepares++;
    return route.fulfill({ json: { data: state, user: authoringUser } });
  });
  await page.route("**/api/search?**", (route) =>
    route.fulfill({ json: { results: [], hasMore: false } }),
  );
  await page.route("**/api/governance", (route) => {
    writes++;
    const input = route.request().postDataJSON();
    expect(JSON.stringify(input)).toContain(course.id);
    expect(JSON.stringify(input)).toContain("pilot");
    return route.fulfill({ json: { revision: 13 } });
  });
  await page.goto("/admin");
  await page
    .getByRole("row")
    .filter({ hasText: "Assignment preparation" })
    .getByRole("button", { name: "Assign", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Assign to learning groups",
    exact: true,
  });
  await expect(picker).toBeVisible();
  expect(prepares).toBeGreaterThan(0);
  await picker
    .getByRole("checkbox", { name: "Assign directly to Pilot", exact: true })
    .check();
  await picker
    .getByRole("button", { name: "Review assignments", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: "Assign Assignment preparation",
    exact: true,
  });
  await expect(review).toBeVisible();
  await expect(picker).not.toBeVisible();
  expect(writes).toBe(0);
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(picker).toBeVisible();
  await expect(
    picker.getByRole("checkbox", {
      name: "Assign directly to Pilot",
      exact: true,
    }),
  ).toBeChecked();
  await picker
    .getByRole("button", { name: "Review assignments", exact: true })
    .click();
  state = reconcileLearning(state, {
    ...state,
    groups: [
      {
        ...state.groups[0],
        learningItems: [{ kind: "course", id: course.id }],
      },
    ],
  });
  state.governanceRevision = 13;
  await review
    .getByRole("button", { name: "Apply assignments", exact: true })
    .click();
  await expect(picker).not.toBeVisible();
  expect(writes).toBe(1);
  await page.screenshot({
    path: info.outputPath("installed-content-assignments.png"),
    fullPage: true,
  });
});
