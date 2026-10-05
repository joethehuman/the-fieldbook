import { test, expect, type Page, type Locator } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { defaultSettings } from "../../lib/settings";
import { authoringUser, setupAuthoringProvider } from "./provider-fixture";

const failure =
  "Move this section's draft and published documents before deleting it. Reference: 00000000-0000-4000-8000-000000000099.";

async function setup(page: Page, production: boolean) {
  const data = freshWorkspace();
  data.content = [];
  data.publishedContent = [];
  data.settings = {
    ...defaultSettings,
    ...data.settings,
    docCategoryOrder: [],
    docSections: Array.from({ length: 30 }, (_, index) => ({
      id: `section-${index}`,
      name: `Section ${index + 1}`,
    })),
  };
  let reject = true;
  if (production) {
    await setupAuthoringProvider(page, data);
    const initial = await (
      await page.request.get("/api/admin/snapshot?scope=content")
    ).json();
    data.settings = initial.data.settings;
    data.revision = initial.data.revision;
    await page.route("**/api/admin/snapshot?**", (route) =>
      route.fulfill({ json: { data, user: authoringUser } }),
    );
    await page.route("**/api/settings", (route) => {
      if (reject)
        return route.fulfill({ status: 400, json: { error: failure } });
      data.settings = route.request().postDataJSON().settings;
      data.revision = (data.revision || 1) + 1;
      return route.fulfill({
        json: { revision: data.revision, settings: data.settings },
      });
    });
  } else {
    await page.addInitScript(
      ({ data, failure }) => {
        localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
        sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
        const original = Storage.prototype.setItem;
        Storage.prototype.setItem = function (key, value) {
          if (
            key === "fieldbook.workspace.v1" &&
            (window as any).__rejectDocsSave
          )
            throw new Error(failure);
          return original.call(this, key, value);
        };
      },
      { data, failure },
    );
  }
  await page.goto(
    production
      ? "/admin/settings/docs-navigation"
      : "/#admin/settings/docs-navigation",
  );
  await expect(
    page.getByRole("button", { name: "New section", exact: true }),
  ).toBeVisible();
  return async (value: boolean) => {
    reject = value;
    await page.evaluate((value) => {
      (window as any).__rejectDocsSave = value;
    }, value);
  };
}

async function scrollTop(page: Page) {
  return page.locator(".admin-panel").evaluate((el) => el.scrollTop);
}

async function sampleHeights(action: Locator, slot: string) {
  return action.evaluate(
    (button, slot) =>
      new Promise<number[]>((resolve) => {
        const region = document.querySelector(`[data-slot="${slot}"]`)!;
        const heights = [region.getBoundingClientRect().height];
        const start = performance.now();
        (button as HTMLElement).click();
        const sample = () => {
          heights.push(region.getBoundingClientRect().height);
          if (performance.now() - start < 800) requestAnimationFrame(sample);
          else resolve(heights);
        };
        requestAnimationFrame(sample);
      }),
    slot,
  );
}

test("Docs creation modal preserves scroll, validates names and reveals the created section and subsection", async ({
  page,
}, info) => {
  await setup(page, info.project.name.startsWith("production"));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const trigger = page.getByRole("button", {
    name: "New section",
    exact: true,
  });
  const before = await scrollTop(page);
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("textbox", { name: "New section name" }),
  ).toBeFocused();
  expect(await scrollTop(page)).toBe(before);
  await dialog
    .getByRole("textbox", { name: "New section name" })
    .fill("Section 1");
  await dialog
    .getByRole("button", { name: "Create section", exact: true })
    .click();
  await expect(dialog).toContainText(
    "Sections under the same parent need different names.",
  );
  expect(await scrollTop(page)).toBe(before);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  expect(await scrollTop(page)).toBe(before);

  await trigger.click();
  await dialog
    .getByRole("textbox", { name: "New section name" })
    .fill("New reference");
  await page.screenshot({ path: info.outputPath("new-section-modal.png") });
  await dialog
    .getByRole("textbox", { name: "New section name" })
    .press("Enter");
  await expect(dialog).toBeHidden();
  const created = page.locator('[data-slot="reorder-row"]').filter({
    has: page.getByRole("button", {
      name: "Actions for New reference",
      exact: true,
    }),
  });
  await expect(created).toBeInViewport();
  await expect(created).toBeFocused();
  expect(await scrollTop(page)).toBeGreaterThan(before + 500);
  await expect(page.getByText("Settings saved.", { exact: true })).toHaveCount(
    0,
  );

  const parent = page.getByRole("button", {
    name: "Actions for Section 12",
    exact: true,
  });
  await parent.click();
  const underBefore = await scrollTop(page);
  await page
    .getByRole("menuitem", { name: "Add subsection", exact: true })
    .click();
  await expect(dialog).toHaveAccessibleName("New subsection");
  expect(await scrollTop(page)).toBe(underBefore);
  await expect(
    dialog.getByRole("combobox", { name: "Top-level parent" }),
  ).toContainText("Section 12");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(parent).toBeFocused();
  expect(await scrollTop(page)).toBe(underBefore);
  await parent.click();
  await page
    .getByRole("menuitem", { name: "Add subsection", exact: true })
    .click();
  await dialog
    .getByRole("textbox", { name: "New section name" })
    .fill("Child reference");
  await dialog
    .getByRole("button", { name: "Create section", exact: true })
    .click();
  const child = page.locator('[data-slot="reorder-row"]').filter({
    has: page.getByRole("button", {
      name: "Actions for Section 12 → Child reference",
      exact: true,
    }),
  });
  await expect(child).toBeInViewport();
  await expect(child).toBeFocused();
  await expect(
    page.getByRole("button", { name: "Collapse Section 12", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("created-subsection.png") });
});

test("Docs save errors expand smoothly beside sticky actions, preserve alignment and clear on retry", async ({
  page,
}, info) => {
  const reject = await setup(page, info.project.name.startsWith("production"));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page
    .getByRole("button", { name: "Actions for Section 1", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Move down", exact: true }).click();
  const bar = page.locator('[data-slot="pending-changes-bar"]');
  await expect(bar).toHaveCSS("opacity", "1");
  await page.locator(".admin-panel").evaluate((el) => {
    el.scrollTop = el.scrollHeight / 2;
  });
  const before = await scrollTop(page);
  await reject(true);
  const opening = await sampleHeights(
    bar.getByRole("button", { name: "Save settings", exact: true }),
    "pending-changes-feedback",
  );
  const alert = bar.getByRole("alert");
  await expect(alert).toContainText(
    "Move this section's draft and published documents",
  );
  await expect(alert).toBeInViewport();
  await expect(alert).toBeFocused();
  await expect(page.locator(".settings-panel").getByRole("alert")).toHaveCount(
    1,
  );
  expect(opening[0]).toBe(0);
  expect(opening.some((h) => h > 1 && h < opening.at(-1)! - 1)).toBe(true);
  expect(Math.abs((await scrollTop(page)) - before)).toBeLessThan(3);
  const edges = await bar.evaluate((el) => {
    const bar = el.getBoundingClientRect();
    const editor = document
      .getElementById("settings-docs")!
      .getBoundingClientRect();
    return {
      left: bar.left - editor.left,
      right: bar.right - editor.right,
      overflow: el.scrollWidth - el.clientWidth,
    };
  });
  expect(edges.left).toBe(0);
  expect(edges.right).toBe(0);
  expect(edges.overflow).toBe(0);
  await page.screenshot({ path: info.outputPath("sticky-save-error.png") });
  await reject(false);
  const closing = await sampleHeights(
    bar.getByRole("button", { name: "Save settings", exact: true }),
    "pending-changes-feedback",
  );
  expect(closing.at(-1)).toBe(0);
  expect(closing.some((h) => h > 1 && h < closing[0] - 1)).toBe(true);
  await expect(bar).toBeHidden();
  await expect(page.locator(".settings-panel").getByRole("alert")).toHaveCount(
    0,
  );
  await expect(
    page.getByText("Settings saved.", { exact: true }),
  ).toBeVisible();
});
