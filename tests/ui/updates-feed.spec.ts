import { expect, test, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";

async function seed(page: Page, relevantIds: string[], count = 27) {
  const data = freshWorkspace();
  const base = data.content.find((item) => item.kind === "brief")!;
  data.content = data.content.filter((item) => item.kind !== "brief");
  data.users[0].groups = ["sales"];
  data.groups = [
    { id: "all", name: "Everyone" },
    { id: "sales", name: "Sales", parentId: "all" },
  ];
  for (let i = 0; i < count; i++) {
    const id = `update-${String(i).padStart(2, "0")}`;
    data.content.push({
      ...base,
      id,
      title: `Update ${String(i).padStart(2, "0")}`,
      summary: `Summary ${i}`,
      groups: relevantIds.includes(id) ? [i % 2 ? "all" : "sales"] : [],
      updatedAt: `2026-09-${String(27 - i).padStart(2, "0")}T12:00:00.000Z`,
    });
  }
  await page.addInitScript((workspace) => {
    if (!localStorage.getItem("updates-feed-seeded")) {
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
      localStorage.setItem("updates-feed-seeded", "yes");
    }
    sessionStorage.setItem("fieldbook.profile.v1", "demo-learner");
  }, data);
  await page.goto("/#updates");
  await expect(
    page.getByRole("heading", { name: "Updates", exact: true, level: 1 }),
  ).toBeVisible();
}

test("For you has zero, one and two results without hiding the published library", async ({
  page,
}) => {
  await seed(page, []);
  await expect(page.getByRole("heading", { name: "For you" })).toHaveCount(0);
  await expect(page.locator(".updates-section").first()).toContainText(
    "All updates",
  );
  await expect(page.locator(".updates-section .brief-card")).toHaveCount(10);

  await page.evaluate(() => {
    const workspace = JSON.parse(
      localStorage.getItem("fieldbook.workspace.v1")!,
    );
    for (const content of [workspace.content, workspace.publishedContent])
      content.find((item: { id: string }) => item.id === "update-03").groups = [
        "sales",
      ];
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  });
  await page.reload();
  await expect(page.locator(".updates-section").first()).toContainText(
    "For you",
  );
  await expect(
    page.locator(".updates-section").first().locator(".brief-card"),
  ).toHaveCount(1);

  await page.evaluate(() => {
    const workspace = JSON.parse(
      localStorage.getItem("fieldbook.workspace.v1")!,
    );
    for (const content of [workspace.content, workspace.publishedContent])
      content.find((item: { id: string }) => item.id === "update-00").groups = [
        "sales",
      ];
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  });
  await page.reload();
  await expect(
    page.locator(".updates-section").first().locator(".brief-card"),
  ).toHaveCount(2);
});

test("Load more reveals complete ordered slices once and preserves scroll position", async ({
  page,
}, info) => {
  await seed(page, ["update-00", "update-04", "update-20"]);
  const sections = page.locator(".updates-section");
  await expect(sections).toHaveCount(2);
  await expect(sections.nth(0).locator(".brief-card")).toHaveCount(2);
  await expect(sections.nth(0)).toContainText("Update 00");
  await expect(sections.nth(0)).toContainText("Update 04");

  const list = sections.nth(1).locator(".brief-card");
  const more = page.getByRole("button", { name: "Load more", exact: true });
  await expect(list).toHaveCount(10);
  await expect(list.first()).toContainText("Update 01");
  await expect(list.nth(9)).toContainText("Update 11");
  await page.screenshot({
    path: info.outputPath("updates-feed.png"),
    fullPage: true,
  });

  await more.focus();
  const scrollBefore = await page
    .locator("#main-content")
    .evaluate((el) => el.scrollTop);
  await page.keyboard.press("Enter");
  await expect(list).toHaveCount(20);
  expect(
    await page.locator("#main-content").evaluate((el) => el.scrollTop),
  ).toBe(scrollBefore);
  await expect(list.nth(19)).toContainText("Update 21");

  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await expect(list).toHaveCount(25);
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  const titles = await page.locator(".brief-card h3").allTextContents();
  expect(new Set(titles).size).toBe(titles.length);
  expect(titles).toHaveLength(27);
});

test("Load more hides on the exact final page boundary", async ({ page }) => {
  await seed(page, ["update-00", "update-04"], 22);
  const list = page.locator(".updates-section").nth(1).locator(".brief-card");
  await expect(list).toHaveCount(10);
  await page.getByRole("button", { name: "Load more", exact: true }).click();
  await expect(list).toHaveCount(20);
  await expect(page.getByRole("button", { name: "Load more" })).toHaveCount(0);
  const titles = await page.locator(".brief-card h3").allTextContents();
  expect(new Set(titles).size).toBe(22);
});
