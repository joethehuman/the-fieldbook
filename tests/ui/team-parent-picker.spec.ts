import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace, type Workspace } from "../../lib/store";

async function teams(page: Page) {
  const section = page.getByRole("combobox", {
    name: "Administration section",
    exact: true,
  });
  await expect(page.locator(".admin-layout")).toBeVisible();
  if (await section.isVisible()) {
    await section.click();
    await page.getByRole("option", { name: "Teams", exact: true }).click();
  } else await page.getByRole("tab", { name: "Teams", exact: true }).click();
}

test("parent picker searches ancestry, reveals the whole path, and cancels without changing teams", async ({
  page,
}, info) => {
  const data = freshWorkspace();
  const root = data.teams!.find((team) => team.system === "organization")!;
  for (let index = 1; index <= 12; index++)
    data.teams!.push({
      id: `parent-${index}`,
      name: index === 1 ? "Commercial division" : `Regional level ${index}`,
      parentId: index === 1 ? root.id : `parent-${index - 1}`,
    });
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto("/#admin");
  await teams(page);
  const baseline = await page.evaluate(() =>
    localStorage.getItem("fieldbook.workspace.v1"),
  );
  await page.getByRole("button", { name: "Add team", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New team", exact: true });
  await dialog
    .getByRole("textbox", { name: "Team name", exact: true })
    .fill("Proposed district");
  const picker = dialog.locator('[data-slot="hierarchy-picker"]');
  const trigger = picker.getByRole("button");
  await trigger.click();
  const search = page.getByRole("combobox", {
    name: "Find a parent team",
    exact: true,
  });
  await expect(search).toBeFocused();
  await search.fill("commercial regional 12");
  await expect(page.getByRole("option")).toHaveCount(1);
  const path = page.getByRole("region", {
    name: "Full hierarchy",
    exact: true,
  });
  await expect(path).toContainText("Commercial division / Regional level 2");
  await expect(path).toContainText("Regional level 11 / Regional level 12");
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveText("Regional level 12");
  await expect(trigger).toBeFocused();
  await expect(picker.locator("summary")).toContainText(
    "Organization / … / Regional level 11 / Regional level 12",
  );
  await picker.locator("summary").click();
  await expect(picker.locator("details p")).toContainText(
    "Commercial division / Regional level 2",
  );
  await trigger.click();
  const selectedOption = page.getByRole("option", {
    name: /Regional level 12$/,
    exact: false,
  });
  await expect
    .poll(async () => {
      const option = (await selectedOption.boundingBox())!;
      const list = (await page
        .getByRole("listbox", { name: "Find a parent team", exact: true })
        .boundingBox())!;
      return (
        option.y >= list.y - 1 &&
        option.y + option.height <= list.y + list.height + 1
      );
    })
    .toBe(true);
  await search.fill("no such team");
  await expect(
    page.getByText("No matching teams.", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(search).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await expect(trigger).toHaveText("Regional level 12");
  await page.screenshot({
    path: info.outputPath("long-parent-hierarchy.png"),
    fullPage: true,
  });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  const discard = page.getByRole("alertdialog");
  if (await discard.isVisible())
    await discard.getByRole("button", { name: /Discard|Confirm/ }).click();
  await expect(dialog).not.toBeVisible();
  expect(
    await page.evaluate(() => localStorage.getItem("fieldbook.workspace.v1")),
  ).toBe(baseline);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("parent picker excludes the edited team and all its descendants", async ({
  page,
}) => {
  const data = freshWorkspace();
  const root = data.teams!.find((team) => team.system === "organization")!;
  data.teams!.push(
    { id: "cycle-parent", name: "Cycle parent", parentId: root.id },
    { id: "cycle-child", name: "Cycle child", parentId: "cycle-parent" },
  );
  await page.addInitScript((workspace: Workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto("/#admin");
  await teams(page);
  await page
    .getByRole("button", { name: "Edit Cycle parent", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Edit Cycle parent",
    exact: true,
  });
  await dialog
    .locator('[data-slot="hierarchy-picker"]')
    .getByRole("button")
    .click();
  const search = page.getByRole("combobox", {
    name: "Find a parent team",
    exact: true,
  });
  await search.fill("cycle");
  await expect(page.getByRole("option")).toHaveCount(0);
  await search.fill("Organization");
  await expect(
    page.getByRole("option", { name: "Organization", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
});
