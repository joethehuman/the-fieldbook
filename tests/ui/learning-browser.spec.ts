import { test, expect, type Page } from "@playwright/test";
import { learningUiFixture } from "../fixtures/learning-ui";

async function seed(page: Page, allAssignedComplete = false, many = false) {
  const data = learningUiFixture();
  const sample = data.content.find((c) => c.id === "course-2")!;
  const optional = {
    ...sample,
    id: "optional-course",
    title: "Optional exploration",
    category: "Optional learning",
    groups: [],
    assignments: [],
  };
  const completedOptional = {
    ...optional,
    id: "optional-complete",
    title: "Optional achievement",
    category: "Completed optional learning",
  };
  data.content.push(optional, completedOptional);
  data.progress["demo-learner"] = [
    ...data.progress["demo-learner"],
    {
      content_id: optional.id,
      version: optional.version,
      lessons: [optional.lessons[0].id],
      passed: false,
    },
    {
      content_id: completedOptional.id,
      version: completedOptional.version,
      lessons: completedOptional.lessons.map((l) => l.id),
      passed: true,
    },
  ];
  if (allAssignedComplete) {
    for (const id of ["course-2", "course-3"]) {
      const c = data.content.find((c) => c.id === id)!;
      data.progress["demo-learner"].push({
        content_id: id,
        version: c.version,
        lessons: c.lessons.map((l) => l.id),
        passed: true,
      });
    }
  }
  if (many) {
    for (let i = 0; i < 8; i++) {
      const id = `extra-${i}`;
      data.content.push({ ...sample, id, title: `Additional course ${i}` });
      data.groups[0].requiredCourseIds!.push(id);
      data.groups[0].learningItems!.push({ kind: "course", id });
    }
  }
  await page.addInitScript((data) => {
    if (!localStorage.getItem("learning-test-seeded")) {
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
      localStorage.setItem("learning-test-seeded", "yes");
    }
    sessionStorage.setItem("fieldbook.profile.v1", "demo-learner");
  }, data);
  await page.goto("/#courses");
  await expect(
    page.getByRole("heading", { name: "Courses", exact: true, level: 1 }),
  ).toBeVisible();
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}

test("due dates off keeps progress and uses recommended language", async ({
  page,
}, info) => {
  const data = learningUiFixture();
  data.settings = { ...data.settings!, dueDatesEnabled: false };
  await page.addInitScript((workspace) => {
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
    sessionStorage.setItem("fieldbook.profile.v1", "demo-learner");
  }, data);
  await page.goto("/#courses");
  const summary = page.locator('.for-you [data-slot="card"]');
  await expect(summary).toContainText("recommended courses complete");
  await expect(summary.getByRole("progressbar")).toHaveCount(1);
  await expect(summary).not.toContainText(
    /assigned|past their due date|onboarding/i,
  );
  await summary.screenshot({
    path: info.outputPath("recommended-progress.png"),
  });
  await summary.getByRole("button", { name: "View all for you" }).click();
  await expect(
    page.getByRole("group", { name: "Course views" }).getByRole("button", {
      name: "Recommended",
    }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".library")).toContainText("Recommended");
  await expect(page.locator(".library")).not.toContainText("Assigned");
});

test("For you uses curriculum cards, one category picker and a simple ordered page", async ({
  page,
}, info) => {
  await seed(page);
  const home = page.locator(".for-you");
  await expect(home.locator(".course-card")).toHaveCount(1);
  await expect(home.locator(".course-card")).toContainText(
    "Account executive foundations",
  );
  await expect(home.locator(".course-card")).toContainText(
    "1 of 3 courses complete",
  );
  await expect(
    page.getByRole("group", { name: "Course categories" }),
  ).toHaveCount(0);
  const controls = page.locator('[data-slot="collection-controls"]');
  await expect(controls).toHaveCount(1);
  await expect(controls.locator("label")).toHaveCount(0);
  await expect(
    controls.getByRole("textbox", { name: "Filter courses" }),
  ).toHaveAttribute("placeholder", "Find a course…");
  await controls.getByRole("button", { name: "Filters", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Category" })).toBeVisible();
  await page.keyboard.press("Escape");
  await noOverflow(page);
  await controls.screenshot({ path: info.outputPath("course-controls.png") });
  const search = controls.getByRole("textbox", { name: "Filter courses" });
  await search.fill("Optional exploration");
  await expect(page.locator(".library .course-card")).toHaveCount(1);
  await expect(page.locator(".library .course-card")).toContainText("Optional exploration");
  await search.fill("");
  await expect(
    page.getByRole("button", { name: "View in progress" }),
  ).toHaveCount(0);
  if (info.project.name === "desktop") {
    const summary = await home.locator('[data-slot="card"]').boundingBox();
    const card = await home.locator(".course-card").boundingBox();
    expect(Math.abs(summary!.y - card!.y)).toBeLessThan(2);
    expect(Math.abs(summary!.height - card!.height)).toBeLessThan(2);
  }
  await page.screenshot({
    path: info.outputPath("learning-home.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "View all for you", exact: true })
    .click();
  const library = page.locator(".library");
  await expect(library.locator(".course-card")).toHaveCount(1);
  await page.getByRole("switch", { name: "Hide completed" }).check();
  await expect(library.locator(".course-card")).toHaveCount(1);
  await controls.getByRole("button", { name: "Filters", exact: true }).click();
  await page.getByRole("combobox", { name: "Category", exact: true }).click();
  await page
    .getByRole("option", { name: "Sales foundations", exact: true })
    .click();
  await expect(library.locator(".course-card")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(
    controls.getByRole("button", { name: "Filters (1)", exact: true }),
  ).toBeVisible();
  await controls
    .getByRole("button", {
      name: "Remove Category: Sales foundations filter",
      exact: true,
    })
    .click();
  await expect(
    controls.getByRole("button", { name: "Filters", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Clear all", exact: true }),
  ).toHaveCount(0);
  await noOverflow(page);
  await library.locator(".course-card").click();
  await expect(page).toHaveURL(/#curricula\/sales-foundations$/);
  await expect(
    page.getByRole("heading", {
      name: "Account executive foundations",
      level: 1,
    }),
  ).toBeVisible();
  const rows = page.locator("[data-slot=card-grid] .course-card");
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("Start with the customer");
  await expect(rows.nth(1)).toContainText("Know the platform");
  await expect(rows.nth(2)).toContainText("From discovery to next steps");
  await expect(
    page.getByRole("combobox", { name: "Sort courses" }),
  ).toContainText("Recommended order");
  await page.reload();
  await rows.nth(1).click();
  await expect(
    page.getByRole("heading", { name: "Know the platform", level: 1 }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "← Exit course" }).click();
  await expect(rows.nth(0)).toContainText("Completed");
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath("curriculum.png"),
    fullPage: true,
  });
});

test("optional activity is resumable and all completions remain available at 100 percent assigned", async ({
  page,
}, info) => {
  await seed(page, true);
  await expect(
    page
      .locator(".for-you")
      .getByRole("progressbar", { name: "Assigned course progress" }),
  ).toHaveAttribute("aria-valuenow", "100");
  await expect(page.locator(".for-you .course-card")).toHaveCount(0);

  await page.getByRole("button", { name: "View all for you" }).click();
  await page
    .getByRole("group", { name: "Course views", exact: true })
    .getByRole("button", { name: "In progress", exact: true })
    .click();
  const library = page.locator(".library");
  await expect(library.locator(".course-card")).toHaveCount(1);
  await expect(library.locator(".course-card")).toContainText(
    "Optional exploration",
  );
  await expect(library.locator(".course-card")).toContainText(
    "Continue course",
  );
  const views = page.getByRole("group", { name: "Course views", exact: true });
  await views.getByRole("button", { name: "Completed", exact: true }).click();
  await expect(library.locator(".course-card")).toHaveCount(4);
  await expect(
    library.locator(".course-card").filter({ hasText: "Optional achievement" }),
  ).toBeVisible();
  await views
    .getByRole("button", { name: "Your courses", exact: true })
    .click();
  await expect(library.locator(".course-card")).toHaveCount(5);
  await library.screenshot({ path: info.outputPath("your-courses.png") });
  await expect(
    library.locator(".course-card").filter({ hasText: "Optional exploration" }),
  ).not.toContainText("For you");
  await expect(
    library.locator(".course-card").filter({ hasText: "Know the platform" }),
  ).toContainText("For you");
  await views.getByRole("button", { name: "Assigned", exact: true }).click();
  await expect(library.locator(".course-card")).toContainText("Completed");
  await page.getByRole("switch", { name: "Hide completed" }).check();
  await expect(
    page.getByRole("heading", { name: "You’re up to date" }),
  ).toBeVisible();
  await views.getByRole("button", { name: "All courses", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Filter courses" })
    .fill("Optional exploration");
  await expect(library.locator(".course-card")).toHaveCount(1);
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath("in-progress.png"),
    fullPage: true,
  });
  await library.locator(".course-card").click();
  await expect(
    page.getByRole("heading", { name: "Optional exploration", level: 1 }),
  ).toBeVisible();
});

test("no assignments show personal activity without labeling other courses", async ({
  page,
}, info) => {
  const data = learningUiFixture();
  const learner = data.users.find((user) => user.id === "demo-learner")!;
  learner.groups = [];
  learner.teamId = undefined;
  const started = data.content.find((course) => course.id === "course-2")!;
  data.progress[learner.id].push({
    content_id: started.id,
    version: started.version,
    lessons: [started.lessons[0].id],
    passed: false,
  });
  await page.addInitScript((workspace) => {
    if (!localStorage.getItem("learning-test-seeded")) {
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
      localStorage.setItem("learning-test-seeded", "yes");
    }
    sessionStorage.setItem("fieldbook.profile.v1", "demo-learner");
  }, data);
  await page.goto("/#courses");
  const summary = page.locator('.for-you [data-slot="card"]');
  await expect(summary).toContainText("No courses assigned to you");
  await expect(summary).toContainText("1 in progress · 1 completed");
  await expect(summary).not.toContainText("days left in onboarding");
  await expect(summary.getByRole("progressbar")).toHaveCount(0);
  await summary.screenshot({
    path: info.outputPath("no-assignments-with-activity.png"),
  });
  await summary.getByRole("button", { name: "View your courses" }).click();
  const views = page.getByRole("group", { name: "Course views" });
  await expect(
    views.getByRole("button", { name: "Your courses" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".library .course-card")).toHaveCount(2);
  await expect(
    page.locator(".library .course-card").filter({ hasText: "Assigned" }),
  ).toHaveCount(0);
  await views.getByRole("button", { name: "Assigned" }).click();
  await expect(
    page.getByRole("heading", { name: "No assigned courses yet" }),
  ).toBeVisible();

  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!);
    data.progress["demo-learner"] = data.progress["demo-learner"].filter(
      (record: { content_id: string }) => record.content_id !== "course-1",
    );
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
  });
  await page.reload();
  await expect(summary).toContainText("1 in progress");
  await expect(summary).not.toContainText("completed");
  await expect(
    summary.getByRole("button", { name: "View your courses" }),
  ).toBeVisible();

  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!);
    data.progress["demo-learner"] = [];
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
  });
  await page.reload();
  await expect(summary).toContainText(
    "Explore the course library at your own pace.",
  );
  await expect(
    summary.getByRole("button", { name: "View your courses" }),
  ).toHaveCount(0);
  await expect(
    summary.getByRole("button", { name: "All courses" }),
  ).toBeVisible();
  await summary.screenshot({
    path: info.outputPath("no-assignments-no-activity.png"),
  });
});

test("course rows scroll directly and the completion card splits on iPad", async ({
  page,
}, info) => {
  await seed(page, false, true);
  const home = page.locator(".for-you");
  const row = home.getByRole("region", { name: "For you", exact: true });
  await expect(
    page.getByRole("button", { name: /^(Previous|Next) .* courses$/ }),
  ).toHaveCount(0);
  await expect(row).toHaveAttribute("tabindex", "0");
  expect(
    await row.evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true);
  await row.scrollIntoViewIfNeeded();
  const rowBox = await row.boundingBox();
  await page.mouse.move(
    rowBox!.x + rowBox!.width / 2,
    rowBox!.y + rowBox!.height / 2,
  );
  await page.mouse.wheel(400, 0);
  await expect
    .poll(() => row.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await row.evaluate((element) => {
    element.scrollLeft = 0;
  });
  await expect
    .poll(() => row.evaluate((element) => element.scrollLeft))
    .toBe(0);
  await row.focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => row.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  // A one-card library channel remains a normal, non-focusable strip.
  const product = page.locator(".channel").filter({
    has: page.getByRole("heading", {
      name: "Completed optional learning",
      exact: true,
    }),
  });
  await expect(product).toHaveCount(1);
  await expect(product.locator(".course-card")).toHaveCount(1);
  await expect(
    product.getByRole("region", { name: "Completed optional learning" }),
  ).not.toHaveAttribute("tabindex", "0");
  for (const width of [820, 1024, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const summary = await home
      .locator('[data-slot="card"]')
      .first()
      .boundingBox();
    // Compare content edges, allowing the strip's inset for card elevation.
    const strip = await row.evaluate(element => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const left = parseFloat(style.paddingLeft);
      const right = parseFloat(style.paddingRight);
      return { x: box.x + left, y: box.y + parseFloat(style.paddingTop), width: box.width - left - right };
    });
    const action = await home
      .locator('[data-slot="card"]')
      .first()
      .getByRole("button", { name: "Start course" })
      .boundingBox();
    if (width >= 820) {
      expect(strip!.x).toBeGreaterThan(summary!.x + summary!.width);
      expect(Math.abs(summary!.y - strip!.y)).toBeLessThan(2);
    } else {
      expect(Math.abs(summary!.x - strip!.x)).toBeLessThan(2);
      expect(Math.abs(summary!.width - strip!.width)).toBeLessThan(2);
      expect(strip!.y).toBeGreaterThan(summary!.y + summary!.height);
    }
    expect(action!.width).toBeLessThan(summary!.width * 0.7);
    await expect
      .poll(async () => {
        const settledSummary = await home
          .locator('[data-slot="card"]')
          .first()
          .boundingBox();
        const settledAction = await home
          .locator('[data-slot="card"]')
          .first()
          .getByRole("button", { name: "Start course" })
          .boundingBox();
        return Math.abs(
          settledAction!.x +
            settledAction!.width / 2 -
            (settledSummary!.x + settledSummary!.width / 2),
        );
      })
      .toBeLessThan(2);
    await page.setViewportSize({ width, height: 1400 });
    await row.evaluate((element) => element.blur());
    await home.screenshot({
      path: info.outputPath(`course-summary-${width}.png`),
    });
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath("learning-enlarged.png"),
    fullPage: true,
  });
});

test("completion removes a course from the home queue and remains visible in both completed collections", async ({
  page,
}) => {
  await seed(page);
  await page
    .locator(".for-you")
    .getByRole("button", { name: "Start course", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Know the platform", level: 1 }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Next lesson/ }).click();
  await page.getByRole("button", { name: "Quiz Check your knowledge" }).click();
  await page
    .getByRole("radio", { name: "The customer’s goal", exact: true })
    .check();
  await page.getByRole("button", { name: "Submit and continue" }).click();
  await expect(page.getByText("Question 2 of 2")).toBeVisible();
  await page
    .getByRole("radio", { name: "With an agreed next step", exact: true })
    .check();
  await page.getByRole("button", { name: "Submit and see results" }).click();
  await expect(
    page.getByRole("heading", { name: "2 of 2 correct" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close course" }).click();
  await page.goto("/#courses");
  await page.reload();
  await expect(page.locator(".for-you .course-card")).toHaveCount(1);
  await expect(page.locator(".for-you .course-card")).toContainText(
    "2 of 3 courses complete",
  );
  await expect(
    page
      .locator('.for-you [data-slot="card"]')
      .getByRole("progressbar", { name: "Assigned course progress" }),
  ).toHaveAttribute("aria-valuenow", "67");
  await page.getByRole("button", { name: "View all for you" }).click();
  await page
    .getByRole("group", { name: "Course views", exact: true })
    .getByRole("button", { name: "Completed", exact: true })
    .click();
  await expect(page.locator(".library .course-card")).toHaveCount(3);
  await page
    .getByRole("group", { name: "Course views", exact: true })
    .getByRole("button", { name: "Assigned", exact: true })
    .click();
  await expect(page.locator(".library .course-card")).toHaveCount(1);
  await page.getByRole("switch", { name: "Hide completed" }).focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".library .course-card")).toHaveCount(1);
});
