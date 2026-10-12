import { expect, test } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { withPublishedSnapshots } from "../../lib/demo-publication";

const sections = [
  ["content", "Content"],
  ["curricula", "Curricula"],
  ["feedback", "Feedback"],
  ["people", "Demo profiles"],
  ["teams", "Teams"],
  ["groups", "Groups"],
  ["progress", "Progress"],
  ["settings/identity", "Identity"],
  ["settings/access", "Access"],
  ["settings/categories", "Categories"],
  ["settings/docs-navigation", "Docs navigation"],
  ["settings/external-links", "External links"],
  ["settings/due-dates", "Due dates"],
  ["settings/ask-ai", "Ask AI"],
  ["settings/mcp", "MCP"],
  ["settings/privacy", "Privacy"],
  ["settings/recently-deleted", "Recently deleted"],
] as const;

for (const width of [320, 390, 430]) {
  test(`admin collections, settings and detail forms fit ${width}px with touch`, async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext({
      baseURL,
      viewport: { width, height: 900 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const data = withPublishedSnapshots(freshWorkspace());
    await context.addInitScript((workspace) => {
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
    }, data);
    for (const [route, name] of sections) {
      await page.goto(`/#admin/${route}`);
      await expect(
        page.getByRole("heading", { name, exact: true }),
      ).toBeVisible({ timeout: 15_000 });
      const panel = page.locator(".admin-panel");
      expect(
        await panel.evaluate(
          (element) => element.scrollWidth - element.clientWidth,
        ),
        route,
      ).toBeLessThanOrEqual(1);
      const controls = panel
        .locator('[data-slot="collection-controls"]')
        .first();
      if (await controls.isVisible()) {
        const search = await controls
          .locator('[data-slot="collection-search"] [data-slot="input"]')
          .first()
          .boundingBox();
        const band = await controls.boundingBox();
        expect(search!.width, `${route} search`).toBeGreaterThanOrEqual(
          band!.width - 2,
        );
      }
    }
    for (const route of [
      "people/new/person",
      "curricula/new/curriculum",
      `teams/${data.teams!.find((team) => !team.system)!.id}/members`,
      `groups/${data.groups[0].id}/people`,
      `progress/people/${data.users[0].id}`,
    ]) {
      await page.goto(`/#admin/${route}`);
      await expect(page.locator(".admin-panel")).toBeVisible();
      expect(
        await page
          .locator(".admin-panel")
          .evaluate((element) => element.scrollWidth - element.clientWidth),
        route,
      ).toBeLessThanOrEqual(1);
    }
    expect(errors).toEqual([]);
    await context.close();
  });
}

test("phone hierarchy aligns controls with titles and counts with row menus; portals retain touch sizing", async ({
  browser,
  baseURL,
}) => {
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 320, height: 900 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await context.addInitScript(() =>
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin"),
  );
  await page.goto("/#admin/settings/categories");
  for (const route of ["categories", "docs-navigation"]) {
    await page.goto(`/#admin/settings/${route}`);
    const row = page.locator('[data-slot="reorder-row"]').first();
    await expect(row).toBeVisible();
    const title = (await row
      .locator('[data-slot="reorder-title"]')
      .boundingBox())!;
    const detail = (await row
      .locator('[data-slot="reorder-detail"]')
      .boundingBox())!;
    const actions = (await row
      .locator('[data-slot="reorder-actions"]')
      .boundingBox())!;
    expect(detail.y).toBeGreaterThanOrEqual(title.y + title.height);
    expect(detail.x).toBe(title.x);
    expect(
      Math.abs(detail.y + detail.height / 2 - actions.y - actions.height / 2),
    ).toBeLessThan(1);
    for (const control of await row
      .locator(
        '[data-slot="reorder-heading"] > div:first-child button, [data-slot="reorder-selection"], [data-slot="reorder-icon"]',
      )
      .all()) {
      const box = (await control.boundingBox())!;
      expect(
        Math.abs(box.y + box.height / 2 - title.y - title.height / 2),
      ).toBeLessThan(1);
    }
    expect(
      await row.evaluate(
        (element) => element.scrollWidth - element.clientWidth,
      ),
    ).toBe(0);
  }
  await page.goto("/#admin/settings/categories");
  const create = page.getByRole("button", {
    name: "Create category",
    exact: true,
  });
  expect((await create.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await create.click();
  const cancel = page
    .getByRole("dialog")
    .getByRole("button", { name: "Cancel", exact: true });
  expect((await cancel.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await cancel.click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.goto("/#admin/content");
  await page.getByRole("button", { name: "Content", exact: true }).click();
  for (const name of ["Doc", "Update", "Course"]) {
    const item = page.getByRole("menuitem", { name, exact: true });
    expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await page.keyboard.press("Escape");
  await context.close();
});

test("demo models start selected without validation or unsaved changes, including older empty settings", async ({
  page,
}) => {
  const data = freshWorkspace();
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    if (!localStorage.getItem("fieldbook.workspace.v1"))
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/admin/ask-ai"))
      requests.push(request.url());
  });
  await page.goto("/#admin/settings/ask-ai");
  const primary = page.getByRole("combobox", {
    name: "Primary model",
    exact: true,
  });
  await expect(primary).toContainText("Gavin’s XL MAXIMUS Demo");
  await expect(primary).not.toHaveAttribute("aria-invalid", "true");
  await expect(
    page.getByText("Choose a primary model to enable AI."),
  ).toHaveCount(0);
  await expect(page.getByText("Unsaved changes", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Save settings", exact: true }),
  ).toBeDisabled();
  await primary.click();
  await page
    .getByRole("option", { name: "Gavin’s XL MAXIMUS Demo", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Fallback model", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Example backup model", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await page.reload();
  await expect(primary).toContainText("Gavin’s XL MAXIMUS Demo");
  await expect(
    page.getByRole("combobox", { name: "Fallback model", exact: true }),
  ).toContainText("Example backup model");
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!);
    data.settings.askAi.model = "";
    data.settings.askAi.router = undefined;
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
  });
  await page.reload();
  await expect(primary).toContainText("Gavin’s XL MAXIMUS Demo");
  await expect(page.getByText("Unsaved changes", { exact: true })).toHaveCount(
    0,
  );
  expect(requests).toEqual([]);
});

test("field validation and its dismiss button share a vertical center without clearing invalid state", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin"),
  );
  await page.goto("/#admin/settings/identity");
  await page.emulateMedia({ reducedMotion: "reduce" });
  const name = page.getByRole("textbox", {
    name: "Installation name",
    exact: true,
  });
  await name.fill("");
  await page.keyboard.press("Tab");
  await expect(name).toHaveAttribute("aria-invalid", "true");
  const error = page
    .locator('[data-slot="field-error"]')
    .filter({ hasText: "Installation name is required." });
  const message = (await error.locator(":scope > span").boundingBox())!;
  const close = error.getByRole("button", {
    name: "Dismiss message",
    exact: true,
  });
  const box = (await close.boundingBox())!;
  expect(
    Math.abs(message.y + message.height / 2 - box.y - box.height / 2),
  ).toBeLessThan(1);
  expect(message.x + message.width).toBeLessThanOrEqual(box.x);
  await close.click();
  await expect(error).toHaveCount(0);
  await expect(name).toHaveAttribute("aria-invalid", "true");
  expect(
    await name.evaluate(
      (element) => (element as HTMLInputElement).validity.valueMissing,
    ),
  ).toBe(true);
});

test("phone Teams selection is immediately available and still requires two teams for bulk actions", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "phone",
    "Desktop retains the chart selection toggle.",
  );
  await page.addInitScript(() =>
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin"),
  );
  await page.goto("/#admin/teams");
  const table = page.locator('table[data-layout="teamDirectory"]');
  await expect(table).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Select multiple", exact: true }),
  ).toHaveCount(0);
  const bulk = page.getByRole("button", { name: "Bulk actions", exact: true });
  await expect(bulk).toBeDisabled();
  const choices = table.locator("tbody").getByRole("checkbox");
  await choices.nth(0).check();
  await expect(bulk).toBeDisabled();
  await choices.nth(1).check();
  await expect(bulk).toBeEnabled();
  await bulk.click();
  await expect(
    page.getByRole("menuitem", { name: "Delete selected teams", exact: true }),
  ).toBeVisible();
});
