import { test, expect } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { defaultPrivacy, defaultSettings } from "../../lib/settings";
import type { Content } from "../../lib/types";

for (const app of ["demo", "production"]) {
  for (const kind of ["brief", "course"] as const) {
    test(`${app}: persistent bar on long ${kind} pages`, async ({
      page,
      request,
    }, info) => {
      const item: Content = {
        ...freshWorkspace().content.find((item) => item.kind === kind)!,
        id: "00000000-0000-4000-8000-000000000999",
        title:
          "A long reading title that wraps without displacing global controls ".repeat(
            3,
          ),
        body: Array.from(
          { length: 20 },
          (_, i) =>
            `## Section ${i}\n\n${"Useful reading material. ".repeat(80)}`,
        ).join("\n\n"),
        status: "published",
      };
      if (kind === "course")
        item.lessons = Array.from({ length: 30 }, (_, i) => ({
          ...item.lessons[0],
          id: `lesson-${i}`,
          title: `Lesson ${i}: Useful course material`,
          body: item.body,
        }));
      await request.post("http://127.0.0.1:3130/fixture", {
        data: {
          settings: { access: "public" },
          documents: [
            {
              id: item.id,
              published: item,
              draft: item,
              revision: 1,
              published_revision: 1,
              updated_at: "2026-01-02",
            },
          ],
        },
      });
      if (app === "demo") {
        const data = freshWorkspace();
        data.content = [item];
        await page.addInitScript((data) => {
          localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
          sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
        }, data);
      }
      const route = kind === "brief" ? "updates" : "courses";
      await page.goto(
        app === "demo"
          ? `http://localhost:3132/#${route}/${item.id}`
          : `/${route}/${item.id}`,
      );
      const bar = page.locator(".topbar");
      await expect(bar).toBeVisible();
      await page.screenshot({
        path: info.outputPath(`${app}-${kind}-top.png`),
      });
      const main = page.locator("#main-content");
      await expect(page.locator(".app-footer")).toHaveCount(0);
      await main.evaluate((el) => el.scrollTo(0, 1200));
      expect(await main.evaluate((el) => el.scrollTop)).toBeGreaterThan(200);
      expect(await page.evaluate(() => scrollY)).toBe(0);
      expect(await bar.evaluate((el) => el.getBoundingClientRect().top)).toBe(
        0,
      );
      await page.screenshot({
        path: info.outputPath(`${app}-${kind}-scrolled.png`),
      });
      await page.evaluate(
        () => (document.documentElement.style.fontSize = "200%"),
      );
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await expect(
        page.getByRole("textbox", { name: "Search all content" }),
      ).toBeInViewport();
      await page.screenshot({
        path: info.outputPath(`${app}-${kind}-enlarged.png`),
      });
      if (app === "demo") {
        const account = page.getByRole("button", { name: "Account menu" });
        if (!(await account.isVisible()))
          await page.getByRole("button", { name: "Open navigation" }).click();
        await account.click();
        await page.screenshot({ path: info.outputPath(`${app}-${kind}-account-menu.png`) });
        const about = page.getByRole("menuitem", { name: "About this demo" });
        await about.click();
        const dialog = page.getByRole("dialog");
        await expect(dialog).toBeVisible();
        await expect
          .poll(() =>
            dialog.evaluate((el) => el.contains(document.activeElement)),
          )
          .toBe(true);
        await page.screenshot({
          path: info.outputPath(`${app}-${kind}-dialog.png`),
        });
        await page.keyboard.press("Escape");
        await expect(
          page.getByRole("button", {
            name:
              info.project.name === "phone"
                ? "Open navigation"
                : "Account menu",
          }),
        ).toBeFocused();
      }
    });
  }
}

test("demo opens on profile choice before the first selection", async ({
  page,
}) => {
  await page.goto("http://localhost:3132/");
  await expect(
    page.getByRole("heading", { name: "Choose a demo profile" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Alex Edwards/ }).click();
  await expect(page.locator(".app-footer")).toHaveCount(0);
  const account = page.getByRole("button", { name: "Account menu" });
  if (!(await account.isVisible()))
    await page.getByRole("button", { name: "Open navigation" }).click();
  await account.click();
  await expect(
    page.getByRole("menuitem", { name: "About this demo" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Demo organization" }),
  ).toHaveCount(0);
  await page.reload();
  if (!(await account.isVisible()))
    await page.getByRole("button", { name: "Open navigation" }).click();
  await account.click();
  await expect(
    page.getByRole("menuitem", { name: "About this demo" }),
  ).toBeVisible();
});

test("demo account menu opens its published privacy policy", async ({ page }) => {
  const data = freshWorkspace();
  data.settings = {
    ...defaultSettings,
    ...data.settings,
    privacy: {
      ...defaultPrivacy,
      published: {
        ...defaultPrivacy.draft,
        operatorName: "Demo operator",
        contactEmail: "demo@example.com",
        body: "Demo published policy.",
      },
      publishedAt: "2026-09-26T00:00:00.000Z",
    },
  };
  await page.addInitScript((workspace) => {
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
  }, data);
  await page.goto("http://localhost:3132/");
  const account = page.getByRole("button", { name: "Account menu" });
  if (!(await account.isVisible()))
    await page.getByRole("button", { name: "Open navigation" }).click();
  await account.click();
  await page.getByRole("menuitem", { name: "Privacy policy" }).click();
  await expect(page).toHaveURL(/\/privacy$/);
  await expect(page.getByText("Demo published policy.")).toBeVisible();
});
