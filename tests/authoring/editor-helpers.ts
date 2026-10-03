import { readFile } from "node:fs/promises";
import { expect, type Page } from "@playwright/test";

/** Wait for the latest edit acknowledgement, without requesting publication. */
export async function waitForDraftSaved(page: Page) {
  await expect(page.locator(".editor-heading [role=status] > .sr-only")).toHaveText(/^Saved(?:\. Unpublished edits)?$/);
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

/** Read the actual exported file, including edits not yet acknowledged by autosave. */
export async function downloadMarkdown(page: Page) {
  await page.getByRole("button", { name: "More editor actions", exact: true }).click();
  const pending = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Download Markdown", exact: true }).click();
  const download = await pending;
  return { name: download.suggestedFilename(), body: await readFile((await download.path())!, "utf8") };
}

export async function expectMarkdown(page: Page, expected: string | RegExp) {
  const { body } = await downloadMarkdown(page);
  if (typeof expected === "string") expect(body).toBe(expected);
  else expect(body).toMatch(expected);
}

/** Write paragraphs through the visual editor instead of the removed source view. */
export async function replaceWritingText(page: Page, text: string) {
  const editor = page.locator('.writing-content[contenteditable="true"]');
  await editor.fill("");
  const paragraphs = text.split("\n\n");
  for (let i = 0; i < paragraphs.length; i++) {
    if (i) await page.keyboard.press("Enter");
    await page.keyboard.insertText(paragraphs[i]);
  }
}
