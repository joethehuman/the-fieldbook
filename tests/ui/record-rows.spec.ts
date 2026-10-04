import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";

async function start(page: Page, section = "content") {
  const data = freshWorkspace();
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    if (!localStorage.getItem("fieldbook.workspace.v1"))
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto(`/#admin/${section}`);
  await expect(page.locator(".admin-layout")).toBeVisible();
  return data;
}
async function screenshot(page: Page, info: TestInfo, name: string) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: info.outputPath(`${name}.png`),
    fullPage: true,
  });
}

test("dense progress remains readable with long identities and enlarged text", async ({
  page,
}, info) => {
  await start(page, "progress");
  const table = page.locator('table[data-layout="progressPeople"]');
  await expect(table.locator("tbody tr")).toHaveCount(25);
  await table.scrollIntoViewIfNeeded();
  await screenshot(page, info, "people-progress");
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  await table
    .locator("tbody tr")
    .first()
    .getByRole("button", { name: /^Actions for/ })
    .click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(
    info.project.use.viewport!.width + 1,
  );
  await screenshot(page, info, "progress-enlarged-menu");
  await page.keyboard.press("Escape");
});

test("record menus support keyboard dismissal, dialog focus return and independent selection", async ({
  page,
}, info) => {
  await page.goto("/ui");
  const table = page.getByRole("region", { name: "Compact records example" });
  const trigger = table.getByRole("button", {
    name: "Actions for Alex Morgan",
  });
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("menuitem", { name: "View courses", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Record details" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(trigger).toBeFocused();
  await page.getByRole("checkbox", { name: "Select example team" }).check();
  await expect(dialog).toHaveCount(0);
  // Scope this catalog check to the records composition. Other catalog examples
  // are independently exercised by the wider design-system suite.
  const example = table.locator("..");
  const bounds = await example.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(
    info.project.use.viewport!.width + 1,
  );
  await example.screenshot({
    path: info.outputPath("catalog-compact-records.png"),
  });
});

test("content row menus preserve assignment selection and canceled publication changes", async ({
  page,
}, info) => {
  const data = await start(page);
  const course = data.content.find(
    (item) => item.kind === "course" && item.status === "published",
  )!;
  await page
    .getByRole("searchbox", { name: "Search content", exact: true })
    .fill(course.title);
  const table = page.locator('table[data-layout="contentSelection"]');
  const row = table.locator("tbody tr").first();
  const widths = await table
    .locator("thead [data-slot=table-cell-content]")
    .evaluateAll((cells) =>
      cells.map((cell) => getComputedStyle(cell).maxWidth),
    );
  await page
    .getByRole("searchbox", { name: "Search content", exact: true })
    .fill("");
  expect(
    await table
      .locator("thead [data-slot=table-cell-content]")
      .evaluateAll((cells) =>
        cells.map((cell) => getComputedStyle(cell).maxWidth),
      ),
  ).toEqual(widths);
  await screenshot(page, info, "content");
  await page
    .getByRole("searchbox", { name: "Search content", exact: true })
    .fill(course.title);
  const trigger = row.getByRole("button", {
    name: `Actions for ${course.title}`,
    exact: true,
  });
  await trigger.click();
  await screenshot(page, info, "content-actions");
  await page.getByRole("menuitem", { name: "Assign", exact: true }).click();
  const audience = page.getByRole("dialog", {
    name: "Course audience",
    exact: true,
  });
  await expect(audience).toBeVisible();
  await expect(
    audience.getByRole("checkbox", { checked: true }).first(),
  ).toBeVisible();
  await audience.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(trigger).toBeFocused();
  const before = await page.evaluate(() =>
    localStorage.getItem("fieldbook.workspace.v1"),
  );
  await trigger.click();
  await page.getByRole("menuitem", { name: "Unpublish", exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(trigger).toBeFocused();
  expect(
    await page.evaluate(() => localStorage.getItem("fieldbook.workspace.v1")),
  ).toEqual(before);
  await row.getByRole("link", { name: course.title, exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue(course.title);
});

test("people and groups keep compact identities and direct navigation", async ({
  page,
}, info) => {
  await start(page, "people");
  const table = page.locator('table[data-layout="peopleSelection"]');
  const row = table.locator("tbody tr").first();
  await expect(row).toBeVisible();
  await screenshot(page, info, "people");
  const groups = table.getByRole("button", { name: /^Show all/ }).first();
  await groups.click();
  await expect(
    page
      .getByRole("dialog", { name: "groups", exact: true })
      .getByRole("listitem")
      .first(),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(groups).toBeFocused();
  await row.getByRole("button", { name: /^Actions for/ }).click();
  await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(row.getByRole("button", { name: /^Actions for/ })).toBeFocused();
  await page.goto("/#admin/groups");
  const group = page
    .locator('table[data-layout="learningGroupsSelectable"] tbody tr')
    .first();
  await expect(group.getByRole("img", { name: /teams linked/ })).toBeVisible();
  await screenshot(page, info, "learning-groups");
  const groupName = await group.locator("a[data-group-id]").innerText();
  await group.locator("a[data-group-id]").click();
  await expect(
    page.getByRole("heading", { name: groupName, exact: true }),
  ).toBeVisible();
});

test("team selection is independent of row menus and browsing", async ({
  page,
}, info) => {
  await start(page, "teams");
  await page.getByRole("button", { name: "Select multiple", exact: true }).click();
  const row = page.locator('table[data-layout="teamDirectory"] tbody tr').first();
  const check = row.getByRole("checkbox");
  await check.check();
  await expect(check).toBeChecked();
  await screenshot(page, info, "teams-selection");
  const trigger = row.getByRole("button", { name: /^Actions for/ });
  await trigger.click();
  await page.getByRole("menuitem", { name: "Edit team", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("textbox", { name: "Team name", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(check).toBeChecked();
  await expect(trigger).toBeFocused();
  await page
    .getByRole("searchbox", { name: "Find teams", exact: true })
    .fill("zz-no-team");
  await expect(page.locator('[data-slot="record-list-row"]')).toHaveCount(0);
  await page
    .getByRole("searchbox", { name: "Find teams", exact: true })
    .fill("");
  // Existing collection behavior clears selection when its filter scope changes.
  await expect(check).not.toBeChecked();
});
