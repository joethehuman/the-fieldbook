import { test, expect } from "@playwright/test";
import { freshWorkspace, type Workspace } from "../../lib/store";


test("same-name team and group remain distinct through audience transfer, review and save", async ({ page }, info) => {
  const data = freshWorkspace();
  const course = data.content.find(item => item.kind === "course")!;
  course.title = "Mixed assignment fixture";
  course.groups = [];
  course.assignments = [];
  data.groups = [{ id: "same", name: "Sales", learningItems: [] }];
  data.teams = [{ id: "same", name: "Sales", learningItems: [] }];
  data.publishedContent = undefined;
  for (const person of data.users) { person.groups = ["same"]; person.teamId = "same"; }
  await page.addInitScript(workspace => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto("/#admin/content");
  await page.getByRole("searchbox", { name: "Search content" }).fill(course.title);
  const row = page.getByRole("row").filter({ hasText: course.title });
  const actions = row.getByRole("button", { name: `Actions for ${course.title}`, exact: true });
  await actions.click();
  await page.getByRole("menuitem", { name: "Assign to teams or groups", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Course assignments", exact: true });
  const tabs = dialog.getByRole("group", { name: "Assignment lists", exact: true });
  if (await tabs.isVisible()) await tabs.getByRole("button", { name: "Available", exact: true }).click();
  await dialog.getByRole("searchbox", { name: "Find a team or group", exact: true }).fill("Sales");
  for (const kind of ["team", "group"])
    await dialog.getByRole("button", { name: `Add ${kind}: Sales`, exact: true }).click();
  if (await tabs.isVisible()) await tabs.getByRole("button", { name: /^Assigned/ }).click();
  const selected = dialog.getByRole("button", { name: /^Remove (team|group): Sales$/ });
  await expect(selected).toHaveCount(2);
  await dialog.getByRole("button", { name: "Review changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await dialog.getByRole("button", { name: "← Back", exact: true }).click();
  await expect(selected).toHaveCount(2);
  await dialog.getByRole("button", { name: "Review changes", exact: true }).click();
  await dialog.screenshot({ path: info.outputPath("mixed-audience-review.png") });
  await dialog.getByRole("button", { name: "Save assignments", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const saved: Workspace = await page.evaluate(() => JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!));
  for (const audience of [saved.groups.find(group => group.id === "same")!, saved.teams!.find(team => team.id === "same")!])
    expect(audience.learningItems).toContainEqual({ kind: "course", id: course.id });
  await actions.click();
  await page.getByRole("menuitem", { name: "Remove team or group assignments", exact: true }).click();
  const removal = page.getByRole("dialog", { name: "Remove assignments", exact: true });
  await expect(removal.getByRole("button", { name: /^Remove (Team|Group): Sales$/ })).toHaveCount(2);
  await removal.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(actions).toBeFocused();
});
