import { test, expect } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
test("search titles, lessons, filters, keyboard, destinations and empty state", async ({
  page,
}, info) => {
  const data = freshWorkspace();
  const course = data.content.find((c) => c.kind === "course")!;
  course.title = "Distributed systems";
  course.lessons[1].title = "Consensus";
  course.lessons[1].body = "A quorum election chooses the leader.";
  data.content.push({
    ...course,
    id: "draft-only",
    title: "Hidden secret",
    status: "draft",
  });
  await page.addInitScript((data) => {
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
    sessionStorage.setItem("fieldbook.profile.v1", "demo-learner");
  }, data);
  await page.goto("/#courses");
  const input = page.getByRole("textbox", { name: "Search all content" });
  await input.fill("quorum");
  const result = page.getByRole("link", { name: /Distributed systems/ });
  await expect(result).toBeVisible();
  await expect(result.locator("mark")).toContainText(["quorum"]);
  await expect(result).toContainText("Lesson: Consensus");
  await page.screenshot({
    path: info.outputPath("search-results.png"),
    fullPage: true,
  });
  await page
    .getByRole("group", { name: "Content type" })
    .getByRole("button", { name: "Docs", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "No results", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("group", { name: "Content type" })
    .getByRole("button", { name: "Courses", exact: true })
    .click();
  await expect(result).toBeVisible();
  await result.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Consensus", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/lesson=/);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Consensus", exact: true }),
  ).toBeVisible();
  await input.fill("distrib");
  await expect(result).toBeVisible();
  await input.fill("distrbiuted");
  await expect(result).toBeVisible();
  await input.fill("hidden secret");
  await expect(
    page.getByRole("heading", { name: "No results", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("search-empty.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
