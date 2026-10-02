import { expect, test, type Page } from "@playwright/test";
import { freshWorkspace, type Workspace } from "../../lib/store";
import { reconcileLearning } from "../../lib/learning-groups";

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
function fixture() {
  const data = freshWorkspace();
  const course = data.content.find((item) => item.kind === "course")!;
  data.content = [
    {
      ...course,
      id: "foundation-course",
      title: "Foundation course",
      status: "published" as const,
      groups: [],
      assignments: [],
    },
    {
      ...course,
      id: "discovery-course",
      title: "Discovery course",
      status: "published" as const,
      groups: [],
      assignments: [],
    },
  ];
  data.publishedContent = undefined;
  data.curricula = [
    {
      id: "foundation",
      name: "GTM foundation",
      description: "Synthetic curriculum",
      status: "published",
      courseIds: ["foundation-course"],
    },
  ];
  data.groups = [
    {
      id: "ae",
      name: "Account executives",
      teamIds: ["ae-team"],
      learningItems: [
        { kind: "curriculum", id: "foundation" },
        { kind: "course", id: "foundation-course" },
      ],
    },
    { id: "pilot", name: "Pilot", teamIds: ["pilot-team"], learningItems: [] },
  ];
  data.teams = [
    { id: "ae-team", name: "Account executives" },
    { id: "pilot-team", name: "Pilot team" },
  ];
  data.users = data.users
    .filter((person) => ["demo-admin", "demo-learner"].includes(person.id))
    .map((person) => ({
      ...person,
      teamId: person.id === "demo-admin" ? "pilot-team" : "ae-team",
      groups: [],
      groupJoinedAt: {},
      effectiveGroupJoinedAt: {},
      learningAssignments:
        person.id === "demo-learner"
          ? [
              {
                episodeId: "11111111-1111-4111-8111-111111111111",
                contentId: "foundation-course",
                version: course.version,
                assignedAt: "2026-09-01T00:00:00.000Z",
                dueDate: "2026-10-01",
                catchUpDays: 30,
                sourceGroups: ["ae"],
              },
            ]
          : [],
      hireDate: "2020-01-01",
    }));
  data.progress = {};
  return reconcileLearning(data, data, "2026-09-01T00:00:00.000Z");
}
async function saved(page: Page): Promise<Workspace> {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
  );
}
async function start(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    if (!localStorage.getItem("fieldbook.workspace.v1"))
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, fixture());
  await page.goto("/#admin");
  await section(page, "Content");
  await expect(
    page
      .locator(".admin-layout")
      .getByRole("tab", { name: "Courses", exact: true }),
  ).toHaveCount(0);
}
function assignmentDialog(page: Page) {
  return page.getByRole("dialog", {
    name: "Assign to teams or groups",
    exact: true,
  });
}

test("Content course assignment has one final review and keeps choices after cancellation", async ({
  page,
}, info) => {
  await start(page);
  await page
    .getByRole("row")
    .filter({ hasText: "Discovery course" })
    .getByRole("button", { name: "Assign", exact: true })
    .click();
  const picker = assignmentDialog(page);
  await expect(picker).toBeVisible();
  await picker
    .getByRole("checkbox", {
      name: "Assign directly to Group: Account executives",
      exact: true,
    })
    .check();
  await page.screenshot({
    path: info.outputPath("content-assignment-dialog.png"),
    fullPage: true,
  });
  await picker
    .getByRole("button", { name: "Review assignments", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: "Assign Discovery course",
    exact: true,
  });
  await expect(review).toBeVisible();
  await expect(
    page.getByRole("dialog", {
      name: "Assign to teams or groups",
      exact: true,
      includeHidden: true,
    }),
  ).toBeHidden();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await page.screenshot({
    path: info.outputPath("content-assignment-review.png"),
    fullPage: true,
  });
  await expect(review.getByRole("table")).toHaveCount(0);
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(review).not.toBeVisible();
  await expect(
    picker.getByRole("button", { name: "Review assignments", exact: true }),
  ).toBeFocused();
  await expect(
    picker.getByRole("checkbox", {
      name: "Assign directly to Group: Account executives",
      exact: true,
    }),
  ).toBeChecked();
  await expect(picker.getByRole("alert")).toHaveCount(0);
  expect(
    (await saved(page)).groups.find((group) => group.id === "ae")!
      .learningItems,
  ).not.toContainEqual({ kind: "course", id: "discovery-course" });
  await picker
    .getByRole("button", { name: "Review assignments", exact: true })
    .click();
  await review
    .getByRole("button", { name: "Apply assignments", exact: true })
    .click();
  await expect(picker).not.toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (await saved(page)).groups.find((group) => group.id === "ae")!
      .learningItems,
  ).toEqual([
    { kind: "curriculum", id: "foundation" },
    { kind: "course", id: "foundation-course" },
    { kind: "course", id: "discovery-course" },
  ]);
});

test("course Details edits the same links without replacing the editor or resetting curriculum-covered deadlines", async ({
  page,
}, info) => {
  await start(page);
  const before = (await saved(page)).users
    .find((person) => person.id === "demo-learner")!
    .learningAssignments!.find(
      (assignment) => assignment.contentId === "foundation-course",
    )!;
  expect(before).toBeTruthy();
  await page
    .getByRole("row")
    .filter({ hasText: "Foundation course" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue("Foundation course");
  const details = page.getByRole("button", { name: "Details", exact: true });
  if ((await details.getAttribute("aria-expanded")) !== "true")
    await details.click();
  await page
    .getByRole("button", { name: "Assign to teams or groups", exact: true })
    .click();
  const picker = assignmentDialog(page);
  const ae = picker
    .getByRole("row")
    .filter({ hasText: "Group: Account executives" });
  await expect(ae).toContainText("GTM foundation");
  const source = ae.getByText(/Also included through GTM foundation/);
  await expect(source).toBeVisible();
  const sourceBox = await source.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(sourceBox!.x + sourceBox!.width).toBeLessThanOrEqual(
    page.viewportSize()!.width,
  );
  await ae
    .getByRole("checkbox", {
      name: "Assign directly to Group: Account executives",
      exact: true,
    })
    .uncheck();
  await page.screenshot({
    path: info.outputPath("editor-assignment-curriculum-source.png"),
    fullPage: true,
  });
  await picker
    .getByRole("button", { name: "Review assignments", exact: true })
    .click();
  await expect(picker).not.toBeVisible();
  await page
    .getByRole("dialog", { name: "Assign Foundation course", exact: true })
    .getByRole("button", { name: "Apply assignments", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue("Foundation course");
  await expect(page.locator(".learning-admin")).toHaveCount(0);
  const after = await saved(page);
  expect(
    after.groups.find((group) => group.id === "ae")!.learningItems,
  ).toEqual([{ kind: "curriculum", id: "foundation" }]);
  expect(
    after.users
      .find((person) => person.id === "demo-learner")!
      .learningAssignments!.find(
        (assignment) => assignment.contentId === "foundation-course",
      ),
  ).toMatchObject({
    episodeId: before.episodeId,
    assignedAt: before.assignedAt,
    dueDate: before.dueDate,
  });
  await page
    .getByRole("button", { name: "Assign to teams or groups", exact: true })
    .click();
  await expect(
    picker.getByRole("checkbox", {
      name: "Assign directly to Group: Account executives",
      exact: true,
    }),
  ).not.toBeChecked();
  await expect(
    picker.getByRole("row").filter({ hasText: "Group: Account executives" }),
  ).toContainText("GTM foundation");
  await picker.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Assign to teams or groups",
      exact: true,
    }),
  ).toBeFocused();
});

test("published Curricula assigns its reference through the shared audience picker", async ({
  page,
}, info) => {
  await start(page);
  await section(page, "Curricula");
  await page
    .getByRole("button", { name: "Assign to teams or groups", exact: true })
    .click();
  const picker = assignmentDialog(page);
  await expect(
    picker.getByRole("columnheader", {
      name: "Also included through",
      exact: true,
    }),
  ).toHaveCount(0);
  await picker
    .getByRole("checkbox", {
      name: "Assign directly to Group: Pilot",
      exact: true,
    })
    .check();
  await page.screenshot({
    path: info.outputPath("curriculum-assignment-dialog.png"),
    fullPage: true,
  });
  await picker
    .getByRole("button", { name: "Review assignments", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: "Assign GTM foundation",
    exact: true,
  });
  await expect(review).toBeVisible();
  await review
    .getByRole("button", { name: "Apply assignments", exact: true })
    .click();
  await expect(picker).not.toBeVisible();
  expect(
    (await saved(page)).groups.find((group) => group.id === "pilot")!
      .learningItems,
  ).toEqual([{ kind: "curriculum", id: "foundation" }]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
