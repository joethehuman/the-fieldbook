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
  const originalPage = await page.locator("main").innerText();
  await page.locator("main").evaluate((main) => {
    main.firstElementChild!.setAttribute(
      "data-search-preservation",
      "retained",
    );
  });
  await input.fill("quorum");
  const result = page.getByRole("link", { name: /Distributed systems/ });
  await expect(result).toBeVisible();
  expect(await page.locator("main").innerText()).toBe(originalPage);
  await expect(
    page.locator('[data-search-preservation="retained"]'),
  ).toHaveCount(1);
  const panel = page.locator('[data-slot="search-panel"]');
  const bounds = (await panel.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  if (viewport.width >= 768)
    expect(bounds.x).toBeGreaterThanOrEqual(
      await page
        .locator(".sidebar")
        .evaluate((el) => el.getBoundingClientRect().right),
    );
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.height).toBeLessThanOrEqual(viewport.height * 0.65 + 1);
  if (viewport.width > 1000)
    expect(bounds.width).toBeLessThan(viewport.width * 0.8);
  await input.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("quorum");
  await input.blur();
  await input.focus();
  await expect(result).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(panel).toHaveCount(0);
  await input.focus();
  await expect(result).toBeVisible();
  await input.fill("a");
  await expect(panel.getByRole("status")).not.toContainText("Searching");
  expect(await panel.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(
    true,
  );
  await panel.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  const filters = await panel
    .getByRole("group", { name: "Content type" })
    .boundingBox();
  expect(filters!.y).toBeGreaterThanOrEqual(bounds.y);
  expect(filters!.y).toBeLessThan(bounds.y + 50);
  await input.fill("quorum");
  await expect(result).toBeVisible();
  await expect(result.locator("mark")).toContainText(["quorum"]);
  await expect(result).toContainText("Lesson: Consensus");
  await page.screenshot({
    path: info.outputPath("search-results.png"),
    fullPage: false,
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
    fullPage: false,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("search preserves an unsaved editor and guards result navigation", async ({
  page,
}) => {
  const data = freshWorkspace();
  data.content[1].title = "Published destination";
  data.content[1].status = "published";
  await page.addInitScript((data) => {
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
  }, data);
  await page.goto("/#admin");
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  const title = page.getByRole("textbox", { name: "Title", exact: true });
  await title.fill("Unsaved work survives search");
  const input = page.getByRole("textbox", { name: "Search all content" });
  await input.fill("Published destination");
  const result = page.getByRole("link", { name: /Published destination/ });
  await expect(result).toBeVisible();
  await expect(title).toHaveValue("Unsaved work survives search");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await result.click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(title).toHaveValue("Unsaved work survives search");
  await expect(page).toHaveURL(/#admin/);
});
