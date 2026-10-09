import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import { categoryLists } from "../../lib/content-categories";

async function fixture(page: Page, largeCategory = false) {
  const data = withPublishedSnapshots(freshWorkspace());
  if (largeCategory) {
    const source = data.content.find((item) => item.kind === "course")!;
    const published = data.publishedContent!.find(
      (item) => item.id === source.id,
    )!;
    for (let index = 1; index <= 48; index++) {
      const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
      const title = `Example course ${String(index).padStart(2, "0")}`;
      data.content.push({ ...source, id, title });
      data.publishedContent!.push({ ...published, id, title });
    }
  }
  data.settings = {
    ...data.settings!,
    contentCategories: categoryLists(data.content),
  };
  data.settings.contentCategories!.course.push("Empty course category");
  data.settings.contentCategories!.brief.push("Empty update category");
  await page.addInitScript((workspace) => {
    if (!localStorage.getItem("fieldbook.workspace.v1"))
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
  }, data);
  await page.goto("/#admin/settings/categories");
  await expect(
    page.getByRole("heading", { name: "Categories", exact: true }),
  ).toBeVisible();
  return data;
}
async function saved(page: Page) {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
  );
}
async function save(page: Page) {
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    page.getByText("Unsaved changes", { exact: true }),
  ).not.toBeVisible();
}

test("create, keep changes across type tabs, save, and permanently delete an empty category", async ({
  page,
}, info) => {
  await fixture(page);
  await expect(
    page.getByText("Use categories to organize courses and updates."),
  ).toBeVisible();
  await expect(
    page.getByText(/Curricula always appear at the bottom/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create category", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Category name", { exact: true })
    .fill("New category");
  await dialog
    .getByRole("button", { name: "Create category", exact: true })
    .click();
  await expect(
    page.getByText("Unsaved changes", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Updates", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Reorder", exact: false }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Actions for New category", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("tab", { name: "Courses", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Actions for New category", exact: true }),
  ).toBeVisible();
  await save(page);
  const before = await saved(page);
  expect(before.settings.contentCategories.course).toContain("New category");
  await page
    .getByRole("button", { name: "Actions for New category", exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Delete category", exact: true })
    .click();
  dialog = page.getByRole("alertdialog");
  await expect(dialog).not.toContainText("30 days");
  await dialog
    .getByRole("button", { name: "Delete category", exact: true })
    .click();
  await save(page);
  expect((await saved(page)).settings.contentCategories.course).not.toContain(
    "New category",
  );
  expect((await saved(page)).deletedItems || []).toEqual(
    before.deletedItems || [],
  );
  await page.screenshot({
    path: info.outputPath("categories.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("legacy initialization keeps the reader category order when a draft placement differs", async ({
  page,
}) => {
  const data = withPublishedSnapshots(freshWorkspace());
  const course = data.content.find((item) => item.kind === "course")!;
  const readerOrder = [
    ...new Set(
      data
        .publishedContent!.filter((item) => item.kind === "course")
        .map((item) => item.category),
    ),
  ];
  course.category = "Draft-only category";
  await page.addInitScript((workspace) => {
    if (!localStorage.getItem("fieldbook.workspace.v1"))
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
  }, data);
  await page.goto("/#admin/settings/categories");
  const names = await page
    .locator("[data-category]")
    .first()
    .getAttribute("data-category");
  // The first category still reflects the published library, not the unpublished placement.
  expect(names).toBe(readerOrder[0]);
});

test("category rows and deletion review remain readable with a dark system preference", async ({
  page,
}, info) => {
  await page.emulateMedia({ colorScheme: "dark" });
  const before = await fixture(page);
  const name = before.settings!.contentCategories!.course[0];
  await page
    .getByRole("button", { name: `Expand ${name}`, exact: true })
    .click();
  await page.screenshot({
    path: info.outputPath("categories-dark.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: `Actions for ${name}`, exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Delete category", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", {
      name: "Move items and delete category",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(dialog).not.toContainText("30 days");
  await page.screenshot({ path: info.outputPath("category-delete-dark.png") });
});

test("move-and-delete creates a destination and preserves drafts, publication and learning history", async ({
  page,
}, info) => {
  const before = await fixture(page);
  const source = before.settings!.contentCategories!.course[0];
  const ids = before.content
    .filter((item) => item.kind === "course" && item.category === source)
    .map((item) => item.id);
  await page
    .getByRole("button", { name: `Actions for ${source}`, exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Delete category", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("button", {
      name: "Move items and delete category",
      exact: true,
    }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "Create a destination category", exact: true })
    .click();
  await dialog.getByLabel("New category name").fill("Merged courses");
  await page.screenshot({ path: info.outputPath("move-and-delete.png") });
  await dialog
    .getByRole("button", {
      name: "Move items and delete category",
      exact: true,
    })
    .click();
  expect((await saved(page)).settings.contentCategories.course).toContain(
    source,
  );
  await save(page);
  const after = await saved(page);
  expect(after.settings.contentCategories.course).not.toContain(source);
  for (const id of ids) {
    const prior = before.content.find((item) => item.id === id)!;
    const draft = after.content.find((item: any) => item.id === id);
    expect(draft.category).toBe("Merged courses");
    expect(draft.lessons).toEqual(prior.lessons);
    expect(draft.version).toBe(prior.version);
    expect(draft.updatedAt).toBe(prior.updatedAt);
    const live = after.publishedContent.find((item: any) => item.id === id);
    if (live) expect(live.category).toBe("Merged courses");
  }
  expect(after.progress).toEqual(before.progress);
  expect(after.curricula).toEqual(before.curricula);
});

test("rename and move selected Updates, with an empty category available as destination", async ({
  page,
}) => {
  const before = await fixture(page);
  await page.getByRole("tab", { name: "Updates", exact: true }).click();
  const source = before.settings!.contentCategories!.brief[0];
  await page
    .getByRole("button", { name: `Actions for ${source}`, exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Rename", exact: true }).click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("Category name", { exact: true })
    .fill("Renamed updates");
  await dialog
    .getByRole("button", { name: "Rename category", exact: true })
    .click();
  await save(page);
  await page
    .getByRole("button", { name: "Expand Renamed updates", exact: true })
    .click();
  const item = before.content.find(
    (item) => item.kind === "brief" && item.category === source,
  )!;
  await page
    .getByRole("checkbox", { name: `Select ${item.title}`, exact: true })
    .check();
  await page
    .getByRole("button", {
      name: "Items in Renamed updates bulk actions",
      exact: true,
    })
    .click();
  await page
    .getByRole("menuitem", { name: "Move to category…", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Destination category", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Empty update category", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Move items", exact: true }).click();
  await save(page);
  const after = await saved(page);
  expect(
    after.content.find((entry: any) => entry.id === item.id).category,
  ).toBe("Empty update category");
  expect(
    after.publishedContent.find((entry: any) => entry.id === item.id).feedAt,
  ).toBe(
    before.publishedContent!.find((entry) => entry.id === item.id)!.feedAt,
  );
});

test("category selection moves contents and permanently deletes multiple categories together", async ({
  page,
}) => {
  const before = await fixture(page);
  const names = before.settings!.contentCategories!.course.slice(0, 2);
  const bulk = page.getByRole("button", {
    name: "Categories bulk actions",
    exact: true,
  });
  await expect(bulk).toBeDisabled();
  for (const name of names)
    await page
      .getByRole("checkbox", { name: `Select category ${name}`, exact: true })
      .check();
  await expect(bulk).toBeEnabled();
  await expect(
    page.getByRole("group", { name: "Categories selection", exact: true }),
  ).toContainText("2 selected");
  await bulk.click();
  await page
    .getByRole("menuitem", { name: "Move all items to…", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Destination category", exact: true })
    .click();
  for (const name of names)
    await expect(page.getByRole("option", { name, exact: true })).toHaveCount(
      0,
    );
  await page.keyboard.press("Escape");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(bulk).toBeFocused();
  await bulk.click();
  await page
    .getByRole("menuitem", { name: "Delete categories", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("2 selected categories");
  await expect(dialog).not.toContainText("30 days");
  await dialog
    .getByRole("combobox", { name: "Destination category", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Empty course category", exact: true })
    .click();
  await dialog
    .getByRole("button", {
      name: "Move items and delete categories",
      exact: true,
    })
    .click();
  // All changes stay staged until the administrator saves.
  expect((await saved(page)).settings.contentCategories).toEqual(
    before.settings!.contentCategories,
  );
  await save(page);
  const after = await saved(page);
  for (const name of names)
    expect(after.settings.contentCategories.course).not.toContain(name);
  const moved = before.content.filter(
    (item) => item.kind === "course" && names.includes(item.category),
  );
  for (const item of moved) {
    expect(
      after.content.find((entry: any) => entry.id === item.id),
    ).toMatchObject({
      ...item,
      category: "Empty course category",
      revision: item.revision! + 1,
      publishedRevision: item.publishedRevision! + 1,
    });
    expect(
      after.publishedContent.find((entry: any) => entry.id === item.id)
        .category,
    ).toBe("Empty course category");
  }
  expect(after.progress).toEqual(before.progress);
  expect(after.deletedItems || []).toEqual(before.deletedItems || []);
  await expect(bulk).toBeDisabled();
});

test("large categories have bounded searchable tables, select-all and individual move menus", async ({
  page,
}, info) => {
  const before = await fixture(page, true);
  const source = before.content.find((item) => item.kind === "course")!;
  const name = source.category;
  await page
    .getByRole("button", { name: `Expand ${name}`, exact: true })
    .click();
  const section = page.getByRole("region", {
    name: `Items in ${name}`,
    exact: true,
  });
  await expect(
    page.getByRole("list", { name: "Courses categories", exact: true }).locator(":scope > li"),
  ).toHaveCount(before.settings!.contentCategories!.course.length);
  const viewport = section.getByRole("region", {
    name: `Scrollable items in ${name}`,
    exact: true,
  });
  const table = section.getByRole("table", {
    name: `Items in ${name}`,
    exact: true,
  });
  const count = before.content.filter(
    (item) => item.kind === "course" && item.category === name,
  ).length;
  await expect(table.locator("tbody tr")).toHaveCount(count);
  const dimensions = await viewport.evaluate((element) => ({
    height: element.clientHeight,
    scrollHeight: element.scrollHeight,
    header: element.querySelector("thead")!.getBoundingClientRect().height,
    row: element.querySelector("tbody tr")!.getBoundingClientRect().height,
  }));
  expect(dimensions.height).toBeLessThanOrEqual(
    dimensions.header + dimensions.row * 5 + 2,
  );
  expect(dimensions.height - dimensions.header).toBeGreaterThanOrEqual(
    dimensions.row * 5,
  );
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.height * 5);
  const row = table.locator("tbody tr").first();
  const rowBounds = await row.boundingBox();
  const checkboxBounds = await row.getByRole("checkbox").boundingBox();
  expect(
    Math.abs(
      checkboxBounds!.y +
        checkboxBounds!.height / 2 -
        rowBounds!.y -
        rowBounds!.height / 2,
    ),
  ).toBeLessThanOrEqual(1);
  const bulk = section.getByRole("button", {
    name: `Items in ${name} bulk actions`,
    exact: true,
  });
  await expect(bulk).toBeDisabled();
  await section.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: info.outputPath("category-item-table.png"),
    fullPage: true,
  });
  await viewport.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.scrollLeft = element.scrollWidth;
  });
  const viewportBounds = await viewport.boundingBox();
  const headerBounds = await table.locator("thead").boundingBox();
  expect(Math.abs(headerBounds!.y - viewportBounds!.y - 1)).toBeLessThanOrEqual(
    1,
  );
  const lastAction = await table
    .locator("tbody tr")
    .last()
    .getByRole("button")
    .boundingBox();
  expect(lastAction!.x + lastAction!.width).toBeLessThanOrEqual(
    viewportBounds!.x + viewportBounds!.width,
  );
  expect(lastAction!.x).toBeGreaterThanOrEqual(viewportBounds!.x);
  await viewport.evaluate((element) => {
    element.scrollTop = 0;
    element.scrollLeft = 0;
  });
  const individual = row.getByRole("button", {
    name: `Actions for ${source.title}`,
    exact: true,
  });
  await individual.click();
  await page
    .getByRole("menuitem", { name: "Move to category…", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(individual).toBeFocused();
  await individual.click();
  await page
    .getByRole("menuitem", { name: "Move to category…", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Destination category", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Empty course category", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Move items", exact: true }).click();
  await expect(table.locator("tbody tr")).toHaveCount(count - 1);
  const search = section.getByRole("searchbox", {
    name: `Search items in ${name}`,
    exact: true,
  });
  await search.fill("EXAMPLE COURSE 0");
  await expect(table.locator("tbody tr")).toHaveCount(9);
  await section
    .getByRole("checkbox", {
      name: `Select all matching items in ${name}`,
      exact: true,
    })
    .check();
  await expect(
    section.getByRole("group", {
      name: `Items in ${name} selection`,
      exact: true,
    }),
  ).toContainText("9 selected");
  await bulk.click();
  await page
    .getByRole("menuitem", { name: "Move to category…", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("9 selected items");
  await dialog
    .getByRole("combobox", { name: "Destination category", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Empty course category", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Move items", exact: true }).click();
  await expect(
    section.getByText("No items match your search.", { exact: true }),
  ).toBeVisible();
  await section
    .getByRole("button", { name: "Clear search", exact: true })
    .click();
  await expect(table.locator("tbody tr")).toHaveCount(count - 10);
  await save(page);
  const after = await saved(page);
  expect(
    after.content.filter(
      (item: any) =>
        item.kind === "course" && item.category === "Empty course category",
    ),
  ).toHaveLength(10);
  expect(after.progress).toEqual(before.progress);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("category search preserves course order and Curricula remains last", async ({
  page,
}, info) => {
  const before = await fixture(page);
  const names = before.settings!.contentCategories!.course.filter(
    (name) => name !== "Empty course category",
  );
  const last = names.at(-1)!;
  const handle = page.getByRole("button", {
    name: `Reorder ${last}`,
    exact: true,
  });
  const search = page.getByRole("searchbox", {
    name: "Search course categories",
    exact: true,
  });
  await search.fill(` ${last.toUpperCase()} `);
  await expect(page.locator("[data-category]")).toHaveCount(1);
  await expect(handle).toBeDisabled();
  await page
    .getByRole("button", { name: `Actions for ${last}`, exact: true })
    .click();
  await expect(
    page.getByRole("menuitem", { name: "Move up", exact: true }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(
    page.getByText("Unsaved changes", { exact: true }),
  ).not.toBeVisible();
  expect((await saved(page)).settings.contentCategories).toEqual(
    before.settings!.contentCategories,
  );
  await page.getByRole("tab", { name: "Updates", exact: true }).click();
  const updateSearch = page.getByRole("searchbox", {
    name: "Search update categories",
    exact: true,
  });
  await expect(updateSearch).toHaveValue("");
  await updateSearch.fill("EMPTY UPDATE");
  await expect(page.locator("[data-category]")).toHaveCount(1);
  await expect(page.locator("[data-category]")).toHaveAttribute(
    "data-category",
    "Empty update category",
  );
  await page.getByRole("tab", { name: "Courses", exact: true }).click();
  await expect(search).toHaveValue(` ${last.toUpperCase()} `);
  await search.fill("No matching category");
  await expect(
    page.getByText("No categories match your search.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search", exact: true }).click();
  await expect(search).toHaveValue("");
  await expect(page.locator("[data-category]")).toHaveCount(
    before.settings!.contentCategories!.course.length,
  );
  await expect(handle).toBeEnabled();
  await page.screenshot({
    path: info.outputPath("category-search.png"),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await handle.focus();
  for (let index = 1; index < names.length; index++)
    await handle.press("ArrowUp");
  await save(page);
  expect((await saved(page)).settings.contentCategories.course[0]).toBe(last);
  await page.goto("/#courses");
  await expect(page.locator(".channel")).not.toHaveCount(0);
  const rows = await page.locator(".channel h2, .channel h3").allTextContents();
  expect(rows[0]).toBe(last);
  const curriculum = page.getByRole("heading", {
    name: "Curricula",
    exact: true,
  });
  await expect(curriculum).toBeVisible();
  const headings = await page
    .locator(
      '.course-row-wrap > [data-slot="section-header"] h2, .course-row-wrap > [data-slot="section-header"] h3',
    )
    .allTextContents();
  expect(headings.at(-1)).toBe("Curricula");
  await page.screenshot({
    path: info.outputPath("category-order-home.png"),
    fullPage: true,
  });
});

test("managed editor and bulk pickers include empty categories", async ({
  page,
}) => {
  const before = await fixture(page);
  const item = before.content.find((entry) => entry.kind === "brief")!;
  await page.goto(`/#admin/content/${item.id}/edit`);
  const details = page.getByRole("button", { name: "Details", exact: true });
  await expect(details).toBeVisible();
  if ((await details.getAttribute("aria-expanded")) !== "true")
    await details.click();
  const category = page.locator("#writing-organization");
  await expect(category).toBeVisible();
  await category.getByRole("button").first().click();
  await page
    .getByRole("option", { name: "Empty update category", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await saved(page)).content.find((entry: any) => entry.id === item.id)
          .category,
    )
    .toBe("Empty update category");
  // Saving a draft category does not publish its changed placement.
  expect(
    (await saved(page)).publishedContent.find(
      (entry: any) => entry.id === item.id,
    ).category,
  ).toBe(item.category);
  await category.getByRole("button", { name: "Create category", exact: true }).click();
  const create = page.getByRole("dialog");
  await create.getByLabel("Category name", { exact: true }).fill("Editor-created category");
  await create.getByRole("button", { name: "Create category", exact: true }).click();
  await expect.poll(async () => (await saved(page)).content.find((entry: any) => entry.id === item.id).category).toBe("Editor-created category");
  expect((await saved(page)).settings.contentCategories.brief).toContain("Editor-created category");
  expect((await saved(page)).publishedContent.find((entry: any) => entry.id === item.id).category).toBe(item.category);
  await page.goto("/#admin/content/updates");
  await page
    .getByRole("button", { name: `Actions for ${item.title}`, exact: true })
    .click();
  await page
    .getByRole("menuitem", { name: "Move to category…", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox", { name: "Category", exact: true }).click();
  await expect(
    page.getByRole("option", { name: "Empty update category", exact: true }),
  ).toBeVisible();
});
