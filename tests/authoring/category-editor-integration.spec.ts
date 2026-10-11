import { expect, test, type Page } from "@playwright/test";
import { freshWorkspace, type Workspace } from "../../lib/store";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import { categoryLists } from "../../lib/content-categories";
import type { Content } from "../../lib/types";
import { setupAuthoringProvider } from "./provider-fixture";
import {
  closeContentSettings,
  openContentSettings,
  returnToContent,
  waitForDraftSaved,
} from "./editor-helpers";

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

function body(item: Content) {
  return item.kind === "course" ? item.lessons[0].body : item.body;
}

for (const profile of [
  { name: "wide desktop", width: 1440, height: 1000, touch: false },
  { name: "narrow desktop", width: 375, height: 900, touch: false },
  { name: "phone", width: 390, height: 844, touch: true },
  { name: "portrait tablet", width: 820, height: 1180, touch: true },
]) {
  test.describe(profile.name, () => {
    test.use({
      hasTouch: profile.touch,
      isMobile: profile.touch,
      colorScheme: profile.touch ? "dark" : "light",
      viewport: { width: profile.width, height: profile.height },
    });
    for (const kind of ["course", "brief"] as const) {
      test(`${kind}: saved categories remain usable through editor layout, draft save and category rename`, async ({
        page,
      }, info) => {
        test.setTimeout(90_000);
        test.skip(info.project.name === "production-phone" && !profile.touch, "The phone project is covered by the touch profiles.");
        const installed = info.project.name.startsWith("production");
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const state = withPublishedSnapshots(freshWorkspace());
        const item = structuredClone(
          state.content.find((entry) => entry.kind === kind)!,
        );
        item.id =
          kind === "course"
            ? "00000000-0000-4000-8000-000000000921"
            : "00000000-0000-4000-8000-000000000922";
        item.title = `Integrated ${kind} editing`;
        item.revision = item.publishedRevision = 1;
        if (kind === "course")
          item.lessons = [
            {
              id: "integration-lesson",
              title: "Keep the lesson",
              body: "Original published lesson.",
            },
          ];
        else item.body = "Original published update.";
        state.content = [item];
        state.publishedContent = [structuredClone(item)];
        state.settings = {
          ...state.settings!,
          contentCategories: categoryLists(state.content),
        };
        const originalPublishedBody = body(item);
        const originalCategory = item.category;
        if (installed) await setupAuthoringProvider(page, state);
        else
          await page.addInitScript((workspace) => {
            if (!localStorage.getItem("fieldbook.workspace.v1"))
              localStorage.setItem(
                "fieldbook.workspace.v1",
                JSON.stringify(workspace),
              );
            sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
          }, state);
        const read = async (): Promise<Workspace> =>
          installed
            ? (
                await (
                  await page.request.get("/api/admin/snapshot?scope=categories")
                ).json()
              ).data
            : page.evaluate(() =>
                JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
              );
        const readDraft = async (): Promise<Content> =>
          installed
            ? await (
                await page.request.get(`/api/content?id=${item.id}&draft=true`)
              ).json()
            : (await read()).content.find((entry) => entry.id === item.id)!;
        await page.goto(
          installed
            ? "/admin/settings/categories"
            : "/#admin/settings/categories",
        );
        await expect(
          page.getByRole("heading", { name: "Categories", exact: true }),
        ).toBeVisible();
        if (kind === "brief")
          await page.getByRole("tab", { name: "Updates", exact: true }).click();
        const destination = `Integrated ${kind} destination`;
        await page
          .getByRole("button", { name: "Create category", exact: true })
          .click();
        let dialog = page.getByRole("dialog");
        await dialog
          .getByLabel("Category name", { exact: true })
          .fill(destination);
        await dialog
          .getByRole("button", { name: "Create category", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Save settings", exact: true })
          .click();
        await expect(
          page.locator('[data-slot="pending-changes-region"]'),
        ).toHaveAttribute("data-active", "false");
        expect((await read()).settings!.contentCategories![kind]).toContain(
          destination,
        );
        await section(page, "Content");
        await page.getByRole("link", { name: item.title, exact: true }).click();
        const writer = page.locator('.writing-content[contenteditable="true"]');
        await expect(writer).toContainText(originalPublishedBody);
        const details = await openContentSettings(page);
        await details
          .locator("#writing-organization")
          .getByRole("button")
          .first()
          .click();
        await page
          .getByRole("option", { name: destination, exact: true })
          .click();
        await waitForDraftSaved(page);
        await closeContentSettings(page);
        await writer.fill(
          "An independently saved draft survives category management.",
        );
        await waitForDraftSaved(page);
        const draft = await readDraft();
        expect(draft.category).toBe(destination);
        expect(body(draft)).toContain("An independently saved draft");
        if (installed) {
          const published = await (
            await page.request.get(
              `/api/content?id=${item.id}&snapshot=published`,
            )
          ).json();
          expect(published.category).toBe(originalCategory);
          expect(body(published)).toBe(originalPublishedBody);
        } else {
          const published = (await read()).publishedContent!.find(
            (entry) => entry.id === item.id,
          )!;
          expect(published.category).toBe(originalCategory);
          expect(body(published)).toBe(originalPublishedBody);
        }
        if (profile.touch) {
          await writer.focus();
          await page.evaluate(() => {
            const viewport = window.visualViewport!;
            Object.defineProperty(viewport, "height", {
              configurable: true,
              get: () => 440,
            });
            viewport.dispatchEvent(new Event("resize"));
          });
          await expect(page.locator(".main-shell")).toHaveAttribute(
            "data-editor-keyboard",
            "true",
          );
          await expect(
            page.locator('.editor-frame-controls[data-dock="true"]'),
          ).toBeInViewport();
        } else {
          await expect(
            page.getByRole("button", { name: "Back to content", exact: true }),
          ).toBeInViewport();
          await expect(
            page.getByRole("button", { name: /^Commands:/ }),
          ).toBeHidden();
        }
        await page.screenshot({
          path: info.outputPath("integrated-editor.png"),
        });
        await returnToContent(page);
        await section(page, "Categories");
        await expect(
          page.getByRole("heading", { name: "Categories", exact: true }),
        ).toBeVisible();
        await expect(page.locator(".main-shell")).not.toHaveAttribute(
          "data-editor-keyboard",
        );
        expect(
          await page
            .locator(".main-shell")
            .evaluate((element) =>
              element.style.getPropertyValue("--editor-viewport-height"),
            ),
        ).toBe("");
        if (kind === "brief")
          await page.getByRole("tab", { name: "Updates", exact: true }).click();
        await page
          .getByRole("button", { name: `Expand ${destination}`, exact: true })
          .click();
        const contents = page.getByRole("region", {
          name: `Items in ${destination}`,
          exact: true,
        });
        await expect(
          contents.getByText(item.title, { exact: true }),
        ).toBeVisible();
        await page
          .getByRole("button", {
            name: `Actions for ${destination}`,
            exact: true,
          })
          .click();
        await page
          .getByRole("menuitem", { name: "Rename", exact: true })
          .click();
        dialog = page.getByRole("dialog");
        const renamed = `${destination} renamed`;
        await dialog.getByLabel("Category name", { exact: true }).fill(renamed);
        await dialog
          .getByRole("button", { name: "Rename category", exact: true })
          .click();
        await page
          .getByRole("button", { name: "Save settings", exact: true })
          .click();
        await expect(
          page.locator('[data-slot="pending-changes-region"]'),
        ).toHaveAttribute("data-active", "false");
        const after = await read();
        const saved = await readDraft();
        expect(saved.category).toBe(renamed);
        expect(body(saved)).toBe(body(draft));
        expect(saved.publishedRevision).toBe(draft.publishedRevision);
        const published = installed
          ? await (
              await page.request.get(
                `/api/content?id=${item.id}&snapshot=published`,
              )
            ).json()
          : after.publishedContent!.find((entry) => entry.id === item.id)!;
        expect(body(published)).toBe(originalPublishedBody);
        expect(after.settings!.contentCategories![kind]).not.toContain(
          destination,
        );
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        await page.screenshot({
          path: info.outputPath("integrated-categories.png"),
          fullPage: true,
        });
        await section(page, "Content");
        await page.getByRole("link", { name: item.title, exact: true }).click();
        await expect(writer).toContainText(
          "An independently saved draft survives category management.",
        );
        await openContentSettings(page);
        await expect(page.locator("#writing-organization")).toContainText(
          renamed,
        );
        if (installed) {
          await closeContentSettings(page);
          await returnToContent(page);
          await section(page, "Categories");
          if (kind === "brief")
            await page
              .getByRole("tab", { name: "Updates", exact: true })
              .click();
          await page
            .getByRole("button", {
              name: `Actions for ${renamed}`,
              exact: true,
            })
            .click();
          await page
            .getByRole("menuitem", { name: "Rename", exact: true })
            .click();
          dialog = page.getByRole("dialog");
          await dialog
            .getByLabel("Category name", { exact: true })
            .fill(`${renamed} again`);
          await dialog
            .getByRole("button", { name: "Rename category", exact: true })
            .click();
          // A second client saves after this page stages a revision-checked
          // category move. The move must preserve that newer draft and retain
          // its source category instead of completing stale removal.
          const concurrent = structuredClone(await readDraft());
          const newerBody = "A newer edit from another client must survive.";
          if (kind === "course") concurrent.lessons[0].body = newerBody;
          else concurrent.body = newerBody;
          const response = await page.request.post("/api/content", {
            headers: { Origin: new URL(page.url()).origin },
            data: {
              content: concurrent,
              expected: concurrent.revision,
              publish: false,
            },
          });
          expect(response.ok()).toBe(true);
          await page
            .getByRole("button", { name: "Save settings", exact: true })
            .click();
          await expect(
            page
              .getByRole("alert")
              .filter({ hasText: "Source categories were kept" }),
          ).toContainText("Revision conflict");
          const preserved = await readDraft();
          expect(body(preserved)).toBe(newerBody);
          expect(preserved.category).toBe(renamed);
          expect((await read()).settings!.contentCategories![kind]).toContain(
            renamed,
          );
          const live = await (
            await page.request.get(
              `/api/content?id=${item.id}&snapshot=published`,
            )
          ).json();
          expect(body(live)).toBe(originalPublishedBody);
          expect(live.category).toBe(renamed);
        }
        expect(errors).toEqual([]);
      });
    }
  });
}
