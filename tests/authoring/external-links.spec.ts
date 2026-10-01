import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import {
  setupAuthoringProvider,
  syncAuthoringProvider,
  authoringUser,
} from "./provider-fixture";

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
async function accountMenu(page: Page) {
  const trigger = page.getByRole("button", {
    name: "Account menu",
    exact: true,
  });
  if (!(await trigger.isVisible()))
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await trigger.click();
}

test("external links: empty state, limit, validation, reorder, recovery and saved menu", async ({
  page,
}, info) => {
  const production = info.project.name.startsWith("production");
  const data = freshWorkspace();
  data.settings!.externalLinks = [];
  data.revision = 1;
  data.governanceRevision = 400;
  let rejectSave = false;
  let writes = 0;
  if (production) {
    await setupAuthoringProvider(page, data);
    await page.route("**/api/admin/snapshot?**", (route) =>
      route.fulfill({ json: { data, user: authoringUser } }),
    );
    await page.route("**/api/settings", async (route) => {
      writes++;
      if (rejectSave)
        return route.fulfill({
          status: 503,
          json: { error: "Save unavailable" },
        });
      data.settings = route.request().postDataJSON().settings;
      data.revision!++;
      await syncAuthoringProvider(page, data);
      await route.fulfill({ json: { revision: data.revision } });
    });
  } else {
    await page.addInitScript((workspace) => {
      if (!localStorage.getItem("fieldbook.workspace.v1"))
        localStorage.setItem(
          "fieldbook.workspace.v1",
          JSON.stringify(workspace),
        );
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    }, data);
  }
  await page.goto(production ? "/admin" : "/#admin");
  await expect(page.locator(".admin-layout")).toBeVisible();
  await accountMenu(page);
  await expect(
    page.getByRole("group", { name: "Links", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  if ((page.viewportSize()?.width || 0) < 768)
    await page.getByRole("button", { name: "Close navigation" }).click();
  await section(page, "External links");
  const settings = page.locator("#settings-links");
  await expect(settings).toContainText("Tip: use short, clear labels");
  await expect(settings).toContainText("0 of 3 links");
  const labels = ["Product docs", "Learning portal", "Company website"];
  for (let index = 0; index < 3; index++) {
    await settings
      .getByRole("button", { name: "Add link", exact: true })
      .click();
    const row = settings.getByRole("region", {
      name: `Link ${index + 1}`,
      exact: true,
    });
    await expect(
      row.getByRole("textbox", { name: "Label", exact: true }),
    ).toBeFocused();
    await row
      .getByRole("textbox", { name: "Label", exact: true })
      .fill(labels[index]);
    await row
      .getByRole("textbox", { name: "URL", exact: true })
      .fill(`https://example.test/${index + 1}`);
  }
  await expect(
    settings.getByRole("button", { name: "Add link", exact: true }),
  ).toBeDisabled();
  await expect(settings).toContainText("3 of 3 links — limit reached");
  const firstUrl = settings
    .getByRole("textbox", { name: "URL", exact: true })
    .first();
  await firstUrl.fill("javascript:alert(1)");
  await settings.getByRole("button", { name: "Save settings" }).click();
  await expect(firstUrl).toHaveAttribute("aria-invalid", "true");
  await expect(firstUrl).toHaveAccessibleDescription(/Use a full http/);
  expect(writes).toBe(0);
  await firstUrl.fill("https://example.test/1");
  await settings
    .getByRole("button", { name: "Move Company website up" })
    .click();
  await expect
    .poll(() =>
      settings
        .getByRole("textbox", { name: "Label", exact: true })
        .evaluateAll((elements) =>
          elements.map((element) => (element as HTMLInputElement).value),
        ),
    )
    .toEqual(["Product docs", "Company website", "Learning portal"]);
  await settings
    .getByRole("button", { name: "Remove Learning portal" })
    .click();
  await expect(
    settings.getByRole("button", { name: "Add link", exact: true }),
  ).toBeEnabled();
  await settings.getByRole("button", { name: "Add link", exact: true }).click();
  const last = settings.getByRole("region", { name: "Link 3", exact: true });
  await last
    .getByRole("textbox", { name: "Label", exact: true })
    .fill("Learning portal");
  await last
    .getByRole("textbox", { name: "URL", exact: true })
    .fill("https://example.test/2");
  await section(page, "Identity");
  const confirm = page.getByRole("alertdialog", { name: "Confirm action" });
  await expect(confirm).toContainText("Unsaved changes will be discarded");
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    settings.getByRole("textbox", { name: "Label", exact: true }),
  ).toHaveCount(3);
  if (production) {
    rejectSave = true;
    await settings.getByRole("button", { name: "Save settings" }).click();
    await expect(
      page.getByText(/0 of 1 changes confirmed saved. Save unavailable/),
    ).toBeVisible();
    await expect(
      last.getByRole("textbox", { name: "Label", exact: true }),
    ).toHaveValue("Learning portal");
    rejectSave = false;
    await settings.getByRole("button", { name: "Save settings" }).click();
    await expect(
      page.getByText(
        /Refresh and review the saved copy before applying more changes/,
      ),
    ).toBeVisible();
    expect(writes).toBe(1);
    page.once("dialog", (dialog) => dialog.accept());
    await page.reload();
    await section(page, "External links");
    await expect(
      settings.getByRole("textbox", { name: "Label", exact: true }),
    ).toHaveCount(0);
    for (const [label, url] of [
      ["Product docs", "https://example.test/1"],
      ["Company website", "https://example.test/3"],
      ["Learning portal", "https://example.test/2"],
    ]) {
      await settings
        .getByRole("button", { name: "Add link", exact: true })
        .click();
      await settings
        .getByRole("textbox", { name: "Label", exact: true })
        .last()
        .fill(label);
      await settings
        .getByRole("textbox", { name: "URL", exact: true })
        .last()
        .fill(url);
    }
  }
  await settings.getByRole("button", { name: "Save settings" }).click();
  await expect(
    page.getByText("Settings saved.", { exact: true }),
  ).toBeVisible();
  await expect(
    settings.getByText("Unsaved changes", { exact: true }),
  ).toHaveCount(0);
  await page.locator(".admin-panel").evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({
    path: info.outputPath("external-links-settings.png"),
    fullPage: true,
  });
  await page.reload();
  await section(page, "External links");
  await expect
    .poll(() =>
      settings
        .getByRole("textbox", { name: "Label", exact: true })
        .evaluateAll((elements) =>
          elements.map((element) => (element as HTMLInputElement).value),
        ),
    )
    .toEqual(["Product docs", "Company website", "Learning portal"]);
  await accountMenu(page);
  const links = page.getByRole("group", { name: "Links", exact: true });
  await expect(links.getByRole("menuitem")).toHaveCount(3);
  const anchors = await links.locator("a").evaluateAll((elements) =>
    elements.map((element) => ({
      text: element.textContent,
      target: element.getAttribute("target"),
      rel: element.getAttribute("rel"),
      arrow: !!element.querySelector("svg.lucide-arrow-up-right"),
    })),
  );
  expect(anchors.map((link) => link.text?.split(" (opens")[0])).toEqual([
    "Product docs",
    "Company website",
    "Learning portal",
  ]);
  for (const link of anchors) {
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
    expect(link.arrow).toBe(true);
  }
  await page.screenshot({ path: info.outputPath("external-links-menu.png") });
  await page.keyboard.press("Escape");
  if ((page.viewportSize()?.width || 0) < 768)
    await page.getByRole("button", { name: "Close navigation" }).click();
  await settings
    .getByRole("button", { name: "Remove Company website" })
    .click();
  await settings.getByRole("button", { name: "Discard changes" }).click();
  await expect(
    settings.getByRole("textbox", { name: "Label", exact: true }),
  ).toHaveCount(3);
  for (const label of ["Product docs", "Company website", "Learning portal"])
    await settings
      .getByRole("button", { name: `Remove ${label}`, exact: true })
      .click();
  await settings.getByRole("button", { name: "Save settings" }).click();
  await expect(
    page.getByText("Settings saved.", { exact: true }),
  ).toBeVisible();
  await accountMenu(page);
  await expect(
    page.getByRole("group", { name: "Links", exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
