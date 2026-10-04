import { expect, test, type Page } from "@playwright/test";
import { freshWorkspace, type Workspace } from "../../lib/store";

async function section(page: Page) {
  const picker = page.getByRole("combobox", {
    name: "Administration section",
    exact: true,
  });
  if (await picker.isVisible()) {
    await picker.click();
    await page.getByRole("option", { name: "Groups", exact: true }).click();
  } else await page.getByRole("tab", { name: "Groups", exact: true }).click();
}
async function saved(page: Page): Promise<Workspace> {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
  );
}
function fixture(large = false) {
  const data = freshWorkspace();
  const seed = data.content.find((item) => item.kind === "course")!;
  data.content = ["Foundation one", "Foundation two", "Discovery"].map(
    (title, index) => ({
      ...seed,
      id: `flat-course-${index}`,
      title,
      groups: [],
      assignments: [],
      status: "published" as const,
    }),
  );
  data.publishedContent = undefined;
  data.curricula = [
    {
      id: "foundation",
      name: "GTM foundation",
      status: "published",
      description: "Synthetic learning",
      courseIds: ["flat-course-0", "flat-course-1"],
    },
  ];
  data.teams = [
    { id: "revenue", name: "Revenue" },
    { id: "us", name: "US", parentId: "revenue" },
    { id: "ae", name: "US Account executives", parentId: "us" },
  ];
  data.groups = [
    {
      id: "ae",
      name: "Account executives",
      teamIds: ["ae"],
      teamLinkScope: "subtree",
      learningItems: [{ kind: "curriculum", id: "foundation" }],
    },
    {
      id: "all",
      name: "All GTM",
      teamIds: ["revenue"],
      teamLinkScope: "subtree",
      learningItems: [{ kind: "curriculum", id: "foundation" }],
    },
    {
      id: "pilot",
      name: "Pilot",
      teamIds: [],
      learningItems: [{ kind: "course", id: "flat-course-2" }],
    },
  ];
  data.users = data.users
    .filter((person) => ["demo-admin", "demo-learner"].includes(person.id))
    .map((person) => ({
      ...person,
      teamId: "ae",
      groups: [],
      groupJoinedAt: {},
      effectiveGroupJoinedAt: {},
      learningAssignments: [],
    }));
  if (large) {
    const person = data.users.find((item) => item.id === "demo-learner")!;
    for (let index = data.users.length; index < 500; index++)
      data.users.push({
        ...person,
        id: `person-${index}`,
        name: `Person ${String(index).padStart(3, "0")}`,
        email: `person-${index}@example.test`,
      });
  }
  data.progress = {};
  return data;
}
async function start(page: Page, data: Workspace) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    if (!localStorage.getItem("fieldbook.workspace.v1"))
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto("/#admin");
  await section(page);
}

test("flat groups retain curriculum links and deduplicate learning across audiences", async ({
  page,
}, info) => {
  await start(page, fixture());
  await page
    .getByRole("searchbox", { name: "Find a group", exact: true })
    .fill("Account");
  await page
    .getByRole("link", { name: "Account executives", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "People", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("button", { name: /Add child|Move group/ }),
  ).toHaveCount(0);
  await page
    .getByRole("tab", { name: "Assigned Courses", exact: true })
    .click();
  await page.getByText("Curriculum · 2 courses", { exact: true }).click();
  await expect(page.getByText("Foundation one", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Assign Courses", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Assign Courses",
    exact: true,
  });
  await picker.getByRole("checkbox", { name: /Discovery/ }).check();
  await picker
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  const review = picker;
  await expect(
    review.getByRole("button", { name: "Save assignments", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await review.getByRole("button", { name: "← Back", exact: true }).click();
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("alert")).toHaveCount(0);
  expect(
    (await saved(page)).groups.find((group) => group.id === "ae")!
      .learningItems,
  ).toEqual([{ kind: "curriculum", id: "foundation" }]);
  await picker
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await review
    .getByRole("button", { name: "Save assignments", exact: true })
    .click();
  await expect(picker).not.toBeVisible();
  expect(
    (await saved(page)).groups.find((group) => group.id === "ae")!
      .learningItems,
  ).toEqual([
    { kind: "curriculum", id: "foundation" },
    { kind: "course", id: "flat-course-2" },
  ]);
  await page
    .getByRole("button", { name: "Remove GTM foundation", exact: true })
    .click();
  await picker
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await picker
    .getByRole("button", { name: "Save assignments", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await saved(page)).groups.find((group) => group.id === "ae")!
          .learningItems,
    )
    .toEqual([{ kind: "course", id: "flat-course-2" }]);
  await expect(review).not.toBeVisible();
  const learner = (await saved(page)).users.find(
    (person) => person.id === "demo-learner",
  )!;
  expect(
    learner.learningAssignments?.map((assignment) => assignment.contentId),
  ).toEqual(
    expect.arrayContaining(["flat-course-0", "flat-course-1", "flat-course-2"]),
  );
  await page.getByRole("button", { name: "All groups", exact: true }).click();
  await expect(
    page.getByRole("searchbox", { name: "Find a group", exact: true }),
  ).toHaveValue("Account");
  await page.screenshot({
    path: info.outputPath("flat-group-index.png"),
    fullPage: true,
  });
});

test("branch membership stays staged and explains overlapping sources", async ({
  page,
}, info) => {
  await start(page, fixture());
  await page.getByRole("link", { name: "Pilot", exact: true }).click();
  await page.getByRole("tab", { name: "People", exact: true }).click();
  await page.getByRole("button", { name: "Add Members", exact: true }).click();
  const membership = page.getByRole("dialog", {
    name: "Add Members",
    exact: true,
  });
  await expect(
    membership.getByRole("tab", { name: "People", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await membership.getByRole("tab", { name: "Teams", exact: true }).click();
  await membership
    .getByRole("checkbox", {
      name: "Revenue Organization / Revenue · Includes subteams",
      exact: true,
    })
    .check();
  expect(
    (await saved(page)).groups.find((group) => group.id === "pilot")!.teamIds,
  ).toEqual([]);
  await membership
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: "Review changes",
    exact: true,
  });
  await expect(review).toBeVisible();
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(membership).toBeVisible();
  await expect(membership.getByRole("alert")).toHaveCount(0);
  await membership
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await review
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(membership).not.toBeVisible();
  await expect(
    page.getByRole("table", { name: "Group members" }),
  ).toContainText("Alex Edwards");
  await page.getByRole("button", { name: "Add Members", exact: true }).click();
  await membership.getByRole("tab", { name: "People", exact: true }).click();
  await membership
    .getByRole("searchbox", { name: "Find a user", exact: true })
    .fill("Alex Edwards");
  await membership.getByRole("checkbox").check();
  await membership
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await expect(membership).not.toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "Alex Edwards" });
  await expect(row).toContainText("Direct · Team");
  await expect(row.getByRole("button")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("membership-sources.png"),
    fullPage: true,
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Pilot", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "People", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "Alex Edwards" }),
  ).toContainText("Direct · Team");
});

test("large group roster is paginated, searchable and contained on narrow screens", async ({
  page,
}, info) => {
  await start(page, fixture(true));
  await page
    .getByRole("link", { name: "Account executives", exact: true })
    .click();
  await page.getByRole("tab", { name: "People", exact: true }).click();
  const table = page.getByRole("table", { name: "Group members" });
  await expect(table.getByRole("row")).toHaveCount(26);
  await expect(
    page.getByRole("region", { name: "Selected items" }),
  ).toContainText("1–25 of 500 people");
  await page
    .getByRole("searchbox", { name: "Find a user", exact: true })
    .fill("Person 499");
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText("Person 499");
  await expect(
    page.getByText("1–1 of 1 people", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("large-roster.png"),
    fullPage: true,
  });
});

test("group workspace starts with people and clearly separates assigned content from assignment pickers", async ({
  page,
}, info) => {
  const data = fixture();
  data.groups
    .find((group) => group.id === "ae")!
    .learningItems!.push({
      kind: "course",
      id: "flat-course-2",
    });
  const update = freshWorkspace().content.find(
    (item) => item.kind === "brief",
  )!;
  data.content.push(
    ...["Assigned launch", "Assigned product", "Unassigned release"].map(
      (title, index) => ({
        ...update,
        id: `flat-update-${index}`,
        title,
        status: "published" as const,
        groups: index < 2 ? ["ae"] : [],
      }),
    ),
  );
  await start(page, data);
  await page
    .getByRole("link", { name: "Account executives", exact: true })
    .click();
  const tabs = page.getByRole("tablist", { name: "Learning group sections" });
  await expect(tabs.getByRole("tab")).toHaveText([
    "People",
    "Assigned Courses",
    "Assigned Updates",
  ]);
  await expect(
    tabs.getByRole("tab", { name: "People", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("table", { name: "Group members" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("people-default-toolbar.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Add Members", exact: true }).click();
  const membership = page.getByRole("dialog", {
    name: "Add Members",
    exact: true,
  });
  await expect(
    membership.getByRole("tab", { name: "People", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    membership.getByRole("tab", { name: "Teams", exact: true }),
  ).toBeVisible();
  await membership.getByRole("button", { name: "Cancel", exact: true }).click();

  await tabs
    .getByRole("tab", { name: "Assigned Courses", exact: true })
    .click();
  const courseSearch = page.getByRole("searchbox", {
    name: "Find an assigned course or curriculum",
    exact: true,
  });
  await courseSearch.fill("Foundation two");
  await expect(
    page.getByRole("button", { name: "Remove GTM foundation", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Remove Discovery", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "Reorder GTM foundation; use up or down arrow",
      exact: true,
    }),
  ).toBeDisabled();
  await courseSearch.clear();
  await expect(
    page.getByRole("button", { name: "Move GTM foundation down", exact: true }),
  ).toBeEnabled();
  expect(
    (await saved(page)).groups.find((group) => group.id === "ae")!
      .learningItems,
  ).toEqual([
    { kind: "curriculum", id: "foundation" },
    { kind: "course", id: "flat-course-2" },
  ]);
  await page.screenshot({
    path: info.outputPath("assigned-courses-toolbar.png"),
    fullPage: true,
  });

  await tabs
    .getByRole("tab", { name: "Assigned Updates", exact: true })
    .click();
  const updateSearch = page.getByRole("searchbox", {
    name: "Find an assigned update",
    exact: true,
  });
  const table = page.getByRole("table", {
    name: "Assigned Updates",
    exact: true,
  });
  await expect(table).toContainText("Assigned launch");
  await expect(table).not.toContainText("Unassigned release");
  await updateSearch.fill("product");
  await expect(table).toContainText("Assigned product");
  await expect(table).not.toContainText("Assigned launch");
  await updateSearch.clear();
  await page.screenshot({
    path: info.outputPath("assigned-updates-toolbar.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Assign Updates", exact: true })
    .click();
  const picker = page.getByRole("dialog", {
    name: "Assign Updates",
    exact: true,
  });
  await expect(
    picker.getByRole("checkbox", { name: /Unassigned release/ }),
  ).toBeVisible();
  await expect(
    picker.getByRole("checkbox", { name: /Assigned launch/ }),
  ).toHaveCount(0);
  await picker.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("People filters and bulk direct removal preserve team membership and cancel without saving", async ({
  page,
}, info) => {
  const data = fixture();
  const learner = data.users.find((person) => person.id === "demo-learner")!;
  learner.groups = ["ae"];
  data.users.push({
    ...learner,
    id: "direct-only",
    name: "Zoe Direct",
    email: "zoe@example.test",
    teamId: undefined,
    active: false,
  });
  await start(page, data);
  await page
    .getByRole("link", { name: "Account executives", exact: true })
    .click();
  const table = page.getByRole("table", { name: "Group members" });
  await expect(table).toHaveAttribute("data-layout", "groupMembersSelectable");
  await expect(table.getByRole("checkbox")).toHaveCount(4);
  await table
    .getByRole("checkbox", { name: "Select page (3)", exact: true })
    .check();
  await page.getByRole("button", { name: "Bulk actions", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "Remove direct members", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText(
      "Select only people with Direct membership. Team membership is managed through linked teams.",
    ),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: /^Filters/ }).click();
  await page
    .getByRole("combobox", { name: "Membership source", exact: true })
    .click();
  await page.getByRole("option", { name: "Direct", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Collection filters", exact: true })
    .press("Escape");
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Bulk actions", exact: true }),
  ).toBeDisabled();
  const columns = await table
    .locator("col")
    .evaluateAll((items) =>
      items.map((item) => item.getBoundingClientRect().width),
    );
  for (const [label, choice, reset] of [
    ["User status", "Inactive", "All statuses"],
    ["Reporting team", "Organization", "All teams"],
  ]) {
    await page.getByRole("button", { name: /^Filters/ }).click();
    await page.getByRole("combobox", { name: label, exact: true }).click();
    await page.getByRole("option", { name: choice, exact: true }).click();
    await page
      .getByRole("dialog", { name: "Collection filters", exact: true })
      .press("Escape");
    await expect(table.getByRole("row")).toHaveCount(2);
    await expect(table.getByRole("checkbox")).toHaveCount(0);
    expect(
      await table
        .locator("col")
        .evaluateAll((items) =>
          items.map((item) => item.getBoundingClientRect().width),
        ),
    ).toEqual(columns);
    await page.getByRole("button", { name: /^Filters/ }).click();
    await page.getByRole("combobox", { name: label, exact: true }).click();
    await page.getByRole("option", { name: reset, exact: true }).click();
    await page
      .getByRole("dialog", { name: "Collection filters", exact: true })
      .press("Escape");
  }
  await page
    .getByRole("combobox", { name: "Sort people", exact: true })
    .click();
  await page.getByRole("option", { name: "Name (Z–A)", exact: true }).click();
  await expect(table.getByRole("row").nth(1)).toContainText("Zoe Direct");
  await table
    .getByRole("checkbox", { name: "Select page (2)", exact: true })
    .check();
  await page.getByRole("button", { name: "Bulk actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Remove direct members", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: "Remove direct members?",
    exact: true,
  });
  await expect(review).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Bulk actions", exact: true }),
  ).toBeFocused();
  await expect(
    table.getByRole("checkbox", {
      name: `Select ${learner.name}`,
      exact: true,
    }),
  ).toBeChecked();
  expect(
    (await saved(page)).users.find((person) => person.id === learner.id)!
      .groups,
  ).toContain("ae");
  // The global announcement region stays mounted; Cancel must announce no error.
  await expect(page.getByRole("alert")).toHaveText("");
  await page.getByRole("button", { name: "Bulk actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Remove direct members", exact: true })
    .click();
  await review
    .getByRole("button", { name: "Remove direct members", exact: true })
    .click();
  await expect(review).not.toBeVisible();
  expect(
    (await saved(page)).users.find((person) => person.id === learner.id)!
      .groups,
  ).not.toContain("ae");
  await page
    .getByRole("button", { name: "Remove Direct filter", exact: true })
    .click();
  const retained = table.getByRole("row").filter({ hasText: learner.email });
  await expect(retained).toContainText("Team");
  await expect(retained).not.toContainText("Direct");
  await expect(table).not.toContainText("Zoe Direct");
  await page.screenshot({
    path: info.outputPath("people-bulk-removal-retains-team.png"),
    fullPage: true,
  });
});

async function indexChoice(page: Page, field: string, option: string) {
  const sort = field === "Sort groups";
  if (!sort) await page.getByRole("button", { name: /^Filters/ }).click();
  await page.getByRole("combobox", { name: field, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
  if (!sort)
    await page.getByRole("dialog", { name: "Collection filters", exact: true }).press("Escape");
}

test("group index keeps selection across pages and creation reveals the new row without opening detail", async ({
  page,
}, info) => {
  const data = fixture();
  data.groups.push(
    ...Array.from({ length: 26 }, (_, index) => ({
      id: `empty-${index}`,
      name: `Empty ${String(index).padStart(2, "0")}`,
      teamIds: [],
      learningItems: [],
    })),
  );
  await start(page, data);
  const table = page.getByRole("table", {
    name: "Groups",
    exact: true,
  });
  await expect(table).toHaveAttribute(
    "data-layout",
    "learningGroupsSelectable",
  );
  await table
    .getByRole("checkbox", { name: "Select page (25)", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Select all 29 matching", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Groups pages", exact: true })
    .getByRole("button", { name: "Next", exact: true })
    .click();
  await expect(
    table.getByRole("checkbox", { name: "Select Pilot", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("region", { name: "Selected items", exact: true }),
  ).toContainText("29 selected");
  await indexChoice(page, "Sort groups", "Name (Z–A)");
  await expect(
    table.getByRole("checkbox", { name: "Select Pilot", exact: true }),
  ).toBeChecked();
  await indexChoice(page, "Group membership", "With people");
  await expect(
    page.getByRole("button", { name: "Bulk actions", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("searchbox", { name: "Find a group", exact: true })
    .fill("Account");
  await expect(table.getByRole("checkbox")).toHaveCount(0);
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  const create = page.getByRole("dialog", {
    name: "Create learning group",
    exact: true,
  });
  await create
    .getByRole("textbox", { name: "Group name", exact: true })
    .fill("AAA new audience");
  await create
    .getByRole("button", { name: "Create group", exact: true })
    .click();
  await expect(create).not.toBeVisible();
  const created = table.getByRole("link", {
    name: "AAA new audience",
    exact: true,
  });
  await expect(created).toBeFocused();
  await expect(created).toBeInViewport();
  await expect
    .poll(async () => {
      const row = (await created.boundingBox())!;
      return row.y + row.height < (page.viewportSize()?.height || 0) - 64;
    })
    .toBe(true);
  await expect(
    page.getByRole("searchbox", { name: "Find a group", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("combobox", { name: "Sort groups", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Selected items", exact: true }),
  ).toContainText("26–30 of 30 groups");
  await expect(
    page.getByRole("tablist", { name: "Learning group sections" }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("group-index-created-row.png"),
    fullPage: true,
  });
});

test("group index sorts real counts and filters membership and assigned courses with stable columns", async ({
  page,
}) => {
  const data = fixture();
  data.groups.push({
    id: "empty",
    name: "Empty audience",
    teamIds: [],
    learningItems: [],
  });
  await start(page, data);
  const table = page.getByRole("table", {
    name: "Groups",
    exact: true,
  });
  const widths = () =>
    table
      .locator("col")
      .evaluateAll((columns) =>
        columns.map((column) => column.getBoundingClientRect().width),
      );
  const original = await widths();
  await indexChoice(page, "Sort groups", "Courses (fewest)");
  await expect(table.getByRole("row").nth(1)).toContainText("Empty audience");
  await indexChoice(page, "Sort groups", "Courses (most)");
  await expect(table.getByRole("row").nth(1)).toContainText(
    "Account executives",
  );
  await indexChoice(page, "Sort groups", "People (fewest)");
  await expect(table.getByRole("row").nth(1)).toContainText("Empty audience");
  await indexChoice(page, "Sort groups", "People (most)");
  await expect(table.getByRole("row").nth(1)).toContainText(
    "Account executives",
  );
  await indexChoice(page, "Group membership", "No people");
  await expect(table.getByRole("row")).toHaveCount(3);
  await indexChoice(page, "Group courses", "With assigned courses");
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText("Pilot");
  await expect(table.getByRole("checkbox")).toHaveCount(0);
  expect(await widths()).toEqual(original);
  await indexChoice(page, "Group membership", "With people");
  await expect(table.getByRole("row")).toHaveCount(3);
  await indexChoice(page, "Group courses", "No assigned courses");
  await expect(
    page.getByText("No groups match these filters.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(table.getByRole("row")).toHaveCount(5);
});

test("bulk group deletion reviews once, cancels intact, and preserves content history and other audiences", async ({
  page,
}, info) => {
  const data = fixture();
  data.settings = { ...data.settings!, access: "public", guestGroupId: "ae" };
  const learner = data.users.find((person) => person.id === "demo-learner")!;
  learner.groups = ["ae", "pilot", "all"];
  const update = freshWorkspace().content.find(
    (item) => item.kind === "brief",
  )!;
  data.content.push({
    ...update,
    id: "group-removal-update",
    title: "Audience update",
    status: "published",
    groups: ["ae", "pilot"],
  });
  data.pendingUsers = [
    {
      name: "Pending Example",
      email: "pending@example.test",
      role: "learner",
      groups: ["ae", "all"],
    },
  ];
  data.progress[learner.id] = [
    {
      content_id: "flat-course-0",
      version: data.content[0].version,
      lessons: [data.content[0].lessons[0].id],
      passed: true,
    },
  ];
  await page.addInitScript(() => {
    const state = window as typeof window & { groupWrites: number };
    state.groupWrites = 0;
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage && key === "fieldbook.workspace.v1")
        state.groupWrites += 1;
      original.call(this, key, value);
    };
  });
  await start(page, data);
  const before = await saved(page);
  const writes = await page.evaluate(
    () => (window as typeof window & { groupWrites: number }).groupWrites,
  );
  const table = page.getByRole("table", {
    name: "Groups",
    exact: true,
  });
  for (const name of ["Account executives", "Pilot"])
    await table
      .getByRole("checkbox", { name: `Select ${name}`, exact: true })
      .check();
  const openDelete = async () => {
    await page
      .getByRole("button", { name: "Bulk actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Delete groups", exact: true })
      .click();
  };
  await openDelete();
  const review = page.getByRole("dialog", {
    name: "Delete 2 learning groups?",
    exact: true,
  });
  await expect(review).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await expect(review).toContainText(
    "Public guest recommendations: 0 added · 3 removed.",
  );
  await expect(review).toContainText("Update relevance changes");
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Bulk actions", exact: true }),
  ).toBeFocused();
  for (const name of ["Account executives", "Pilot"])
    await expect(
      table.getByRole("checkbox", { name: `Select ${name}`, exact: true }),
    ).toBeChecked();
  expect((await saved(page)).groups).toEqual(before.groups);
  expect(
    await page.evaluate(
      () => (window as typeof window & { groupWrites: number }).groupWrites,
    ),
  ).toBe(writes);
  await expect(page.getByRole("alert")).not.toContainText(
    /cancel|error|failed/i,
  );
  await openDelete();
  await review
    .getByRole("button", { name: "Delete groups", exact: true })
    .click();
  await expect(review).not.toBeVisible();
  await expect(
    table.getByRole("link", { name: "All GTM", exact: true }),
  ).toBeVisible();
  await expect(table.getByRole("checkbox")).toHaveCount(0);
  const after = await saved(page);
  expect(after.groups.map((group) => group.id)).toEqual(["all"]);
  expect(
    after.users.find((person) => person.id === learner.id)!.groups,
  ).toEqual(["all"]);
  expect(after.pendingUsers![0].groups).toEqual(["all"]);
  expect(after.content.map((item) => item.id)).toEqual(
    before.content.map((item) => item.id),
  );
  expect(
    after.content.find((item) => item.id === "group-removal-update")!.groups,
  ).toEqual([]);
  expect(after.progress).toEqual(before.progress);
  expect(
    await page.evaluate(
      () => (window as typeof window & { groupWrites: number }).groupWrites,
    ),
  ).toBe(writes + 1);
  await page.screenshot({
    path: info.outputPath("group-index-bulk-deleted.png"),
    fullPage: true,
  });
});
