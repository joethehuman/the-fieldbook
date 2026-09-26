import { test, expect } from "@playwright/test";

test("reordering shows the whole row in motion and retains arrow controls", async ({ page }, info) => {
  await page.goto("/ui");
  await page.getByRole("tab", { name: "Learning", exact: true }).click();
  const rows = page.locator(".learning-order [data-slot=reorder-row]");
  await expect(rows.first()).toContainText("Company essentials");
  const handle = rows.first().getByRole("button", { name: /Reorder Company essentials/ });
  const box = await handle.boundingBox();
  const second = await rows.nth(1).boundingBox();
  expect(box && second).toBeTruthy();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  await page.mouse.move(box!.x + box!.width / 2 + 12, box!.y + box!.height / 2 + 12, { steps: 5 });
  await expect(rows.filter({ hasText: "Company essentials" })).toHaveAttribute("data-dragging", "true");
  await page.screenshot({ path: info.outputPath("full-row-drag.png") });
  await page.mouse.move(second!.x + second!.width / 2, second!.y + second!.height / 2, { steps: 8 });
  await page.mouse.up();
  await expect(rows.first()).toContainText("Customer conversations");
  await rows.nth(1).getByRole("button", { name: "Move Company essentials up" }).click();
  await expect(rows.first()).toContainText("Company essentials");
});

test("Docs sections drag by their handle and save the resulting row order", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("fieldbook.profile.v1", "demo-admin"));
  await page.goto("/#admin");
  await expect(page.locator(".admin-layout")).toBeVisible();
  const picker = page.getByRole("combobox", { name: "Administration section", exact: true });
  if (await picker.isVisible()) {
    await picker.click();
    await page.getByRole("option", { name: "Docs navigation", exact: true }).click();
  } else {
    await page.getByRole("tab", { name: "Docs navigation", exact: true }).click();
  }
  const rows = page.locator(".doc-order-list > li > .doc-order-list > [data-slot=reorder-row]:first-child");
  expect(await rows.count()).toBeGreaterThan(1);
  await rows.nth(1).scrollIntoViewIfNeeded();
  await rows.first().getByRole("button", { name: /^Reorder / }).scrollIntoViewIfNeeded();
  await page.locator("#main-content").evaluate((element) => { element.scrollTop += 120; });
  const first = await rows.first().locator("strong").innerText();
  const source = await rows.first().getByRole("button", { name: /^Reorder / }).boundingBox();
  const target = await rows.nth(1).boundingBox();
  expect(source && target).toBeTruthy();
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down();
  await page.mouse.move(source!.x + source!.width / 2 + 12, source!.y + source!.height / 2 + 12, { steps: 5 });
  await page.mouse.move(target!.x + 20, target!.y + 20, { steps: 12 });
  await page.mouse.up();
  await expect(rows.nth(1).locator("strong")).toHaveText(first);
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await page.reload();
  await expect(page.locator(".admin-layout")).toBeVisible();
  if (await picker.isVisible()) {
    await picker.click();
    await page.getByRole("option", { name: "Docs navigation", exact: true }).click();
  } else {
    await page.getByRole("tab", { name: "Docs navigation", exact: true }).click();
  }
  await expect(rows.nth(1).locator("strong")).toHaveText(first);
});
