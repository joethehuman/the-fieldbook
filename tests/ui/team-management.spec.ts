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
    ...Array.from({ length: 198 }, (_, i) => ({
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
  await expect(
    page.getByRole("heading", { name: "Administration", exact: true }),
  ).toBeVisible();
  await section(page, "Teams");
  await page
    .getByRole("button", { name: "Manage Sales team", exact: true })
    .click();
  await expect(
    page.getByText(
      "50 direct members · 100 people in subteams · 1 immediate subteams",
    ),
  ).toBeVisible();
  const members = page.getByRole("table", {
    name: "Team members",
    exact: true,
  });
  await expect(members.locator("tbody tr")).toHaveCount(25);
  const pages = page.getByRole("navigation", { name: "Team members pages" });
  await pages.getByRole("button", { name: "Next", exact: true }).click();
  await expect(members).toContainText("Person 025");
  await expect(members).toContainText("Inactive");
  await page.getByRole("combobox", { name: "Membership scope" }).click();
  await page
    .getByRole("option", { name: "Include subteams", exact: true })
    .click();
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
  const search = page.getByRole("searchbox", {
    name: "Find people to add",
    exact: true,
  });
  await search.fill("person150@example.test");
  await page.getByRole("checkbox", { name: /Person 150/ }).check();
  await search.fill("person151@example.test");
  await page.getByRole("checkbox", { name: /Person 151/ }).check();
  await section(page, "Feedback");
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText("Discard unsaved team changes?");
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Review 2 selected", exact: true })
    .click();
  const review = page.locator("#team-add-members");
  await expect(
    review.getByText("Move from Other team to Sales team", { exact: true }),
  ).toHaveCount(2);
  await page.screenshot({
    path: info.outputPath("review-members.png"),
    fullPage: true,
  });
  // A failed demo save must keep the review and choices available for retry.
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    let fail = true;
    Storage.prototype.setItem = function (key, value) {
      if (key === "fieldbook.workspace.v1" && fail) {
        fail = false;
        throw new Error("Synthetic storage failure");
      }
      return original.call(this, key, value);
    };
  });
  await review
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(review.getByRole("alert")).toContainText(
    "Your browser could not save",
  );
  expect(
    (await saved(page)).users.find((u) => u.id === "person-150")!.teamId,
  ).toBe("other");
  await review
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(review).toHaveCount(0);
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
  await confirm.getByRole("button", { name: "Confirm", exact: true }).click();
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
  await dialog
    .getByRole("combobox", { name: "Parent team", exact: true })
    .click();
  await expect(
    page.getByRole("option", { name: "Child team", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("option", { name: "Grandchild team", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
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
    page.getByText(
      "51 direct members · 100 people in subteams · 1 immediate subteams",
    ),
  ).toBeVisible();
});
