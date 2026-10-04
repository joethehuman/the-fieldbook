import { expect, test, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { setupAuthoringProvider } from "./provider-fixture";

async function setup(page: Page, installed: boolean, savedEpisode = false) {
  const data = freshWorkspace();
  const sample = data.content.find((item) => item.kind === "course")!;
  const titles = [
    "Alpha course",
    "Zulu course",
    "Beta course",
    "Optional course",
  ];
  const created = ["03", "01", "02", "04"];
  const assigned = ["03", "01", "02", "04"];
  data.content = titles.map((title, i) => ({
    ...structuredClone(sample),
    id: `00000000-0000-4000-8000-00000000010${i}`,
    title,
    category: "Category fixture",
    summary: "Synthetic discovery fixture.",
    status: "published" as const,
    createdAt: `2026-02-${created[i]}T00:00:00.000Z`,
    updatedAt: `2026-03-${created[3 - i]}T00:00:00.000Z`,
    groups: i === 3 ? [] : ["sort-group"],
    assignments:
      i === 3
        ? []
        : [
            {
              groupId: "sort-group",
              assignedAt: `2026-05-${assigned[i]}T00:00:00.000Z`,
              due: { type: "none" as const },
            },
          ],
    questions: [],
    lessons: [
      { id: "first", title: "First lesson", body: "Synthetic lesson." },
    ],
    revision: 1,
    publishedRevision: 1,
  }));
  const [alpha, zulu, beta] = data.content;
  data.publishedContent = structuredClone(data.content);
  data.groups = [
    {
      id: "sort-group",
      name: "Sort group",
      // Deliberately differs from assignment chronology.
      requiredCourseIds: [beta.id, alpha.id, zulu.id],
      learningItems: [
        { kind: "course", id: beta.id },
        { kind: "curriculum", id: "sort-curriculum" },
      ],
    },
  ];
  data.curricula = [
    {
      id: "sort-curriculum",
      name: "Published curriculum",
      description: "An authored sequence.",
      status: "published",
      courseIds: [zulu.id, alpha.id],
    },
    {
      id: "optional-curriculum",
      name: "Unassigned curriculum",
      description: "Available to everyone.",
      status: "published",
      courseIds: [data.content[3].id],
    },
    {
      id: "draft-curriculum",
      name: "Hidden draft curriculum",
      description: "Draft only.",
      status: "draft",
      courseIds: [beta.id],
    },
  ];
  data.users = [data.users.find((person) => person.id === "demo-admin")!];
  data.users[0].groups = ["sort-group"];
  data.users[0].groupJoinedAt = { "sort-group": "2026-01-01T00:00:00.000Z" };
  data.users[0].learningAssignments = savedEpisode
    ? [
        {
          episodeId: "saved-episode",
          contentId: beta.id,
          version: beta.version,
          assignedAt: "2026-04-01T00:00:00.000Z",
          dueDate: "2026-06-01",
          catchUpDays: 30,
          sourceGroups: ["sort-group"],
        },
      ]
    : undefined;
  data.teams = [];
  data.progress = {};
  if (installed) {
    await setupAuthoringProvider(page, data);
    await page.request.post(
      `http://127.0.0.1:${process.env.FIELDBOOK_BACKEND_TEST_PORT || 3130}/fixture`,
      {
        data: {
          settings: data.settings,
          groups: data.groups,
          curricula: data.curricula,
          userGroups: ["sort-group"],
          users: savedEpisode
            ? [
                {
                  id: data.users[0].id,
                  auth_user_id: data.users[0].id,
                  name: data.users[0].name,
                  email: data.users[0].email,
                  role: "admin",
                  active: true,
                  groups: ["sort-group"],
                  group_joined_at: data.users[0].groupJoinedAt,
                  learning_assignments: data.users[0].learningAssignments,
                },
              ]
            : [],
          documents: data.content.map((item) => ({
            id: item.id,
            draft: item,
            published: item,
            revision: 1,
            published_revision: 1,
            updated_at: item.updatedAt,
          })),
        },
      },
    );
  } else {
    await page.addInitScript((state) => {
      if (!localStorage.getItem("fieldbook.workspace.v1"))
        localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(state));
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    }, data);
  }
  await page.goto(installed ? "/courses" : "/#courses");
  await expect(
    page.getByRole("heading", { name: "Courses", exact: true, level: 1 }),
  ).toBeVisible();
}

async function choose(page: Page, value: string) {
  await page
    .getByRole("combobox", { name: "Sort courses", exact: true })
    .click();
  await page.getByRole("option", { name: value, exact: true }).click();
}

test("homepage shows recently updated category courses then all published curricula", async ({
  page,
}, info) => {
  await setup(page, info.project.name.startsWith("production"));
  const sort = page.getByRole("combobox", {
    name: "Sort courses",
    exact: true,
  });
  await expect(sort).toContainText("Updated (newest)");
  await sort.click();
  await expect(
    page.getByRole("option", { name: "Recommended order", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Browse curricula" }),
  ).toHaveCount(0);
  const row = page.getByRole("region", {
    name: "Category fixture",
    exact: true,
  });
  await expect(row.locator("h3")).toHaveText([
    "Alpha course",
    "Optional course",
    "Zulu course",
    "Beta course",
  ]);
  const curricula = page.getByRole("region", {
    name: "Curricula",
    exact: true,
  });
  await expect(curricula.locator(".course-card")).toHaveCount(2);
  await expect(curricula).toContainText("Unassigned curriculum");
  await expect(curricula).not.toContainText("Hidden draft");
  expect(
    await curricula.evaluate((el) => {
      const channels = el.closest(".library")!.querySelectorAll(".channel");
      const lastChannel = channels[channels.length - 1];
      return !!(
        lastChannel.compareDocumentPosition(el) &
        Node.DOCUMENT_POSITION_FOLLOWING
      );
    }),
  ).toBe(true);
  await curricula.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("homepage-curricula.png") });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page
    .getByRole("textbox", { name: "Filter courses" })
    .fill("Unassigned curriculum");
  await expect(curricula.locator(".course-card")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "No matching courses" }),
  ).toHaveCount(0);
  await page.getByRole("textbox", { name: "Filter courses" }).fill("");
  await page.reload();
  await expect(sort).toContainText("Updated (newest)");
});

test("For you defaults to due dates and supports assignment chronology on navigation and direct refresh", async ({
  page,
}, info) => {
  const installed = info.project.name.startsWith("production");
  await setup(page, installed);
  await choose(page, "Title (A–Z)");
  await page
    .getByRole("button", { name: "View all for you", exact: true })
    .click();
  const sort = page.getByRole("combobox", {
    name: "Sort courses",
    exact: true,
  });
  await expect(sort).toContainText("Due (earliest)");
  const cards = page.locator(".library .course-card h3");
  await expect(cards).toHaveText(["Published curriculum", "Beta course"]);
  await choose(page, "Assigned (oldest)");
  await expect(cards).toHaveText(["Published curriculum", "Beta course"]);
  await choose(page, "Assigned (newest)");
  await expect(cards).toHaveText(["Beta course", "Published curriculum"]);
  await sort.click();
  await expect(
    page.getByRole("option", { name: "Recommended order", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Browse curricula" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(sort).toContainText("Due (earliest)");
  await expect(cards).toHaveText(["Published curriculum", "Beta course"]);
  await page.getByRole("textbox", { name: "Filter courses" }).fill("Beta");
  await expect(cards).toHaveText(["Beta course"]);
  await page.screenshot({ path: info.outputPath("for-you-sorting.png") });
  await page.goto(installed ? "/courses/for-you" : "/#courses/for-you");
  await expect(sort).toContainText("Due (earliest)");
});

test("curriculum keeps authored default, supports alternate sorting and returns home", async ({
  page,
}, info) => {
  await setup(page, info.project.name.startsWith("production"));
  await page
    .getByRole("region", { name: "Curricula", exact: true })
    .locator(".course-card")
    .filter({ hasText: "Published curriculum" })
    .click();
  const cards = page.locator("[data-slot=card-grid] .course-card h3");
  await expect(
    page.getByRole("combobox", { name: "Sort courses", exact: true }),
  ).toContainText("Recommended order");
  await expect(cards).toHaveText(["Zulu course", "Alpha course"]);
  await choose(page, "Title (A–Z)");
  await expect(cards).toHaveText(["Alpha course", "Zulu course"]);
  await choose(page, "Recommended order");
  await expect(cards).toHaveText(["Zulu course", "Alpha course"]);
  await page.reload();
  await expect(cards).toHaveText(["Zulu course", "Alpha course"]);
  await page.screenshot({
    path: info.outputPath("curriculum-recommended.png"),
  });
  await page
    .getByRole("button", { name: /Back to courses/ })
    .or(page.getByRole("link", { name: /Back to courses/ }))
    .click();
  await expect(
    page.getByRole("region", { name: "Curricula", exact: true }),
  ).toBeVisible();
});

test("For you uses the saved effective assignment date across overlapping sources", async ({
  page,
}, info) => {
  await setup(page, info.project.name.startsWith("production"), true);
  await page
    .getByRole("button", { name: "View all for you", exact: true })
    .click();
  await choose(page, "Assigned (oldest)");
  await expect(page.locator(".library .course-card h3")).toHaveText([
    "Beta course",
    "Published curriculum",
  ]);
  await choose(page, "Assigned (newest)");
  await expect(page.locator(".library .course-card h3")).toHaveText([
    "Published curriculum",
    "Beta course",
  ]);
});
