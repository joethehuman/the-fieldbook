import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace, type Workspace } from "../../lib/store";
import { addDays, todayUTC } from "../../lib/learning";
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
async function saved(page: Page): Promise<Workspace> {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
  );
}
function fixture() {
  const data = freshWorkspace(),
    course = data.content.find(
      (c) => c.kind === "course" && c.groups.includes("sales"),
    )!;
  data.settings!.catchUpDays = 7;
  data.content = [course];
  data.progress = {};
  data.teams = [
    { id: "sales-team", name: "Sales team", managerId: "demo-manager" },
    { id: "child", name: "Sales child", parentId: "sales-team" },
  ];
  data.groups = [
    {
      id: "sales",
      name: "Sales",
      teamIds: ["sales-team"],
      teamLinkScope: "direct",
      learningItems: [{ kind: "course", id: course.id }],
      requiredCourseIds: [course.id],
    },
  ];
  course.groups = ["sales"];
  course.assignments = [
    {
      groupId: "sales",
      assignedAt: addDays(todayUTC(), -10) + "T00:00:00.000Z",
      due: { type: "none" },
    },
  ];
  data.users = data.users.map((u) => ({
    ...u,
    groups: [],
    effectiveGroupJoinedAt: {},
    groupJoinedAt: {},
  }));
  const learner = data.users.find((u) => u.id === "demo-learner")!;
  learner.teamId = "child";
  learner.hireDate = addDays(todayUTC(), -84);
  learner.onboardingDays = 90;
  return data;
}
test("review subtree assignments, keep defaults future-only, cancel and apply deadline recalculation", async ({
  page,
}, info) => {
  const data = fixture();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    if (!localStorage.getItem("fieldbook.workspace.v1"))
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto("/#admin");
  await section(page, "Learning groups");
  await page.getByRole("button", { name: "Manage Sales", exact: true }).click();
  await page.getByRole("tab", { name: "Members", exact: true }).click();
  await page
    .getByRole("button", { name: "Include subteams", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: "Review organization changes",
    exact: true,
  });
  await expect(review).toBeVisible();
  await expect(review).toContainText("Alex Edwards");
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(review).not.toBeVisible();
  expect((await saved(page)).groups[0].teamLinkScope).toBe("direct");
  await page
    .getByRole("button", { name: "Include subteams", exact: true })
    .click();
  await review
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(review).not.toBeVisible();
  const first = (await saved(page)).users.find((u) => u.id === "demo-learner")!
    .learningAssignments![0];
  expect(first.dueDate).toBe(addDays(todayUTC(), 7));
  await expect(page.locator(".learning-admin")).toContainText(
    "Via team Sales team / Sales child",
  );
  await section(page, "Due dates");
  await page
    .getByRole("spinbutton", {
      name: "New user onboarding window (days)",
      exact: true,
    })
    .fill("45");
  await page
    .getByRole("spinbutton", {
      name: "Ongoing catch-up window (days)",
      exact: true,
    })
    .fill("14");
  await expect(
    page.getByRole("button", {
      name: "Review existing deadlines",
      exact: true,
    }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  expect(
    (await saved(page)).users.find((u) => u.id === "demo-learner")!
      .learningAssignments![0].dueDate,
  ).toBe(first.dueDate);
  await page
    .getByRole("button", { name: "Review existing deadlines", exact: true })
    .click();
  const deadlines = page.getByRole("dialog", {
    name: "Recalculate existing deadlines",
    exact: true,
  });
  await expect(deadlines).toBeVisible();
  await expect(deadlines).toContainText("Alex Edwards");
  await page.screenshot({
    path: info.outputPath("deadline-review.png"),
    fullPage: true,
  });
  await deadlines.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    (await saved(page)).users.find((u) => u.id === "demo-learner")!
      .onboardingDays,
  ).toBe(90);
  await page
    .getByRole("button", { name: "Review existing deadlines", exact: true })
    .click();
  await deadlines
    .getByRole("button", { name: "Apply recalculation", exact: true })
    .click();
  await expect(deadlines).not.toBeVisible();
  const person = (await saved(page)).users.find(
    (u) => u.id === "demo-learner",
  )!;
  expect(person.onboardingDays).toBe(45);
  expect(person.learningAssignments![0].assignedAt).toBe(first.assignedAt);
  expect(person.learningAssignments![0].dueDate).toBe(addDays(todayUTC(), 14));
});
