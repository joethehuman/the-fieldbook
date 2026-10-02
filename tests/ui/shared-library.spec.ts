import { test, expect, type Page } from "@playwright/test";
async function fits(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}
async function section(page: Page, name: string) {
  const picker = page.getByRole("combobox", {
    name: "Administration section",
    exact: true,
  });
  if (await picker.isVisible()) {
    await picker.click();
    await page.getByRole("option", { name, exact: true }).click();
    await expect(picker).toBeFocused();
  } else await page.getByRole("tab", { name, exact: true }).click();
}

test("library: associated help, selections, choice keys, tooltip, menu and progress semantics", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/ui#shared-library");
  const region = page.getByRole("region", {
    name: "Shared library states",
    exact: true,
  });
  const settings = region.locator("#catalog-settings");
  await expect(
    settings.getByRole("group", { name: "Fields and choices", exact: true }),
  ).toHaveAccessibleDescription(/Keep persistent guidance/);
  await expect(settings.locator('[data-slot="card-footer"]')).toContainText(
    "Use a switch for immediate",
  );
  await expect(
    region.getByRole("checkbox", { name: "Some choices selected" }),
  ).toHaveAttribute("aria-checked", "mixed");
  const select = region.getByRole("combobox", {
    name: "Long selection",
    exact: true,
  });
  await expect(select).toHaveAccessibleDescription(
    "Selected labels wrap; arrow keys and typeahead remain available.",
  );
  await region.getByText("Long selection", { exact: true }).click();
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(select).toBeFocused();
  await page.keyboard.press("Space");
  await expect(
    page.getByRole("option", {
      name: "Customer experience and technical enablement across all regions",
    }),
  ).toBeFocused();
  await page.keyboard.press("Home");
  await expect(
    page.getByRole("option", { name: "Short label", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(select).toHaveText("Short label");
  await select.click();
  await page
    .getByRole("option", {
      name: "Customer experience and technical enablement across all regions",
    })
    .click();
  await expect(
    region.getByRole("combobox", { name: "Disabled selection" }),
  ).toBeDisabled();
  const invalid = region.getByRole("textbox", {
    name: "Invalid description",
    exact: true,
  });
  await expect(invalid).toHaveAttribute("aria-invalid", "true");
  await expect(invalid).toHaveAccessibleDescription(
    "Required before publishing. Enter a description.",
  );
  await invalid.focus();
  expect(
    await invalid.evaluate((el) => getComputedStyle(el).boxShadow),
  ).not.toBe("none");
  await select.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("library-fields.png") });
  const radio = region.getByRole("radio", {
    name: "First option",
    exact: true,
  });
  await radio.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    region.getByRole("radio", { name: /Second option/ }),
  ).toBeChecked();
  const toggle = region.getByRole("switch", { name: "Hide completed example" });
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(toggle).toBeChecked();
  const tip = region.getByRole("button", { name: "Example settings" });
  await tip.scrollIntoViewIfNeeded();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await tip.focus();
  await expect(page.getByRole("tooltip")).toHaveText("Open example settings");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(tip).toBeFocused();
  await tip.hover();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.screenshot({ path: info.outputPath("library-tooltip.png") });
  await page.keyboard.press("Escape");
  const menu = region.getByRole("button", { name: "Example actions" });
  await menu.focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "Rename", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("menuitem", { name: "Archive example" }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  const ring = region.getByRole("progressbar", { name: "Assigned example" });
  await expect(ring).toHaveAttribute("aria-valuenow", "67");
  await expect(ring).toHaveAttribute("aria-valuetext", "67% complete");
  await ring.scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("library-progress.png") });
  await region.getByRole("button", { name: "Load more" }).click();
  await expect(region.getByText("Showing 20 of 30 examples.")).toBeVisible();
  await region.getByRole("button", { name: "Load more" }).click();
  await expect(region.getByRole("button", { name: "Load more" })).toHaveCount(
    0,
  );
  await page.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
  expect(
    await region
      .locator('[role="status"] svg')
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await fits(page);
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  await fits(page);
  expect(errors).toEqual([]);
});

test("product settings: connected help, editor hints and enlarged navigation", async ({
  page,
}, info) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin"),
  );
  await page.goto("/#admin");
  // Navigation is rendered with the lazy Administration bundle.
  await expect(page.locator(".admin-layout")).toBeVisible();
  const picker = page.getByRole("combobox", {
    name: "Administration section",
    exact: true,
  });
  const nav = page.getByRole("tablist", {
    name: "Administration section",
    exact: true,
  });
  if (await picker.isVisible()) await expect(nav).toBeHidden();
  else await expect(nav).toBeVisible();
  await section(page, "Due dates");
  const useDueDates = page.getByRole("switch", { name: "Use due dates" });
  const onboardingDays = page.getByRole("spinbutton", {
    name: "New user onboarding window (days)",
  });
  const catchUpDays = page.getByRole("spinbutton", {
    name: "Ongoing catch-up window (days)",
  });
  await expect(onboardingDays).toHaveAccessibleDescription(
    /Defaults apply to future onboarding clocks and assignment episodes/,
  );
  await useDueDates.uncheck();
  await expect(onboardingDays).toBeDisabled();
  await expect(catchUpDays).toBeDisabled();
  await page.screenshot({
    path: info.outputPath("settings-due-dates-off.png"),
    fullPage: true,
  });
  await useDueDates.check();
  await expect(onboardingDays).toBeEnabled();
  await expect(catchUpDays).toBeEnabled();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("settings-window.png"),
    fullPage: true,
  });
  await section(page, "Privacy");
  await expect(
    page.getByRole("textbox", { name: "Contact page URL (optional)" }),
  ).toHaveAccessibleDescription(
    "An HTTPS contact page can keep your email address private.",
  );
  const bold = page.getByRole("button", { name: "Bold", exact: true });
  const heading = page.getByRole("combobox", { name: "Heading level" });
  await heading.scrollIntoViewIfNeeded();
  // At tablet widths the toolbar wraps. Reveal the destination button too,
  // so native Tab scrolling does not immediately dismiss its focus tooltip.
  await bold.scrollIntoViewIfNeeded();
  // Let native scroll notifications finish before opening a focus tooltip:
  // Radix intentionally dismisses tooltips when an ancestor scrolls.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await heading.focus();
  await page.keyboard.press("Tab");
  await expect(bold).toBeFocused();
  await expect(page.getByRole("tooltip")).toHaveText("Bold");
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("settings-privacy.png"),
    fullPage: true,
  });
  await section(page, "Identity");
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  await fits(page);
  await expect(
    page.getByRole("combobox", { name: "Administration section" }),
  ).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("settings-enlarged.png"),
    fullPage: true,
  });
});
