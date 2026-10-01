import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { authoringUser, setupAuthoringProvider } from "./provider-fixture";

async function setup(
  page: Page,
  installed: boolean,
  manager = false,
  external = false,
) {
  const data = freshWorkspace();
  const actor = data.users.find(
    (user) => user.id === (manager ? "demo-manager" : "demo-admin"),
  )!;
  data.content = data.content.filter((item) => item.kind === "doc").slice(0, 1);
  data.content[0].revision = 1;
  data.settings!.privacy = {
    publishedAt: "2026-01-01T00:00:00Z",
    draft: {
      mode: external ? "external" : "hosted",
      url: "https://policy.example.test/",
      operatorName: "Synthetic operator",
      contactEmail: "operator@example.test",
      body: "Synthetic policy.",
    },
    published: {
      mode: external ? "external" : "hosted",
      url: "https://policy.example.test/",
      operatorName: "Synthetic operator",
      contactEmail: "operator@example.test",
      body: "Synthetic policy.",
    },
  };
  const member = {
    ...data.users[0],
    id: "00000000-0000-4000-8000-000000000011",
    name: "Visible team member",
    email: "member@example.test",
    role: "learner" as const,
    teamId: "managed",
  };
  if (installed) {
    await setupAuthoringProvider(page, data);
    Object.assign(actor, {
      ...authoringUser,
      role: manager ? "manager" : "admin",
    });
    data.users = [actor, member];
  } else data.users = [actor, member];
  data.teams = [{ id: "managed", name: "Managed team", managerId: actor.id }];
  if (installed) {
    await page.request.post("http://127.0.0.1:3130/fixture", {
      data: {
        settings: data.settings,
        teams: data.teams,
        users: data.users.map((user) => ({
          ...user,
          team_id: user.teamId,
          group_joined_at: {},
        })),
        documents: data.content.map((item) => ({
          id: item.id,
          draft: item,
          published: item,
          revision: 1,
          published_revision: 1,
          updated_at: item.updatedAt,
        })),
      },
    });
    await page.route("**/api/admin/snapshot?**", (route) =>
      route.fulfill({ json: { data, user: actor } }),
    );
  } else {
    await page.addInitScript(
      ({ workspace, id }) => {
        localStorage.setItem(
          "fieldbook.workspace.v1",
          JSON.stringify(workspace),
        );
        sessionStorage.setItem("fieldbook.profile.v1", id);
      },
      { workspace: data, id: actor.id },
    );
  }
  await page.goto(
    manager
      ? installed
        ? "/team"
        : "/#team"
      : installed
        ? "/admin"
        : "/#admin",
  );
  return data;
}

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
async function account(page: Page, name: string) {
  await navigation(page);
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}
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
async function noNavigation(page: Page, select: () => Promise<void>) {
  const before = await page.evaluate(() => [location.href, history.length]);
  let routeRequests = 0;
  const listen = (request: import("@playwright/test").Request) => {
    if (
      request.resourceType() === "fetch" &&
      new URL(request.url()).searchParams.has("_rsc")
    )
      routeRequests++;
  };
  // Warm menu prefetch separately; only selection is under test.
  await page.evaluate(() => {
    (window as any).sawOpeningPage = false;
    const observer = new MutationObserver(() => {
      if (document.querySelector('[role="status"][aria-label="Opening page"]'))
        (window as any).sawOpeningPage = true;
    });
    observer.observe(document.body, { childList: true, subtree: true });
    (window as any).openingPageObserver = observer;
  });
  page.on("request", listen);
  await select();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  expect(await page.evaluate(() => [location.href, history.length])).toEqual(
    before,
  );
  expect(await page.evaluate(() => (window as any).sawOpeningPage)).toBe(false);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByRole("menu")).toHaveCount(0);
  expect(routeRequests).toBe(0);
  page.off("request", listen);
  await page.evaluate(() => (window as any).openingPageObserver.disconnect());
}

for (const entry of ["account menu", "breadcrumb"] as const) {
  test(`Administration ${entry} returns sections to Content and landing selection does not navigate`, async ({
    page,
  }, info) => {
    test.skip(
      entry === "breadcrumb" && (page.viewportSize()?.width || 0) < 768,
      "Breadcrumbs are hidden on phone layouts",
    );
    await setup(page, info.project.name.startsWith("production"));
    await section(page, "Identity");
    const name = page.getByRole("textbox", {
      name: "Installation name",
      exact: true,
    });
    await name.fill("Unsaved identity");
    const select = () =>
      entry === "account menu"
        ? account(page, "Manage organization")
        : page
            .getByRole("navigation", { name: "Breadcrumb" })
            .getByRole("link", { name: "Administration", exact: true })
            .click();
    await select();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(name).toHaveValue("Unsaved identity");
    await select();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Edit", exact: true }).first(),
    ).toBeVisible();
    if (entry === "account menu") {
      await navigation(page);
      await page
        .getByRole("button", { name: "Account menu", exact: true })
        .click();
      await noNavigation(page, () =>
        page
          .getByRole("menuitem", { name: "Manage organization", exact: true })
          .click(),
      );
    } else await noNavigation(page, select);
    await page
      .locator(".sidebar")
      .evaluate((node) =>
        Promise.all(
          node
            .getAnimations()
            .map((animation) => animation.finished.catch(() => {})),
        ),
      );
    await page.screenshot({
      path: info.outputPath(`${entry}-content-landing.png`),
    });
  });

  test(`Team progress ${entry} returns member details to the overview and landing selection does not navigate`, async ({
    page,
  }, info) => {
    test.skip(
      entry === "breadcrumb" && (page.viewportSize()?.width || 0) < 768,
      "Breadcrumbs are hidden on phone layouts",
    );
    await setup(page, info.project.name.startsWith("production"), true);
    await page
      .getByRole("button", { name: "View courses", exact: true })
      .first()
      .click();
    const details = page.getByRole("heading", {
      name: "Visible team member’s assignments",
      exact: true,
    });
    await expect(details).toBeVisible();
    const select = () =>
      entry === "account menu"
        ? account(page, "My team’s progress")
        : page
            .getByRole("navigation", { name: "Breadcrumb" })
            .getByRole("link", { name: "Team progress", exact: true })
            .click();
    await select();
    await expect(details).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: "People & completion", exact: true }),
    ).toBeVisible();
    if (entry === "account menu") {
      await navigation(page);
      await page
        .getByRole("button", { name: "Account menu", exact: true })
        .click();
      await noNavigation(page, () =>
        page
          .getByRole("menuitem", { name: "My team’s progress", exact: true })
          .click(),
      );
    } else await noNavigation(page, select);
    await page
      .locator(".sidebar")
      .evaluate((node) =>
        Promise.all(
          node
            .getAnimations()
            .map((animation) => animation.finished.catch(() => {})),
        ),
      );
    await page.screenshot({
      path: info.outputPath(`${entry}-team-landing.png`),
    });
  });
}

test("My team’s progress keeps a failed editor on Cancel and opens the manager panel on Confirm", async ({
  page,
}, info) => {
  const installed = info.project.name.startsWith("production");
  await setup(page, installed);
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  if (installed)
    await page.route("**/api/content*", (route) =>
      route.request().method() === "GET"
        ? route.continue()
        : route.fulfill({
            status: 503,
            json: { error: "Synthetic save unavailable" },
          }),
    );
  else
    await page.evaluate(() => {
      const setItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (key === "fieldbook.workspace.v1")
          throw new Error("Synthetic storage unavailable");
        return setItem.call(this, key, value);
      };
    });
  const title = page.getByRole("textbox", { name: "Title", exact: true });
  await title.fill("Keep this manager destination draft");
  const original = await title.elementHandle();
  await account(page, "My team’s progress");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(title).toHaveValue("Keep this manager destination draft");
  expect(await original!.evaluate((node) => node.isConnected)).toBe(true);
  await expect(page.locator(".admin-layout")).toHaveCount(0);
  await account(page, "My team’s progress");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page).toHaveURL(installed ? /\/team$/ : /#team$/);
  await expect(
    page.getByRole("heading", { name: "People & completion", exact: true }),
  ).toBeVisible();
  await expect(title).toHaveCount(0);
});

test("external privacy destination preserves unsaved settings on Cancel and navigates on Confirm", async ({
  page,
}, info) => {
  await setup(page, info.project.name.startsWith("production"), false, true);
  await page.route("https://policy.example.test/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<h1>Synthetic external policy</h1>",
    }),
  );
  await section(page, "Identity");
  const name = page.getByRole("textbox", {
    name: "Installation name",
    exact: true,
  });
  await name.fill("Keep unsaved privacy source");
  await account(page, "Privacy policy");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(name).toHaveValue("Keep unsaved privacy source");
  await account(page, "Privacy policy");
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page).toHaveURL("https://policy.example.test/");
  await expect(
    page.getByRole("heading", { name: "Synthetic external policy" }),
  ).toBeVisible();
});

test("switch profile or sign out keeps unsaved settings on Cancel and completes on Confirm", async ({
  page,
}, info) => {
  const installed = info.project.name.startsWith("production");
  await setup(page, installed);
  if (installed)
    await page.route("**/auth/logout", (route) =>
      route.fulfill({ json: { ok: true } }),
    );
  await section(page, "Identity");
  const name = page.getByRole("textbox", {
    name: "Installation name",
    exact: true,
  });
  await name.fill("Keep account settings");
  const select = async () => {
    if (installed) await account(page, "Sign out");
    else {
      await navigation(page);
      await page
        .getByRole("button", { name: "Switch demo profile", exact: true })
        .click();
    }
  };
  await select();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(name).toHaveValue("Keep account settings");
  await select();
  page.on("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  if (installed) await expect(page).not.toHaveURL(/\/admin$/);
  else
    await expect(
      page.getByRole("heading", { name: "Choose a demo profile", exact: true }),
    ).toBeVisible();
});

test("server roles still deny Admin entry and manager reports exclude other teams", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("production"),
    "Installed server authorization",
  );
  const data = await setup(page, true, true);
  const manager = data.users[0];
  data.users.push({
    ...data.users[1],
    id: "00000000-0000-4000-8000-000000000012",
    name: "Outside reporting scope",
    email: "outside@example.test",
    teamId: "other",
  });
  data.teams!.push({ id: "other", name: "Other team" });
  const fixture = (role = "manager", active = true) => ({
    settings: data.settings,
    teams: data.teams,
    users: data.users.map((user) => ({
      ...user,
      ...(user.id === manager.id ? { role, active } : {}),
      team_id: user.teamId,
      group_joined_at: {},
    })),
  });
  await page.request.post("http://127.0.0.1:3130/fixture", { data: fixture() });
  await page.reload();
  await expect(
    page.getByText("Visible team member", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Outside reporting scope", { exact: true }),
  ).toHaveCount(0);
  await navigation(page);
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "Manage organization", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("menuitem", { name: "My team’s progress", exact: true }),
  ).toBeVisible();
  for (const role of ["manager", "learner"]) {
    await page.request.post("http://127.0.0.1:3130/fixture", {
      data: fixture(role),
    });
    expect((await page.request.get("/admin")).status()).toBe(404);
    expect(
      (await page.request.get("/api/admin/snapshot?scope=content")).status(),
    ).toBe(403);
  }
  await page.request.post("http://127.0.0.1:3130/fixture", {
    data: fixture("admin", false),
  });
  expect(
    (await page.request.get("/api/admin/snapshot?scope=content")).status(),
  ).toBe(403);
  await page.context().clearCookies();
  expect(
    (await page.request.get("/api/admin/snapshot?scope=content")).status(),
  ).toBe(401);
  const signedOut = await page.request.get("/admin", { maxRedirects: 0 });
  expect(signedOut.status()).toBe(307);
  expect(signedOut.headers().location).toContain("/auth/sign-in?next=%2Fadmin");
});
