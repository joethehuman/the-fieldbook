import { expect, test, type Locator, type Page } from "@playwright/test";
import { freshWorkspace, type Workspace } from "../../lib/store";

function library() {
  const data = freshWorkspace();
  const course = data.content.find((item) => item.kind === "course")!;
  const update = data.content.find((item) => item.kind === "brief")!;
  const collection = (kind: "course" | "brief", count: number) =>
    Array.from({ length: count }, (_, index) => ({
      ...(kind === "course" ? course : update),
      id: `${kind}-${index}`,
      title: `${kind === "course" ? "Course" : "Update"} ${String(index).padStart(3, "0")}`,
      summary: `Description marker${String(index).padStart(3, "0")}`,
      body: `Published material ${index}`,
      lessons:
        kind === "course"
          ? [
              {
                id: `lesson-${index}`,
                title: "Lesson introduction",
                body: `Published lesson material ${index}`,
              },
            ]
          : [],
      category: index % 2 ? "Engineering" : "Sales",
      updatedAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      status: "published" as const,
      groups: [],
      assignments: [],
    }));
  data.content = [...collection("course", 98), ...collection("brief", 100)];

  data.content.find((item) => item.id === "course-3")!.body =
    "Published course body describes **orbital navigation**.";
  data.content.find((item) => item.id === "course-3")!.lessons = [
    {
      id: "published-lesson",
      title: "Sequoia mastery",
      body: "One two three four five six seven eight nine ten eleven twelve thirteen fourteen. **Quartz** harbor signals are covered in this lesson.",
    },
  ];
  data.content.find((item) => item.id === "brief-2")!.body =
    "An **amber** lighthouse guides this published update.";
  data.content.push({
    ...course,
    id: "draft-only",
    title: "Private draft",
    summary: "Unpublished",
    body: "Cobalt embargo",
    lessons: [],
    status: "draft",
    groups: [],
    assignments: [],
  });
  data.publishedContent = undefined;
  data.curricula = [
    {
      id: "foundation",
      name: "Foundation curriculum",
      description: "Build a foundation",
      status: "published",
      courseIds: ["course-3", "draft-only"],
    },
    {
      id: "regional",
      name: "Regional curriculum",
      description: "Regional preparation",
      status: "published",
      courseIds: ["course-2"],
    },
  ];
  data.groups = [
    { id: "picker", name: "Picker audience", teamIds: [], learningItems: [] },
  ];
  data.teams = [];
  data.users = data.users
    .filter((user) => ["demo-admin", "demo-learner"].includes(user.id))
    .map((user) => ({
      ...user,
      groups: user.id === "demo-learner" ? ["picker"] : [],
      teamId: undefined,
      learningAssignments: [],
    }));
  data.progress = {};
  return data;
}
async function start(page: Page, kind: "courses" | "updates" = "courses") {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((data) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
  }, library());
  await page.goto("/#admin");
  const section = page.getByRole("combobox", {
    name: "Administration section",
    exact: true,
  });
  if (await section.isVisible()) {
    await section.click();
    await page
      .getByRole("option", { name: "Groups", exact: true })
      .click();
  } else
    await page
      .getByRole("tab", { name: "Groups", exact: true })
      .click();
  await page
    .getByRole("link", { name: "Picker audience", exact: true })
    .click();
  await page
    .getByRole("tab", {
      name: kind === "courses" ? "Assigned Courses" : "Assigned Updates",
      exact: true,
    })
    .click();
  const name = kind === "courses" ? "Manage Courses" : "Manage Updates";
  await page.getByRole("button", { name, exact: true }).click();
  return page.getByRole("dialog", { name, exact: true });
}
async function saved(page: Page): Promise<Workspace> {
  return page.evaluate(() => JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!));
}
async function pane(picker: Locator, side: "Available" | "Assigned") {
  const region = picker.getByRole("region", { name: `${side} items`, exact: true });
  if (!(await region.isVisible()))
    await picker.getByRole("button", { name: side === "Available" ? "Available" : /^Assigned \(\d+\)$/, exact: true }).click();
  return region;
}
async function add(picker: Locator, label: string) {
  const available = await pane(picker, "Available");
  await available.getByRole("searchbox").fill(label);
  await available.getByRole("button", { name: `Add ${label}`, exact: true }).click();
}

test("large transfer lists retain choices through independent searches and cancel without saving", async ({ page }, info) => {
  const picker = await start(page);
  const before = (await saved(page)).groups;
  await expect(picker.getByRole("combobox", { name: "Sort content", exact: true })).toHaveCount(0);
  await add(picker, "Course 097");
  await add(picker, "Course 003");
  await add(picker, "Regional curriculum");
  const assigned = await pane(picker, "Assigned");
  await expect(assigned.getByRole("button", { name: /^Remove / })).toHaveCount(3);
  await assigned.getByRole("searchbox").fill("Course 003");
  await expect(assigned.getByRole("button", { name: "Remove Course 003", exact: true })).toBeVisible();
  await assigned.getByRole("button", { name: "Remove Course 003", exact: true }).click();
  await assigned.getByRole("searchbox").clear();
  await expect(assigned.getByRole("button", { name: /^Remove / })).toHaveCount(2);
  await picker.screenshot({ path: info.outputPath("transfer-retained-choices.png") });
  await picker.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await saved(page)).groups).toEqual(before);
});

test("course and curriculum transfers review, save, reopen and remove direct sources", async ({ page }) => {
  const picker = await start(page);
  await add(picker, "Course 097");
  await add(picker, "Course 003");
  await add(picker, "Regional curriculum");
  await picker.getByRole("button", { name: "Review changes", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await picker.getByRole("button", { name: "Save assignments", exact: true }).click();
  await expect(picker).not.toBeVisible();
  const items = (await saved(page)).groups[0].learningItems;
  expect(items).toEqual(expect.arrayContaining([
    { kind: "course", id: "course-3" }, { kind: "course", id: "course-97" },
    { kind: "curriculum", id: "regional" },
  ]));
  expect(items).toHaveLength(3);
  await page.getByRole("button", { name: "Manage Courses", exact: true }).click();
  const assigned = await pane(picker, "Assigned");
  await assigned.getByRole("button", { name: "Remove Regional curriculum", exact: true }).click();
  await picker.getByRole("button", { name: "Review changes", exact: true }).click();
  await picker.getByRole("button", { name: "Save assignments", exact: true }).click();
  expect((await saved(page)).groups[0].learningItems).toEqual([
    { kind: "course", id: "course-97" }, { kind: "course", id: "course-3" },
  ]);
});

test("Update transfers save chosen audiences and preserve unrelated Updates", async ({ page }) => {
  const picker = await start(page, "updates");
  const before = (await saved(page)).content;
  await add(picker, "Update 099");
  await add(picker, "Update 002");
  await picker.getByRole("button", { name: "Review changes", exact: true }).click();
  await page.getByRole("dialog", { name: "Review Update audiences", exact: true })
    .getByRole("button", { name: "Apply changes", exact: true }).click();
  await expect(picker).not.toBeVisible();
  const after = (await saved(page)).content;
  expect(after.filter(item => item.kind === "brief" && item.groups.includes("picker")).map(item => item.id).sort())
    .toEqual(["brief-2", "brief-99"]);
  for (const item of before.filter(item => !["brief-2", "brief-99"].includes(item.id)))
    expect(after.find(next => next.id === item.id)!.groups).toEqual(item.groups);
});
