import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace, type Workspace } from "../../lib/store";
async function seed(page: Page, data = freshWorkspace(), path = "content") {
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    if (!localStorage.getItem("fieldbook.workspace.v1"))
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto(`/#admin/${path}`);
}
async function menu(page: Page, name: string) {
  await page
    .getByRole("button", { name: `Actions for ${name}`, exact: true })
    .click();
}
const bulk = (page: Page) =>
  page.getByRole("button", { name: "Bulk actions", exact: true });
const stored = (page: Page) =>
  page.evaluate(
    () =>
      JSON.parse(
        localStorage.getItem("fieldbook.workspace.v1") || "{}",
      ) as Workspace,
  );

test("content row commands match bulk, selection count excludes the header, and singleton remains actionable", async ({
  page,
}, info) => {
  const data = freshWorkspace();
  const docs = data.content.filter((c) => c.kind === "doc").slice(0, 2);
  data.content = docs;
  data.publishedContent = data.publishedContent?.filter((c) =>
    docs.some((d) => d.id === c.id),
  );
  await seed(page, data);
  await expect(bulk(page)).toBeDisabled();
  await page
    .getByRole("checkbox", { name: `Select ${docs[0].title}`, exact: true })
    .check();
  await expect(bulk(page)).toBeDisabled();
  await expect(
    page.getByRole("checkbox", { name: /Select all 2/ }),
  ).toHaveAttribute("data-state", "indeterminate");
  await page
    .getByRole("checkbox", { name: `Select ${docs[1].title}`, exact: true })
    .check();
  await expect(bulk(page)).toBeEnabled();
  await bulk(page).click();
  for (const name of [
    "Publish selected",
    "Unpublish selected",
    "Move to section",
    "Delete selected",
  ])
    await expect(
      page.getByRole("menuitem", { name, exact: true }),
    ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Edit", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page
    .getByRole("checkbox", { name: `Select ${docs[1].title}`, exact: true })
    .uncheck();
  await expect(bulk(page)).toBeDisabled();
  await menu(page, docs[0].title);
  for (const name of ["Edit", "Unpublish", "Move to section", "Delete"])
    await expect(
      page.getByRole("menuitem", { name, exact: true }),
    ).toBeVisible();
  await page.screenshot({ path: info.outputPath("content-row-menu.png") });
  await page.keyboard.press("Escape");
  await page
    .getByRole("searchbox", { name: "Search content" })
    .fill(docs[0].title);
  await expect(bulk(page)).toHaveCount(0);
  await menu(page, docs[0].title);
  await expect(
    page.getByRole("menuitem", { name: "Delete", exact: true }),
  ).toBeVisible();
});

test("single-row deletion and recovery target only that item and keep the acknowledgment", async ({
  page,
}, info) => {
  const data = freshWorkspace();
  const item = data.content.find((c) => c.kind === "doc")!;
  await seed(page, data);
  await menu(page, item.title);
  await page.getByRole("menuitem", { name: "Delete", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("30 days");
  await expect(
    dialog.getByRole("button", { name: "Delete", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();
  await expect
    .poll(async () =>
      (await stored(page)).content.some((c) => c.id === item.id),
    )
    .toBe(false);
  await page.goto("/#admin/settings/recently-deleted");
  await expect(bulk(page)).toHaveCount(0);
  await menu(page, item.title);
  await page.getByRole("menuitem", { name: "Restore", exact: true }).click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await stored(page)).content.find((c) => c.id === item.id)?.status,
    )
    .toBe("draft");
  await expect
    .poll(async () => (await stored(page)).deletedItems?.length)
    .toBe(0);
  await page.screenshot({
    path: info.outputPath("single-record-recovered.png"),
  });
});

test("people individual commands preserve access safeguards and match bulk membership operations", async ({
  page,
}) => {
  const data = freshWorkspace();
  const admin = data.users.find((u) => u.id === "demo-admin")!;
  data.users = [
    admin,
    ...data.users.filter((u) => u.id !== admin.id).slice(0, 1),
  ];
  await seed(page, data, "people");
  await menu(page, admin.name);
  for (const name of [
    "Edit",
    "Progress",
    "Add to groups",
    "Remove from groups",
    "Set reporting team",
    "Set hire date",
    "Delete",
  ])
    await expect(
      page.getByRole("menuitem", { name, exact: true }),
    ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Deactivate", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await page
    .getByRole("checkbox", { name: `Select ${admin.name}`, exact: true })
    .check();
  await expect(bulk(page)).toBeDisabled();
});

test("curriculum individual and bulk publication, assignment, deletion menus align", async ({
  page,
}, info) => {
  const data = freshWorkspace();
  await seed(page, data, "curricula");
  const first = data.curricula![0];
  await menu(page, first.name);
  for (const name of [
    "Edit curriculum",
    "Assign to teams or groups",
    "Remove team or group assignments",
    "Delete curriculum",
  ])
    await expect(
      page.getByRole("menuitem", { name, exact: true }),
    ).toBeVisible();
  await expect(
    page.getByRole("menuitem", {
      name: first.status === "published" ? "Unpublish" : "Publish",
      exact: true,
    }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page
    .getByRole("checkbox", { name: `Select ${first.name}`, exact: true })
    .check();
  await expect(bulk(page)).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: `Select ${data.curricula![1].name}`,
      exact: true,
    })
    .check();
  await bulk(page).click();
  await expect(
    page.getByRole("menuitem", {
      name: "Delete selected curricula",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("curricula-bulk-menu.png") });
});

test("groups directory exposes the same membership and assignment commands individually and in bulk", async ({
  page,
}, info) => {
  const data = freshWorkspace();
  await seed(page, data, "groups");
  const group = data.groups[0];
  await menu(page, group.name);
  for (const name of [
    "Edit group",
    "Add people",
    "Remove people",
    "Assign courses",
    "Remove courses",
    "Assign updates",
    "Remove updates",
    "Delete group",
  ])
    await expect(
      page.getByRole("menuitem", { name, exact: true }),
    ).toBeVisible();
  await page.screenshot({ path: info.outputPath("group-row-menu.png") });
  await page.keyboard.press("Escape");
  await page
    .getByRole("checkbox", { name: `Select ${group.name}`, exact: true })
    .check();
  await expect(bulk(page)).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: `Select ${data.groups[1].name}`,
      exact: true,
    })
    .check();
  await bulk(page).click();
  for (const name of [
    "Add people",
    "Remove people",
    "Assign courses",
    "Remove courses",
    "Assign updates",
    "Remove updates",
    "Delete groups",
  ])
    await expect(
      page.getByRole("menuitem", { name, exact: true }),
    ).toBeVisible();
});

test("group membership removal remains available individually and protects linked-team-only members", async ({
  page,
}) => {
  const data = freshWorkspace();
  const group = data.groups[0];
  const team = data.teams!.find((t) => t.system !== "organization")!;
  group.teamIds = [team.id];
  group.teamLinkScope = "subtree";
  const person = data.users[0];
  person.groups = [...new Set([...person.groups, group.id])];
  person.teamId = team.id;
  const inherited = data.users[1];
  inherited.groups = inherited.groups.filter((id) => id !== group.id);
  inherited.teamId = team.id;
  await seed(page, data, `groups/${group.id}/people`);
  const search = page.getByRole("searchbox", { name: "Find a user" });
  await search.fill(person.name);
  await menu(page, person.name);
  await expect(
    page.getByRole("menuitem", {
      name: "Remove direct membership",
      exact: true,
    }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(bulk(page)).toHaveCount(0);
  await search.fill(inherited.name);
  await menu(page, inherited.name);
  await expect(
    page.getByRole("menuitem", {
      name: "Remove direct membership",
      exact: true,
    }),
  ).toBeDisabled();
});

test("team hierarchy menus align group links, movement and deletion; Organization protects its root", async ({
  page,
}, info) => {
  const data = freshWorkspace();
  const team = data.teams!.find((t) => t.system !== "organization")!;
  await seed(page, data, "teams");
  await page.getByRole("searchbox", { name: "Find teams" }).fill(team.name);
  await menu(page, team.name);
  for (const name of [
    "Open team",
    "Edit team",
    "Add to groups",
    "Remove from groups",
    "Move team",
    "Delete team",
  ])
    await expect(
      page.getByRole("menuitem", { name, exact: true }),
    ).toBeVisible();
  await page.screenshot({ path: info.outputPath("team-row-menu.png") });
  await page.keyboard.press("Escape");
  const root = data.teams!.find((t) => t.system === "organization")!;
  await page.goto(`/#admin/teams/${root.id}/members`);
  const person = data.users.find((u) => !u.teamId || u.teamId === root.id)!;
  await page
    .getByRole("searchbox", { name: "Find a member" })
    .fill(person.name);
  await menu(page, person.name);
  await expect(
    page.getByRole("menuitem", { name: "Remove from team", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("menuitem", { name: "Move to team", exact: true }),
  ).toBeEnabled();
});

test("Docs section bulk deletion remains disabled for one selection and rejects nonempty sections", async ({
  page,
}) => {
  const data = freshWorkspace();
  await seed(page, data, "settings/docs-navigation");
  const choices = page.getByRole("checkbox", { name: /^Select / });
  await expect(choices).not.toHaveCount(0);
  await choices.nth(0).check();
  await expect(bulk(page)).toBeDisabled();
  await choices.nth(1).check();
  await bulk(page).click();
  await expect(
    page.getByRole("menuitem", { name: "Move selected sections", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("menuitem", { name: "Delete selected sections", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete selected sections", exact: true })
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toBeVisible();
});
