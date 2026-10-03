import { test, expect } from "@playwright/test";
import { learningUiFixture } from "../fixtures/learning-ui";
import { exerciseLessonScrollOwner, expectNativePageOverscroll } from "../fixtures/native-overscroll";

test.beforeEach(async ({ page }) => {
  const data = learningUiFixture();
  data.progress["demo-admin"] = [];
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const course = data.content.find((item) => item.id === "course-2")!;
  course.lessons = course.lessons.map((lesson, index) => ({
    ...lesson, body: index === 0 ? "An extended lesson explanation.\n\n".repeat(80) : "A concise explanation.", videoUrl: undefined,
  }));
  await page.addInitScript((workspace) => {
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
  }, data);
});

test("native edge bounce is limited to learner pages and respects reduced motion", async ({ page }) => {
  for (const path of ["/", "/#courses", "/#updates", "/#docs"]) {
    await page.goto(path);
    await expectNativePageOverscroll(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expectNativePageOverscroll(page, false);
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }
  await page.goto("/#admin");
  await expectNativePageOverscroll(page, false);
  await expect(page.locator(".main-content")).not.toHaveAttribute("data-native-overscroll", "true");
});

test("lesson pane owns native input and bottom actions remain reachable through layout changes", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "This story resizes desktop through short and enlarged-phone layouts.");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/#courses/course-2");
  await exerciseLessonScrollOwner(page, "Put it into practice", (name) => info.outputPath(name));
});
