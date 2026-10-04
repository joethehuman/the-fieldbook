import { test, expect, type Page } from "@playwright/test";
import { learningUiFixture } from "../fixtures/learning-ui";

async function seed(page: Page, profile = "demo-learner", data = learningUiFixture()) {
  await page.addInitScript(
    ({ data, profile }) => {
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
      sessionStorage.setItem("fieldbook.profile.v1", profile);
    },
    { data, profile },
  );
}
async function choose(page: Page, label: string, option: string) {
  const picker = page.getByRole("combobox", { name: label, exact: true });
  await picker.click();
  await expect(
    page.getByRole("dialog", { name: "Collection sort" }),
  ).toHaveCount(0);
  await page.getByRole("option", { name: option, exact: true }).click();
  await expect(picker).toContainText(`Sort: ${option}`);
  return picker;
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}

test("admin sorts open direct options and reverse the visible records", async ({
  page,
}, info) => {
  const data = learningUiFixture();
  data.content = data.content.filter((item) => ["course-1", "course-2", "course-3"].includes(item.id));
  await seed(page, "demo-admin", data);
  await page.goto("/#admin/content");
  const picker = await choose(page, "Sort content", "Title (A–Z)");
  const titles = () =>
    page
      .locator('table[data-layout="contentSelection"] tbody td:nth-child(2) a')
      .allTextContents();
  const ascending = await titles();
  expect(ascending.length).toBeGreaterThan(1);
  await choose(page, "Sort content", "Title (Z–A)");
  expect(await titles()).toEqual([...ascending].reverse());
  await picker.click();
  await expect(
    page.getByRole("option", { name: "Created (oldest)", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("admin-direct-sort.png") });
  await page.keyboard.press("Escape");
  await expect(picker).toBeFocused();
  await noOverflow(page);
});

test("Your courses retains Assigned, adds Due and omits authoring dates", async ({
  page,
}, info) => {
  await seed(page);
  await page.goto("/#courses/yours");
  const picker = page.getByRole("combobox", {
    name: "Sort courses",
    exact: true,
  });
  await picker.click();
  await expect(
    page.getByRole("option", { name: "Assigned (oldest)", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Assigned (newest)", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Due (earliest)", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: /Created|Updated/ }),
  ).toHaveCount(0);
  await page
    .getByRole("option", { name: "Assigned (oldest)", exact: true })
    .click();
  await choose(page, "Sort courses", "Due (latest)");
  await page.screenshot({ path: info.outputPath("personal-sort.png") });
  await noOverflow(page);
});

test("curriculum uses compact sort and preserves authored order on return", async ({
  page,
}, info) => {
  await seed(page);
  await page.goto("/#curricula/sales-foundations");
  const picker = page.getByRole("combobox", {
    name: "Sort courses",
    exact: true,
  });
  await expect(picker).toContainText("Sort: Recommended order");
  const width = (await picker.boundingBox())!.width;
  expect(width).toBeLessThan(340);
  const titles = () => page.locator(".course-card h3").allTextContents();
  const authored = await titles();
  expect(authored).toHaveLength(3);
  await choose(page, "Sort courses", "Title (Z–A)");
  await choose(page, "Sort courses", "Recommended order");
  expect(await titles()).toEqual(authored);
  await picker.click();
  await expect(page.getByRole("option")).toHaveCount(3);
  await page.screenshot({
    path: info.outputPath("curriculum-compact-sort.png"),
  });
  await page.keyboard.press("Escape");
  await noOverflow(page);
});

test("Due uses saved unfinished deadlines and reverses the same curriculum deadline", async ({ page }) => {
  const data = learningUiFixture();
  const learner = data.users.find((person) => person.id === "demo-learner")!;
  const extra = { ...structuredClone(data.content.find((course) => course.id === "course-2")!),
    id: "sort-extra", title: "Standalone assignment", groups: ["sales"] };
  data.content.push(extra);
  data.teams = [];
  learner.teamId = undefined;
  learner.groups = ["sales"];
  learner.groupJoinedAt = { sales: "2026-09-01T00:00:00.000Z" };
  data.groups = [{
    id: "sales", name: "Sort audience",
    requiredCourseIds: ["course-1", "course-2", "course-3", extra.id],
    learningItems: [{ kind: "curriculum", id: "sales-foundations" }, { kind: "course", id: extra.id }],
  }];
  learner.learningAssignments = [
    ["course-1", "2026-09-01", "2026-10-01"],
    ["course-2", "2026-10-02", "2026-10-05"],
    ["course-3", "2026-09-02", "2026-10-20"],
    [extra.id, "2026-09-03", "2026-10-10"],
  ].map(([id, assignedAt, dueDate]) => ({
    episodeId: `saved-${id}`, contentId: id,
    version: data.content.find((course) => course.id === id)!.version,
    assignedAt, dueDate, catchUpDays: 30, sourceGroups: ["sales"],
  }));
  await seed(page, "demo-learner", data);
  await page.goto("/#courses/yours");
  await choose(page, "Sort courses", "Due (earliest)");
  const titles = page.locator(".library .course-card h3");
  await expect(titles).toHaveText([
    "Know the platform", "Standalone assignment", "From discovery to next steps", "Start with the customer",
  ]);
  await choose(page, "Sort courses", "Due (latest)");
  await expect(titles).toHaveText([
    "From discovery to next steps", "Standalone assignment", "Know the platform", "Start with the customer",
  ]);
  await page.goto("/#courses/for-you");
  await choose(page, "Sort courses", "Due (earliest)");
  await expect(titles).toHaveText(["Account executive foundations", "Standalone assignment"]);
  await choose(page, "Sort courses", "Due (latest)");
  await expect(titles).toHaveText(["Standalone assignment", "Account executive foundations"]);
});

test("catalog mixed picker uses Title and offers Updated only for Courses", async ({
  page,
}, info) => {
  await page.goto("/ui#catalog-content-selection");
  const section = page.locator("#catalog-content-selection");
  const picker = section.getByRole("combobox", {
    name: "Sort content",
    exact: true,
  });
  await expect(picker).toContainText("Sort: Title (A–Z)");
  await picker.click();
  await expect(page.getByRole("option", { name: /Updated:/ })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await section.getByRole("button", { name: "Filters", exact: true }).click();
  const filter = page.getByRole("dialog", {
    name: "Collection filters",
    exact: true,
  });
  await filter
    .getByRole("combobox", { name: "Content type", exact: true })
    .click();
  await page.getByRole("option", { name: "Courses", exact: true }).click();
  await filter.press("Escape");
  await picker.click();
  await expect(
    page.getByRole("option", { name: "Updated (newest)", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("option", { name: "Updated (oldest)", exact: true })
    .click();
  await section
    .getByRole("searchbox", { name: "Find content", exact: true })
    .fill("product");
  await expect(picker).toContainText("Sort: Relevance");
  await section.scrollIntoViewIfNeeded();
  await section.screenshot({ path: info.outputPath("catalog-sort.png") });
  // The catalog includes an unrelated editor-frame example with inherited phone overflow.
  // Check this sort/selection example itself rather than that separate example.
  expect(await section.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  const bounds = (await picker.boundingBox())!;
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});
