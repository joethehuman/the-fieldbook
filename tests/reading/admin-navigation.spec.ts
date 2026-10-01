import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
const backend = "http://127.0.0.1:3130";
const id = "00000000-0000-4000-8000-000000000081";
const workspace = freshWorkspace();
const doc = {
  ...workspace.content.find((item) => item.kind === "doc")!,
  id,
  title: "Navigation reference",
  body: "The saved reference body",
  status: "published" as const,
  revision: 1,
  publishedRevision: 1,
};
async function navigation(page: Page) {
  const trigger = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (
    (await trigger.isVisible()) &&
    (await trigger.getAttribute("aria-expanded")) !== "true"
  )
    await trigger.click();
}
async function manage(page: Page) {
  await navigation(page);
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Manage organization", exact: true })
    .click();
}
async function section(page: Page, name: string) {
  const picker = page.getByRole("combobox", { name: "Administration section" });
  if (await picker.isVisible()) {
    await picker.click();
    await page.getByRole("option", { name, exact: true }).click();
  } else await page.getByRole("tab", { name, exact: true }).click();
}
for (const surface of ["installed", "demo"] as const) {
  test.describe(surface, () => {
    test.beforeEach(async ({ page, request }) => {
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.addInitScript(() => {
        (window as any).globalLoadingFlashes = [];
        const observe = () => {
          if (
            document.querySelector(
              ".app-bar-progress, .loading-bar, .navigation-pending",
            ) ||
            document.body?.innerText.includes("Just a sec")
          )
            (window as any).globalLoadingFlashes.push(true);
        };
        new MutationObserver(observe).observe(document, {
          childList: true,
          subtree: true,
          attributes: true,
        });
      });
      if (surface === "installed") {
        await request.post(`${backend}/fixture`, {
          data: {
            settings: { access: "private" },
            documents: [
              {
                id,
                draft: doc,
                published: doc,
                revision: 1,
                published_revision: 1,
                updated_at: doc.updatedAt,
              },
            ],
          },
        });
        const token = await (
          await request.post(`${backend}/auth/v1/token`, { data: {} })
        ).json();
        await page.context().addCookies([
          {
            name: "sb-test-auth-token",
            value:
              "base64-" +
              Buffer.from(
                JSON.stringify({
                  ...token,
                  expires_at: Math.floor(Date.now() / 1000) + 3600,
                }),
              ).toString("base64url"),
            domain: "localhost",
            path: "/",
          },
        ]);
      } else
        await page.addInitScript(
          (data) => {
            sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
            localStorage.setItem(
              "fieldbook.workspace.v1",
              JSON.stringify(data),
            );
            const save = Storage.prototype.setItem;
            Storage.prototype.setItem = function (key, value) {
              if (
                (window as any).rejectDraft &&
                key === "fieldbook.workspace.v1"
              )
                throw new Error("Synthetic storage failure");
              return save.call(this, key, value);
            };
          },
          { ...workspace, content: [doc], publishedContent: [doc] },
        );
      await page.goto(
        surface === "installed" ? "/admin" : "http://localhost:3132/#admin",
      );
      await expect(
        page.getByRole("heading", { name: "Content", exact: true }),
      ).toBeVisible();
    });

    test("Manage organization closes Content without work and returns from another section", async ({
      page,
    }, info) => {
      let adminRequests = 0;
      page.on("request", (request) => {
        if (/\/admin(?:\?|\/snapshot)/.test(request.url())) adminRequests++;
      });
      const history = await page.evaluate(() => window.history.length);
      await manage(page);
      await expect(
        page.getByRole("menuitem", { name: "Manage organization" }),
      ).toHaveCount(0);
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      expect(await page.evaluate(() => window.history.length)).toBe(history);
      expect(adminRequests).toBe(0);
      await section(page, "Feedback");
      await expect(
        page.getByRole("heading", { name: "Feedback", exact: true }),
      ).toBeVisible();
      await manage(page);
      await expect(
        page.getByRole("heading", { name: "Content", exact: true }),
      ).toBeVisible();
      expect(await page.evaluate(() => window.history.length)).toBe(
        surface === "installed" ? history + 2 : history,
      );
      expect(
        await page.evaluate(() => (window as any).globalLoadingFlashes),
      ).toEqual([]);
      await page.screenshot({
        path: info.outputPath(`${surface}-content.png`),
      });
    });

    test("route-managed navigation prepares on keyboard focus and opens once on activation", async ({
      page,
      request,
    }, info) => {
      test.skip(
        surface !== "installed" || info.project.name !== "desktop",
        "Installed desktop route navigation.",
      );
      await expect(
        page.getByRole("status").filter({ hasText: /^Content ready$/ }),
      ).toBeVisible();
      const content = page.getByRole("tab", { name: "Content", exact: true });
      const feedback = page.getByRole("tab", { name: "Feedback", exact: true });
      await content.focus();
      await page.keyboard.press("ArrowDown");
      await expect(feedback).toBeFocused();
      await expect(page).toHaveURL(/\/admin$/);
      expect(
        (await (await request.get(`${backend}/reads`)).json()).feedbackReads,
      ).toBe(0);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/admin\/feedback$/);
      await expect(feedback).toHaveAttribute("aria-selected", "true");
      await expect(
        page.getByRole("heading", { name: "Feedback", exact: true }),
      ).toBeVisible();
      expect(
        (await (await request.get(`${backend}/reads`)).json()).feedbackReads,
      ).toBe(1);
      await feedback.focus();
      await page.keyboard.press("ArrowUp");
      await expect(content).toBeFocused();
      await expect(page).toHaveURL(/\/admin\/feedback$/);
      await page.keyboard.press("Space");
      await expect(page).toHaveURL(/\/admin$/);
      await expect(content).toHaveAttribute("aria-selected", "true");
    });

    test("Manage organization cancels and confirms unsaved settings", async ({
      page,
    }) => {
      await section(page, "Identity");
      const name = page.getByRole("textbox", { name: "Installation name" });
      await name.fill("Unsaved organization");
      await manage(page);
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(name).toHaveValue("Unsaved organization");
      await manage(page);
      await expect(dialog).toBeVisible();
      await dialog
        .getByRole("button", { name: "Confirm", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Content", exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(() => (window as any).globalLoadingFlashes),
      ).toEqual([]);
    });

    test("failed draft save keeps work on Cancel and completes the Content move on Confirm", async ({
      page,
    }, info) => {
      if (surface === "installed")
        await page.route("**/api/content**", (route) =>
          route.request().method() === "POST"
            ? route.fulfill({
                status: 503,
                json: { error: "Synthetic save failure" },
              })
            : route.continue(),
        );
      else
        await page.evaluate(() => {
          (window as any).rejectDraft = true;
        });
      await page
        .getByRole("button", { name: "Edit", exact: true })
        .first()
        .click();
      const title = page.getByRole("textbox", { name: "Title", exact: true });
      await title.fill("Keep this unsaved reference");
      await manage(page);
      const dialog = page.getByRole("alertdialog");
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(title).toHaveValue("Keep this unsaved reference");
      await expect(page.locator(".editor")).toBeVisible();
      await page.screenshot({ path: info.outputPath(`${surface}-cancel.png`) });
      await manage(page);
      await dialog
        .getByRole("button", { name: "Confirm", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Content", exact: true }),
      ).toBeVisible();
      await expect(page.getByText(doc.title, { exact: true })).toBeVisible();
      expect(
        await page.evaluate(() => (window as any).globalLoadingFlashes),
      ).toEqual([]);
    });
  });
}

test("manager keeps Team menu and cannot directly read or write Admin", async ({
  page,
  request,
}) => {
  await request.post(`${backend}/fixture`, {
    data: { settings: { access: "private" }, role: "manager" },
  });
  const token = await (
    await request.post(`${backend}/auth/v1/token`, { data: {} })
  ).json();
  await page
    .context()
    .addCookies([
      {
        name: "sb-test-auth-token",
        value:
          "base64-" +
          Buffer.from(
            JSON.stringify({
              ...token,
              expires_at: Math.floor(Date.now() / 1000) + 3600,
            }),
          ).toString("base64url"),
        domain: "localhost",
        path: "/",
      },
    ]);
  await page.goto("/courses");
  await navigation(page);
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "My team’s progress" }),
  ).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Manage organization" }),
  ).toHaveCount(0);
  expect((await page.request.get("/admin")).status()).toBe(404);
  for (const scope of ["content", "governance", "feedback", "deleted"])
    expect(
      (await page.request.get(`/api/admin/snapshot?scope=${scope}`)).status(),
    ).toBe(403);
  expect(
    (await page.request.get(`/api/content?id=${id}&draft=true`)).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/content", {
        data: { content: doc, expected: 1 },
        headers: { origin: "http://localhost:3131" },
      })
    ).status(),
  ).toBe(403);
});
