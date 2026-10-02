import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
async function section(page: Page, name: string) {
  const compact = page.getByRole("combobox", {
    name: "Administration section",
    exact: true,
  });
  if (await compact.isVisible()) {
    await compact.click();
    await page.getByRole("option", { name, exact: true }).click();
  } else await page.getByRole("tab", { name, exact: true }).click();
}
test("course picker combines teams/groups, retains searched selection, saves once and clears on navigation", async ({
  page,
}, info) => {
  const data = freshWorkspace();
  const course = data.content.find((c) => c.kind === "course")!;
  course.title = "Mixed assignment fixture";
  data.groups = [{ id: "same", name: "Sales", learningItems: [] }];
  data.teams = [{ id: "same", name: "Sales", learningItems: [] }];
  for (const u of data.users) {
    u.groups = ["same"];
    u.teamId = "same";
  }
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto("/#admin");
  await page
    .getByRole("searchbox", { name: "Search content" })
    .fill(course.title);
  const row = page.getByRole("row").filter({ hasText: course.title });
  await row.getByRole("button", { name: "Assign", exact: true }).click();
  const panel = page.getByRole("region", { name: "Assign learning" });
  await panel
    .getByRole("checkbox", { name: "Team: Sales", exact: true })
    .check();
  await panel.getByRole("searchbox").fill("Group:");
  await panel
    .getByRole("checkbox", { name: "Group: Sales", exact: true })
    .check();
  await panel.getByRole("searchbox").fill("");
  await expect(
    panel.getByRole("checkbox", { name: "Team: Sales", exact: true }),
  ).toBeChecked();
  await page.screenshot({
    path: info.outputPath("mixed-assignment-picker.png"),
  });
  await panel
    .getByRole("button", { name: "Save assignments", exact: true })
    .click();
  await expect(panel).toHaveCount(0);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
  );
  const learner = saved.users.find((u: any) => u.id === "demo-learner");
  const episode = learner.learningAssignments.find(
    (a: any) => a.contentId === course.id,
  );
  expect(episode.sourceAudiences).toHaveLength(2);
  const episodes = learner.learningAssignments.filter(
    (a: any) => a.contentId === course.id,
  );
  expect(episodes).toHaveLength(1);
  await row.getByRole("button", { name: "Assign", exact: true }).click();
  await section(page, "Demo profiles");
  await expect(panel).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Demo profiles", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("course editor assignment panel returns with a usable save baseline", async ({
  page,
}) => {
  const data = freshWorkspace(),
    course = data.content.find((c) => c.kind === "course")!;
  course.title = "Editor assignment fixture";
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto("/#admin");
  await page
    .getByRole("searchbox", { name: "Search content" })
    .fill(course.title);
  await page
    .getByRole("row")
    .filter({ hasText: course.title })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  await page.getByRole("button", { name: "Details", exact: true }).click();
  await page
    .getByRole("button", { name: "Assign to teams or groups", exact: true })
    .click();
  const panel = page.getByRole("region", { name: "Assign learning" });
  await panel
    .getByRole("checkbox", { name: "Team: Sales team", exact: true })
    .check();
  await panel
    .getByRole("button", { name: "Save assignments", exact: true })
    .click();
  await expect(panel).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Course editor", exact: true }),
  ).toBeVisible();
});
