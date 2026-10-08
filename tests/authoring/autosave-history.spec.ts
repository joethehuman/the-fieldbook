import { test, expect } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { authoringUser, setupAuthoringProvider } from "./provider-fixture";

for (const newlyCreated of [false, true]) test(`a ${newlyCreated ? "new" : "saved"} title URL preserves Back protection for newer edits after the next save fails`, async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("production"), "The race requires delayed installed API responses.");
  const data = freshWorkspace();
  const item = data.content.find((entry) => entry.kind === "doc")!;
  Object.assign(item, {
    id: "00000000-0000-4000-8000-000000000101",
    title: "History fixture",
    body: "Original body.",
    status: "draft",
    revision: 1,
    publishedRevision: undefined,
  });
  data.content = newlyCreated ? [] : [item];
  data.publishedContent = [];
  await setupAuthoringProvider(page, data);
  await page.route("**/api/admin/snapshot?**", (route) =>
    route.fulfill({ json: { data, user: authoringUser } }),
  );
  let writes = 0;
  let release!: () => void;
  const firstResponse = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/content", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    writes++;
    if (writes > 1)
      return route.fulfill({ status: 503, json: { error: "Temporary save failure" } });
    const response = await route.fetch();
    await firstResponse;
    data.content = [await response.json()];
    await route.fulfill({ response });
  });
  await page.goto("/admin/content");
  if (newlyCreated) {
    await page.getByRole("button", { name: "Content", exact: true }).click();
    await page.getByRole("menuitem", { name: "Doc", exact: true }).click();
  } else await page.getByRole("link", { name: item.title, exact: true }).click();
  const title = page.getByRole("textbox", { name: "Title", exact: true });
  const body = page.getByRole("textbox", { name: "Doc content", exact: true });
  await expect(body).toBeVisible();
  await title.fill("First saved title");
  await expect.poll(() => writes).toBe(1);
  await title.fill("Newer unsaved title");
  await body.fill("Newer unsaved body must survive Back.");
  release();
  await expect(page).toHaveURL(/first-saved-title/);
  await expect(page.getByRole("button", { name: "Retry saving", exact: true })).toBeVisible();
  expect(writes).toBe(2);
  const canonicalUrl = page.url();
  await page.evaluate(() => history.back());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page).toHaveURL(canonicalUrl);
  await expect(title).toHaveValue("Newer unsaved title");
  await expect(body).toHaveText("Newer unsaved body must survive Back.");
  await page.evaluate(() => history.back());
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/content$/);
  await expect(page.getByRole("link", { name: "First saved title", exact: true })).toBeVisible();
  await page.evaluate(() => history.forward());
  await expect(page).toHaveURL(canonicalUrl);
  await expect(title).toHaveValue("First saved title");
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/admin\/content$/);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
});
