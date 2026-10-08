import { test, expect } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { setupAuthoringProvider, authoringUser } from "./provider-fixture";
import { openContentSettings, waitForDraftSaved } from "./editor-helpers";

test("a twenty-lesson editor keeps image requirements current through unrelated edits, reordering and corrections", async ({ page }, info) => {
  const installed = info.project.name.startsWith("production");
  const data = freshWorkspace();
  const course = data.content.find((item) => item.kind === "course")!;
  Object.assign(course, {
    id: "00000000-0000-4000-8000-000000000103",
    title: "Twenty lesson validation fixture",
    status: "draft",
    revision: 1,
    publishedRevision: undefined,
    publishedSignature: undefined,
    groups: [],
    assignments: [],
    questions: [],
    lessons: Array.from({ length: 20 }, (_, index) => ({
      id: `lesson-${index}`,
      title: `Lesson ${index + 1}`,
      body: "A synthetic lesson explains a repeatable workflow. Read the example, decide on the next step, and record a useful observation for your team.\n\n".repeat(15) +
        (index === 19 ? "![](/api/media/diagram.png)" : ""),
    })),
  });
  data.content = [course];
  data.publishedContent = [];
  if (installed) {
    await setupAuthoringProvider(page, data);
    await page.route("**/api/admin/snapshot?**", (route) =>
      route.fulfill({ json: { data, user: authoringUser } }),
    );
  } else {
    await page.addInitScript((state) => {
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(state));
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    }, data);
  }
  await page.route("**/api/media/diagram.png", (route) => route.fulfill({
    contentType: "image/svg+xml",
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#ddd"/></svg>',
  }));
  await page.goto(installed ? "/admin/content" : "/#admin");
  await page.getByRole("link", { name: course.title, exact: true }).click();
  await page.getByRole("textbox", { name: "Lesson content", exact: true }).waitFor();
  await openContentSettings(page);
  const requirement = (number: number) => page.getByRole("button", {
    name: `Lesson ${number}: add image alternative text`, exact: true,
  });
  await expect(requirement(20)).toBeVisible();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill("Edited course title");
  await expect(requirement(20)).toBeVisible();
  await requirement(20).click();
  const outline = page.getByRole("button", { name: "Outline", exact: true });
  if (await outline.getAttribute("aria-expanded") !== "true") await outline.click();
  await page.getByRole("button", { name: "Lesson actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Move up", exact: true }).click();
  await openContentSettings(page);
  await expect(requirement(19)).toBeVisible();
  await expect(requirement(20)).toHaveCount(0);
  const lessonTitle = page.getByRole("textbox", { name: "Lesson title", exact: true });
  await lessonTitle.fill("");
  await expect(page.getByRole("button", { name: "Lesson 19: add a title", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Lesson content", exact: true }).fill("Corrected lesson body.");
  await expect(requirement(19)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Lesson 19: add a title", exact: true })).toBeVisible();
  await lessonTitle.fill("Corrected lesson");
  await expect(page.getByRole("button", { name: "Lesson 19: add a title", exact: true })).toHaveCount(0);
  await waitForDraftSaved(page);
  const saved = installed
    ? await (await page.request.get(`/api/content?id=${course.id}&draft=true`)).json()
    : await page.evaluate((id) => JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!).content.find((item: { id: string }) => item.id === id), course.id);
  expect(saved.lessons[18]).toMatchObject({ id: "lesson-19", title: "Corrected lesson" });
  expect(saved.lessons[18].body.trim()).toBe("Corrected lesson body.");
  expect(saved.lessons).toHaveLength(20);
});
