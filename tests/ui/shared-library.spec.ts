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
  await expect(
    region.getByRole("progressbar", {
      name: "People up to date example",
      exact: true,
    }),
  ).toHaveAttribute("aria-valuetext", "64% up to date");
  await expect(
    region.getByRole("img", {
      name: "No assigned people example: no assigned courses",
      exact: true,
    }),
  ).not.toHaveAttribute("aria-valuenow");
  const status = region.getByRole("button", { name: "Overdue 6", exact: true });
  await status.click();
  await expect(status).toHaveAttribute("aria-pressed", "true");
  await status.click();
  await expect(status).toHaveAttribute("aria-pressed", "false");
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
      .getByRole("status")
      .filter({ hasText: "Loading example…" })
      .locator("svg")
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
  await expect(onboardingDays).toBeEnabled();
  await expect(catchUpDays).toBeEnabled();
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
  const editor = page.getByRole("region", {
    name: "Privacy policy draft editor",
  });
  const commands = editor.getByRole("button", { name: /^Commands:/ });
  const menu = page.getByRole("menu", { name: /^Insert content/ });
  await commands.scrollIntoViewIfNeeded();
  await commands.focus();
  await page.keyboard.press("Enter");
  await expect(
    menu.getByRole("menuitem", { name: "Normal Text", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    menu.getByRole("menuitem", { name: "Heading 1", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(commands).toBeFocused();
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

test("reporting overview fits enlarged text without clipping controls", async ({
  page,
}) => {
  await page.goto("/ui#shared-library");
  const overview = page.locator('[data-slot="progress-overview"]');
  await expect(overview).toBeVisible();
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  await overview.scrollIntoViewIfNeeded();
  expect(
    await overview.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return (
        box.right <= innerWidth + 1 && el.scrollWidth <= el.clientWidth + 1
      );
    }),
  ).toBe(true);
  const overdue = overview.getByRole("button", {
    name: "Overdue 6",
    exact: true,
  });
  await overdue.focus();
  await page.keyboard.press("Enter");
  await expect(overdue).toHaveAttribute("aria-pressed", "true");
});

test("animated filter rows wrap, stay left-aligned and clear without an empty spacer", async ({
  page,
}, info) => {
  await page.goto("/ui#catalog-filter-rows");
  const example = page.locator("#catalog-filter-rows");
  const row = example.locator('[data-slot="collection-applied-filters"]');
  const search = example.getByRole("textbox", {
    name: "Find example items",
    exact: true,
  });
  const results = example.getByRole("heading", {
    name: "Example results",
    exact: true,
  });
  await expect.poll(async () => (await row.boundingBox())!.height).toBe(0);
  const baseline =
    (await results.boundingBox())!.y - (await search.boundingBox())!.y;
  await example
    .getByRole("button", { name: "Add example filters", exact: true })
    .click();
  const chips = row.getByRole("button", { name: /^Remove Example filter/ });
  await expect(chips).toHaveCount(15);
  await expect
    .poll(async () => (await row.boundingBox())!.height)
    .toBeGreaterThan(52);
  await expect
    .poll(
      async () =>
        (await row.boundingBox())!.height -
        (await row
          .locator(":scope > div")
          .evaluate((el) => el.getBoundingClientRect().height)),
    )
    .toBe(0);
  const first = chips.first();
  expect(
    Math.abs((await first.boundingBox())!.x - (await search.boundingBox())!.x),
  ).toBeLessThanOrEqual(1);
  await first.focus();
  expect(
    await first.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const frame = el
        .closest('[data-slot="collection-applied-filters"]')!
        .getBoundingClientRect();
      return (
        box.left - 4 >= frame.left - 0.5 &&
        box.top - 4 >= frame.top - 0.5 &&
        box.bottom + 4 <= frame.bottom + 0.5
      );
    }),
  ).toBe(true);
  await page.screenshot({ path: info.outputPath("wrapping-filter-rows.png") });
  await first.click();
  await expect(chips).toHaveCount(14);
  await expect(
    row.getByRole("button", {
      name: "Remove Example filter 2 filter",
      exact: true,
    }),
  ).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await row.evaluate((el) => getComputedStyle(el).transitionProperty),
  ).toBe("none");
  await example.getByRole("button", { name: "Clear all", exact: true }).click();
  await expect.poll(async () => (await row.boundingBox())!.height).toBe(0);
  expect(
    Math.abs(
      (await results.boundingBox())!.y -
        (await search.boundingBox())!.y -
        baseline,
    ),
  ).toBeLessThanOrEqual(1);
});

test("grouped search loads more, searches locally, and preserves keyboard editing and focus", async ({
  page,
}, info) => {
  await page.goto("/ui#catalog-progress");
  const search = page.getByRole("combobox", {
    name: "Search teams or people",
    exact: true,
  });
  await search.click();
  const people = page
    .getByRole("listbox", { name: "Search results", exact: true })
    .getByRole("group", { name: "People", exact: true });
  await expect(people.getByRole("option")).toHaveCount(6);
  await page.screenshot({
    path: info.outputPath("grouped-search-results.png"),
  });
  await page
    .getByRole("button", { name: "More people (14)", exact: true })
    .click();
  await expect(people.getByRole("option")).toHaveCount(12);
  await search.fill("Example person 10");
  await expect(people.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Home");
  await page.keyboard.press("End");
  expect(
    await search.evaluate((input: HTMLInputElement) => input.selectionStart),
  ).toBe("Example person 10".length);
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("listbox", { name: "Search results", exact: true }),
  ).not.toBeVisible();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("");
});

test("shared scroll edges fade only hidden content at either end", async ({
  page,
}, info) => {
  await page.goto("/ui#catalog-scroll-region");
  const scroll = page.getByLabel("Scroll edge example", { exact: true });
  await scroll.scrollIntoViewIfNeeded();
  await expect(scroll).toHaveAttribute("data-scroll-fade-before", "false");
  await expect(scroll).toHaveAttribute("data-scroll-fade-after", "true");
  expect(
    await scroll.evaluate((el) => getComputedStyle(el).maskImage),
  ).not.toBe("none");
  await scroll.evaluate((el) => (el.scrollTop = el.scrollHeight / 2));
  await expect(scroll).toHaveAttribute("data-scroll-fade-before", "true");
  await page.screenshot({ path: info.outputPath("scroll-region-middle.png") });
  await scroll.evaluate((el) => (el.scrollTop = el.scrollHeight));
  await expect(scroll).toHaveAttribute("data-scroll-fade-before", "true");
  await expect(scroll).toHaveAttribute("data-scroll-fade-after", "false");
  await scroll.evaluate((el) => (el.scrollTop = 0));
  await expect(scroll).toHaveAttribute("data-scroll-fade-before", "false");
});
