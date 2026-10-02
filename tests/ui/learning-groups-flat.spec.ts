import { expect, test, type Page } from "@playwright/test";
import { freshWorkspace, type Workspace } from "../../lib/store";

async function section(page: Page) {
  const picker = page.getByRole("combobox", {
    name: "Administration section",
    exact: true,
  });
  if (await picker.isVisible()) {
    await picker.click();
    await page
      .getByRole("option", { name: "Learning groups", exact: true })
      .click();
  } else
    await page
      .getByRole("tab", { name: "Learning groups", exact: true })
      .click();
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
    .getByRole("button", { name: "Account executives", exact: true })
    .click();
  await expect(
    page.getByRole("tab", { name: "Learning", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("button", { name: /Add child|Move group/ }),
  ).toHaveCount(0);
  await page.getByText("Curriculum · 2 courses", { exact: true }).click();
  await expect(page.getByText("Foundation one", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Add learning", exact: true }).click();
  const picker = page.getByRole("dialog", {
    name: "Add learning",
    exact: true,
  });
  await picker.getByRole("checkbox", { name: /Discovery/ }).check();
  await picker
    .getByRole("button", { name: "Review assignment", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: "Review changes",
    exact: true,
  });
  await expect(review).toBeVisible();
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(picker).toBeVisible();
  await expect(picker.getByRole("alert")).toHaveCount(0);
  expect(
    (await saved(page)).groups.find((group) => group.id === "ae")!
      .learningItems,
  ).toEqual([{ kind: "curriculum", id: "foundation" }]);
  await picker
    .getByRole("button", { name: "Review assignment", exact: true })
    .click();
  await review
    .getByRole("button", { name: "Apply changes", exact: true })
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
  await page
    .getByRole("button", { name: "All learning groups", exact: true })
    .click();
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
  await page.getByRole("button", { name: "Pilot", exact: true }).click();
  await page.getByRole("tab", { name: "People", exact: true }).click();
  await page
    .getByRole("button", { name: "Manage membership", exact: true })
    .click();
  const membership = page.getByRole("dialog", {
    name: "Manage membership",
    exact: true,
  });
  await membership
    .getByRole("checkbox", {
      name: "Revenue Revenue · Includes subteams",
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
  await page
    .getByRole("button", { name: "Manage membership", exact: true })
    .click();
  await membership
    .getByRole("tab", { name: "Individuals", exact: true })
    .click();
  await membership
    .getByRole("searchbox", { name: "Find a person", exact: true })
    .fill("Alex Edwards");
  await membership.getByRole("checkbox").check();
  await membership
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await expect(membership).not.toBeVisible();
  const row = page.getByRole("row").filter({ hasText: "Alex Edwards" });
  await row
    .getByRole("button", { name: "2 membership sources", exact: true })
    .click();
  const source = page.getByRole("dialog", {
    name: "Alex Edwards",
    exact: true,
  });
  await expect(source).toContainText("Revenue");
  await expect(source).toContainText("Individually added");
  await page.screenshot({
    path: info.outputPath("membership-sources.png"),
    fullPage: true,
  });
  await source.getByRole("button", { name: "Done", exact: true }).click();
  await page.reload();
  await section(page);
  await page.getByRole("button", { name: "Pilot", exact: true }).click();
  await page.getByRole("tab", { name: "People", exact: true }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "Alex Edwards" }),
  ).toContainText("2 membership sources");
});

test("large group roster is paginated, searchable and contained on narrow screens", async ({
  page,
}, info) => {
  await start(page, fixture(true));
  await page
    .getByRole("button", { name: "Account executives", exact: true })
    .click();
  await page.getByRole("tab", { name: "People", exact: true }).click();
  const table = page.getByRole("table", { name: "Group members" });
  await expect(table.getByRole("row")).toHaveCount(26);
  await expect(
    page.getByRole("navigation", { name: "Group members pages" }),
  ).toContainText("1–25 of 500");
  await page
    .getByRole("searchbox", { name: "Find a person", exact: true })
    .fill("Person 499");
  await expect(table.getByRole("row")).toHaveCount(2);
  await expect(table).toContainText("Person 499");
  await expect(
    page.getByRole("navigation", { name: "Group members pages" }),
  ).toContainText("1–1 of 1");
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
