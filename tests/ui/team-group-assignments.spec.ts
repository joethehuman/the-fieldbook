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
  const panel = page.getByRole("dialog", {
    name: "Assign to teams or groups",
    exact: true,
  });
  await panel
    .getByRole("checkbox", {
      name: "Assign directly to Team: Sales",
      exact: true,
    })
    .check();
  await panel.getByRole("searchbox").fill("Group:");
  await panel
    .getByRole("checkbox", {
      name: "Assign directly to Group: Sales",
      exact: true,
    })
    .check();
  await panel.getByRole("searchbox").fill("");
  await expect(
    panel.getByRole("checkbox", {
      name: "Assign directly to Team: Sales",
      exact: true,
    }),
  ).toBeChecked();
  await page.screenshot({
    path: info.outputPath("mixed-assignment-picker.png"),
  });
  await panel
    .getByRole("button", { name: "Review assignments", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: `Assign ${course.title}`,
    exact: true,
  });
  await expect(review).toBeVisible();
  await expect(panel).not.toBeVisible();
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "Review assignments", exact: true }),
  ).toBeFocused();
  await expect(
    panel.getByRole("checkbox", {
      name: "Assign directly to Team: Sales",
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    panel.getByRole("checkbox", {
      name: "Assign directly to Group: Sales",
      exact: true,
    }),
  ).toBeChecked();
  const unchanged = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
  );
  expect(unchanged.teams[0].learningItems).toEqual([]);
  expect(unchanged.groups[0].learningItems).toEqual([]);

  await panel
    .getByRole("button", { name: "Review assignments", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: `Assign ${course.title}`, exact: true })
    .getByRole("button", { name: "Apply assignments", exact: true })
    .click();
  await expect(panel).not.toBeVisible();
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
  await panel
    .getByRole("checkbox", {
      name: "Assign directly to Team: Sales",
      exact: true,
    })
    .uncheck();
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  const discard = page.getByRole("alertdialog", {
    name: "Confirm action",
    exact: true,
  });
  await discard.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    panel.getByRole("checkbox", {
      name: "Assign directly to Team: Sales",
      exact: true,
    }),
  ).not.toBeChecked();
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  await discard.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(panel).not.toBeVisible();
  await section(page, "Demo profiles");
  await expect(
    page.getByRole("heading", { name: "Demo profiles", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("course editor assignment dialog returns with a usable save baseline", async ({
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
  const panel = page.getByRole("dialog", {
    name: "Assign to teams or groups",
    exact: true,
  });
  await panel
    .getByRole("checkbox", {
      name: "Assign directly to Team: Sales team",
      exact: true,
    })
    .check();
  await panel
    .getByRole("button", { name: "Review assignments", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: `Assign ${course.title}`, exact: true })
    .getByRole("button", { name: "Apply assignments", exact: true })
    .click();
  await expect(panel).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Course editor", exact: true }),
  ).toBeVisible();
});
