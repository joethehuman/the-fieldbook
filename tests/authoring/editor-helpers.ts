import { expect, type Page } from "@playwright/test";

/** Wait for the latest edit acknowledgement, without requesting publication. */
export async function waitForDraftSaved(page: Page) {
  await expect(page.locator(".editor-heading [role=status]")).toHaveText("Saved");
}

export async function openContentSettings(page: Page) {
  const details = page.getByRole("complementary", { name: "Content details", exact: true });
  const toggle = page.getByRole("button", { name: /^Details/ });
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await expect(details).toBeVisible();
  return details;
}

export async function closeContentSettings(page: Page) {
  const toggle = page.getByRole("button", { name: /^Details/ });
  if (await toggle.getAttribute("aria-expanded") === "true") await toggle.click();
  await expect(page.getByRole("complementary", { name: "Content details", exact: true })).toHaveCount(0);
}
