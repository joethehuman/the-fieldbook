import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace, type Workspace } from "../../lib/store";

async function start(page: Page, section: string) {
  const data = freshWorkspace();
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    if (!localStorage.getItem("fieldbook.workspace.v1"))
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto(`/#admin/${section}`);
  await expect(page.locator(".admin-layout")).toBeVisible();
  return data;
}

test("row menus remain visible at both scroll edges in every revised table", async ({
  page,
}, info) => {
  await start(page, "content");
  for (const [section, layout] of [
    ["content", "contentSelection"],
    ["people", "peopleSelection"],
    ["groups", "learningGroupsSelectable"],
    ["progress", "progressPeople"],
  ]) {
    await page.goto(`/#admin/${section}`);
    const table = page.locator(`table[data-layout="${layout}"]`);
    const row = table.locator("tbody tr").first();
    await row.scrollIntoViewIfNeeded();
    const container = table.locator("..");
    const actions = row.getByRole("button", { name: /^Actions for/ });
    for (const edge of [0, 10000]) {
      await container.evaluate((el, left) => {
        el.scrollLeft = left;
      }, edge);
      const box = await actions.boundingBox();
      const frame = await container.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(frame!.x);
      expect(box!.x + box!.width).toBeLessThanOrEqual(
        frame!.x + frame!.width + 1,
      );
      expect(box!.x + box!.width).toBeLessThanOrEqual(
        info.project.use.viewport!.width + 1,
      );
    }
    await container.evaluate((el) => {
      el.scrollLeft = 0;
    });
    await actions.click();
    await expect(page.getByRole("menu")).toBeVisible();
    await page.screenshot({
      path: info.outputPath(`${section}-pinned-menu.png`),
    });
    await page.keyboard.press("Escape");
    await expect(actions).toBeFocused();
  }
});

test("content edit links and published course assignment remain available", async ({
  page,
}, info) => {
  const data = await start(page, "content");
  const course = data.content.find(
    (item) => item.kind === "course" && item.status === "published",
  )!;
  await page
    .getByRole("searchbox", { name: "Search content", exact: true })
    .fill(course.title);
  const row = page
    .locator('table[data-layout="contentSelection"] tbody tr')
    .first();
  const link = row.getByRole("link", { name: course.title, exact: true });
  await expect(link).toHaveAttribute(
    "href",
    `#admin/content/${course.id}/edit`,
  );
  await row.getByRole("button", { name: /^Actions for/ }).click();
  await expect(
    page.getByRole("menuitem", { name: "Edit", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Unpublish", exact: true }),
  ).toBeVisible();
  await page.getByRole("menuitem", { name: "Assign", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Course audience", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await link.click();
  await expect(
    page.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue(course.title);
});

test("people shows reporting team, access and groups with an edit link", async ({
  page,
}, info) => {
  const data = await start(page, "people");
  const table = page.locator('table[data-layout="peopleSelection"]');
  await expect(
    table.getByRole("columnheader", { name: "Status", exact: true }),
  ).toHaveCount(0);
  await expect(
    table.getByRole("columnheader", { name: "Team", exact: true }),
  ).toBeVisible();
  await expect(
    table.getByRole("columnheader", { name: "Access", exact: true }),
  ).toBeAttached();
  await expect(
    table.getByRole("columnheader", { name: "Groups", exact: true }),
  ).toBeAttached();
  const row = table.locator("tbody tr").first();
  const name = await row.getByRole("link").innerText();
  const person = data.users.find((user) => user.name === name)!;
  await expect(row).toContainText(
    data.teams!.find((team) => team.id === person.teamId)!.name,
  );
  await page.screenshot({ path: info.outputPath("people-team-column.png") });
  await row.getByRole("link").click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("progress cells show only a ring and percentage with accessible deadline detail", async ({
  page,
}, info) => {
  await start(page, "progress");
  const table = page.locator('table[data-layout="progressPeople"]');
  const cells = table.locator("tbody tr td:nth-child(4)");
  await expect(cells.first()).toBeVisible();
  for (const value of await cells.allInnerTexts())
    expect(value.trim()).toMatch(/^(\d+%|—)$/);
  const overdue = table.getByRole("progressbar", { name: /overdue/ }).first();
  await expect(overdue).toHaveAttribute(
    "aria-label",
    /courses complete · \d+ overdue/,
  );
  const details = overdue.locator("xpath=ancestor::button");
  await details.scrollIntoViewIfNeeded();
  await details.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "Completion details", exact: true }),
  ).toContainText("overdue");
  await page.keyboard.press("Escape");
  await table.locator("tbody tr").first().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("progress-compact-rings.png"),
  });
});

test("learning group shortcuts open the correct existing editor and retain the filtered index", async ({
  page,
}, info) => {
  const data = await start(page, "groups");
  const group = [...data.groups].sort((a, b) =>
    a.name.localeCompare(b.name),
  )[0];
  const search = page.getByRole("searchbox", {
    name: "Find a group",
    exact: true,
  });
  await search.fill(group.name);
  const row = page
    .locator('table[data-layout="learningGroupsSelectable"] tbody tr')
    .first();
  const actions = row.getByRole("button", {
    name: `Actions for ${group.name}`,
    exact: true,
  });
  const before = await page.evaluate(() =>
    localStorage.getItem("fieldbook.workspace.v1"),
  );
  for (const action of ["Add people", "Assign courses", "Assign updates"]) {
    await actions.click();
    await page.getByRole("menuitem", { name: action, exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(group.name);
    await page.screenshot({
      path: info.outputPath(`group-${action.replaceAll(" ", "-")}.png`),
    });
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(actions).toBeFocused();
    await expect(search).toHaveValue(group.name);
    expect(
      await page.evaluate(() => localStorage.getItem("fieldbook.workspace.v1")),
    ).toEqual(before);
  }
  await row.getByRole("link", { name: group.name, exact: true }).click();
  await expect(
    page.getByRole("heading", { name: group.name, exact: true }),
  ).toBeVisible();
});

test("group row membership and assignment saves affect the chosen group and retain other sources", async ({
  page,
}) => {
  await start(page, "groups");
  const saved = async (): Promise<Workspace> =>
    page.evaluate(() =>
      JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
    );
  const before = await saved();
  const group = [...before.groups].sort((a, b) =>
    a.name.localeCompare(b.name),
  )[0];
  const person = before.users.find((user) => !user.groups.includes(group.id))!;
  const search = page.getByRole("searchbox", {
    name: "Find a group",
    exact: true,
  });
  await search.fill(group.name);
  const actions = page.getByRole("button", {
    name: `Actions for ${group.name}`,
    exact: true,
  });
  await actions.click();
  await page.getByRole("menuitem", { name: "Add people", exact: true }).click();
  const membership = page.getByRole("dialog", {
    name: "Add Members",
    exact: true,
  });
  await membership
    .getByRole("searchbox", { name: "Find a user", exact: true })
    .fill(person.email);
  await membership.getByRole("checkbox").check();
  expect(
    (await saved()).users.find((user) => user.id === person.id)!.groups,
  ).toEqual(person.groups);
  await membership
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  const membershipReview = page.getByRole("dialog", {
    name: "Review changes",
    exact: true,
  });
  await expect
    .poll(
      async () =>
        !(await membership.isVisible()) || (await membershipReview.isVisible()),
    )
    .toBe(true);
  if (await membershipReview.isVisible())
    await membershipReview
      .getByRole("button", { name: "Apply changes", exact: true })
      .click();
  await expect(membership).not.toBeVisible();
  await expect(search).toHaveValue(group.name);
  const afterMembership = await saved();
  expect(
    afterMembership.users.find((user) => user.id === person.id)!.groups,
  ).toEqual([...person.groups, group.id]);
  expect(
    afterMembership.groups.find((item) => item.id === group.id)!.teamIds,
  ).toEqual(group.teamIds);
  expect(
    afterMembership.groups.find((item) => item.id === group.id)!.learningItems,
  ).toEqual(group.learningItems);
  expect(afterMembership.groups.filter((item) => item.id !== group.id)).toEqual(
    before.groups.filter((item) => item.id !== group.id),
  );
  for (const other of before.users.filter((user) => user.id !== person.id))
    expect(
      afterMembership.users.find((user) => user.id === other.id)!.groups,
    ).toEqual(other.groups);

  const update = afterMembership.content.find(
    (item) =>
      item.kind === "brief" &&
      item.status === "published" &&
      !item.groups.includes(group.id),
  )!;
  await actions.click();
  await page
    .getByRole("menuitem", { name: "Assign updates", exact: true })
    .click();
  const updates = page.getByRole("dialog", {
    name: "Assign Updates",
    exact: true,
  });
  await updates
    .getByRole("searchbox", { name: "Find Updates", exact: true })
    .fill(update.title);
  await updates.getByRole("checkbox").check();
  await updates
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: "Review Update audiences",
    exact: true,
  });
  await review
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(updates).not.toBeVisible();
  await expect(search).toHaveValue(group.name);
  const after = await saved();
  expect(after.content.find((item) => item.id === update.id)!.groups).toEqual(
    expect.arrayContaining([...update.groups, group.id]),
  );
  for (const other of afterMembership.content.filter(
    (item) => item.id !== update.id,
  ))
    expect(after.content.find((item) => item.id === other.id)!.groups).toEqual(
      other.groups,
    );
  await actions.click();
  await page
    .getByRole("menuitem", { name: "Assign courses", exact: true })
    .click();
  const courses = page.getByRole("dialog", {
    name: "Assign Courses",
    exact: true,
  });
  const target = after.content.find(
    (item) =>
      item.kind === "course" &&
      item.status === "published" &&
      !group.learningItems?.some(
        (learning) => learning.kind === "course" && learning.id === item.id,
      ),
  )!;
  await courses
    .getByRole("searchbox", { name: "Find courses or curricula", exact: true })
    .fill(target.title);
  await courses
    .getByRole("checkbox", {
      name: new RegExp(
        `^${target.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} Course`,
      ),
    })
    .check();
  await courses
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await courses
    .getByRole("button", { name: "Save assignments", exact: true })
    .click();
  await expect(courses).not.toBeVisible();
  await expect(search).toHaveValue(group.name);
  const assigned = await saved();
  expect(
    assigned.groups.find((item) => item.id === group.id)!.learningItems,
  ).toEqual(
    expect.arrayContaining([
      ...(group.learningItems || []),
      { kind: "course", id: target.id },
    ]),
  );
  expect(assigned.groups.filter((item) => item.id !== group.id)).toEqual(
    after.groups.filter((item) => item.id !== group.id),
  );
});
