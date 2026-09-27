import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";

async function section(page: Page, name: string) {
  const picker = page.getByRole("combobox", {
    name: "Administration section",
    exact: true,
  });
  if (await picker.isVisible()) {
    await picker.click();
    await page.getByRole("option", { name, exact: true }).click();
  } else await page.getByRole("tab", { name, exact: true }).click();
}

test("catalog shows eight generated families without horizontal overflow", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ui");
  const gallery = page.getByRole("region", { name: "Generated card artwork" });
  await expect(gallery.locator(".card-artwork")).toHaveCount(8);
  await expect(gallery.getByText("Design 1", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await gallery.screenshot({ path: info.outputPath("card-art-families.png") });
});

test("Identity palette and Update Shuffle save the chosen design", async ({
  page,
}, info) => {
  const data = freshWorkspace();
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto("/#admin");
  await section(page, "Identity");
  const palette = page.getByRole("region", { name: "Card artwork palette" });
  await expect(palette.locator(".card-artwork")).toHaveCount(3);
  const before = await palette
    .locator(".card-artwork")
    .first()
    .evaluate((el) => el.style.getPropertyValue("--card-highlight"));
  await palette.getByRole("combobox", { name: "Palette mode" }).click();
  await page.getByRole("option", { name: "Dusk" }).click();
  const after = await palette
    .locator(".card-artwork")
    .first()
    .evaluate((el) => el.style.getPropertyValue("--card-highlight"));
  expect(after).not.toBe(before);
  await page.getByRole("button", { name: "Save settings" }).click();
  await section(page, "Content");
  await page
    .getByRole("group", { name: "Content type" })
    .getByRole("button", { name: "Updates", exact: true })
    .click();
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  const settingsToggle = page.getByRole("button", { name: "Content settings" });
  if (await settingsToggle.isVisible()) await settingsToggle.click();
  const editor = page.getByRole("region", { name: "Card artwork editor" });
  await expect(editor).toBeVisible();
  const title = editor.getByRole("textbox", { name: "Short title" });
  await title.fill("A shorter update");
  const first = await editor.locator(".card-artwork-geometry").innerHTML();
  await editor.getByRole("button", { name: "Shuffle artwork" }).click();
  expect(await editor.locator(".card-artwork-geometry").innerHTML()).not.toBe(
    first,
  );
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fieldbook.workspace.v1") || "{}"),
  );
  expect(saved.settings.cardPalette.preset).toBe("dusk");
  expect(
    saved.content.some(
      (item: { cardArt?: { shortTitle: string } }) =>
        item.cardArt?.shortTitle === "A shorter update",
    ),
  ).toBe(true);
  await editor.screenshot({ path: info.outputPath("card-art-admin.png") });
});
