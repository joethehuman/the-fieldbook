import { test, expect } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
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
          body: "Reading material.",
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
      const footer = page.locator(".app-footer");
      const scrollAreaBottom = await main.evaluate(
        (el) => el.getBoundingClientRect().bottom,
      );
      const initialFooterTop = await footer.evaluate(
        (el) => el.getBoundingClientRect().top,
      );
      expect(initialFooterTop).toBeGreaterThanOrEqual(scrollAreaBottom - 1);
      await main.evaluate((el) => el.scrollTo(0, 1200));
      expect(await main.evaluate((el) => el.scrollTop)).toBeGreaterThan(200);
      expect(await page.evaluate(() => scrollY)).toBe(0);
      expect(await bar.evaluate((el) => el.getBoundingClientRect().top)).toBe(
        0,
      );
      expect(
        await footer.evaluate((el) => el.getBoundingClientRect().top),
      ).toBeLessThan(initialFooterTop);
      await main.evaluate((el) => el.scrollTo(0, el.scrollHeight));
      await footer.scrollIntoViewIfNeeded();
      await expect(footer).toBeInViewport();
      expect(await bar.evaluate((el) => el.getBoundingClientRect().top)).toBe(
        0,
      );
      expect(await page.evaluate(() => scrollY)).toBe(0);
      if (info.project.name === "phone") {
        await expect(footer.locator(".footer-name")).toBeHidden();
        await expect(footer.locator(".footer-tagline")).toBeVisible();
        if (app === "production")
          await expect(
            footer.getByRole("link", { name: "Privacy policy" }),
          ).toBeVisible();
        expect(
          await footer.evaluate((el) => el.getBoundingClientRect().height),
        ).toBeLessThan(120);
      }
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
        const about = footer.getByRole("button", { name: "About this demo" });
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
        await expect(about).toBeFocused();
      }

      await main.evaluate((el) => el.scrollTo(0, 0));
      await expect
        .poll(() =>
          main.evaluate((el) => {
            const content = el.querySelector(".main-content")!;
            const before = content.getBoundingClientRect().top;
            el.dispatchEvent(
              new WheelEvent("wheel", {
                deltaY: -160,
                bubbles: true,
                cancelable: true,
              }),
            );
            return content.getBoundingClientRect().top - before;
          }),
        )
        .toBeGreaterThan(0);
      expect(await bar.evaluate((el) => el.getBoundingClientRect().top)).toBe(
        0,
      );
      expect(
        await page
          .locator(".sidebar")
          .evaluate((el) => el.getBoundingClientRect().top),
      ).toBe(0);

      await main.evaluate((el) => el.scrollTo(0, el.scrollHeight));
      const bottomPull = await main.evaluate((el) => {
        const footer = el.querySelector(".app-footer")!;
        const before = footer.getBoundingClientRect().top;
        el.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY: 160,
            bubbles: true,
            cancelable: true,
          }),
        );
        return footer.getBoundingClientRect().top - before;
      });
      expect(bottomPull).toBeLessThan(0);
      expect(await bar.evaluate((el) => el.getBoundingClientRect().top)).toBe(
        0,
      );

      if (info.project.name === "phone") {
        await main.evaluate((el) => el.scrollTo(0, 0));
        const touchPull = await main.evaluate((el) => {
          const content = el.querySelector(".main-content")!;
          const before = content.getBoundingClientRect().top;
          const start = new Touch({ identifier: 1, target: el, clientY: 100 });
          const moved = new Touch({ identifier: 1, target: el, clientY: 160 });
          el.dispatchEvent(
            new TouchEvent("touchstart", {
              touches: [start],
              changedTouches: [start],
              bubbles: true,
            }),
          );
          el.dispatchEvent(
            new TouchEvent("touchmove", {
              touches: [moved],
              changedTouches: [moved],
              bubbles: true,
              cancelable: true,
            }),
          );
          const distance = content.getBoundingClientRect().top - before;
          el.dispatchEvent(
            new TouchEvent("touchend", {
              changedTouches: [moved],
              bubbles: true,
            }),
          );
          return distance;
        });
        expect(touchPull).toBeGreaterThan(0);
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
  const footer = page.locator(".app-footer");
  const about = footer.getByRole("button", { name: "About this demo" });
  await expect(about).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Demo organization" }),
  ).toHaveCount(0);
  expect(await about.evaluate((el) => getComputedStyle(el).fontSize)).toBe(
    await footer
      .locator("span")
      .first()
      .evaluate((el) => getComputedStyle(el).fontSize),
  );
  await page.reload();
  await expect(about).toBeVisible();
});
