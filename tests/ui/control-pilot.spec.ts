import { test, expect } from "@playwright/test";

test("control pilot: label associations, native validation, loading and focus", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ui#control-pilot");
  const pilot = page.getByRole("region", { name: "Control pilot" });
  const button = pilot
    .getByRole("button", { name: "Default", exact: true })
    .first();
  await button.focus();
  await expect(button).toBeFocused();
  expect(
    await button.evaluate((el) => getComputedStyle(el).boxShadow),
  ).not.toBe("none");
  const normal = await button.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  await button.hover();
  await expect
    .poll(() => button.evaluate((el) => getComputedStyle(el).backgroundColor))
    .not.toBe(normal);
  await page.screenshot({
    path: info.outputPath("buttons-focus-hover.png"),
    fullPage: false,
  });
  for (const loading of await pilot
    .getByRole("button", { name: "Loading", exact: true })
    .all()) {
    await expect(loading).toBeDisabled();
    await expect(loading).toHaveAttribute("aria-busy", "true");
  }
  for (const variant of [
    "default",
    "outline",
    "ghost",
    "destructive",
    "link",
  ]) {
    const row = pilot.locator(`[aria-label="${variant} buttons"]`);
    const regular = row.getByRole("button", { name: "Default", exact: true });
    const compact = row.getByRole("button", { name: "Compact", exact: true });
    // Semantic typography must not replace the variant's foreground color.
    expect(await compact.evaluate((el) => getComputedStyle(el).color)).toBe(
      await regular.evaluate((el) => getComputedStyle(el).color),
    );
    if (variant !== "link") {
      const icon = row.getByRole("button", {
        name: `${variant} settings`,
        exact: true,
      });
      expect((await icon.boundingBox())!.width).toBe(36);
      expect((await compact.boundingBox())!.height).toBe(32);
    }
  }
  const empty = page.getByRole("textbox", { name: "Empty input", exact: true });
  await expect(empty).toHaveAccessibleDescription(
    "Use a name your learners recognize.",
  );
  await page.getByText("Empty input", { exact: true }).click();
  await expect(empty).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("textbox", { name: "Filled input", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("textbox", { name: "Read-only input", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  const invalid = page.getByRole("textbox", {
    name: "Invalid input",
    exact: true,
  });
  await expect(invalid).toBeFocused();
  await expect(invalid).toHaveAccessibleDescription(
    "Installation name is required.",
  );
  await page.screenshot({ path: info.outputPath("inputs-focus.png") });
  const name = page.getByRole("textbox", {
    name: "Example installation name",
    exact: true,
  });
  await name.focus();
  await page.keyboard.press("Tab");
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await page.getByRole("button", { name: "Save example", exact: true }).click();
  await expect(name).toBeFocused();
  await name.fill("Example Academy");
  await expect(name).not.toHaveAttribute("aria-invalid", "true");
  const save = page.getByRole("button", { name: "Save example", exact: true });
  const before = await save.boundingBox();
  await save.click();
  await expect(save).toBeDisabled();
  await expect(save).toHaveAttribute("aria-busy", "true");
  expect((await save.boundingBox())!.width).toBe(before!.width);
  await page.screenshot({ path: info.outputPath("loading.png") });
  await expect(pilot.getByRole("status")).toHaveText(
    "Example saved. No installation settings changed.",
  );
  await expect(save).toBeEnabled();
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(
    await pilot
      .locator('[aria-busy="true"] svg')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});

test("branding pilot: validation, save, retained identity and responsive layout", async ({
  page,
}, info) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin"),
  );
  await page.goto("/#admin");
  // Navigation is rendered with the lazy Administration bundle.
  await expect(
    page.getByRole("heading", { name: "Administration", exact: true }),
  ).toBeVisible();
  const picker = page.getByRole("combobox", {
    name: "Administration section",
    exact: true,
  });
  if (await picker.isVisible()) {
    await picker.click();
    await page.getByRole("option", { name: "Identity", exact: true }).click();
  } else await page.getByRole("tab", { name: "Identity", exact: true }).click();
  await expect(page.getByText("Organization logo")).toHaveCount(0);
  await expect(
    page.getByText("YOUR ORGANIZATION", { exact: true }),
  ).toHaveCount(0);
  const identity = page.locator(".sidebar .logo");
  await expect(identity.locator("img, svg")).toHaveCount(0);
  expect(
    Number(await identity.evaluate((el) => getComputedStyle(el).fontWeight)),
  ).toBeLessThan(600);
  const name = page.getByRole("textbox", {
    name: "Installation name",
    exact: true,
  });
  await expect(name).toHaveAccessibleDescription("Up to 60 characters.");
  await name.fill("");
  await page.keyboard.press("Tab");
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await expect(name).toHaveAccessibleDescription(
    "Up to 60 characters. Installation name is required.",
  );
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("branding-error.png"),
    fullPage: true,
  });
  await name.fill("Example Academy");
  await page
    .getByRole("textbox", {
      name: "Welcome description (optional)",
      exact: true,
    })
    .fill("Learn together, one useful idea at a time.");
  await page
    .getByRole("textbox", { name: "Accent color hex value", exact: true })
    .fill("#16704a");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Settings saved.");
  await page.reload();
  // Administration intentionally returns to Content after a full reload.
  await expect(
    page.getByRole("heading", { name: "Administration", exact: true }),
  ).toBeVisible();
  if (await picker.isVisible()) {
    await picker.click();
    await page.getByRole("option", { name: "Identity", exact: true }).click();
  } else await page.getByRole("tab", { name: "Identity", exact: true }).click();
  await expect(name).toHaveValue("Example Academy");
  await expect(
    page.getByRole("textbox", { name: "Accent color hex value", exact: true }),
  ).toHaveValue("#16704a");
  await name.focus();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("branding-settings.png"),
    fullPage: true,
  });
  const viewport = page.viewportSize()!;
  if (viewport.width >= 1024) {
    // 200% page-zoom equivalent CSS viewport, which also triggers responsive navigation.
    await page.setViewportSize({
      width: Math.floor(viewport.width / 2),
      height: viewport.height,
    });
  } else {
    await page.evaluate(
      () => (document.documentElement.style.fontSize = "200%"),
    );
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("branding-enlarged.png"),
    fullPage: true,
  });
});
