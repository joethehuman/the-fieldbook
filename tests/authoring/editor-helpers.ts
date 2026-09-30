import { expect, type Page } from "@playwright/test";

/** Wait for the latest edit acknowledgement, without requesting publication. */
export async function waitForDraftSaved(page: Page) {
  await expect(page.locator(".editor-heading [role=status]")).toHaveText("Saved");
}

export async function openContentSettings(page: Page) {
  const settings = page.getByRole("dialog", { name: "Content settings", exact: true });
  if (!(await settings.isVisible()))
    await page.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(settings).toBeVisible();
  return settings;
}

export async function closeContentSettings(page: Page) {
  const settings = page.getByRole("dialog", { name: "Content settings", exact: true });
  if (await settings.isVisible())
    await settings.getByRole("button", { name: "Close content settings", exact: true }).click();
}
