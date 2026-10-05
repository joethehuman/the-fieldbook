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
