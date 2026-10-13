import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin"),
  );
});

test("organization settings save only changed values", async ({ page }) => {
  await page.goto("/#admin/settings/access");
  const save = page.getByRole("button", { name: "Save settings", exact: true });
  const registration = page.getByRole("combobox", { name: "New learner accounts" });
  const discard = page.locator('[data-slot="discard-changes"]');
  const footer = page.locator('[data-slot="card-footer"]').first();
  const guidance = footer.locator(":scope > div").first();
  await expect(save).toBeDisabled();
  await expect(discard).toBeHidden();
  await expect(page.getByText("No changes to save")).toHaveCount(0);
  const guidanceBefore = await guidance.boundingBox();
  const footerBefore = await footer.boundingBox();
  const layoutBefore = guidanceBefore && footerBefore && {
    width: guidanceBefore.width,
    height: guidanceBefore.height,
    top: guidanceBefore.y - footerBefore.y,
    footerHeight: footerBefore.height,
  };
  const footerLayout = async () => {
    const guidanceBox = await guidance.boundingBox();
    const footerBox = await footer.boundingBox();
    return guidanceBox && footerBox && {
      width: guidanceBox.width,
      height: guidanceBox.height,
      top: guidanceBox.y - footerBox.y,
      footerHeight: footerBox.height,
    };
  };

  await registration.click();
  await page.getByRole("option", { name: "Existing members only" }).click();
  await expect(save).toBeEnabled();
  await expect(discard).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "Unsaved changes" })).toHaveClass(/sr-only/);
  expect(await footerLayout()).toEqual(layoutBefore);
  const editedFooter = await footer.boundingBox();
  const discardBox = await discard.boundingBox();
  expect(discardBox!.y).toBeGreaterThanOrEqual(editedFooter!.y + editedFooter!.height);

  await discard.click();
  await expect(save).toBeDisabled();
  await expect(discard).toBeHidden();
  expect(await footerLayout()).toEqual(layoutBefore);

  await registration.click();
  await page.getByRole("option", { name: "Existing members only" }).click();

  await registration.click();
  await page.getByRole("option", { name: "Allow registration with Google" }).click();
  await expect(save).toBeDisabled();
  await expect(discard).toBeHidden();
  await expect(page.getByRole("status").filter({ hasText: "Unsaved changes" })).toHaveCount(0);

  await registration.click();
  await page.getByRole("option", { name: "Existing members only" }).click();
  await save.click();
  await expect(save).toBeDisabled();
  await expect(page.getByText("Settings saved.")).toBeVisible();
});

test("privacy discard stays below the save bar and aligned with Save", async ({ page }, testInfo) => {
  await page.goto("/#admin/settings/privacy");
  const save = page.getByRole("button", { name: "Save settings", exact: true });
  const operator = page.getByRole("textbox", { name: "Operator name" });
  const bar = page.locator('[data-slot="settings-page-actions"]');
  const surface = bar.locator(":scope > div[aria-hidden='true']");
  const original = await operator.inputValue();
  await expect(save).toBeDisabled();
  await expect(bar.locator('[data-slot="discard-changes"]')).toHaveCount(0);

  await operator.fill(`${original} edited`);
  const discard = bar.locator('[data-slot="discard-changes"]');
  await expect(save).toBeEnabled();
  await expect(discard).toBeVisible();
  const saveBox = await save.boundingBox();
  const discardBox = await discard.boundingBox();
  const surfaceBox = await surface.boundingBox();
  expect(discardBox!.y).toBeGreaterThanOrEqual(surfaceBox!.y + surfaceBox!.height);
  if (testInfo.project.name === "phone") {
    expect(discardBox!.x + discardBox!.width).toBeCloseTo(saveBox!.x + saveBox!.width, 0);
  } else {
    expect(discardBox!.x).toBeCloseTo(saveBox!.x, 0);
  }
});

for (const [route, fieldName] of [
  ["identity", "Installation name"],
  ["ask-ai", "Answer guidance"],
  ["privacy", "Operator name"],
] as const) {
  test(`${route} save footer stays after the content when settings change and scroll`, async ({ page }, info) => {
    await page.setViewportSize({ width: page.viewportSize()!.width, height: 620 });
    await page.goto(`/#admin/settings/${route}`);
    const save = page.getByRole("button", { name: "Save settings", exact: true });
    const field = page.getByRole("textbox", { name: fieldName, exact: true });
    const bar = page.locator('[data-slot="settings-page-actions"]');
    const discard = bar.locator('[data-slot="discard-changes"]');
    const guidance = bar.locator(":scope > p");
    const original = await field.inputValue();
    const gapAfterContent = () => bar.evaluate((element) => {
      const sections = element.closest("form")!.querySelectorAll("[data-settings-section]");
      const last = sections[sections.length - 1].getBoundingClientRect();
      return element.getBoundingClientRect().top - last.bottom;
    });
    const scrollSettings = (top: number) => bar.evaluate((element, value) => {
      let owner = element.parentElement;
      while (owner && !(owner.scrollHeight > owner.clientHeight &&
        /(auto|scroll)/.test(getComputedStyle(owner).overflowY))) {
        owner = owner.parentElement;
      }
      if (!owner) throw new Error("Settings scroll owner not found");
      owner.scrollTop = value;
      return owner.scrollTop;
    }, top);
    await expect(save).toBeDisabled();
    await expect(bar).toHaveCSS("position", "static");
    const cleanGap = await gapAfterContent();
    expect(cleanGap).toBeGreaterThanOrEqual(12);

    await field.fill(`${original} edited`);
    await expect(save).toBeEnabled();
    await expect(discard).toBeVisible();
    await expect(bar).toHaveCSS("position", "static");
    await expect(guidance).not.toHaveClass(/sr-only/);
    expect(await gapAfterContent()).toBeCloseTo(cleanGap, 0);
    await scrollSettings(0);
    await expect.poll(async () => (await bar.boundingBox())!.y).toBeGreaterThan(620);
    const beforeScroll = (await bar.boundingBox())!.y;
    expect(await scrollSettings(140)).toBe(140);
    await expect.poll(async () => (await bar.boundingBox())!.y).toBeCloseTo(beforeScroll - 140, 0);
    expect(await gapAfterContent()).toBeCloseTo(cleanGap, 0);

    await save.scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath(`${route}-edited-footer.png`) });
    await discard.click();
    await expect(field).toHaveValue(original);
    await expect(save).toBeDisabled();
    await expect(discard).toBeHidden();
    expect(await gapAfterContent()).toBeCloseTo(cleanGap, 0);

    await field.fill(`${original} edited`);
    await save.click();
    await expect(save).toBeDisabled();
    await expect(page.getByText("Settings saved.")).toBeVisible();
    await page.reload();
    await expect(field).toHaveValue(`${original} edited`);
    await expect(bar).toHaveCSS("position", "static");
    await expect(save).toBeDisabled();
  });
}

test("manual admin editors share the clean and edited save states", async ({ page }) => {
  await page.goto("/#admin/people/new/person");
  const profileSave = page.getByRole("button", { name: "Save profile" });
  const profileName = page.getByRole("textbox", { name: "Name", exact: true });
  await expect(profileSave).toBeDisabled();
  await profileName.fill("Example Person");
  await expect(profileSave).toBeEnabled();
  await profileName.fill("");
  await expect(profileSave).toBeDisabled();

  await page.goto("/#admin/curricula/new/curriculum");
  const curriculumSave = page.getByRole("button", { name: "Save curriculum" });
  const curriculumName = page.getByRole("textbox", { name: "Name", exact: true });
  await expect(curriculumSave).toBeDisabled();
  await curriculumName.fill("Example curriculum");
  await expect(curriculumSave).toBeEnabled();
  await curriculumName.fill("");
  await expect(curriculumSave).toBeDisabled();

  await page.goto("/#admin/teams");
  await page.getByRole("button", { name: "Add team" }).click();
  const teamSave = page.getByRole("button", { name: "Save team" });
  const teamName = page.getByRole("textbox", { name: "Team name" });
  await expect(teamSave).toBeDisabled();
  await teamName.fill("Example team");
  await expect(teamSave).toBeEnabled();
  await teamName.fill("");
  await expect(teamSave).toBeDisabled();
});
