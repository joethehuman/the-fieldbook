import { test, expect, type Page } from "@playwright/test";
const backend = "http://127.0.0.1:3130";
const docId = "00000000-0000-4000-8000-000000000041";
const owner = "00000000-0000-4000-8000-000000000010";
const doc = {
  id: docId,
  kind: "doc",
  status: "published",
  title: "Shared shell reference",
  summary: "Searchable shared shell reference",
  body: "The complete visible reference body.",
  category: "Reference",
  folder: "",
  version: 1,
  duration: 5,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-02",
  groups: [],
  assignments: [],
  lessons: [],
  questions: [],
};
const fixture = {
  settings: {
    access: "private",
    homePage: "docs",
    privacy: {
      published: {
        mode: "hosted",
        operatorName: "Synthetic operator",
        contactEmail: "operator@example.test",
        body: "Synthetic policy.",
        url: "",
      },
    },
  },
  teams: [{ id: "managed", name: "Managed team", managerId: owner }],
  documents: [
    {
      id: doc.id,
      published: doc,
      draft: doc,
      revision: 1,
      published_revision: 1,
      updated_at: doc.updatedAt,
    },
  ],
};
async function openNavigation(page: Page) {
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
async function account(page: Page, destination: string) {
  await openNavigation(page);
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: destination, exact: true }).click();
}
test.beforeEach(async ({ page, request }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await request.post(`${backend}/fixture`, { data: fixture });
  await page.route("**/api/search?**", (route) =>
    route.fulfill({
      json: {
        hasMore: false,
        results: [
          {
            contentId: docId,
            kind: "doc",
            title: doc.title,
            passageId: "body",
            lessonId: null,
            lessonTitle: null,
            publishedRevision: 1,
            contentDate: null,
            excerpt: doc.summary,
            href: `/docs/${docId}`,
            highlights: [],
          },
        ],
      },
    }),
  );
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
});

test("Admin, Team and reader keep one frame, search controller and account with fresh document navigation", async ({
  page,
  request,
}, info) => {
  let documentRequests = 0;
  let workspaceReads = 0;
  page.on("request", (request) => {
    if (request.isNavigationRequest()) documentRequests++;
    if (request.url().includes("/api/workspace")) workspaceReads++;
  });
  await page.goto("/admin");
  await expect(page.locator(".admin-layout:visible")).toBeVisible();
  await page.evaluate(() => {
    (window as any).shellReferences = [
      document.querySelector(".app"),
      document.querySelector(".topbar"),
      document.querySelector(".sidebar"),
      document.querySelector('[aria-label="Search all content"]'),
    ];
  });
  await page
    .getByRole("textbox", { name: "Search all content" })
    .fill("reference");
  await expect(
    page.getByRole("region", { name: "Search results" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search all content" })
    .press("Escape");
  await openNavigation(page);
  await page.getByRole("link", { name: "Docs", exact: true }).first().click();
  await expect(
    page.getByRole("heading", { name: doc.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.sidebar a[href="/docs/' + docId + '"]'),
  ).toHaveCount(1);
  await account(page, "My team’s progress");
  await expect(page).toHaveURL(/\/team$/);
  await expect(
    page.getByRole("heading", { name: "Team progress", exact: true }),
  ).toBeVisible();
  await openNavigation(page);
  await page.getByRole("link", { name: "Docs", exact: true }).first().click();
  await expect(
    page.getByRole("heading", { name: doc.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.locator('.sidebar a[href="/docs/' + docId + '"]'),
  ).toHaveCount(1);
  await account(page, "Manage organization");
  await expect(page.locator(".admin-layout:visible")).toBeVisible();
  expect(
    await page.evaluate(() => {
      const current = [
        document.querySelector(".app"),
        document.querySelector(".topbar"),
        document.querySelector(".sidebar"),
        document.querySelector('[aria-label="Search all content"]'),
      ];
      return current.every(
        (element, index) => element === (window as any).shellReferences[index],
      );
    }),
  ).toBe(true);
  await expect(
    page.getByRole("textbox", { name: "Search all content" }),
  ).toHaveValue("reference");
  await expect(page.locator(".sidebar")).toHaveCount(1);
  await expect(page.locator('[aria-label="Account menu"]')).toHaveCount(1);
  expect(documentRequests).toBe(1);
  expect(workspaceReads).toBe(0);
  await page.screenshot({
    path: info.outputPath("persistent-admin-frame.png"),
    fullPage: true,
  });
  // The presentation owner cannot confer authority after a role change.
  await request.post(`${backend}/fixture`, {
    data: { ...fixture, role: "learner" },
  });
  expect(
    (await page.request.get("/api/admin/snapshot?scope=content")).status(),
  ).toBe(403);
  expect((await page.request.get("/admin")).status()).toBe(404);
});

test("approved cold navigation retains content without a global indicator while preserving the old body and modified anchors remain native", async ({
  page,
}) => {
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/updates**", async (route) => {
    if (route.request().resourceType() === "fetch") await held;
    await route.continue();
  });
  await page.goto("/admin");
  await expect(page.locator(".admin-layout:visible")).toBeVisible();
  await openNavigation(page);
  const docs = page.getByRole("link", { name: "Docs", exact: true }).first();
  expect(
    await docs.evaluate((anchor) => {
      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        metaKey: true,
      });
      anchor.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(false);
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("link", { name: "Updates", exact: true }).click();
  await expect(
    page.getByRole("status", { name: "Opening page", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".admin-layout:visible")).toBeVisible();
  release();
  await expect(page).toHaveURL(/\/updates$/);
  await expect(
    page.getByRole("status", { name: "Opening page", exact: true }),
  ).toHaveCount(0);
});

test("dirty Admin navigation and search results require approval before editor removal", async ({
  page,
}) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await page
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Keep this draft");
  await account(page, "Privacy policy");
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await openNavigation(page);
  await page.getByRole("link", { name: "Docs", exact: true }).first().click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Opening page", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue("Keep this draft");
  const close = page.getByRole("button", {
    name: "Close navigation",
    exact: true,
  });
  if (await close.isVisible()) await close.click();
  await page
    .getByRole("textbox", { name: "Search all content" })
    .fill("reference");
  const results = page.getByRole("region", { name: "Search results" });
  await results
    .getByRole("link", { name: new RegExp(doc.title) })
    .first()
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Title", exact: true }),
  ).toHaveValue("Keep this draft");
  await page
    .getByRole("textbox", { name: "Search all content" })
    .press("Escape");
  await openNavigation(page);
  await page.getByRole("link", { name: "Docs", exact: true }).first().click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: doc.title, exact: true }),
  ).toBeVisible();
});

test("leaf navigation refreshes added, renamed and removed Docs after direct Team entry", async ({
  page,
  request,
}) => {
  const secondId = "00000000-0000-4000-8000-000000000042";
  const removedId = "00000000-0000-4000-8000-000000000043";
  const newId = "00000000-0000-4000-8000-000000000044";
  const second = { ...doc, id: secondId, title: "Second reference" };
  const removed = { ...doc, id: removedId, title: "Removed reference" };
  const rows = (items: (typeof doc)[]) =>
    items.map((item) => ({
      id: item.id,
      published: item,
      draft: item,
      revision: 1,
      published_revision: 1,
      updated_at: item.updatedAt,
    }));
  await request.post(`${backend}/fixture`, {
    data: { ...fixture, documents: rows([doc, second, removed]) },
  });
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/docs/${secondId}**`, async (route) => {
    await held;
    await route.continue();
  });
  await page.goto("/team");
  await expect(
    page.getByRole("heading", { name: "Team progress", exact: true }),
  ).toBeVisible();
  await openNavigation(page);
  await page.getByRole("link", { name: "Docs", exact: true }).first().click();
  await expect(
    page.getByRole("heading", { name: doc.title, exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(`.sidebar a[href="/docs/${secondId}"]`),
  ).toHaveCount(1);
  await request.post(`${backend}/fixture`, {
    data: {
      ...fixture,
      documents: rows([
        { ...doc, title: "Renamed first reference" },
        { ...second, title: "Renamed second reference" },
        { ...doc, id: newId, title: "Added reference" },
      ]),
    },
  });
  await openNavigation(page);
  await page.locator(`.sidebar a[href="/docs/${secondId}"]`).click();
  release();
  await expect(
    page.getByRole("heading", {
      name: "Renamed second reference",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(`.sidebar a[href="/docs/${docId}"]`)).toContainText(
    "Renamed first reference",
  );
  await expect(page.locator(`.sidebar a[href="/docs/${newId}"]`)).toContainText(
    "Added reference",
  );
  await expect(
    page.locator(`.sidebar a[href="/docs/${removedId}"]`),
  ).toHaveCount(0);
  await expect(page.locator('.breadcrumb [aria-current="page"]')).toHaveText(
    "Renamed second reference",
  );
});

test("course progress refresh updates shell presentation while keeping its lesson step", async ({
  page,
  request,
}) => {
  const courseId = "00000000-0000-4000-8000-000000000045";
  const course = {
    ...doc,
    id: courseId,
    kind: "course",
    title: "Refresh course",
    lessons: [
      { id: "first", title: "First lesson", body: "First complete lesson." },
      { id: "second", title: "Second lesson", body: "Second complete lesson." },
    ],
  };
  const courseFixture = {
    ...fixture,
    documents: [
      {
        id: course.id,
        published: course,
        draft: course,
        revision: 1,
        published_revision: 1,
        updated_at: course.updatedAt,
      },
    ],
  };
  await request.post(`${backend}/fixture`, { data: courseFixture });
  await page.goto(`/courses/${courseId}`);
  await expect(
    page.getByRole("heading", { name: "First lesson", exact: true }),
  ).toBeVisible();
  await request.post(`${backend}/fixture`, {
    data: {
      ...courseFixture,
      settings: { ...fixture.settings, name: "Refreshed installation" },
    },
  });
  await page.getByRole("button", { name: /^Next lesson/ }).click();
  await expect(
    page.getByRole("heading", { name: "Second lesson", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".sidebar .logo")).toContainText(
    "Refreshed installation",
  );
  await expect(page).toHaveURL(new RegExp(`/courses/${courseId}$`));
});

test("dirty Identity settings protect Back and allow Forward to return to a clean form", async ({
  page,
}) => {
  await page.goto("/docs");
  await account(page, "Manage organization");
  await expect(page.locator(".admin-layout:visible")).toBeVisible();
  const picker = page.getByRole("combobox", {
    name: "Administration section",
    exact: true,
  });
  if (await picker.isVisible()) {
    await picker.click();
    await page.getByRole("option", { name: "Identity", exact: true }).click();
  } else await page.getByRole("tab", { name: "Identity", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Installation name", exact: true })
    .fill("Keep dirty settings");
  await page.evaluate(() => history.back());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Installation name", exact: true }),
  ).toHaveValue("Keep dirty settings");
  await page.evaluate(() => history.back());
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page).toHaveURL(/\/docs$/);
  await page.evaluate(() => history.forward());
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator(".admin-layout:visible")).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.evaluate(() => history.forward());
  await expect(page).toHaveURL(/\/admin$/);
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/docs$/);
});

async function adminSection(page: Page, name: string) {
  await expect(page.locator(".admin-layout:visible")).toBeVisible();
  const picker = page.getByRole("combobox", {
    name: "Administration section",
    exact: true,
  });
  if ((page.viewportSize()?.width ?? 1000) < 768) {
    await picker.click();
    await page.getByRole("option", { name, exact: true }).click();
  } else await page.getByRole("tab", { name, exact: true }).click();
}

test("approved dirty link removes its sentinel before Back twice and Forward", async ({
  page,
}) => {
  await page.goto("/updates");
  await openNavigation(page);
  await page.getByRole("link", { name: "Docs", exact: true }).first().click();
  await expect(
    page.getByRole("heading", { name: doc.title, exact: true }),
  ).toBeVisible();
  await account(page, "Manage organization");
  await adminSection(page, "Curricula");
  await page
    .getByRole("button", { name: "Create curriculum", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Unsaved curriculum");
  await page.evaluate(() => history.back());
  await expect(page.getByRole("alertdialog")).toContainText(
    "Discard unsaved curriculum changes?",
  );
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Unsaved curriculum");
  await openNavigation(page);
  await page.getByRole("link", { name: "Docs", exact: true }).first().click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page).toHaveURL(/\/docs$/);
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator(".admin-layout:visible")).toBeVisible();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/docs$/);
  await page.evaluate(() => history.forward());
  await expect(page).toHaveURL(/\/admin$/);
  await page.evaluate(() => history.forward());
  await expect(page).toHaveURL(/\/docs$/);
});

test("clean to immediate re-dirty during queued cleanup rearms a fresh owned history pair", async ({
  page,
}) => {
  await page.goto("/docs");
  await account(page, "Manage organization");
  await adminSection(page, "Identity");
  const name = page.getByRole("textbox", {
    name: "Installation name",
    exact: true,
  });
  const original = await name.inputValue();
  await name.fill("First dirty edit");
  await expect
    .poll(() => page.evaluate(() => history.state?.__fieldbookNavigation?.kind))
    .toBe("sentinel");
  const previousOwner = await page.evaluate(
    () => history.state.__fieldbookNavigation.owner,
  );
  // Delay only the native cleanup traversal, reproducing a fast second edit before its popstate.
  await page.evaluate(() => {
    const nativeBack = history.back.bind(history);
    (window as any).releaseCleanup = () => {
      history.back = nativeBack;
      nativeBack();
    };
    history.back = () => {
      (window as any).cleanupQueued = true;
    };
  });
  await name.fill(original);
  await expect
    .poll(() => page.evaluate(() => (window as any).cleanupQueued))
    .toBe(true);
  await name.fill("Second protected edit");
  await page.evaluate(() => (window as any).releaseCleanup());
  await expect
    .poll(() =>
      page.evaluate(() => history.state?.__fieldbookNavigation?.owner),
    )
    .not.toBe(previousOwner);
  await expect
    .poll(() => page.evaluate(() => history.state?.__fieldbookNavigation?.kind))
    .toBe("sentinel");
  await page.evaluate(() => history.back());
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(name).toHaveValue("Second protected edit");
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/settings", async (route) => {
    await held;
    await route.fulfill({
      status: 503,
      json: { error: "Synthetic save blocked" },
    });
  });
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Saving…", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => history.back());
  await expect
    .poll(() => page.evaluate(() => history.state?.__fieldbookNavigation?.kind))
    .toBe("sentinel");
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  release();
  await expect(page.locator(".settings-panel")).toContainText(
    "Synthetic save blocked",
  );
  await page.evaluate(() => history.back());
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page).toHaveURL(/\/docs$/);
});

test("failed logout preserves the signed-in page and offers a retry", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(page.locator(".admin-layout:visible")).toBeVisible();
  await page.route("**/auth/logout", (route) =>
    route.fulfill({ status: 503, json: { error: "Unavailable" } }),
  );
  await account(page, "Sign out");
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Could not sign out. Try again." }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator(".admin-layout:visible")).toBeVisible();
});

test("saved settings keep a single Admin stop through Back and repeated Forward", async ({
  page,
  request,
}) => {
  await page.goto("/docs");
  await account(page, "Manage organization");
  await adminSection(page, "Identity");
  const name = page.getByRole("textbox", {
    name: "Installation name",
    exact: true,
  });
  await name.fill("Saved installation");
  await page.route("**/api/settings", async (route) => {
    await request.post(`${backend}/fixture`, {
      data: {
        ...fixture,
        settings: { ...fixture.settings, name: "Saved installation" },
      },
    });
    await route.fulfill({ json: { revision: 2 } });
  });
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    page.getByText("Settings saved.", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => history.state?.__fieldbookNavigation?.kind))
    .toBe("base");
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/docs$/);
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await page.evaluate(() => history.forward());
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.locator(".admin-layout:visible")).toBeVisible();
  await page.evaluate(() => history.forward());
  await expect(page).toHaveURL(/\/admin$/);
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(/\/docs$/);
});

test("installed tablet keeps the frame and settled Admin and reader geometry", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "One targeted installed tablet capture.",
  );
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/admin");
  await expect(page.locator(".admin-layout:visible")).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "Content", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("installed-tablet-admin.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Edit", exact: true }).first().click();
  await expect(
    page.getByRole("button", { name: /Commands: insert blocks or format selected text/ }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("installed-tablet-editor.png"),
    fullPage: true,
  });
  await page.evaluate(
    () => ((window as any).tabletFrame = document.querySelector(".app")),
  );
  await page.getByRole("link", { name: "Docs", exact: true }).first().click();
  await expect(
    page.getByRole("heading", { name: doc.title, exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as any).tabletFrame === document.querySelector(".app"),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("installed-tablet-reader.png"),
    fullPage: true,
  });
});

for (const section of ["updates", "courses", "curricula"] as const) {
  test(`cold ${section} detail navigation updates its title without the hidden Docs/Updates index`, async ({
    page,
    request,
  }) => {
    const item = {
      ...doc,
      id: "00000000-0000-4000-8000-000000000046",
      kind: section === "updates" ? "brief" : "course",
      title: "Narrow detail",
      lessons: [
        {
          id: "lesson",
          title: "Complete lesson",
          body: "Complete narrow lesson.",
        },
      ],
    };
    const detailFixture = {
      ...fixture,
      curricula: [
        {
          id: "narrow-curriculum",
          name: "Narrow curriculum",
          description: "A focused path",
          courseIds: [item.id],
          status: "published",
          groups: [],
        },
      ],
      documents: [
        {
          id: item.id,
          published: item,
          draft: item,
          revision: 1,
          published_revision: 1,
          updated_at: item.updatedAt,
        },
      ],
    };
    await request.post(`${backend}/fixture`, { data: detailFixture });
    // Isolate this detail read from the shell's ordinary primary-list prefetches.
    await page.route("**/*", async (route) => {
      const target = new URL(route.request().url());
      if (
        route.request().resourceType() === "fetch" &&
        ["/docs", "/updates", "/courses"].includes(target.pathname)
      )
        await route.abort();
      else await route.continue();
    });
    await page.goto("/team");
    await expect(
      page.getByRole("heading", { name: "Team progress", exact: true }),
    ).toBeVisible();
    // A new governance revision makes any unintended index read cold, rather than hiding it in shared cache.
    await request.post(`${backend}/fixture`, { data: detailFixture });
    const path =
      section === "curricula"
        ? "/curricula/narrow-curriculum"
        : `/${section}/${item.id}`;
    await page.evaluate((href) => {
      const a = document.createElement("a");
      a.href = href;
      a.textContent = "Open cold detail";
      document.querySelector("main")!.append(a);
    }, path);
    await page
      .getByRole("link", { name: "Open cold detail", exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(path + "$"));
    await expect(page.locator('.breadcrumb [aria-current="page"]')).toHaveText(
      section === "curricula" ? "Narrow curriculum" : item.title,
    );
    const { readQueries } = await (
      await request.get(`${backend}/reads`)
    ).json();
    expect(
      readQueries.filter((query: string) =>
        new URLSearchParams(query)
          .get("select")
          ?.includes("sectionId:published"),
      ),
    ).toHaveLength(0);
    await expect(page.locator('.sidebar a[href^="/docs/"]')).toHaveCount(0);
  });
}
