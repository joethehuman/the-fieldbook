import { expect, test, type Locator, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { teamCommand } from "../helpers/team-navigation";
import {
  authoringUser,
  setupAuthoringProvider,
  syncAuthoringProvider,
} from "./provider-fixture";

const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(browserErrors.get(page)).toEqual([]);
});

function fixture() {
  const data = freshWorkspace();
  const doc = data.content.find((item) => item.kind === "doc")!;
  const course = data.content.find((item) => item.kind === "course")!;
  const update = data.content.find((item) => item.kind === "brief")!;
  data.content = [
    ...Array.from({ length: 25 }, (_, index) => ({
      ...doc,
      id: `search-doc-${index}`,
      title: `Guide ${index}`,
      summary: "Ordinary guide",
      category: "Reference",
      folder: "",
      createdAt: "2026-10-10T00:00:00Z",
    })),
    {
      ...doc,
      id: "search-install",
      title: "Install Fieldbook",
      summary: "Setup guide",
      category: "Reference",
      folder: "",
      createdAt: "2026-10-01T00:00:00Z",
    },
    {
      ...doc,
      id: "search-checklist",
      title: "Installation checklist",
      summary: "Setup guide",
      category: "Reference",
      folder: "",
      createdAt: "2026-10-02T00:00:00Z",
    },
    {
      ...doc,
      id: "search-folder",
      title: "Backup guide",
      summary: "Recovery guide",
      category: "Install and run",
      folder: "Install foldermarker",
      createdAt: "2026-10-13T00:00:00Z",
    },
    {
      ...doc,
      id: "search-summary",
      title: "Account guide",
      summary: "Install summarymarker",
      category: "Reference",
      folder: "",
      createdAt: "2026-10-12T00:00:00Z",
    },
    {
      ...course,
      id: "search-course",
      title: "Course Alpha",
      summary: "Descriptionmarker",
      body: "Bodymarker",
      lessons: [
        {
          id: "search-lesson",
          title: "Lessonmarker",
          body: "Lessonbodymarker",
        },
      ],
      status: "published" as const,
      assignments: [],
      groups: [],
    },
    {
      ...course,
      id: "search-course-install",
      title: "Install course",
      status: "published" as const,
      assignments: [],
      groups: [],
    },
    {
      ...update,
      id: "search-update",
      title: "Update Alpha",
      summary: "Descriptionmarker",
      body: "Bodymarker",
      status: "published" as const,
      groups: [],
    },
  ];
  data.publishedContent = undefined;
  data.curricula = [
    {
      id: "search-curriculum",
      name: "Foundation curriculum",
      description: "Descriptionmarker",
      status: "published",
      courseIds: ["search-course"],
    },
  ];
  data.groups = [
    { id: "search-group", name: "Search audience", learningItems: [] },
    {
      id: "assigned-group",
      name: "Assigned audience",
      learningItems: [{ kind: "curriculum", id: "search-curriculum" }],
    },
  ];
  const organization = data.teams!.find(
    (team) => team.system === "organization",
  )!;
  const admin = data.users.find((person) => person.role === "admin")!;
  const learner = data.users.find((person) => person.role === "learner")!;
  data.teams = [
    organization,
    {
      id: "search-revenue",
      name: "Revenue",
      parentId: organization.id,
      managerId: admin.id,
    },
    {
      id: "search-territory",
      name: "Territory",
      parentId: "search-revenue",
      managerId: admin.id,
    },
    { id: "search-west", name: "West", parentId: "search-revenue" },
    {
      id: "search-destination",
      name: "Destination",
      parentId: "search-territory",
    },
  ];
  data.users = [
    {
      ...admin,
      name: "Managerneedle Person",
      teamId: undefined,
      groups: [],
      effectiveGroupIds: undefined,
    },
    {
      ...learner,
      name: "Synthetic Learner",
      email: "learner@example.test",
      teamId: "search-territory",
      groups: ["search-group", "assigned-group"],
      effectiveGroupIds: undefined,
    },
  ];
  data.progress = {};
  return data;
}

async function setup(page: Page, installed: boolean) {
  const data = fixture();
  if (installed) {
    await setupAuthoringProvider(page, data);
    // The fixture changes the admin ID to the installed identity.
    data.teams!.forEach((team) => {
      if (team.managerId) team.managerId = authoringUser.id;
    });
    await syncAuthoringProvider(page, data, { includeTeams: true });
    await page.route("**/api/admin/snapshot?**", (route) =>
      route.fulfill({ json: { data, user: authoringUser } }),
    );
  } else {
    await page.addInitScript((data) => {
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    }, data);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(installed ? "/admin" : "/#admin");
  await expect(
    page.getByRole("searchbox", { name: "Search content", exact: true }),
  ).toBeVisible();
  // Development chrome can cover phone dialog actions; it is absent from builds.
  await page.addStyleTag({ content: "nextjs-portal { display: none; }" });
}

async function section(page: Page, name: string) {
  if (name === "People" && page.url().includes("#")) name = "Demo profiles";
  const compact = page.getByRole("combobox", {
    name: "Administration section",
    exact: true,
  });
  if (await compact.isVisible()) {
    await compact.click();
    await page.getByRole("option", { name, exact: true }).click();
  } else {
    await page.getByRole("tab", { name, exact: true }).click();
  }
}

async function pane(picker: Locator, side: "Available" | "Assigned") {
  const region = picker.getByRole("region", {
    name: `${side} items`,
    exact: true,
  });
  if (!(await region.isVisible()))
    await picker
      .getByRole("button", {
        name: side === "Available" ? "Available" : /^Assigned \(\d+\)$/,
        exact: true,
      })
      .click();
  return region;
}

test("Admin Content finds only titles, trims queries and retains sort and type filters", async ({
  page,
}, info) => {
  await setup(page, info.project.name.startsWith("production"));
  const types = page.getByRole("group", { name: "Content type", exact: true });
  await types.getByRole("button", { name: "Docs", exact: true }).click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  const search = page.getByRole("searchbox", {
    name: "Search content",
    exact: true,
  });
  await expect(search).toHaveAttribute(
    "placeholder",
    "Search content by title",
  );
  await search.fill(" INSTALL ");
  const rows = page.locator("table tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("Installation checklist");
  await expect(rows.last()).toContainText("Install Fieldbook");
  await expect(page.getByText("Backup guide", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Account guide", { exact: true })).toHaveCount(0);
  await types.getByRole("button", { name: "Courses", exact: true }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Install course");
  await search.fill("summarymarker");
  await expect(rows).toHaveCount(0);
  await types.getByRole("button", { name: "Docs", exact: true }).click();
  await search.fill("foldermarker");
  await expect(rows).toHaveCount(0);
  await search.fill(" Install Fieldbook ");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("Install Fieldbook");
  await page.screenshot({
    path: info.outputPath("admin-title-search.png"),
    fullPage: true,
  });
});

test("Admin directories find names and people emails without descriptions, managers or parent names", async ({
  page,
}, info) => {
  await setup(page, info.project.name.startsWith("production"));
  await section(page, "Curricula");
  const curricula = page.getByRole("searchbox", {
    name: "Find curricula",
    exact: true,
  });
  await curricula.fill("Descriptionmarker");
  await expect(
    page.getByText("Foundation curriculum", { exact: true }),
  ).toHaveCount(0);
  await curricula.fill(" FOUNDATION ");
  await expect(
    page.getByText("Foundation curriculum", { exact: true }),
  ).toBeVisible();
  await section(page, "Teams");
  const teams = page.getByRole("searchbox", {
    name: "Find teams",
    exact: true,
  });
  await teams.fill(
    info.project.name.startsWith("production")
      ? "Synthetic Admin"
      : "Managerneedle",
  );
  await expect(page.locator("[data-hierarchy-id]")).toHaveCount(0);
  await teams.fill(" REVENUE ");
  await expect(page.locator("[data-hierarchy-id]")).toHaveCount(1);
  await teams.fill("territory");
  await expect(page.locator("[data-hierarchy-id]")).toHaveCount(1);
  await section(page, "People");
  const people = page.getByRole("searchbox", {
    name: "Search profiles",
    exact: true,
  });
  await people.fill(" LEARNER@EXAMPLE.TEST ");
  await expect(page.locator("table tbody tr")).toHaveCount(1);
  await expect(page.locator("table tbody tr")).toContainText(
    "Synthetic Learner",
  );
  await people.fill("Territory");
  await expect(page.locator("table tbody tr")).toHaveCount(0);
});

test("Admin assignment searches use titles and curriculum names while retaining selections", async ({
  page,
}, info) => {
  await setup(page, info.project.name.startsWith("production"));
  await section(page, "Groups");
  await page
    .getByRole("link", { name: "Search audience", exact: true })
    .click();
  await page
    .getByRole("tab", { name: "Assigned Courses", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Manage Courses", exact: true })
    .click();
  const courses = page.getByRole("dialog", {
    name: "Manage Courses",
    exact: true,
  });
  const available = await pane(courses, "Available");
  for (const query of [
    "Descriptionmarker",
    "Bodymarker",
    "Lessonmarker",
    "Lessonbodymarker",
  ]) {
    await available.getByRole("searchbox").fill(query);
    await expect(available.getByRole("button", { name: /^Add / })).toHaveCount(
      0,
    );
  }
  await available.getByRole("searchbox").fill(" COURSE ALPHA ");
  await expect(available.getByRole("button", { name: /^Add / })).toHaveCount(1);
  await available
    .getByRole("button", { name: "Add Course Alpha", exact: true })
    .click();
  const assigned = await pane(courses, "Assigned");
  await assigned.getByRole("searchbox").fill("Bodymarker");
  await expect(assigned.getByRole("button", { name: /^Remove / })).toHaveCount(
    0,
  );
  await assigned.getByRole("searchbox").fill(" alpha ");
  await expect(
    assigned.getByRole("button", { name: "Remove Course Alpha", exact: true }),
  ).toBeVisible();
  await courses.getByRole("button", { name: "Cancel", exact: true }).click();
  await courses
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(courses).toHaveCount(0);
  await page
    .getByRole("tab", { name: "Assigned Updates", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Manage Updates", exact: true })
    .click();
  const updates = page.getByRole("dialog", {
    name: "Manage Updates",
    exact: true,
  });
  const updateOptions = await pane(updates, "Available");
  for (const query of ["Descriptionmarker", "Bodymarker"]) {
    await updateOptions.getByRole("searchbox").fill(query);
    await expect(
      updateOptions.getByRole("button", { name: /^Add / }),
    ).toHaveCount(0);
  }
  await updateOptions.getByRole("searchbox").fill(" UPDATE ALPHA ");
  await expect(
    updateOptions.getByRole("button", {
      name: "Add Update Alpha",
      exact: true,
    }),
  ).toBeVisible();
  await updates.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "All groups", exact: true }).click();
  await page
    .getByRole("link", { name: "Assigned audience", exact: true })
    .click();
  await page
    .getByRole("tab", { name: "Assigned Courses", exact: true })
    .click();
  const search = page.getByRole("searchbox", {
    name: "Find an assigned course or curriculum",
    exact: true,
  });
  await search.fill("Course Alpha");
  await expect(
    page.getByText("Foundation curriculum", { exact: true }),
  ).toHaveCount(0);
  await search.fill(" FOUNDATION ");
  await expect(
    page.getByText("Foundation curriculum", { exact: true }),
  ).toBeVisible();
});

test("Admin member pickers retain email matching and hierarchy choosers retain parent paths", async ({
  page,
}, info) => {
  await setup(page, info.project.name.startsWith("production"));
  await section(page, "Teams");
  await teamCommand(page, "Revenue");
  await page.getByRole("button", { name: "Add members", exact: true }).click();
  const members = page.getByRole("dialog", {
    name: "Add members",
    exact: true,
  });
  const search = members.getByRole("searchbox");
  await search.fill("Territory");
  await expect(
    members.getByText("Synthetic Learner", { exact: true }),
  ).toHaveCount(0);
  await search.fill(" LEARNER@EXAMPLE.TEST ");
  await expect(
    members.getByText("Synthetic Learner", { exact: true }),
  ).toBeVisible();
  await members.getByRole("button", { name: "Cancel", exact: true }).click();
  await teamCommand(page, "Revenue", "Move existing team here");
  const move = page.getByRole("dialog", {
    name: "Move a team into Revenue",
    exact: true,
  });
  await move.getByRole("searchbox").fill(" Revenue / Territory / Destination ");
  await expect(move.getByText("Destination", { exact: true })).toBeVisible();
  await move.getByRole("button", { name: "Cancel", exact: true }).click();
});
