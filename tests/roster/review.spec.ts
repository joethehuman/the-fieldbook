import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { freshWorkspace } from "../../lib/store";
import {
  rosterTemplate,
  rosterExample,
  reviewRosterCsv,
} from "../../lib/roster-import";
import { serializeCsv } from "../../lib/csv";
import {
  setupAuthoringProvider,
  authoringUser,
} from "../authoring/provider-fixture";
const csv = (rows: string[][]) => serializeCsv({ ...rosterTemplate(), rows });
test("the installed HTTP route enforces origin, identity and admin access and returns a server-derived review", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("production"),
    "Installed server boundary",
  );
  await setupAuthoringProvider(page, freshWorkspace());
  const endpoint = "/api/admin/roster-import/review";
  const origin = String(info.project.use.baseURL);
  const request = (data: object, site = origin) =>
    page.request.post(endpoint, { headers: { Origin: site }, data });
  const result = await request({ csv: serializeCsv(rosterExample()) });
  expect(result.status()).toBe(200);
  expect(result.headers()["cache-control"]).toBe("no-store");
  const body = await result.json();
  expect(body.review.valid).toBe(true);
  expect(body.review.people).toHaveLength(5);
  expect(body.review.teams).toHaveLength(6);
  expect((await request({ csv: "x", people: ["spoofed"] })).status()).toBe(400);
  expect(
    (await request({ csv: "x" }, "https://other.example.test")).status(),
  ).toBe(403);
  await page.request.post("http://127.0.0.1:3130/fixture", {
    data: { role: "learner" },
  });
  expect((await request({ csv: "x" })).status()).toBe(403);
  await page.context().clearCookies();
  expect((await request({ csv: "x" })).status()).toBe(401);
});
async function setup(page: Page, installed: boolean) {
  const data = freshWorkspace();
  let writes = 0;
  if (installed) {
    await setupAuthoringProvider(page, data);
    await page.route("**/api/session**", (r) =>
      r.fulfill({ json: { data, user: authoringUser } }),
    );
    await page.route("**/api/admin/snapshot**", (r) =>
      r.fulfill({ json: { data, user: authoringUser } }),
    );
    await page.route("**/api/admin/roster-import/review", (r) =>
      r.fulfill({
        json: { review: reviewRosterCsv(r.request().postDataJSON().csv, data) },
      }),
    );
  } else
    await page.addInitScript((d) => {
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(d));
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    }, data);
  page.on("request", (r) => {
    if (
      ["POST", "PATCH", "DELETE", "PUT"].includes(r.method()) &&
      r.url().includes("/api/") &&
      !r.url().endsWith("/roster-import/review")
    )
      writes++;
  });
  await page.goto(installed ? "/admin" : "/#admin");
  const section = installed ? "People" : "Demo profiles",
    picker = page.getByRole("combobox", { name: "Administration section" });
  if (await picker.isVisible()) {
    await picker.click();
    await page.getByRole("option", { name: section, exact: true }).click();
  } else await page.getByRole("tab", { name: section, exact: true }).click();
  const baseline = installed
    ? JSON.stringify(data)
    : await page.evaluate(() => localStorage.getItem("fieldbook.workspace.v1"));
  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Review CSV import" });
  await expect(dialog).toBeVisible();
  return {
    dialog,
    writes: () => writes,
    unchanged: async () =>
      expect(
        installed
          ? JSON.stringify(data)
          : await page.evaluate(() =>
              localStorage.getItem("fieldbook.workspace.v1"),
            ),
      ).toBe(baseline),
  };
}
async function upload(page: Page, text: string, name = "people.csv") {
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Choose CSV file", exact: true })
    .click();
  await (
    await chooser
  ).setFiles({ name, mimeType: "text/csv", buffer: Buffer.from(text) });
  await expect(page.getByRole("dialog").getByRole("status")).toHaveText(name);
  const review = page.getByRole("button", { name: "Review file", exact: true });
  await expect(review).toBeEnabled();
  await review.click();
  await expect(
    page.getByRole("button", { name: "Done", exact: true }),
  ).toBeVisible();
}
test("stored downloads and example review are real, read-only, and restore focus on close", async ({
  page,
}, info) => {
  const s = await setup(page, info.project.name.startsWith("production"));
  const download = page.waitForEvent("download");
  await s.dialog
    .getByRole("link", { name: "Download template", exact: true })
    .click();
  const file = await download;
  expect(readFileSync((await file.path())!, "utf8")).toBe(
    serializeCsv(rosterTemplate()),
  );
  const choose = s.dialog.getByRole("button", {
    name: "Choose CSV file",
    exact: true,
  });
  await choose.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  const background = await choose.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  await choose.hover();
  await expect
    .poll(() => choose.evaluate((el) => getComputedStyle(el).backgroundColor))
    .not.toBe(background);
  const guide = s.dialog.getByRole("button", {
    name: "Column guide",
    exact: true,
  });
  await guide.click();
  await expect(s.dialog.locator("dt")).toHaveCount(6);
  await expect(
    s.dialog.getByText("Parents and managers can appear later in the file.", {
      exact: false,
    }),
  ).toBeVisible();
  await guide.click();
  await page.screenshot({ path: info.outputPath("upload-refined.png") });
  await upload(page, serializeCsv(rosterExample()));
  await expect(
    s.dialog.getByText("Preview only. No changes are saved."),
  ).toBeVisible();
  await s.dialog.getByRole("tab", { name: /Teams/ }).click();
  await expect(
    s.dialog.getByRole("cell", { name: "Revenue Organization", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("example-review.png") });
  await s.dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(s.dialog).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Import CSV", exact: true }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  await expect(s.dialog.getByRole("status")).toHaveText("No CSV file selected");
  await expect(
    s.dialog.getByRole("button", { name: "Review file", exact: true }),
  ).toBeDisabled();
  await s.dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(s.dialog).not.toBeVisible();
  await s.unchanged();
  expect(s.writes()).toBe(0);
});
test("500-row review has bounded pages, stable controls for one/zero/many matches, and Back preserves discovery", async ({
  page,
}, info) => {
  const s = await setup(page, info.project.name.startsWith("production"));
  const rows = Array.from({ length: 500 }, (_, i) => [
    `Person ${String(i).padStart(3, "0")}`,
    `person${i}@example.test`,
    "2026-09-01",
    "Import team",
    "",
    "",
  ]);
  await upload(page, csv(rows));
  await expect(
    s.dialog.getByRole("navigation", { name: "Review pages" }),
  ).toContainText("1–25 of 500");
  await s.dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    s.dialog.getByRole("navigation", { name: "Review pages" }),
  ).toContainText("26–50 of 500");
  await s.dialog.getByRole("button", { name: "Back", exact: true }).click();
  await s.dialog
    .getByRole("button", { name: "Review file", exact: true })
    .click();
  await expect(
    s.dialog.getByRole("navigation", { name: "Review pages" }),
  ).toContainText("26–50 of 500");
  const query = s.dialog.getByRole("searchbox", { name: "Search review" });
  await query.scrollIntoViewIfNeeded();
  const compact = await s.dialog
    .locator('[data-slot="review-collection"]')
    .getAttribute("data-compact");
  const anchor =
    compact === "true"
      ? s.dialog.getByRole("button", { name: "Done", exact: true })
      : query;
  const before = await anchor.boundingBox();
  await query.fill("person499@example.test");
  await expect(s.dialog.getByText("Person 499", { exact: true })).toBeVisible();
  await query.fill("no such person");
  await expect(
    s.dialog.getByText("No records match these filters."),
  ).toBeVisible();
  const after = await anchor.boundingBox();
  expect(after!.y).toBeCloseTo(before!.y, 0);
  expect(after!.height).toBeCloseTo(before!.height, 0);
  await query.fill("");
  await expect(
    s.dialog.getByRole("navigation", { name: "Review pages" }),
  ).toContainText("1–25 of 500");
  await s.dialog
    .getByRole("button", { name: "Details for Person 000", exact: true })
    .click();
  await expect(
    s.dialog.getByText(
      "Pre-registered learner. No email or login account is created.",
    ),
  ).toBeVisible();
  // Focusing a row action may scroll the table, never the discovery header sideways.
  expect((await query.boundingBox())!.x).toBeCloseTo(before!.x, 0);
  await page.screenshot({ path: info.outputPath("large-review.png") });
  await s.dialog.getByRole("button", { name: "Done", exact: true }).click();
  await s.unchanged();
  expect(s.writes()).toBe(0);
});
test("all grouped issues span pages, download completely, and a replacement file clears the old review", async ({
  page,
}, info) => {
  const s = await setup(page, info.project.name.startsWith("production"));
  const rows = Array.from({ length: 60 }, (_, i) => [
    `Person ${i}`,
    `bad${i}@example.test`,
    "2026-02-30",
    "New team",
    "Missing parent",
    "",
  ]);
  await upload(page, csv(rows));
  await expect(
    s.dialog.getByRole("tab", { name: "Issues", exact: true }),
  ).toHaveAttribute("data-state", "active");
  await expect(
    s.dialog.getByRole("navigation", { name: "Review pages" }),
  ).toContainText("1–25 of 61");
  await s.dialog.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    s.dialog.getByRole("navigation", { name: "Review pages" }),
  ).toContainText("26–50 of 61");
  const download = page.waitForEvent("download");
  await s.dialog
    .getByRole("button", { name: "Download issues", exact: true })
    .click();
  const file = await download;
  expect(readFileSync((await file.path())!, "utf8").split("\r\n").length).toBe(
    63,
  );
  await page.screenshot({ path: info.outputPath("issues.png") });
  await s.dialog.getByRole("button", { name: "Back", exact: true }).click();
  await upload(
    page,
    csv([["New person", "new-person@example.test", "2026-09-01", "", "", ""]]),
  );
  await expect(s.dialog.getByRole("tab", { name: /People 1/ })).toHaveAttribute(
    "data-state",
    "active",
  );
  await expect(
    s.dialog.getByRole("button", { name: "Download issues", exact: true }),
  ).toHaveCount(0);
  await s.dialog.getByRole("button", { name: "Done", exact: true }).click();
  await s.unchanged();
  expect(s.writes()).toBe(0);
});
test("ten-level ancestry and enlarged text keep short-height dialog controls reachable", async ({
  page,
}, info) => {
  await page.setViewportSize({
    width: Math.min(900, info.project.use.viewport!.width),
    height: 600,
  });
  await page.addInitScript(() =>
    document.addEventListener("DOMContentLoaded", () => {
      document.documentElement.style.fontSize = "24px";
    }),
  );
  const s = await setup(page, info.project.name.startsWith("production"));
  const rows = Array.from({ length: 10 }, (_, i) => [
    "",
    "",
    "",
    `Long regional team ${i}`,
    i ? `Long regional team ${i - 1}` : "",
    "",
  ]);
  rows.push([
    "Long Person",
    "long-person@example.test",
    "2026-09-01",
    "Long regional team 9",
    "",
    "",
  ]);
  await upload(page, csv(rows.reverse()));
  await s.dialog.getByRole("tab", { name: /Teams/ }).click();
  await s.dialog.getByRole("button", { name: /^Filters/ }).click();
  await page.getByRole("combobox", { name: "Changes shown" }).click();
  await page.getByRole("option", { name: "All records", exact: true }).click();
  await page.keyboard.press("Escape");
  const close = s.dialog.getByRole("button", {
    name: "Done",
    exact: true,
  });
  await expect(close).toBeInViewport();
  const controls = s.dialog.locator('[data-slot="review-collection"]');
  await expect(controls).toHaveAttribute("data-compact", "true");
  await page.screenshot({ path: info.outputPath("short-enlarged.png") });
  await close.click();
  await s.unchanged();
  expect(s.writes()).toBe(0);
});
test("failed installed review is retryable and cancellation cannot reveal an abandoned response", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("production"),
    "Server failure applies only to installed review.",
  );
  const s = await setup(page, true);
  let attempts = 0;
  await page.route("**/api/admin/roster-import/review", async (r) => {
    attempts++;
    if (attempts === 1)
      return r.fulfill({
        status: 409,
        json: {
          error:
            "The organization changed while reviewing. Review the file again.",
        },
      });
    return r.fulfill({
      json: {
        review: reviewRosterCsv(
          serializeCsv(rosterExample()),
          freshWorkspace(),
        ),
      },
    });
  });
  await s.dialog.getByLabel("CSV file", { exact: true }).setInputFiles({
    name: "example.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(serializeCsv(rosterExample())),
  });
  await s.dialog
    .getByRole("button", { name: "Review file", exact: true })
    .click();
  await expect(s.dialog.getByRole("alert")).toContainText(
    "organization changed",
  );
  await s.dialog
    .getByRole("button", { name: "Review file", exact: true })
    .click();
  await expect(
    s.dialog.getByRole("button", { name: "Done", exact: true }),
  ).toBeVisible();
  await s.dialog.getByRole("button", { name: "Done", exact: true }).click();
  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  let release: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/admin/roster-import/review", async (r) => {
    await gate;
    await r
      .fulfill({
        json: {
          review: reviewRosterCsv(
            serializeCsv(rosterExample()),
            freshWorkspace(),
          ),
        },
      })
      .catch(() => {});
  });
  await s.dialog.getByLabel("CSV file", { exact: true }).setInputFiles({
    name: "later.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(serializeCsv(rosterExample())),
  });
  await s.dialog
    .getByRole("button", { name: "Review file", exact: true })
    .click();
  await s.dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  release!();
  await page.getByRole("button", { name: "Import CSV", exact: true }).click();
  await expect(
    s.dialog.getByRole("button", { name: "Choose CSV file", exact: true }),
  ).toBeVisible();
  await expect(
    s.dialog.getByRole("button", { name: "Review file", exact: true }),
  ).toBeDisabled();
  await s.dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await s.unchanged();
  expect(s.writes()).toBe(0);
});
