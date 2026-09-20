import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";

async function seed(page: Page, allAssignedComplete = false, many = false) {
  const data = freshWorkspace();
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

test("For you uses curriculum cards, one channel picker and a simple ordered page", async ({
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
    page.getByRole("group", { name: "Course channels" }),
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
  await page.getByRole("checkbox", { name: "Hide completed" }).check();
  await expect(library.locator(".course-card")).toHaveCount(1);
  await page.getByRole("combobox", { name: "Channel", exact: true }).click();
  await page
    .getByRole("option", { name: "Sales foundations", exact: true })
    .click();
  await expect(library.locator(".course-card")).toHaveCount(1);
  await library.locator(".course-card").click();
  await expect(page).toHaveURL(/#curricula\/sales-foundations$/);
  await expect(
    page.getByRole("heading", {
      name: "Account executive foundations",
      level: 1,
    }),
  ).toBeVisible();
  const rows = page.locator('[data-slot="launch-list"] li');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("Start with the customer");
  await expect(rows.nth(1)).toContainText("Know the platform");
  await expect(rows.nth(2)).toContainText("From discovery to next steps");
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await page.reload();
  await page
    .getByRole("button", { name: "Continue curriculum", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Know the platform", level: 1 }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Back to curriculum" }).click();
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
    page.locator(".for-you").getByRole("img", { name: "100% complete" }),
  ).toBeVisible();
  await expect(page.locator(".for-you .course-card")).toHaveCount(0);

  await page
    .getByRole("button", { name: "View in progress", exact: true })
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
  await views.getByRole("button", { name: "For you", exact: true }).click();
  await expect(library.locator(".course-card")).toContainText("Completed");
  await page.getByRole("checkbox", { name: "Hide completed" }).check();
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

test("course row arrows track overflow, endpoints, resize and enlarged text", async ({
  page,
}, info) => {
  await seed(page, false, true);
  const home = page.locator(".for-you");
  const next = home.getByRole("button", {
    name: "Next For you courses",
    exact: true,
  });
  const previous = home.getByRole("button", {
    name: "Previous For you courses",
    exact: true,
  });
  await expect(next).toBeEnabled();
  await expect(previous).toBeDisabled();
  await next.click();
  await expect(previous).toBeEnabled();
  await home
    .getByRole("region", { name: "For you", exact: true })
    .evaluate((element) => {
      element.scrollLeft = element.scrollWidth;
    });
  await expect(next).toBeDisabled();
  // A one-card library channel never needs arrows at these widths.
  const product = page.locator(".channel").filter({
    has: page.getByRole("heading", {
      name: "Completed optional learning",
      exact: true,
    }),
  });
  await expect(product).toHaveCount(1);
  await expect(product.locator(".course-card")).toHaveCount(1);
  await expect(product.getByRole("button", { name: /^Next / })).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(next).toBeVisible();
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await expect(product.getByRole("button", { name: /^Next / })).toHaveCount(0);
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
  await page
    .getByRole("button", { name: "Complete & continue", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue to quiz", exact: true })
    .click();
  await page
    .getByRole("radio", { name: "The customer’s goal", exact: true })
    .check();
  await page
    .getByRole("radio", { name: "With an agreed next step", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Check answers", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Nicely done.", exact: true }),
  ).toBeVisible();
  await page.goto("/#courses");
  await page.reload();
  await expect(page.locator(".for-you .course-card")).toHaveCount(1);
  await expect(page.locator(".for-you .course-card")).toContainText(
    "2 of 3 courses complete",
  );
  await expect(
    page
      .locator('.for-you [data-slot="card"]')
      .getByRole("img", { name: "67% complete" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "View completed", exact: true })
    .click();
  await expect(page.locator(".library .course-card")).toHaveCount(3);
  await page
    .getByRole("group", { name: "Course views", exact: true })
    .getByRole("button", { name: "For you", exact: true })
    .click();
  await expect(page.locator(".library .course-card")).toHaveCount(1);
  await page.getByRole("checkbox", { name: "Hide completed" }).focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".library .course-card")).toHaveCount(1);
});
