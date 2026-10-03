import { test, expect, type Page } from "@playwright/test";
import { learningUiFixture } from "../fixtures/learning-ui";
import {
  courseSidebarGap,
  expectDesktopOutlineMinimum,
  expectContentSizedCourseSidebar,
  exercisePreviousLessons,
} from "../fixtures/course-layout";
import {
  expectShortLessonFits,
  exerciseImageViewer,
  readerImageAlt,
  readerImageUrl,
  serveReaderImage,
} from "../fixtures/reader-layout";

async function openCourse(
  page: Page,
  mode: "required" | "optional" | "no-quiz",
  {
    longFirstLesson = false,
    startAtFirstLesson = false,
    shortLessons = false,
    lessonImage = false,
    lessonCount,
  }: {
    longFirstLesson?: boolean;
    startAtFirstLesson?: boolean;
    shortLessons?: boolean;
    lessonImage?: boolean;
    lessonCount?: number;
  } = {},
) {
  const data = learningUiFixture();
  const course = data.content.find((item) => item.id === "course-2")!;
  course.requirePassing = mode === "required";
  if (shortLessons)
    course.lessons = course.lessons.map((lesson) => ({
      ...lesson,
      body: "A concise explanation.",
      videoUrl: undefined,
    }));
  if (lessonImage) {
    course.lessons[0].body = `![${readerImageAlt}](${readerImageUrl})`;
    course.lessons[0].videoUrl = undefined;
  }
  if (lessonCount)
    course.lessons = Array.from({ length: lessonCount }, (_, index) => ({
      ...course.lessons[index % course.lessons.length],
      id: `layout-lesson-${index}`,
      title: `Lesson ${index + 1}`,
    }));
  if (longFirstLesson) {
    course.lessons[0].body +=
      "\n\n" + "A fuller explanation of the lesson.\n\n".repeat(80);
    course.body += "\n\n" + "A useful overview for this course.\n\n".repeat(9);
  }
  if (mode === "no-quiz") course.questions = [];
  await page.addInitScript((workspace) => {
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
    sessionStorage.setItem("fieldbook.profile.v1", "demo-learner");
  }, data);
  await page.goto("/#courses/course-2");
  if (!startAtFirstLesson)
    await page.getByRole("button", { name: /^Next lesson/ }).click();
}

test("short lessons fit without empty reader scroll and keep Next reachable", async ({
  page,
}, info) => {
  // Leave enough room for the stacked course outline as well as the short lesson.
  if (info.project.name === "phone")
    await page.setViewportSize({ width: 375, height: 900 });
  await openCourse(page, "no-quiz", {
    shortLessons: true,
    startAtFirstLesson: true,
  });
  await expectShortLessonFits(page);
  await page.screenshot({ path: info.outputPath("short-lesson-fits.png") });
  await page.getByRole("button", { name: /^Next lesson/ }).click();
  await expect(
    page.getByRole("heading", { name: "Put it into practice" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Finish course", exact: true }),
  ).toBeVisible();
});

test("lesson image expands with Close, keyboard dismissal and focus return", async ({
  page,
}, info) => {
  await serveReaderImage(page);
  await openCourse(page, "no-quiz", {
    lessonImage: true,
    startAtFirstLesson: true,
  });
  await exerciseImageViewer(page, (name) => info.outputPath(name));
});
async function cardInView(page: Page, selector: string) {
  await expect
    .poll(async () => {
      const card = await page.locator(selector).boundingBox();
      const viewport = await page.locator(".main-content").boundingBox();
      const offset = card!.y - viewport!.y;
      return (
        offset >= 0 &&
        (offset < 70 ||
          card!.y + card!.height <= viewport!.y + viewport!.height)
      );
    })
    .toBe(true);
}
async function outlineOffset(page: Page) {
  return page.evaluate(() => {
    const sidebar = document
      .querySelector(".course-sidebar")!
      .getBoundingClientRect();
    const outline = document
      .querySelector(".course-sidebar .lesson-nav")!
      .getBoundingClientRect();
    return outline.top - sidebar.top;
  });
}

test("required quiz shows one question at a time, grades, and retries", async ({
  page,
}, info) => {
  await openCourse(page, "required");
  await page.getByRole("button", { name: "Quiz Check your knowledge" }).click();
  await expect(page.getByText("Question 1 of 2")).toBeVisible();
  await expect(
    page.getByText("How should a useful conversation end?"),
  ).toHaveCount(0);
  await page.getByRole("radio", { name: "Every available feature" }).check();
  await page.getByRole("button", { name: "Submit and continue" }).click();
  await expect(page.getByText("Question 2 of 2")).toBeVisible();
  await page.getByRole("radio", { name: "With an agreed next step" }).check();
  await page.getByRole("button", { name: "Submit and see results" }).click();
  await expect(
    page.getByRole("heading", { name: "1 of 2 correct" }),
  ).toBeVisible();
  await cardInView(page, ".course-quiz");
  const review = page.getByRole("button", { name: /^Review answers/ });
  const savedBeforeReview = await page.evaluate(() => localStorage.getItem("fieldbook.workspace.v1"));
  await review.focus();
  await page.keyboard.press("Enter");
  await expect(review).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.locator('[data-slot="badge"]', { hasText: "Incorrect" }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("required-quiz-results.png") });
  await page.keyboard.press("Space");
  await expect(review).toHaveAttribute("aria-expanded", "false");
  expect(await page.evaluate(() => localStorage.getItem("fieldbook.workspace.v1"))).toBe(savedBeforeReview);
  await expect(page.getByRole("button", { name: "Close course" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("region", { name: "Content feedback" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Retry quiz" }).click();
  await page.getByRole("radio", { name: "The customer’s goal" }).check();
  await page.getByRole("button", { name: "Submit and continue" }).click();
  await page.getByRole("radio", { name: "With an agreed next step" }).check();
  await page.getByRole("button", { name: "Submit and see results" }).click();
  await expect(
    page.getByRole("heading", { name: "2 of 2 correct" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close course" }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Content feedback" }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const card = await page.locator(".course-quiz").boundingBox();
      const button = await page
        .getByRole("button", { name: "Close course" })
        .boundingBox();
      return Math.abs(button!.x - card!.x);
    })
    .toBeLessThan(2);
  expect(await page.locator(".course-quiz").evaluate(section => {
    const close = [...section.querySelectorAll("button")].find(button => button.textContent === "Close course")!;
    const disclosure = section.querySelector('[data-slot="collapsible-trigger"]')!;
    return close.getBoundingClientRect().bottom < disclosure.getBoundingClientRect().top;
  })).toBe(true);
  await review.click();
  await page.screenshot({ path: info.outputPath("completed-quiz-results.png") });
});

test("optional quiz completes after a missed answer and still offers retry", async ({
  page,
}, info) => {
  await openCourse(page, "optional");
  await page.getByRole("button", { name: "Quiz Check your knowledge" }).click();
  await page.getByRole("radio", { name: "Every available feature" }).check();
  await page.getByRole("button", { name: "Submit and continue" }).click();
  await page.getByRole("radio", { name: "With an agreed next step" }).check();
  const outlineBeforeCompletion = await outlineOffset(page);
  await page.getByRole("button", { name: "Submit and see results" }).click();
  await expect(
    page.getByRole("heading", { name: "1 of 2 correct" }),
  ).toBeVisible();
  await expect(page.getByText("Course complete.")).toBeVisible();
  await expect
    .poll(async () =>
      Math.abs((await outlineOffset(page)) - outlineBeforeCompletion),
    )
    .toBeLessThan(2);
  if (info.project.name === "desktop")
    await expect(
      page.locator('.course-detail-meta [data-slot="badge"]'),
    ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Content feedback" }),
  ).toBeVisible();
  await cardInView(page, ".course-quiz");
  await page.getByText("Review answers").click();
  await expect(
    page.locator('[data-slot="badge"]', { hasText: "Incorrect" }),
  ).toBeVisible();
  await expect(
    page.locator("strong", { hasText: "Your answer:" }).first(),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("optional-quiz-results.png") });
  await expect(page.getByRole("button", { name: "Retry quiz" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close course" }),
  ).toBeVisible();
});

test("last no-quiz lesson completes and opens expanded feedback", async ({
  page,
}, info) => {
  await openCourse(page, "no-quiz");
  const outlineBeforeCompletion = await outlineOffset(page);
  await page
    .getByRole("button", { name: "Finish course Course complete" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Course complete" }),
  ).toBeVisible();
  await expect
    .poll(async () =>
      Math.abs((await outlineOffset(page)) - outlineBeforeCompletion),
    )
    .toBeLessThan(2);
  await expect(
    page.getByRole("form", { name: "Course feedback" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Your feedback (optional)" }),
  ).toBeVisible();
  await cardInView(page, ".course-finish-card");
  await page.screenshot({ path: info.outputPath("no-quiz-finish.png") });
  await page.getByRole("button", { name: "Useful", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Your feedback (optional)" })
    .fill("Clear and useful.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Feedback saved.")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Close course" }),
  ).toBeVisible();
  await expect
    .poll(async () => {
      const card = await page.locator(".course-finish-card").boundingBox();
      const button = await page
        .getByRole("button", { name: "Close course" })
        .boundingBox();
      return Math.abs(
        button!.x + button!.width / 2 - (card!.x + card!.width / 2),
      );
    })
    .toBeLessThan(2);
});

test("course sidebar preserves header spacing across natural-height lessons and the quiz", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "The sidebar stacks above the reader on narrow screens.",
  );
  await page.setViewportSize({ width: 1440, height: 934 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openCourse(page, "required", {
    longFirstLesson: true,
    startAtFirstLesson: true,
  });
  const back = page.getByRole("button", { name: "← Exit course" });
  const outlineTop = await outlineOffset(page);
  const gap = await courseSidebarGap(page);
  await page.screenshot({ path: info.outputPath("lesson-1-layout.png") });
  await page.getByRole("button", { name: /^Next lesson/ }).click();
  await expect(
    page.getByRole("heading", { name: "Put it into practice" }),
  ).toBeVisible();
  await cardInView(page, ".course-lesson");
  await expect
    .poll(async () => Math.abs((await courseSidebarGap(page)) - gap))
    .toBeLessThan(2);
  await expect(
    page.getByRole("heading", { name: "Put it into practice" }),
  ).toBeFocused();
  await expect
    .poll(async () => Math.abs((await outlineOffset(page)) - outlineTop))
    .toBeLessThan(2);
  await page.screenshot({ path: info.outputPath("lesson-2-layout.png") });
  await page.getByRole("button", { name: "Quiz Check your knowledge" }).click();
  await expect(page.getByText("Question 1 of 2")).toBeVisible();
  await cardInView(page, ".course-quiz");
  await expect
    .poll(async () => Math.abs((await courseSidebarGap(page)) - gap))
    .toBeLessThan(2);
  await expect
    .poll(async () => Math.abs((await outlineOffset(page)) - outlineTop))
    .toBeLessThan(2);
  await expect(back).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: info.outputPath("quiz-layout.png") });
  await page
    .getByRole("navigation", { name: "In this course" })
    .getByRole("button", { name: /The big idea/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "The big idea" }),
  ).toBeVisible();
  await cardInView(page, ".course-lesson");
  await expect
    .poll(async () => Math.abs((await courseSidebarGap(page)) - gap))
    .toBeLessThan(2);
  await expect
    .poll(async () => Math.abs((await outlineOffset(page)) - outlineTop))
    .toBeLessThan(2);
});

for (const lessonCount of [3, 12]) {
  test(`desktop course outline with ${lessonCount} lessons retains its minimum and independent scroll on short screens`, async ({
    page,
  }, info) => {
    test.skip(
      info.project.name !== "desktop",
      "Narrow course outlines use natural stacked height.",
    );
    await page.setViewportSize({ width: 1440, height: 1200 });
    await openCourse(page, "required", {
      shortLessons: true,
      startAtFirstLesson: true,
      lessonCount,
    });
    await expectContentSizedCourseSidebar(page);
    await page.screenshot({
      path: info.outputPath(`content-sized-outline-${lessonCount}.png`),
    });
    await page.setViewportSize({ width: 1440, height: 400 });
    await expectDesktopOutlineMinimum(page, lessonCount);
    await page.screenshot({
      path: info.outputPath(`short-outline-${lessonCount}.png`),
    });
    await page.setViewportSize({ width: 2560, height: 900 });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "200%";
    });
    await expectDesktopOutlineMinimum(page, lessonCount);
    await page.screenshot({
      path: info.outputPath(`enlarged-outline-${lessonCount}.png`),
    });
    await page.evaluate(() => {
      document.documentElement.style.fontSize = "";
    });
  });
}

for (const mode of ["required", "optional", "no-quiz"] as const) {
  test(`previous lesson navigation preserves ${mode} progress`, async ({
    page,
  }, info) => {
    await openCourse(page, mode, {
      shortLessons: true,
      startAtFirstLesson: true,
    });
    await exercisePreviousLessons(
      page,
      "The big idea",
      "Put it into practice",
      mode !== "no-quiz",
      (name) => info.outputPath(name),
    );
  });
}

test("next question's submit button starts disabled without showing its enabled color", async ({
  page,
}, info) => {
  await openCourse(page, "required");
  await page.getByRole("button", { name: "Quiz Check your knowledge" }).click();
  await page.getByRole("radio", { name: "The customer’s goal" }).check();
  await page.evaluate(() => {
    const samples: string[] = [];
    (window as Window & { quizButtonColors?: string[] }).quizButtonColors =
      samples;
    const sample = () => {
      const button = Array.from(document.querySelectorAll("button")).find(
        (candidate) =>
          candidate.textContent?.includes("Submit and see results"),
      );
      if (button) {
        samples.push(getComputedStyle(button).backgroundColor);
        if (samples.length >= 15) return;
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.getByRole("button", { name: "Submit and continue" }).click();
  const submit = page.getByRole("button", { name: "Submit and see results" });
  await expect(submit).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { quizButtonColors?: string[] }).quizButtonColors
            ?.length || 0,
      ),
    )
    .toBe(15);
  const colors = await page.evaluate(
    () =>
      (window as Window & { quizButtonColors?: string[] }).quizButtonColors ||
      [],
  );
  expect(new Set(colors).size, colors.join(", ")).toBe(1);
  const transitionDuration = await submit.evaluate(
    (button) => getComputedStyle(button).transitionDuration,
  );
  expect(
    transitionDuration
      .split(",")
      .every((duration) => parseFloat(duration) === 0),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("quiz-question-disabled.png"),
  });
  await page.getByRole("radio", { name: "With an agreed next step" }).check();
  await expect(submit).toBeEnabled();
  await expect
    .poll(() =>
      submit.evaluate((button) => getComputedStyle(button).backgroundColor),
    )
    .not.toBe(colors[0]);
});
