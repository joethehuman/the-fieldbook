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
      .getByRole("option", { name: "Learning groups", exact: true })
      .click();
  } else
    await page
      .getByRole("tab", { name: "Learning groups", exact: true })
      .click();
  await page
    .getByRole("button", { name: "Picker audience", exact: true })
    .click();
  await page
    .getByRole("tab", {
      name: kind === "courses" ? "Assigned Courses" : "Assigned Updates",
      exact: true,
    })
    .click();
  const name = kind === "courses" ? "Assign Courses" : "Assign Updates";
  await page.getByRole("button", { name, exact: true }).click();
  return page.getByRole("dialog", { name, exact: true });
}
async function choose(
  page: Page,
  picker: Locator,
  control: string,
  option: string,
) {
  await picker
    .getByRole("button", {
      name: control === "Sort content" ? /^Sort:/ : /^Filters/,
    })
    .click();
  await page.getByRole("combobox", { name: control, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
  await page
    .getByRole("dialog", {
      name:
        control === "Sort content" ? "Collection sort" : "Collection filters",
      exact: true,
    })
    .press("Escape");
}
async function saved(page: Page): Promise<Workspace> {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
  );
}

test("100 content choices keep selections through discovery and cancel without saving", async ({
  page,
}, info) => {
  const picker = await start(page);
  const search = picker.getByRole("searchbox", {
    name: "Find courses or curricula",
    exact: true,
  });
  await expect(
    picker.getByRole("button", { name: "Sort: Updated newest", exact: true }),
  ).toBeVisible();
  await expect(
    picker.getByRole("checkbox", { name: /^Course/ }).first(),
  ).toHaveAccessibleName(/^Course 097\b/);
  await picker.getByRole("checkbox", { name: /^Course 097\b/ }).check();
  await picker.getByRole("button", { name: "Next", exact: true }).click();
  await picker.getByRole("checkbox", { name: /^Course 087\b/ }).check();
  await search.fill("marker003");
  await picker.getByRole("checkbox", { name: /^Course 003\b/ }).check();
  await search.clear();
  await choose(page, picker, "Category", "Engineering");
  await expect(
    picker.getByRole("checkbox", { name: /^Course/ }).first(),
  ).toHaveAccessibleName(/Engineering/);
  await expect(
    picker.getByText("1–10 of 49 shown", { exact: true }),
  ).toBeVisible();
  await picker.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    picker.getByText("11–20 of 49 shown", { exact: true }),
  ).toBeVisible();
  await expect(
    picker.getByRole("checkbox", { name: /^Course 077\b/ }),
  ).toBeVisible();
  await picker.getByRole("button", { name: "Previous", exact: true }).click();
  await expect(
    picker.getByRole("checkbox", { name: /^Course 097\b/ }),
  ).toBeChecked();
  await choose(page, picker, "Sort content", "Title A–Z");
  await expect(
    picker.getByRole("checkbox", { name: /^Course/ }).first(),
  ).toHaveAccessibleName(/^Course 001\b/);
  await choose(page, picker, "Sort content", "Title Z–A");
  await expect(
    picker.getByRole("checkbox", { name: /^Course/ }).first(),
  ).toHaveAccessibleName(/^Course 097\b/);
  await choose(page, picker, "Content type", "Curricula");
  await expect(
    picker.getByText(/^No content matches your search or filters\./),
  ).toBeVisible();
  await picker
    .getByRole("button", { name: "Clear search and filters", exact: true })
    .click();
  await choose(page, picker, "Content type", "Curricula");
  await expect(picker.getByRole("checkbox", { name: /^Course/ })).toHaveCount(
    0,
  );
  await picker.getByRole("checkbox", { name: /^Regional curriculum/ }).check();
  await picker
    .getByRole("button", { name: "Review selected", exact: true })
    .click();
  await expect(
    picker.getByRole("checkbox", { name: /^(Course|Regional)/ }),
  ).toHaveCount(4);
  for (const choice of await picker
    .getByRole("checkbox", { name: /^(Course|Regional)/ })
    .all())
    await expect(choice).toBeChecked();
  await page.screenshot({
    path: info.outputPath("content-picker-selected.png"),
    fullPage: true,
  });
  await picker
    .getByRole("button", { name: "Review assignment", exact: true })
    .click();
  const review = page.getByRole("dialog", {
    name: "Review changes",
    exact: true,
  });
  await review.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    picker.getByRole("checkbox", { name: /^(Course|Regional)/ }),
  ).toHaveCount(4);
  expect((await saved(page)).groups[0].learningItems).toEqual([]);
  await picker.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(picker).not.toBeVisible();
  expect((await saved(page)).groups[0].learningItems).toEqual([]);
});

test("course selections apply in displayed sort order and find curriculum child titles", async ({
  page,
}) => {
  const picker = await start(page);
  const search = picker.getByRole("searchbox", {
    name: "Find courses or curricula",
    exact: true,
  });

  await search.fill("harb quart");
  await expect(
    picker.getByRole("checkbox", { name: /^Course 003\b/ }),
  ).toBeVisible();
  await expect(
    picker.getByRole("checkbox", { name: /^Foundation curriculum/ }),
  ).toBeVisible();
  await search.fill("quart harb");
  await expect(
    picker.getByRole("checkbox", { name: /^Course 003\b/ }),
  ).toBeVisible();
  await search.fill("navig orb");
  await expect(
    picker.getByRole("checkbox", { name: /^Course 003\b/ }),
  ).toBeVisible();
  await search.fill("mast sequo");
  await expect(
    picker.getByRole("checkbox", { name: /^Foundation curriculum/ }),
  ).toBeVisible();
  await search.fill("embargo cobalt");
  await expect(picker.getByRole("checkbox")).toHaveCount(0);
  await search.fill("Course 003");
  await expect(
    picker.getByRole("checkbox", { name: /^Foundation curriculum/ }),
  ).toBeVisible();
  await picker.getByRole("checkbox", { name: /^Course 003\b/ }).check();
  await search.fill("Course 097");
  await picker.getByRole("checkbox", { name: /^Course 097\b/ }).check();
  await choose(page, picker, "Sort content", "Title A–Z");
  await picker
    .getByRole("button", { name: "Review selected", exact: true })
    .click();
  await expect(
    picker.getByRole("checkbox", { name: /^Course/ }).first(),
  ).toHaveAccessibleName(/^Course 003\b/);
  await picker
    .getByRole("button", { name: "Review assignment", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Review changes", exact: true })
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(picker).not.toBeVisible();
  expect((await saved(page)).groups[0].learningItems).toEqual([
    { kind: "course", id: "course-3" },
    { kind: "course", id: "course-97" },
  ]);
});

test("100 Updates expose real categories and searchable descriptions without a course type filter", async ({
  page,
}, info) => {
  const picker = await start(page, "updates");
  await expect(
    picker.getByRole("checkbox", { name: /^Update/ }).first(),
  ).toHaveAccessibleName(/^Update 099\b/);
  await picker.getByRole("button", { name: /^Filters/ }).click();
  await expect(
    page.getByRole("combobox", { name: "Content type", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("combobox", { name: "Category", exact: true }).click();
  await expect(page.getByRole("option")).toHaveText([
    "All categories",
    "Engineering",
    "Sales",
  ]);
  await page.getByRole("option", { name: "Sales", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Collection filters", exact: true })
    .press("Escape");
  const search = picker.getByRole("searchbox", {
    name: "Find Updates",
    exact: true,
  });
  await search.fill("lighth amb");
  await expect(
    picker.getByRole("checkbox", { name: /^Update 002\b/ }),
  ).toBeVisible();
  await search.fill("amb lighth");
  await expect(
    picker.getByRole("checkbox", { name: /^Update 002\b/ }),
  ).toBeVisible();
  await search.fill("marker002");
  await picker.getByRole("checkbox", { name: /^Update 002\b/ }).check();
  await search.fill("Engineering");
  await expect(
    picker.getByText(/^No content matches your search or filters\./),
  ).toBeVisible();
  await picker
    .getByRole("button", { name: "Review selected", exact: true })
    .click();
  await expect(
    picker.getByRole("checkbox", { name: /^Update 002\b/ }),
  ).toBeChecked();
  await page.screenshot({
    path: info.outputPath("updates-picker-selected.png"),
    fullPage: true,
  });
  await picker
    .getByRole("button", { name: "Clear selection", exact: true })
    .click();
  await expect(picker.getByRole("checkbox", { name: /^Update/ })).toHaveCount(
    10,
  );
  await expect(
    picker.getByRole("checkbox", { name: /^Update/ }).first(),
  ).toHaveAccessibleName(/^Update 099\b/);
  await expect(
    picker.getByRole("button", { name: "Show all options", exact: true }),
  ).toHaveCount(0);
  await picker.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(picker).not.toBeVisible();
  expect(
    (await saved(page)).content.filter(
      (item) => item.kind === "brief" && item.groups.includes("picker"),
    ),
  ).toEqual([]);
});
