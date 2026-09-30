import { test, expect } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";

test("demo build assets and existing browser workspace survive reload and reset", async ({
  page,
  request,
}, info) => {
  const marker = await request.get("/fieldbook-build.json");
  expect(marker.status()).toBe(200);
  expect(await marker.json()).toMatchObject({ kind: "demo" });
  expect((await request.get("/favicon.svg")).status()).toBe(200);
  const data = freshWorkspace();
  data.settings!.name = "Stored demo workspace";
  await page.addInitScript((workspace) => {
    if (!localStorage.getItem("relocation-smoke-seeded")) {
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
      sessionStorage.setItem("fieldbook.profile.v1", "demo-learner");
      localStorage.setItem("relocation-smoke-seeded", "yes");
    }
  }, data);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/#courses");
  await page.reload();
  await expect(page.locator(".sidebar .logo")).toContainText(
    "Stored demo workspace",
  );
  if (info.project.name === "phone")
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: /About this demo/ }).click();
  await page.getByRole("button", { name: "Reset sample data" }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Choose a demo profile" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!).settings
          .name,
    ),
  ).toBe("Hoolibook");
  expect(
    await page.evaluate(() => sessionStorage.getItem("fieldbook.profile.v1")),
  ).toBeNull();
  await page.screenshot({
    path: info.outputPath("reset-demo-account.png"),
    fullPage: true,
  });
});
