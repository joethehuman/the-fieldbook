import { expect, test, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { defaultSettings } from "../../lib/settings";
import {
  authoringUser,
  setupAuthoringProvider,
  syncAuthoringProvider,
} from "./provider-fixture";

async function section(page: Page, name: string) {
  const picker = page.getByRole("combobox", {
    name: "Administration section",
    exact: true,
  });
  if (await picker.isVisible()) {
    await picker.click();
    await page.getByRole("option", { name, exact: true }).click();
  } else {
    await page.getByRole("tab", { name, exact: true }).click();
  }
}

test("saved admin settings stop warning while unsaved edits still warn", async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  const production = info.project.name.startsWith("production");
  const data = freshWorkspace();
  let rejectSettings = false;
  let settingsRequests = 0;
  data.settings = {
    ...defaultSettings,
    ...data.settings,
    docSections: [],
  } as typeof data.settings;
  if (production) {
    await setupAuthoringProvider(page, data);
    await page.route("**/api/admin/snapshot?**", (route) =>
      route.fulfill({
        json: {
          data,
          user: authoringUser,
        },
      }),
    );
    await page.route("**/api/settings", (route) => {
      settingsRequests += 1;
      if (rejectSettings)
        return route.fulfill({
          status: 503,
          json: { error: "Save unavailable" },
        });
      const submitted = route.request().postDataJSON().settings;
      // PostgreSQL JSONB returns object keys in a different order than the form.
      data.settings = Object.fromEntries(
        Object.entries(submitted).sort(([a], [b]) => a.localeCompare(b)),
      ) as typeof data.settings;
      data.revision = (data.revision ?? 1) + 1;
      return route.fulfill({ json: { revision: data.revision } });
    });
    await page.route("**/api/governance", (route) => {
      data.curricula = route.request().postDataJSON().curricula;
      data.governanceRevision = (data.governanceRevision ?? 1) + 1;
      return route.fulfill({
        json: { governanceRevision: data.governanceRevision },
      });
    });
  } else {
    await page.addInitScript((workspace) => {
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    }, data);
  }

  await page.goto(production ? "/admin" : "/#admin");
  await expect(page.locator(".admin-layout")).toBeVisible();
  await section(page, "Docs navigation");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  await section(page, "Identity");
  await expect(
    page.getByRole("alertdialog", { name: "Confirm action" }),
  ).toHaveCount(0);

  const name = page.getByRole("textbox", { name: "Installation name" });
  await name.fill("Unsaved installation name");
  const menu = page.getByRole("button", { name: "Open navigation" });
  if ((page.viewportSize()?.width ?? 1000) < 768) await menu.click();
  await page
    .getByRole("navigation")
    .getByRole(production ? "link" : "button", { name: "Docs", exact: true })
    .click();
  const confirmation = page.getByRole("alertdialog", {
    name: "Confirm action",
  });
  await expect(confirmation).toContainText("Unsaved changes will be discarded");
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  const closeNav = page.getByRole("button", { name: "Close navigation" });
  if (await closeNav.isVisible()) await closeNav.click();
  await expect(name).toHaveValue("Unsaved installation name");
  await section(page, "Docs navigation");
  await expect(confirmation).toContainText("Unsaved changes will be discarded");
  if (info.project.name === "production-desktop")
    await page.screenshot({
      path: info.outputPath("unsaved-settings-dialog.png"),
    });
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await expect(name).toHaveValue("Unsaved installation name");
  if (production) {
    rejectSettings = true;
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.locator(".settings-panel")).toContainText(
      "Save unavailable",
    );
    await section(page, "Docs navigation");
    await expect(confirmation).toContainText(
      "Unsaved changes will be discarded",
    );
    await confirmation.getByRole("button", { name: "Cancel" }).click();
    rejectSettings = false;
    await page.getByRole("button", { name: "Save settings" }).click();
    await expect(page.locator(".settings-panel")).toContainText(
      "Refresh and review the saved copy before applying more changes",
    );
    expect(settingsRequests).toBe(2);
    await expect(name).toHaveValue("Unsaved installation name");

    // Failed writes require a fresh saved copy before another mutation.
    await syncAuthoringProvider(page, data);
    await page.getByRole("button", { name: "Discard changes" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Unsaved changes" }),
    ).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => history.state?.__fieldbookNavigation?.kind),
      )
      .toBe("base");
    await page.reload();
    await expect(page.locator(".admin-layout")).toBeVisible();
    await section(page, "Identity");
    await name.fill("Unsaved installation name");
    await Promise.all([
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === "/api/settings" &&
          response.request().method() === "POST" &&
          response.status() === 200,
      ),
      page.getByRole("button", { name: "Save settings" }).click(),
    ]);
  } else {
    await page.getByRole("button", { name: "Save settings" }).click();
  }
  await expect(page.getByText("Settings saved.")).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Unsaved changes" }),
  ).toHaveCount(0);
  await section(page, "Docs navigation");
  await expect(confirmation).toHaveCount(0);

  await section(page, "Curricula");
  await page.getByRole("button", { name: "Create curriculum" }).click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("New playlist");
  await section(page, "Identity");
  await expect(confirmation).toContainText(
    "Discard unsaved curriculum changes?",
  );
  await confirmation.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Save curriculum" }).click();
  await expect(page.getByText("Curriculum saved.")).toBeVisible();
  await section(page, "Identity");
  await expect(confirmation).toHaveCount(0);

  await section(page, "Privacy");
  await page.getByRole("combobox", { name: "Policy location" }).click();
  await page
    .getByRole("option", { name: "Link to an existing policy" })
    .click();
  await page
    .getByRole("textbox", { name: "Privacy policy URL" })
    .fill("https://example.com/privacy");
  await page.getByRole("button", { name: "Publish privacy policy" }).click();
  await confirmation.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Privacy policy published.")).toBeVisible();
  await section(page, "Identity");
  await expect(confirmation).toHaveCount(0);
});
