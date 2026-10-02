import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace, type Workspace } from "../../lib/store";
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
  data.teams!.push(
    { id: "child", name: "Child team", parentId: "sales-team" },
    { id: "grand", name: "Grandchild team", parentId: "child" },
    { id: "other", name: "Other team" },
  );
  data.users = [
    ...data.users.filter((u) => ["demo-admin", "demo-manager"].includes(u.id)),
    ...Array.from({ length: 498 }, (_, i) => ({
      id: `person-${i}`,
      name: `Person ${String(i).padStart(3, "0")}`,
      email: `person${i}@example.test`,
      active: i !== 49,
      role: "learner" as const,
      groups: ["sales"],
      teamId:
        i < 50 ? "sales-team" : i < 100 ? "child" : i < 150 ? "grand" : "other",
    })),
  ];
  data.progress["person-150"] = structuredClone(data.progress["demo-learner"]);
  data.users = data.users.map((person) => ({
    ...person,
    groupJoinedAt: Object.fromEntries(
      person.groups.map((id) => [id, "2026-01-01T00:00:00.000Z"]),
    ),
    effectiveGroupJoinedAt: Object.fromEntries(
      person.groups.map((id) => [id, "2026-01-01T00:00:00.000Z"]),
    ),
  }));
  return data;
}
async function saved(page: Page) {
  return page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!) as Workspace,
  );
}

test("large team: hierarchy, pagination, reviewed moves, retry, removal and guarded details", async ({
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
  await expect(page.locator(".admin-layout")).toBeVisible();
  await section(page, "Teams");
  await page
    .getByRole("button", { name: "Manage Sales team", exact: true })
    .click();
  await expect(
    page.getByText("150 people in this branch · 50 direct members · 1 subteam"),
  ).toBeVisible();
  const members = page.getByRole("table", {
    name: "Team members",
    exact: true,
  });
  await expect(members.locator("tbody tr")).toHaveCount(25);
  await expect(
    members.getByRole("columnheader", {
      name: "Included through",
      exact: true,
    }),
  ).toBeVisible();
  await expect(members.locator("tbody tr").first()).toContainText(
    "Direct member",
  );
  await expect(
    page.getByRole("button", { name: "All people", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Direct members", exact: true }),
  ).toHaveCount(0);
  const pages = page.getByRole("navigation", { name: "Team members pages" });
  await pages.getByRole("button", { name: "Next", exact: true }).click();
  await expect(members).toContainText("Person 025");
  await expect(members).toContainText("Inactive");

  await pages.getByRole("button", { name: "Next", exact: true }).click();
  await expect(members.locator("tbody tr")).toHaveCount(25);
  await expect(members.locator("tbody tr").first()).toContainText("Child team");
  await expect(
    members.getByRole("checkbox", { name: "Select Person 050", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("searchbox", { name: "Find a member", exact: true })
    .fill("person125@example.test");
  await expect(members.locator("tbody tr")).toHaveCount(1);
  await expect(members).toContainText("Grandchild team");
  await expect(members.getByRole("button", { name: /Remove/ })).toHaveCount(0);
  await members
    .getByRole("button", { name: "Manage Person 125's team" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Grandchild team", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Parent: Child team" }).click();
  await page.getByRole("tab", { name: "Subteams", exact: true }).click();
  await expect(
    page.getByRole("table", { name: "Subteams", exact: true }),
  ).toContainText("Grandchild team");
  await page.getByRole("button", { name: "Parent: Sales team" }).click();
  await page.screenshot({
    path: info.outputPath("team-detail.png"),
    fullPage: true,
  });

  await page.getByRole("button", { name: "Add members", exact: true }).click();
  const review = page.getByRole("dialog");
  const search = review.getByRole("searchbox", {
    name: "Choose items",
    exact: true,
  });
  await search.fill("person150@example.test");
  await review.getByRole("checkbox", { name: /Person 150/ }).check();
  await search.fill("person151@example.test");
  await review.getByRole("checkbox", { name: /Person 151/ }).check();
  await review
    .getByRole("button", { name: "Review selected", exact: true })
    .click();
  await expect(review).toContainText("Other team");
  await expect(review).toContainText("move here");
  await page.screenshot({
    path: info.outputPath("review-members.png"),
    fullPage: true,
  });
  expect(
    (await saved(page)).users.find((u) => u.id === "person-150")!.teamId,
  ).toBe("other");
  await review
    .getByRole("button", { name: "Review changes 2", exact: true })
    .click();
  const effects = page.getByRole("dialog", {
    name: "Review membership changes",
    exact: true,
  });
  await effects
    .getByRole("button", {
      name: "View affected people and learning",
      exact: true,
    })
    .click();
  await expect(effects).toContainText("Person 150");
  await expect(effects).toContainText("Person 151");
  await effects
    .getByRole("button", { name: "Add members", exact: true })
    .click();
  await expect(review).toHaveCount(0);
  const confirm = page.getByRole("alertdialog");
  const after = await saved(page);
  expect(
    after.users
      .filter((u) => ["person-150", "person-151"].includes(u.id))
      .every((u) => u.teamId === "sales-team"),
  ).toBe(true);
  expect(after.progress["person-150"]).toEqual(data.progress["person-150"]);
  expect(after.users.find((u) => u.id === "person-125")!.teamId).toBe("grand");
  await page
    .getByRole("searchbox", { name: "Find a member", exact: true })
    .fill("person150@example.test");
  await page
    .getByRole("button", { name: "Remove Person 150 from team", exact: true })
    .click();
  await expect(confirm).toHaveCount(0);
  await effects
    .getByRole("button", {
      name: "View affected people and learning",
      exact: true,
    })
    .click();
  await expect(effects).toContainText("Person 150");
  await expect(effects).toContainText("Reporting access removed");
  await effects
    .getByRole("button", { name: "Remove member", exact: true })
    .click();
  await expect(members).toHaveCount(0);
  const removed = await saved(page);
  expect(
    removed.users.find((u) => u.id === "person-150")!.teamId,
  ).toBeUndefined();
  expect(removed.users.find((u) => u.id === "person-150")!.active).toBe(true);
  expect(removed.progress["person-150"]).toEqual(data.progress["person-150"]);

  await page
    .getByRole("button", { name: "Edit team details", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("combobox", { name: "Parent team", exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("textbox", { name: "Team name", exact: true })
    .fill("Sales renamed");
  await page.keyboard.press("Escape");
  await expect(confirm).toContainText("Discard unsaved team changes?");
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await dialog.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Sales renamed", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.reload();
  await section(page, "Teams");
  await page
    .getByRole("button", { name: "Manage Sales renamed", exact: true })
    .click();
  await expect(
    page.getByText("151 people in this branch · 51 direct members · 1 subteam"),
  ).toBeVisible();
});

test("team detail retains the tree search and optional selection on return", async ({
  page,
}) => {
  const data = fixture();
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto("/#admin");
  await expect(page.locator(".admin-layout")).toBeVisible();
  await section(page, "Teams");
  const baseline = await saved(page);
  const search = page.getByRole("searchbox", {
    name: "Find teams",
    exact: true,
  });
  await search.fill("Sales");
  await page
    .getByRole("button", { name: "Manage Sales team", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Back to teams", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Teams", exact: true }),
  ).toBeFocused();
  await expect(search).toHaveValue("Sales");
  await search.fill("");
  await expect(search).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Manage Other team", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Select teams", exact: true }).click();
  const choice = page.getByRole("checkbox", {
    name: "Select Sales team",
    exact: true,
  });
  await choice.check();
  await page
    .getByRole("button", { name: "Manage Sales team", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Back to teams", exact: true })
    .click();
  await expect(choice).toBeChecked();
  await expect(
    page.getByRole("button", { name: "Done selecting", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Done selecting", exact: true })
    .click();
  await expect(choice).toHaveCount(0);
  expect((await saved(page)).users).toEqual(baseline.users);
});

test("new-team parent options stay anchored to the visible dialog and preserve cancel or save", async ({
  page,
}, info) => {
  const data = freshWorkspace();
  data.teams!.push(
    { id: "east", name: "East team" },
    { id: "west", name: "West team" },
  );
  data.users = data.users.map((person) => ({
    ...person,
    groupJoinedAt: Object.fromEntries(
      person.groups.map((id) => [id, "2026-01-01T00:00:00.000Z"]),
    ),
    effectiveGroupJoinedAt: Object.fromEntries(
      person.groups.map((id) => [id, "2026-01-01T00:00:00.000Z"]),
    ),
  }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    if (!localStorage.getItem("fieldbook.workspace.v1"))
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto("/#admin");
  await expect(page.locator(".admin-layout")).toBeVisible();
  await section(page, "Teams");
  const baseline = await saved(page);
  await page.getByRole("button", { name: "Add team", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "New team",
    exact: true,
    includeHidden: true,
  });
  const parent = editor.getByRole("combobox", {
    name: "Parent team",
    exact: true,
    includeHidden: true,
  });
  await editor
    .getByRole("textbox", { name: "Team name", exact: true })
    .fill("New regional team");
  await parent.click();
  const options = page.getByRole("listbox");
  await expect(options).toBeVisible();
  await expect(editor).toBeVisible();
  await expect(parent).toBeVisible();
  await expect
    .poll(async () => {
      const trigger = await parent.boundingBox();
      const menu = await options.boundingBox();
      if (!trigger || !menu) return false;
      const verticalGap = Math.min(
        Math.abs(menu.y - (trigger.y + trigger.height + 5)),
        Math.abs(menu.y + menu.height + 5 - trigger.y),
      );
      return (
        Math.abs(menu.x - trigger.x) < 8 &&
        menu.width >= trigger.width - 2 &&
        verticalGap < 8
      );
    })
    .toBe(true);
  await page.screenshot({
    path: info.outputPath("new-team-parent-options.png"),
    fullPage: true,
  });
  await page.getByRole("option", { name: "Sales team", exact: true }).click();
  await expect(parent).toContainText("Sales team");
  await editor.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect((await saved(page)).teams).toEqual(baseline.teams);

  await page.getByRole("button", { name: "Add team", exact: true }).click();
  await editor
    .getByRole("textbox", { name: "Team name", exact: true })
    .fill("New regional team");
  await parent.click();
  await page.getByRole("option", { name: "Sales team", exact: true }).click();
  await editor.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(
    page.getByRole("dialog", { name: "Review team changes", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "New regional team", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Parent: Sales team", exact: true }),
  ).toBeVisible();
  const after = await saved(page);
  expect(
    after.teams!.find((team) => team.name === "New regional team")!.parentId,
  ).toBe("sales-team");
  expect(after.users).toEqual(baseline.users);
  expect(after.progress).toEqual(baseline.progress);
});

test("a contributor manager has one cancelable review without changing their own membership", async ({
  page,
}, info) => {
  const data = fixture();
  data.users.find((person) => person.id === "person-150")!.role = "contributor";
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto("/#admin");
  await expect(page.locator(".admin-layout")).toBeVisible();
  await section(page, "Teams");
  const baseline = await saved(page);
  await page
    .getByRole("button", { name: "Manage Sales team", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit team details", exact: true })
    .click();
  const editor = page.getByRole("dialog", {
    name: "Edit Sales team",
    exact: true,
  });
  await expect(
    editor.getByRole("combobox", { name: "Parent team", exact: true }),
  ).toBeVisible();
  await editor.getByRole("combobox", { name: "Manager", exact: true }).click();
  await page.getByRole("option", { name: "Person 150", exact: true }).click();
  await editor
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: "Review team changes",
    exact: true,
  });
  await expect(review).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(editor.locator("[data-slot=alert]")).toHaveCount(0);
  expect((await saved(page)).teams).toEqual(baseline.teams);
  await editor
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await page.screenshot({
    path: info.outputPath("manager-review.png"),
    fullPage: true,
  });
  await review.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const after = await saved(page);
  expect(after.teams!.find((team) => team.id === "sales-team")!.managerId).toBe(
    "person-150",
  );
  expect(after.users).toEqual(baseline.users);
  expect(after.users.find((person) => person.id === "person-150")!.teamId).toBe(
    "other",
  );
  expect(after.progress).toEqual(baseline.progress);
});
