import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import type { Content } from "../../lib/types";

async function openSearch(page: Page) {
  const input = page.getByRole("textbox", { name: "Search all content" });
  const trigger = page.getByRole("button", {
    name: "Open search",
    exact: true,
  });
  await expect(input.or(trigger).first()).toBeVisible();
  if (await trigger.isVisible()) await trigger.click();
  else await input.click();
  return input;
}
for (const guest of [false, true]) {
  test(`${guest ? "guest" : "learner"} empty search suggests published content, supports keyboard and browses directly`, async ({
    page,
  }, info) => {
    const data = freshWorkspace();
    const base = data.content.find((item) => item.kind === "course")!;
    const course = (id: string): Content => ({
      ...base,
      id,
      title:
        id === "started"
          ? "A practical guide to navigating a long and unfamiliar customer conversation"
          : id,
      status: "published",
      groups: ["audience"],
      assignments: [
        {
          groupId: "audience",
          assignedAt: "2026-10-01T00:00:00Z",
          due: { type: "none" },
        },
      ],
      lessons: [
        { id: "first", title: "First lesson", body: "First lesson body" },
        { id: "next", title: "Second lesson", body: "Second lesson body" },
      ],
      questions: [],
      version: 1,
    });
    data.content = [
      course("unstarted"),
      course("started"),
      {
        ...course("reference"),
        kind: "doc",
        title: "Reference guide",
        groups: [],
        assignments: [],
        category: "Reference",
        folder: "",
        sectionId: undefined,
      },
      { ...course("update"), kind: "brief", title: "Relevant update" },
      { ...course("draft"), status: "draft", title: "Hidden draft" },
    ];
    data.publishedContent = data.content.filter(
      (item) => item.status === "published",
    );
    data.groups = [
      {
        id: "audience",
        name: "Audience",
        requiredCourseIds: ["unstarted", "started"],
      },
    ];
    data.users.find((user) => user.id === "demo-learner")!.groups = [
      "audience",
    ];
    data.settings = {
      ...data.settings!,
      guestGroupId: "audience",
      docSections: [],
      docCategoryOrder: ["Reference"],
    };
    data.progress["demo-learner"] = [
      { content_id: "started", version: 1, lessons: ["first"], passed: false },
    ];
    await page.addInitScript(
      ({ data, guest }) => {
        localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
        sessionStorage.setItem(
          "fieldbook.profile.v1",
          guest ? "guest" : "demo-learner",
        );
      },
      { data, guest },
    );
    const aiRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/ask-ai")) aiRequests.push(request.url());
    });
    await page.goto("/#courses");
    const input = await openSearch(page);
    const panel = page.locator('[data-slot="search-panel"]');
    const suggestions = panel.getByRole("list", { name: "Suggested content" });
    await expect(suggestions.getByRole("link")).toHaveCount(4);
    await expect(suggestions).not.toContainText("Hidden draft");
    const first = suggestions.getByRole("link").first();
    await expect(first).toContainText(
      guest ? "Recommended course" : "Continue course",
    );
    await expect(first).toContainText(
      guest ? "unstarted" : "A practical guide",
    );
    await expect(panel).toHaveAttribute("data-fit-content", "true");
    const bounds = (await panel.boundingBox())!;
    expect(bounds.height).toBeLessThan(560);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(
      page.viewportSize()!.width,
    );
    await page.screenshot({ path: info.outputPath("search-suggestions.png") });
    await input.press("ArrowDown");
    await expect(first).toBeFocused();
    await first.press("ArrowDown");
    await expect(suggestions.getByRole("link").nth(1)).toBeFocused();
    await page.keyboard.press("Home");
    await expect(first).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);
    await openSearch(page);
    await input.fill("Reference");
    await expect(
      panel.getByRole("region", { name: "Search suggestions" }),
    ).toHaveCount(0);
    await expect(
      panel.getByRole("link", { name: /Reference guide/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(suggestions.getByRole("link")).toHaveCount(4);
    await panel
      .getByRole("navigation", { name: "Browse content" })
      .getByRole("link", { name: "Docs", exact: true })
      .click();
    await expect(panel).toHaveCount(0);
    await expect(
      page
        .locator("main")
        .getByRole("heading", { name: "Reference guide", exact: true }),
    ).toBeVisible();
    expect(aiRequests).toEqual([]);
  });
}

test("suggestions stay reachable above a small phone viewport at enlarged text", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "phone",
    "Phone viewport and keyboard space.",
  );
  await page.addInitScript(() =>
    sessionStorage.setItem("fieldbook.profile.v1", "demo-learner"),
  );
  await page.goto("/#courses");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
    Object.defineProperty(window.visualViewport!, "height", {
      configurable: true,
      value: 440,
    });
  });
  await openSearch(page);
  const panel = page.locator('[data-slot="search-panel"]');
  const bounds = (await panel.boundingBox())!;
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(424);
  const scroll = panel.locator('[data-slot="search-suggestions-scroll"]');
  expect(
    await scroll.evaluate(
      (element) => element.scrollHeight > element.clientHeight,
    ),
  ).toBe(true);
  await scroll.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect(
    panel.getByRole("link", { name: "Updates", exact: true }),
  ).toBeInViewport();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("search-suggestions-phone-small-viewport.png"),
  });
});
