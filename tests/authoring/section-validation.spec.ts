import { test, expect } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { defaultSettings } from "../../lib/settings";
import { authoringUser, setupAuthoringProvider } from "./provider-fixture";

test("retrying the same duplicate section name restores dismissed validation without losing input", async ({ page }, info) => {
  const installed = info.project.name.startsWith("production");
  const data = freshWorkspace();
  data.content = [];
  data.publishedContent = [];
  data.settings = { ...defaultSettings, ...data.settings, docCategoryOrder: [], docSections: [
    { id: "existing-section", name: "Existing section" },
  ] };
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
  await page.goto(installed ? "/admin/settings/docs-navigation" : "/#admin/settings/docs-navigation");
  await page.getByRole("button", { name: "New section", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New section", exact: true });
  const name = dialog.getByRole("textbox", { name: "New section name", exact: true });
  const create = dialog.getByRole("button", { name: "Create section", exact: true });
  await name.fill("Existing section");
  await create.click();
  const error = dialog.getByRole("alert");
  await expect(error).toBeVisible();
  const message = await error.textContent();
  await error.getByRole("button", { name: "Dismiss message", exact: true }).click();
  await expect(error).toHaveCount(0);
  await expect(name).toHaveValue("Existing section");
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await create.click();
  await expect(error).toHaveText(message!);
  await error.getByRole("button", { name: "Dismiss message", exact: true }).click();
  await expect(error).toHaveCount(0);
  // An unrelated local render must not redisplay the dismissed notification.
  await name.fill("Existing section ");
  await expect(error).toHaveCount(0);
  await create.click();
  await expect(error).toHaveText(message!);
  await name.fill("New valid section");
  await create.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("New valid section", { exact: true })).toBeVisible();
});
