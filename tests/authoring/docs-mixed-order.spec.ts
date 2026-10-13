import { test, expect } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { defaultSettings } from "../../lib/settings";
import { setupAuthoringProvider } from "./provider-fixture";

test("installed admin saves and reloads mixed sibling order without rewriting Docs", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("production"));
  const data = freshWorkspace();
  const base = data.content.find((item) => item.kind === "doc")!;
  data.content = ["First guide", "Second guide", "Recipe guide"].map((title, index) => ({
    ...base, id: `00000000-0000-4000-8000-${String(index + 901).padStart(12, "0")}`,
    title, sectionId: index === 2 ? "recipes" : "root", category: "Start",
    folder: index === 2 ? "Recipes" : "", status: "published", revision: 1, publishedRevision: 1,
  }));
  data.publishedContent = structuredClone(data.content);
  data.settings = { ...defaultSettings, ...data.settings, docCategoryOrder: [], docSections: [
    { id: "root", name: "Start", docOrder: data.content.slice(0, 2).map((doc) => doc.id) },
    { id: "recipes", name: "Recipes", parentId: "root" },
  ] };
  await setupAuthoringProvider(page, data);
  await page.goto("/admin/settings/docs-navigation");
  await page.getByRole("button", { name: "Expand Start", exact: true }).click();
  const before = (await (await page.request.get("/api/admin/snapshot?scope=content")).json()).data;
  const recipe = page.getByRole("button", { name: /^Reorder Start → Recipes;/ });
  await recipe.press("ArrowUp");
  await recipe.press("ArrowUp");
  await page.getByRole("button", { name: /^Reorder document First guide;/ }).press("ArrowDown");
  const expected = ["section:recipes", `doc:${data.content[1].id}`, `doc:${data.content[0].id}`];
  const items = page.getByRole("list", { name: "Items in Start", exact: true });
  const order = () => items.locator(":scope > [data-navigation-item]").evaluateAll((items) => items.map((item) => item.getAttribute("data-navigation-item")));
  expect(await order()).toEqual(expected);
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible();
  const saved = (await (await page.request.get("/api/admin/snapshot?scope=content")).json()).data;
  expect(saved.content).toEqual(before.content);
  expect(saved.publishedContent).toEqual(before.publishedContent);
  expect(saved.settings.docSections[0].itemOrder.map((item: { kind: string; id: string }) => `${item.kind}:${item.id}`)).toEqual(expected);
  await page.reload();
  await page.getByRole("button", { name: "Expand Start", exact: true }).click();
  expect(await order()).toEqual(expected);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: info.outputPath("installed-mixed-order.png"), fullPage: true });
});
