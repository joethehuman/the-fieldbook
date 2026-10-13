import { test, expect } from "@playwright/test";
import { learningUiFixture } from "../fixtures/learning-ui";

for (const complete of [false, true]) {
  test(`progress labels have breathing room at ${complete ? 100 : 0} percent and enlarged text`, async ({ page }, info) => {
    const data = learningUiFixture();
    data.progress["demo-learner"] = complete
      ? data.content.filter((item) => item.kind === "course").map((course) => ({
        content_id: course.id,
        version: course.version,
        lessons: course.lessons.map((lesson) => lesson.id),
        passed: true,
      }))
      : [];
    await page.addInitScript((workspace) => {
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
      sessionStorage.setItem("fieldbook.profile.v1", "demo-learner");
    }, data);
    await page.goto("/#courses");
    const card = page.locator(".learning-progress-card");
    const ring = card.getByRole("progressbar");
    await expect(ring).toHaveAttribute("aria-valuenow", complete ? "100" : "0");
    if (info.project.name === "phone") await page.setViewportSize({ width: 320, height: 844 });
    for (const scale of [1, 2]) {
      await page.evaluate((scale) => { document.documentElement.style.fontSize = `${scale * 100}%`; }, scale);
      await expect.poll(() => ring.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        const label = element.querySelector("div > span")!;
        const number = element.querySelector("strong")!;
        const range = document.createRange();
        range.selectNodeContents(label);
        const caption = range.getBoundingClientRect();
        const centerX = bounds.x + bounds.width / 2;
        const centerY = bounds.y + bounds.height / 2;
        // The inner edge of the shared SVG ring is 15.5 / 40 of its width.
        const radius = bounds.width * 15.5 / 40;
        const farthestCorner = Math.max(...[caption.left, caption.right].flatMap((x) =>
          [caption.top, caption.bottom].map((y) => Math.hypot(x - centerX, y - centerY)),
        ));
        return Math.min(radius - farthestCorner, caption.top - number.getBoundingClientRect().bottom);
      })).toBeGreaterThanOrEqual(3 * scale);
      await expect(ring.locator("div > span")).toHaveCSS("font-size", `${12 * scale}px`);
      await expect.poll(() => page.locator(".main-content").evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
      await card.screenshot({ path: info.outputPath(`progress-${complete ? 100 : 0}-${scale}x.png`) });
    }
  });
}

test("course row controls reveal content and stop at either boundary", async ({ page }) => {
  const data = learningUiFixture();
  const course = data.content.find((item) => item.id === "course-2")!;
  for (let index = 0; index < 6; index++) {
    data.content.push({ ...course, id: `browse-${index}`, title: `More learning ${index}`, groups: [], assignments: [] });
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((workspace) => {
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
    sessionStorage.setItem("fieldbook.profile.v1", "demo-learner");
  }, data);
  await page.goto("/#courses");
  const row = page.getByRole("region", { name: "Sales foundations", exact: true });
  const previous = page.getByRole("button", { name: "Scroll Sales foundations left", exact: true });
  const next = page.getByRole("button", { name: "Scroll Sales foundations right", exact: true });
  await expect(previous).toBeDisabled();
  await expect(next).toBeEnabled();
  await expect(next).toHaveAttribute("aria-controls", (await row.getAttribute("id"))!);
  await next.press("Enter");
  await expect.poll(() => row.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await expect(previous).toBeEnabled();
  for (let index = 0; index < 12 && await next.isEnabled(); index++) await next.press("Enter");
  await expect(next).toBeDisabled();
  await expect(row.locator(".course-card").last()).toBeInViewport();
  for (let index = 0; index < 12 && await previous.isEnabled(); index++) await previous.press("Enter");
  await expect(previous).toBeDisabled();
  await expect(row.locator(".course-card").first()).toBeInViewport();
});

for (const profile of ["demo-admin", "demo-contributor", "demo-manager"]) {
  test(`${profile} keeps the learner presentation out of management and editing`, async ({ page }) => {
    const data = learningUiFixture();
    await page.addInitScript(({ workspace, profile }) => {
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
      sessionStorage.setItem("fieldbook.profile.v1", profile);
    }, { workspace: data, profile });
    await page.goto("/#courses");
    await expect(page.locator(".app")).toHaveClass(/learner-workspace/);
    const learnerSurface = await page.locator(".app").evaluate((element) => getComputedStyle(element).getPropertyValue("--surface"));
    const sidebarSurface = await page.locator(".sidebar").evaluate((element) => getComputedStyle(element).backgroundColor);
    await page.goto(profile === "demo-manager" ? "/#team" : "/#admin");
    await expect(page.locator(".app")).not.toHaveClass(/learner-workspace/);
    await expect(page.locator(".sidebar")).toHaveCSS("background-color", sidebarSurface);
    await expect.poll(() => page.locator(".app").evaluate((element) => getComputedStyle(element).getPropertyValue("--surface"))).not.toBe(learnerSurface);
    if (profile === "demo-admin") {
      await page.getByRole("searchbox", { name: "Search content", exact: true }).fill("Know the platform");
      await page.getByRole("link", { name: "Know the platform", exact: true }).click();
      await expect(page.locator(".editor")).toBeVisible();
      await expect(page.locator(".app")).not.toHaveClass(/learner-workspace/);
    }
    await page.goto("/#updates");
    await expect(page.locator(".app")).toHaveClass(/learner-workspace/);
  });
}

test("learner views reflow with long titles and enlarged text", async ({ page }, info) => {
  const data = learningUiFixture();
  for (const item of data.content) {
    if (item.kind === "brief") item.title = "A longer update title about the decisions, people, and details that shape our everyday work";
  }
  await page.addInitScript((workspace) => {
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
    sessionStorage.setItem("fieldbook.profile.v1", "demo-learner");
  }, data);
  for (const destination of ["courses", "updates", "docs"]) {
    await page.goto(`/#${destination}`);
    await expect(page.locator(".learner-workspace h1")).toBeVisible();
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    const content = page.locator(".main-content");
    await expect.poll(() => content.evaluate((element) => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({ path: info.outputPath(`learner-${destination}-enlarged.png`) });
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  }
});

test("learner search opens from the keyboard and preserves an AI draft across dismissal", async ({ page }, info) => {
  await page.addInitScript(() => sessionStorage.setItem("fieldbook.profile.v1", "demo-learner"));
  await page.goto("/#courses");
  await expect(page.locator(".learner-workspace")).toBeVisible();
  if (info.project.name === "phone") {
    const card = (await page.locator(".learning-progress-card").boundingBox())!;
    const ring = (await page.locator('.learning-progress-card [data-slot="progress-ring"]').boundingBox())!;
    const copy = (await page.locator(".learning-progress-copy").boundingBox())!;
    expect(card.height).toBeLessThan(330);
    expect(copy.x).toBeGreaterThanOrEqual(ring.x + ring.width);
  }
  await page.screenshot({ path: info.outputPath("learner-home.png") });
  await page.keyboard.press("Control+k");
  const search = page.getByRole("textbox", { name: "Search all content", exact: true });
  const panel = page.locator('[data-slot="search-panel"]');
  await expect(search).toBeFocused();
  await expect(panel.getByRole("heading", { name: "Find what you need." })).toBeVisible();
  await panel.getByRole("button", { name: "Ask AI a question", exact: true }).click();
  const question = page.getByRole("textbox", { name: "Your question", exact: true });
  await expect(question).toBeFocused();
  await question.fill("How should I prepare for a customer conversation?");
  await question.press("Escape");
  await expect(panel).toHaveCount(0);
  await page.keyboard.press("Control+k");
  await expect(question).toHaveValue("How should I prepare for a customer conversation?");
  await expect(search).toHaveValue("");
  await panel.getByRole("button", { name: "New conversation", exact: true }).click();
  await expect(question).toHaveValue("");
  await page.screenshot({ path: info.outputPath("learner-ask-ai.png") });
});

test("collapsed learner navigation retains visible icons and reachable destinations", async ({ page }, info) => {
  test.skip(info.project.name === "phone", "Phones use the full navigation drawer.");
  await page.addInitScript(() => sessionStorage.setItem("fieldbook.profile.v1", "demo-learner"));
  await page.goto("/#courses");
  await page.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
  const navigation = page.getByRole("navigation", { name: "Primary", exact: true });
  for (const name of ["Updates", "Courses", "Docs"]) {
    const button = navigation.getByRole("button", { name, exact: true });
    const icon = button.locator("svg");
    await expect.poll(async () => {
      const bounds = (await button.boundingBox())!;
      const artwork = (await icon.boundingBox())!;
      return artwork.x >= bounds.x && artwork.x + artwork.width <= bounds.x + bounds.width;
    }).toBe(true);
    await button.click();
    await expect(button).toHaveAttribute("aria-current", "page");
  }
  // Entering Docs expands its document tree, retaining the existing navigation behavior.
  await expect(page.getByRole("button", { name: "Collapse sidebar", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Documents", exact: true })).toBeVisible();
});
