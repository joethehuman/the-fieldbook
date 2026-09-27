import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";

async function openCourse(page: Page, mode: "required" | "optional" | "no-quiz", { longFirstLesson = false, startAtFirstLesson = false }: {
  longFirstLesson?: boolean;
  startAtFirstLesson?: boolean;
} = {}) {
  const data = freshWorkspace();
  const course = data.content.find((item) => item.id === "course-2")!;
  course.requirePassing = mode === "required";
  if (longFirstLesson) {
    course.lessons[0].body += "\n\n" + "A fuller explanation of the lesson.\n\n".repeat(80);
    course.body += "\n\n" + "A useful overview for this course.\n\n".repeat(9);
  }
  if (mode === "no-quiz") course.questions = [];
  await page.addInitScript((workspace) => {
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
    sessionStorage.setItem("fieldbook.profile.v1", "demo-learner");
  }, data);
  await page.goto("/#courses/course-2");
  if (!startAtFirstLesson) await page.getByRole("button", { name: /^Next lesson/ }).click();
}
async function cardAtTop(page: Page, selector: string) {
  await expect.poll(async () => {
    const card = await page.locator(selector).boundingBox();
    const viewport = await page.locator(".main-content").boundingBox();
    return card!.y - viewport!.y;
  }).toBeLessThan(70);
}
async function outlineOffset(page: Page) {
  return page.evaluate(() => {
    const sidebar = document.querySelector(".course-sidebar")!.getBoundingClientRect();
    const outline = document.querySelector(".course-sidebar .lesson-nav")!.getBoundingClientRect();
    return outline.top - sidebar.top;
  });
}

test("required quiz shows one question at a time, grades, and retries", async ({ page }, info) => {
  await openCourse(page, "required");
  await page.getByRole("button", { name: "Quiz Check your knowledge" }).click();
  await expect(page.getByText("Question 1 of 2")).toBeVisible();
  await expect(page.getByText("How should a useful conversation end?")).toHaveCount(0);
  await page.getByRole("radio", { name: "Every available feature" }).check();
  await page.getByRole("button", { name: "Submit and continue" }).click();
  await expect(page.getByText("Question 2 of 2")).toBeVisible();
  await page.getByRole("radio", { name: "With an agreed next step" }).check();
  await page.getByRole("button", { name: "Submit and see results" }).click();
  await expect(page.getByRole("heading", { name: "1 of 2 correct" })).toBeVisible();
  await cardAtTop(page, ".course-quiz");
  await page.getByText("Review answers").click();
  await expect(page.locator('[data-slot="badge"]', { hasText: "Incorrect" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("required-quiz-results.png") });
  await expect(page.getByRole("button", { name: "Close course" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Content feedback" })).toHaveCount(0);
  await page.getByRole("button", { name: "Retry quiz" }).click();
  await page.getByRole("radio", { name: "The customer’s goal" }).check();
  await page.getByRole("button", { name: "Submit and continue" }).click();
  await page.getByRole("radio", { name: "With an agreed next step" }).check();
  await page.getByRole("button", { name: "Submit and see results" }).click();
  await expect(page.getByRole("heading", { name: "2 of 2 correct" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close course" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Content feedback" })).toBeVisible();
  await expect.poll(async () => {
    const card = await page.locator(".course-quiz").boundingBox();
    const button = await page.getByRole("button", { name: "Close course" }).boundingBox();
    return Math.abs((button!.x + button!.width / 2) - (card!.x + card!.width / 2));
  }).toBeLessThan(2);
});

test("optional quiz completes after a missed answer and still offers retry", async ({ page }, info) => {
  await openCourse(page, "optional");
  await page.getByRole("button", { name: "Quiz Check your knowledge" }).click();
  await page.getByRole("radio", { name: "Every available feature" }).check();
  await page.getByRole("button", { name: "Submit and continue" }).click();
  await page.getByRole("radio", { name: "With an agreed next step" }).check();
  const outlineBeforeCompletion = await outlineOffset(page);
  await page.getByRole("button", { name: "Submit and see results" }).click();
  await expect(page.getByRole("heading", { name: "1 of 2 correct" })).toBeVisible();
  await expect(page.getByText("Course complete.")).toBeVisible();
  await expect.poll(async () => Math.abs((await outlineOffset(page)) - outlineBeforeCompletion)).toBeLessThan(2);
  if (info.project.name === "desktop") await expect(page.locator('.course-detail-meta [data-slot="badge"]')).toBeVisible();
  await expect(page.getByRole("region", { name: "Content feedback" })).toBeVisible();
  await cardAtTop(page, ".course-quiz");
  await page.getByText("Review answers").click();
  await expect(page.locator('[data-slot="badge"]', { hasText: "Incorrect" })).toBeVisible();
  await expect(page.locator("strong", { hasText: "Your answer:" }).first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("optional-quiz-results.png") });
  await expect(page.getByRole("button", { name: "Retry quiz" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close course" })).toBeVisible();
});

test("last no-quiz lesson completes and opens expanded feedback", async ({ page }, info) => {
  await openCourse(page, "no-quiz");
  const outlineBeforeCompletion = await outlineOffset(page);
  await page.getByRole("button", { name: "Finish course Course complete" }).click();
  await expect(page.getByRole("heading", { name: "Course complete" })).toBeVisible();
  await expect.poll(async () => Math.abs((await outlineOffset(page)) - outlineBeforeCompletion)).toBeLessThan(2);
  await expect(page.getByRole("form", { name: "Course feedback" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Your feedback (optional)" })).toBeVisible();
  await cardAtTop(page, ".course-finish-card");
  await page.screenshot({ path: info.outputPath("no-quiz-finish.png") });
  await page.getByRole("button", { name: "Useful", exact: true }).click();
  await page.getByRole("textbox", { name: "Your feedback (optional)" }).fill("Clear and useful.");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByText("Feedback saved.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Close course" })).toBeVisible();
  await expect.poll(async () => {
    const card = await page.locator(".course-finish-card").boundingBox();
    const button = await page.getByRole("button", { name: "Close course" }).boundingBox();
    return Math.abs((button!.x + button!.width / 2) - (card!.x + card!.width / 2));
  }).toBeLessThan(2);
});

test("course sidebar keeps its position across long and short lessons and the quiz", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "The sidebar stacks above the reader on narrow screens.");
  await page.setViewportSize({ width: 1440, height: 934 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openCourse(page, "required", { longFirstLesson: true, startAtFirstLesson: true });
  const back = page.getByRole("button", { name: "Back to courses" });
  const lessonTop = (await back.boundingBox())!.y;
  await page.screenshot({ path: info.outputPath("lesson-1-layout.png") });
  await page.getByRole("button", { name: /^Next lesson/ }).click();
  await expect(page.getByRole("heading", { name: "Put it into practice" })).toBeVisible();
  await cardAtTop(page, ".course-lesson");
  await expect.poll(async () => Math.abs((await back.boundingBox())!.y - lessonTop)).toBeLessThan(2);
  await page.screenshot({ path: info.outputPath("lesson-2-layout.png") });
  await page.getByRole("button", { name: "Quiz Check your knowledge" }).click();
  await expect(page.getByText("Question 1 of 2")).toBeVisible();
  await cardAtTop(page, ".course-quiz");
  await expect.poll(async () => Math.abs((await back.boundingBox())!.y - lessonTop)).toBeLessThan(2);
  await page.screenshot({ path: info.outputPath("quiz-layout.png") });
  await page.getByRole("navigation", { name: "In this course" }).getByRole("button", { name: /The big idea/ }).click();
  await expect(page.getByRole("heading", { name: "The big idea" })).toBeVisible();
  await cardAtTop(page, ".course-lesson");
  await expect.poll(async () => Math.abs((await back.boundingBox())!.y - lessonTop)).toBeLessThan(2);
});

test("next question's submit button starts disabled without showing its enabled color", async ({ page }, info) => {
  await openCourse(page, "required");
  await page.getByRole("button", { name: "Quiz Check your knowledge" }).click();
  await page.getByRole("radio", { name: "The customer’s goal" }).check();
  await page.evaluate(() => {
    const samples: string[] = [];
    (window as Window & { quizButtonColors?: string[] }).quizButtonColors = samples;
    const sample = () => {
      const button = Array.from(document.querySelectorAll("button"))
        .find((candidate) => candidate.textContent?.includes("Submit and see results"));
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
  await expect.poll(() => page.evaluate(() => (window as Window & { quizButtonColors?: string[] }).quizButtonColors?.length || 0)).toBe(15);
  const colors = await page.evaluate(() => (window as Window & { quizButtonColors?: string[] }).quizButtonColors || []);
  expect(new Set(colors).size, colors.join(", ")).toBe(1);
  const transitionDuration = await submit.evaluate((button) => getComputedStyle(button).transitionDuration);
  expect(transitionDuration.split(",").every((duration) => parseFloat(duration) === 0)).toBe(true);
  await page.screenshot({ path: info.outputPath("quiz-question-disabled.png") });
  await page.getByRole("radio", { name: "With an agreed next step" }).check();
  await expect(submit).toBeEnabled();
  await expect.poll(() => submit.evaluate((button) => getComputedStyle(button).backgroundColor)).not.toBe(colors[0]);
});
