import { expect, test, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import { reconcileLearning } from "../../lib/learning-groups";
import { authoringUser, setupAuthoringProvider } from "./provider-fixture";

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

test("installed group content discovery keeps selections until the final review saves", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("production"),
    "Installed picker coverage uses a synthetic authenticated provider.",
  );
  let state = withPublishedSnapshots(freshWorkspace());
  const seed = state.content.find((item) => item.kind === "course")!;
  state.content = Array.from({ length: 100 }, (_, index) => ({
    ...seed,
    id: `discovery-course-${index}`,
    title: `Course ${String(index).padStart(3, "0")}`,
    category: index % 2 ? "Sales" : "Operations",
    status: "published" as const,
    updatedAt: new Date(Date.UTC(2026, 8, 1 + index)).toISOString(),
    groups: [],
    assignments: [],
  }));
  state.content[99].body = "Published escalation pager ownership guidance";
  state.publishedContent = structuredClone(state.content);
  state.groups = [{ id: "pilot", name: "Pilot", learningItems: [] }];
  state.curricula = [];
  state.users = state.users.map((person) => ({
    ...person,
    groups: ["pilot"],
    learningAssignments: [],
  }));
  state.governanceRevision = 12;
  await setupAuthoringProvider(page, state);
  await page.route("**/api/admin/snapshot?**", (route) =>
    route.fulfill({ json: { data: state, user: authoringUser } }),
  );
  let writes = 0;
  await page.route("**/api/governance", (route) => {
    writes++;
    const submitted = route.request().postDataJSON();
    expect(submitted.expected).toBe(12);
    expect(
      submitted.groups.find((group: { id: string }) => group.id === "pilot")
        .learningItems,
    ).toEqual([{ kind: "course", id: "discovery-course-99" }]);
    state = reconcileLearning(state, { ...state, groups: submitted.groups });
    state.governanceRevision = 13;
    return route.fulfill({ json: { revision: 13 } });
  });
  await page.goto("/admin");
  await section(page, "Groups");
  await page.getByRole("button", { name: "Pilot", exact: true }).click();
  await page
    .getByRole("tab", { name: "Assigned Courses", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Assign Courses", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Assign Courses",
    exact: true,
  });
  await expect(
    picker.getByRole("button", { name: "Sort: Updated newest", exact: true }),
  ).toBeVisible();
  await picker.getByRole("checkbox", { name: /^Course 099/ }).check();
  await picker.getByRole("searchbox").fill("pager escalation");
  await expect(
    picker.getByRole("checkbox", { name: /^Course 099/ }),
  ).toBeChecked();
  await picker.getByRole("searchbox").fill("Operations");
  await expect(picker).not.toContainText("Course 099");
  await picker
    .getByRole("button", { name: "Review selected", exact: true })
    .click();
  await expect(
    picker.getByRole("checkbox", { name: /^Course 099/ }),
  ).toBeChecked();
  await picker
    .getByRole("button", { name: "Review assignment", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: "Review changes",
    exact: true,
  });
  await expect(review).toBeVisible();
  expect(writes).toBe(0);
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    picker.getByRole("checkbox", { name: /^Course 099/ }),
  ).toBeChecked();
  await picker
    .getByRole("button", { name: "Review assignment", exact: true })
    .click();
  await review
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(picker).not.toBeVisible();
  expect(writes).toBe(1);
  await expect(page.getByText("Course 099", { exact: true })).toBeVisible();
  await page.screenshot({
    path: info.outputPath("installed-content-discovery.png"),
    fullPage: true,
  });
});
