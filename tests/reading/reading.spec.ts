import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import type { Content } from "../../lib/types";
const backend = "http://127.0.0.1:3130";
const ids = [
  "00000000-0000-4000-8000-000000000021",
  "00000000-0000-4000-8000-000000000022",
  "00000000-0000-4000-8000-000000000023",
];
const items = ["doc", "brief", "course"].map((kind, index) => ({
  id: ids[index],
  kind,
  status: "published",
  title: `Published ${kind} title`,
  summary: `Useful ${kind} description`,
  body: `Meaningful ${kind} reading text.`,
  category: "Getting started",
  folder: "",
  version: 1,
  duration: 5,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-02",
  groups: ["hidden-group"],
  assignments: [] as Content["assignments"],
  lessons:
    kind === "course"
      ? [
          {
            id: "first",
            title: "First lesson",
            body: "Learn the first principle.",
          },
          {
            id: "second",
            title: "Second lesson",
            body: "Learn the second principle.",
          },
        ]
      : [],
  questions:
    kind === "course"
      ? [
          {
            id: "check",
            prompt: "Choose a principle",
            options: ["First", "Second"],
            answer: 1,
          },
        ]
      : [],
}));
function documents(overrides = items) {
  return overrides.map((item) => ({
    id: item.id,
    published: item,
    draft: { ...item, title: "SECRET DRAFT TITLE", body: "SECRET DRAFT BODY" },
    revision: 2,
    published_revision: 1,
    updated_at: item.updatedAt,
  }));
}
async function fixture(request: any, extra = {}) {
  await request.post(`${backend}/fixture`, {
    data: {
      settings: { access: "public", logoUrl: "" },
      documents: documents(),
      ...extra,
    },
  });
}
test.beforeEach(async ({ request }) => fixture(request));
for (const signedIn of [false, true]) {
  test(`${signedIn ? "signed-in" : "guest"} reader links keep the shell, history and compact content`, async ({
    page,
    request,
  }) => {
    const secondDoc = {
      ...items[0],
      id: "00000000-0000-4000-8000-000000000024",
      title: "Second reference document",
    };
    const secondUpdate = {
      ...items[1],
      id: "00000000-0000-4000-8000-000000000025",
      title: "Another published update",
      groups: [],
    };
    await fixture(request, {
      settings: {
        access: signedIn ? "private" : "public",
        guestGroupId: "child",
        logoUrl: "",
      },
      groups: [
        { id: "parent", name: "Internal group" },
        { id: "child", name: "Child group", parentId: "parent" },
      ],
      userGroups: signedIn ? ["child"] : [],
      documents: documents([
        { ...items[0], groups: [] },
        { ...items[1], groups: ["parent"] },
        items[2],
        secondDoc,
        secondUpdate,
      ]),
    });
    if (signedIn) {
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
    }
    let workspaceReads = 0;
    let documentNavigations = 0;
    page.on("request", (request) => {
      if (request.url().includes("/api/workspace")) workspaceReads++;
      if (request.isNavigationRequest()) documentNavigations++;
    });
    await page.goto("/updates");
    expect(documentNavigations).toBe(1);
    await expect(page.getByRole("heading", { name: "For you" })).toBeVisible();
    if (signedIn)
      expect(
        (await (await request.get(`${backend}/reads`)).json()).authReads,
      ).toBe(0);
    await expect
      .poll(async () => {
        const { readQueries } = await (
          await request.get(`${backend}/reads`)
        ).json();
        return readQueries.some((query: string) => {
          const params = new URLSearchParams(query);
          return (
            params.get("id") === `eq.${ids[1]}` &&
            params.get("select")?.includes("published_revision")
          );
        });
      })
      .toBe(true);
    const html = await page.content();
    if (!signedIn) {
      expect(html).not.toContain("Internal group");
      expect(html).not.toContain('"parent"');
    }
    await page.evaluate(() => ((window as any).__readerMarker = "kept"));
    await page.locator(`a.brief-card[href="/updates/${ids[1]}"]`).click();
    await expect(
      page.getByRole("heading", { name: items[1].title }),
    ).toBeVisible();
    expect(await page.evaluate(() => (window as any).__readerMarker)).toBe(
      "kept",
    );
    const updateQueries = (await (await request.get(`${backend}/reads`)).json())
      .readQueries;
    // The body may have arrived from an eager prefetch before the click.
    const bodyQueries = updateQueries.filter((query: string) =>
      new URLSearchParams(query).get("select")?.includes("published_revision"),
    );
    expect(bodyQueries.length).toBeGreaterThan(0);
    expect(
      bodyQueries.some((query: string) =>
        new URLSearchParams(query).get("select")?.includes("title:published"),
      ),
    ).toBe(false);
    await page.getByRole("link", { name: /Back to updates/ }).click();
    await expect(page).toHaveURL(/\/updates$/);
    if ((page.viewportSize()?.width || 0) < 768)
      await page.getByRole("button", { name: "Open navigation" }).click();
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Docs" })
      .click();
    await page.locator(`.knowledge-section a[href="/docs/${ids[0]}"]`).click();
    await expect(
      page.getByRole("heading", { name: items[0].title }),
    ).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/docs$/);
    await page.goForward();
    await expect(
      page.getByRole("heading", { name: items[0].title }),
    ).toBeVisible();
    await page.route("**/api/search?**", (route) =>
      route.fulfill({
        json: {
          results: [
            {
              contentId: secondUpdate.id,
              kind: "brief",
              title: secondUpdate.title,
              passageId: "content",
              lessonId: null,
              lessonTitle: null,
              excerpt: secondUpdate.summary,
              href: `/updates/${secondUpdate.id}`,
              highlights: [],
              publishedRevision: 1,
              contentDate: "2026-01-02T00:00:00.000Z",
            },
          ],
          hasMore: false,
        },
      }),
    );
    await page
      .getByRole("textbox", { name: "Search all content" })
      .fill("another");
    await page
      .getByRole("region", { name: "Search results" })
      .getByRole("link", { name: new RegExp(secondUpdate.title) })
      .click();
    await expect(
      page.getByRole("heading", { name: secondUpdate.title }),
    ).toBeVisible();
    expect(await page.evaluate(() => (window as any).__readerMarker)).toBe(
      "kept",
    );
    expect(documentNavigations).toBe(1);
    expect(workspaceReads).toBe(0);
  });
}
test("Courses share reader navigation and show the signed-in account immediately", async ({
  page,
  request,
}, info) => {
  await fixture(request, {
    settings: { access: "private", logoUrl: "" },
    groups: [{ id: "learning-group", name: "Learners" }],
    userGroups: ["learning-group"],
    documents: documents([
      items[0],
      items[1],
      { ...items[2], groups: ["learning-group"], assignments: undefined },
    ]),
    progress: [
      {
        user_id: "00000000-0000-4000-8000-000000000010",
        content_id: ids[2],
        version: 1,
        lessons: ["first", "second"],
        passed: true,
        attempts: [],
      },
    ],
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
  let workspaceReads = 0;
  let documentNavigations = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/workspace")) workspaceReads++;
    if (request.isNavigationRequest()) documentNavigations++;
  });
  await page.goto("/courses");
  await expect(
    page.getByRole("heading", { name: "Courses", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/1 course completed/)).toBeVisible();
  await expect(page.getByText("Assigned courses complete")).toBeVisible();
  await page.screenshot({
    path: info.outputPath("courses.png"),
    fullPage: true,
  });
  expect(await page.content()).toContain("Synthetic Admin");
  expect(await page.content()).not.toContain("SECRET DRAFT BODY");
  await page.evaluate(() => ((window as any).__readerMarker = "kept"));
  await page.locator(`a.course-card[href="/courses/${ids[2]}"]`).click();
  await expect(
    page.getByRole("heading", { name: items[2].title }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Back to courses/ }).click();
  await expect(page).toHaveURL(/\/courses$/);
  if ((page.viewportSize()?.width || 0) < 768)
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Updates" })
    .click();
  if ((page.viewportSize()?.width || 0) < 768) {
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Courses" })
      .click();
  } else {
    await page.getByRole("link", { name: "Organization", exact: true }).click();
  }
  await expect(page).toHaveURL(/\/courses$/);
  expect(await page.evaluate(() => (window as any).__readerMarker)).toBe(
    "kept",
  );
  expect(documentNavigations).toBe(1);
  expect(workspaceReads).toBe(0);
  await page.goto(`/courses/${ids[2]}`);
  await page.getByRole("link", { name: /First lesson/ }).click();
  const saved = page.waitForResponse(
    (response) =>
      response.url().includes("/api/progress") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Complete & continue" }).click();
  expect((await saved).status()).toBe(200);
});
test("client navigation rechecks publication, item type and installation access", async ({
  page,
  request,
}) => {
  const coldDoc = {
    ...items[0],
    id: "00000000-0000-4000-8000-000000000024",
    title: "Another published document",
  };
  const all = documents([...items, coldDoc]);
  for (const change of [
    "unpublished",
    "deleted",
    "wrong-type",
    "private",
  ] as const) {
    await fixture(request, { documents: all });
    await page.goto("/docs");
    const link = page.locator(
      `.knowledge-section a[href="/docs/${coldDoc.id}"]`,
    );
    await expect(link).toBeVisible();
    if (change === "private")
      await fixture(request, { settings: { access: "private", logoUrl: "" } });
    else if (change === "deleted")
      await fixture(request, {
        documents: all.filter((row) => row.id !== coldDoc.id),
      });
    else if (change === "unpublished")
      await fixture(request, {
        documents: all.map((row) =>
          row.id === coldDoc.id ? { ...row, published: null } : row,
        ),
      });
    else
      await fixture(request, {
        documents: all.map((row) =>
          row.id === coldDoc.id
            ? { ...row, published: { ...row.published, kind: "brief" } }
            : row,
        ),
      });
    await link.click();
    if (change === "private") await expect(page).toHaveURL(/\/sign-in/);
    else
      await expect(
        page.getByRole("heading", { name: "This page isn’t available" }),
      ).toBeVisible();
  }
});
test("server HTML, metadata, redaction and a compact index plus one body read", async ({
  request,
}) => {
  for (const [index, section] of ["docs", "updates", "courses"].entries()) {
    await fixture(request);
    const response = await request.get(`/${section}/${ids[index]}`);
    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");
    const html = await response.text();
    const beforeScripts = html.replace(/<script[\s\S]*?<\/script>/g, "");
    expect(beforeScripts).toContain(items[index].title);
    expect(beforeScripts).toContain(items[index].body);
    expect(html).toContain(
      `<title>${items[index].title} | Acme Learning</title>`,
    );
    expect(html).toContain(
      `name="description" content="${items[index].summary}"`,
    );
    expect(html).toContain(
      `property="og:title" content="${items[index].title} | Acme Learning"`,
    );
    expect(html).toContain(
      `property="og:description" content="${items[index].summary}"`,
    );
    expect(html).not.toContain("SECRET DRAFT");
    expect(html).not.toContain("hidden-group");
    expect(html).not.toContain("Synthetic Admin");
    expect(html).not.toMatch(/\\"answer\\":/);
    expect((await (await request.get(`${backend}/reads`)).json()).reads).toBe(
      2,
    );
  }
});
test("missing, wrong-kind, unpublished and service failures have real statuses", async ({
  request,
}) => {
  for (const path of [
    `/docs/missing`,
    `/docs/${ids[2]}`,
    `/courses/${ids[2]}?lesson=missing`,
    "/unknown/item",
    "/docs/too/many",
  ])
    expect((await request.get(path)).status(), path).toBe(404);
  await fixture(request, {
    documents: documents().map((row) => ({ ...row, published: null })),
  });
  expect((await request.get(`/docs/${ids[0]}`)).status()).toBe(404);
  await fixture(request, { fail: true });
  expect(
    (await request.get(`/docs/${ids[0]}`)).status(),
  ).toBeGreaterThanOrEqual(500);
});
test("feedback lookup checks guest access and publication without loading workspace", async ({
  browser,
  request,
  baseURL,
}) => {
  const guestLookup = await request.get(`/api/feedback?contentId=${ids[0]}`);
  expect(guestLookup.status()).toBe(200);
  expect(await guestLookup.json()).toEqual({ saved: null });
  const token = await (
    await request.post(`${backend}/auth/v1/token`, { data: {} })
  ).json();
  const context = await browser.newContext({ baseURL });
  await context.addCookies([
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
  const published = await context.request.get(
    `/api/feedback?contentId=${ids[0]}`,
  );
  expect(published.status()).toBe(200);
  expect(await published.json()).toEqual({ saved: null });
  await fixture(request, {
    documents: documents().map((row) => ({ ...row, published: null })),
  });
  expect(
    (await context.request.get(`/api/feedback?contentId=${ids[0]}`)).status(),
  ).toBe(404);
  await fixture(request, { settings: { access: "private" } });
  expect(
    (await request.get(`/api/feedback?contentId=${ids[0]}`)).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/feedback", {
        headers: { Origin: new URL(baseURL!).origin },
        data: { contentId: ids[0], rating: "up", comment: "Denied" },
      })
    ).status(),
  ).toBe(401);
  await context.close();
});
test("guest feedback persists in its browser and reaches administrator reports", async ({
  browser,
  page,
  request,
  baseURL,
}, info) => {
  await fixture(request, { settings: { access: "public" } });
  await page.goto(`/updates/${ids[1]}`);
  const region = page.getByRole("region", { name: "Content feedback" });
  await expect(
    region.getByRole("button", { name: "Useful", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("guest-update-feedback.png"),
    fullPage: true,
  });
  const saved = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/feedback") &&
      response.request().method() === "POST",
  );
  await region.getByRole("button", { name: "Useful", exact: true }).click();
  expect((await saved).status()).toBe(200);
  await page.reload();
  await expect(
    page
      .getByRole("region", { name: "Content feedback" })
      .getByRole("button", { name: "Useful", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const token = await (
    await request.post(`${backend}/auth/v1/token`, { data: {} })
  ).json();
  const admin = await browser.newContext({ baseURL });
  await admin.addCookies([
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
  const memberSave = await admin.request.post("/api/feedback", {
    headers: { Origin: new URL(baseURL!).origin },
    data: { contentId: ids[1], rating: "down", comment: "Account response" },
  });
  expect(memberSave.status()).toBe(200);
  const workspace = await (await admin.request.get("/api/workspace")).json();
  expect(workspace.data.feedback).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ userId: "guest", rating: "up" }),
      expect.objectContaining({ rating: "down", comment: "Account response" }),
    ]),
  );
  await admin.close();
});
test("private HTML and RSC requests redirect without item or draft data", async ({
  request,
}) => {
  await fixture(request, { settings: { access: "private", logoUrl: "" } });
  const next = `/courses/${ids[2]}?lesson=second`;
  for (const headers of [{}, { RSC: "1" }] as Record<string, string>[]) {
    let response = await request.get(next, { maxRedirects: 0, headers });
    if (response.headers().location?.startsWith(next + "&_rsc"))
      response = await request.get(response.headers().location, {
        maxRedirects: 0,
        headers,
      });
    const html = await response.text();
    if ("RSC" in headers) {
      expect(response.status()).toBe(200);
      expect(html).toContain("NEXT_REDIRECT");
      expect(html).toContain(`/auth/sign-in?next=${encodeURIComponent(next)}`);
    } else {
      expect(response.status()).toBe(307);
      expect(response.headers().location).toBe(
        `/auth/sign-in?next=${encodeURIComponent(next)}`,
      );
    }
    for (const item of items) {
      expect(html).not.toContain(item.title);
      expect(html).not.toContain(item.summary);
      expect(html).not.toContain(item.body);
    }
    expect(html).not.toContain("SECRET DRAFT");
  }
  const signin = await request.get(next);
  expect(new URL(signin.url()).pathname).toBe("/sign-in");
  expect((await signin.text()).replace(/<!--.*?-->/g, "")).toContain(
    "Sign in to Acme Learning",
  );
  expect(
    decodeURIComponent(
      (await request.storageState()).cookies.find(
        (c) => c.name === "fieldbook-sign-in-return",
      )!.value,
    ),
  ).toBe(next);
  expect((await (await request.get(`${backend}/reads`)).json()).reads).toBe(0);
});
test("publication and access changes are reflected on the next request", async ({
  request,
}) => {
  const path = `/docs/${ids[0]}`;
  expect((await request.get(path)).status()).toBe(200);
  await fixture(request, {
    documents: documents(
      items.map((item) => ({ ...item, title: "Edited published title" })),
    ),
  });
  expect(await (await request.get(path)).text()).toContain(
    "Edited published title",
  );
  await fixture(request, { documents: [] });
  expect((await request.get(path)).status()).toBe(404);
  await fixture(request, { settings: { access: "private", logoUrl: "" } });
  const privateResponse = await request.get(path, { maxRedirects: 0 });
  expect(privateResponse.status()).toBe(307);
  expect(await privateResponse.text()).not.toContain("Published doc title");
  await fixture(request);
  expect((await request.get(path)).status()).toBe(200);
});
test("reading without JavaScript, responsive layout and native breadcrumbs", async ({
  browser,
  baseURL,
}, info) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: info.project.use.viewport,
    baseURL,
  });
  const page = await context.newPage();
  await page.goto(`/docs/${ids[0]}`);
  await expect(
    page.getByRole("heading", { name: items[0].title }),
  ).toBeVisible();
  await expect(page.getByText(items[0].body, { exact: true })).toBeVisible();
  await expect(
    page.locator('nav[aria-label="Breadcrumb"] a[href="/docs"]'),
  ).toHaveAttribute("href", "/docs");
  await expectReadingWidth(page);
  await page.screenshot({
    path: info.outputPath("article-no-js.png"),
    fullPage: true,
  });
  await page.goto(`/courses/${ids[2]}`);
  await expect(
    page.getByRole("link", { name: /Second lesson/ }),
  ).toHaveAttribute("href", `/courses/${ids[2]}?lesson=second`);
  await page.screenshot({
    path: info.outputPath("course-no-js.png"),
    fullPage: true,
  });
  await context.close();
});
test("hydration keeps one article, breadcrumbs navigate, and lesson links open the player", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/docs/${ids[0]}`);
  await expect(page.getByRole("heading", { name: items[0].title })).toHaveCount(
    1,
  );
  await expect(page.getByText(items[0].body, { exact: true })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  if (info.project.name === "phone")
    await page.getByRole("link", { name: /Back to docs/ }).click();
  else {
    const crumb = page
      .getByRole("navigation", { name: "Breadcrumb" })
      .getByRole("link", { name: "Docs", exact: true });
    await crumb.focus();
    await crumb.press("Enter");
  }
  await expect(page).toHaveURL("/docs");
  await page.goto(`/courses/${ids[2]}`);
  await page.getByRole("link", { name: /Second lesson/ }).click();
  await expect(
    page.getByText("Learn the second principle.", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveTitle(`${items[2].title} | Acme Learning`);
  await page.screenshot({
    path: info.outputPath("lesson-player.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("private verified sessions refresh and do not contaminate anonymous responses", async ({
  browser,
  request,
  baseURL,
}) => {
  await fixture(request, {
    settings: { access: "private", logoUrl: "" },
    role: "learner",
  });
  const token = await (
    await request.post(`${backend}/auth/v1/token`, { data: {} })
  ).json();
  for (const expired of [false, true]) {
    const context = await browser.newContext({ baseURL });
    await context.addCookies([
      {
        name: "sb-test-auth-token",
        value:
          "base64-" +
          Buffer.from(
            JSON.stringify({
              ...token,
              expires_at:
                Math.floor(Date.now() / 1000) + (expired ? -60 : 3600),
            }),
          ).toString("base64url"),
        domain: "localhost",
        path: "/",
      },
    ]);
    const response = await context.request.get(`/docs/${ids[0]}`);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain(items[0].title);
    expect(html).not.toContain("admin@example.test");
    expect(html).toContain("Synthetic Admin");
    expect(html).not.toContain("SECRET DRAFT");
    if (expired)
      expect(response.headers()["set-cookie"]).toContain("sb-test-auth-token");
    const page = await context.newPage();
    await page.goto(`/docs/${ids[0]}`);
    await expect(
      page.getByRole("heading", { name: items[0].title }),
    ).toBeVisible();
    const openNavigation = page.getByRole("button", {
      name: "Open navigation",
      exact: true,
    });
    if (await openNavigation.isVisible()) await openNavigation.click();
    await expect(
      page.getByText("Synthetic Admin", { exact: true }),
    ).toBeVisible();
    await context.close();
  }
  const anonymous = await request.get(`/docs/${ids[0]}`, { maxRedirects: 0 });
  expect(anonymous.status()).toBe(307);
  expect(await anonymous.text()).not.toContain(items[0].title);
});
test("guest lessons and server-graded quiz retain browser progress", async ({
  page,
  request,
}) => {
  await page.goto(`/courses/${ids[2]}?lesson=first`);
  await page.getByRole("button", { name: "Complete & continue" }).click();
  await page.getByRole("button", { name: "Continue to quiz" }).click();
  await page.getByRole("radio", { name: "Second", exact: true }).check();
  await page.getByRole("button", { name: "Check answers" }).click();
  await expect(
    page.getByText("Great work. You’ve completed this course."),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Content feedback" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("Completed", { exact: true }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem("fieldbook.guest-progress.v1") || "[]",
        )[0]?.passed,
    ),
  ).toBe(true);
  await page.goto("/courses");
  await expect(page.getByText(/1 course completed/)).toBeVisible();
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
  await page.reload();
  await page
    .getByRole("region", { name: "Import browser progress" })
    .getByRole("button", { name: "Save browser progress to my account" })
    .click();
  await expect(page.getByText(/1 course completed/)).toBeVisible();
  expect(
    await page.evaluate(() =>
      localStorage.getItem("fieldbook.guest-progress.v1"),
    ),
  ).toBeNull();
});

test("signed-in lessons keep the reader shell and persist server-graded progress", async ({
  page,
  request,
}) => {
  await fixture(request, {
    settings: { access: "private", logoUrl: "" },
    role: "learner",
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
  let documentNavigations = 0;
  let workspaceReads = 0;
  page.on("request", (entry) => {
    if (entry.isNavigationRequest()) documentNavigations++;
    if (entry.url().includes("/api/workspace")) workspaceReads++;
  });
  await page.goto(`/courses/${ids[2]}`);
  await page.getByRole("link", { name: /First lesson/ }).click();
  await expect(page).toHaveURL(new RegExp(`/courses/${ids[2]}\\?lesson=first`));
  await page.getByRole("button", { name: "Complete & continue" }).click();
  await page.getByRole("button", { name: "Continue to quiz" }).click();
  await page.getByRole("radio", { name: "First", exact: true }).check();
  await page.getByRole("button", { name: "Check answers" }).click();
  await expect(
    page.getByText("Not quite yet. Revisit the lessons and try again."),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Second", exact: true }).check();
  await page.getByRole("button", { name: "Check answers" }).click();
  await expect(
    page.getByText("Great work. You’ve completed this course."),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Content feedback" }),
  ).toBeVisible();
  expect(documentNavigations).toBe(1);
  expect(workspaceReads).toBe(0);
  const saved = await (
    await request.get(`${backend}/rest/v1/fb_progress?content_id=eq.${ids[2]}`)
  ).json();
  expect(saved[0]).toMatchObject({
    lessons: ["first", "second"],
    passed: true,
  });
  expect(saved[0].attempts).toHaveLength(2);
  await page.getByRole("button", { name: /Back to course/ }).first().click();
  await expect(page).toHaveURL(new RegExp(`/courses/${ids[2]}$`));
  await page.getByRole("link", { name: /Back to courses/ }).click();
  await expect(page.getByText(/1 course completed/)).toBeVisible();
  expect(documentNavigations).toBe(1);
  await page.reload();
  await expect(
    page.getByText("Completed", { exact: true }).first(),
  ).toBeVisible();
});

test("legacy aliases, curriculum destinations and existing logo metadata", async ({
  request,
}) => {
  await fixture(request, { settings: { access: "public" } });
  for (const [index, section] of ["knowledge", "notes", "learning"].entries()) {
    const response = await request.get(
      `/${section}/${ids[index]}?curriculum=intro`,
    );
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain(
      'property="og:image" content="http://localhost:3131/api/branding/logo?v=',
    );
    expect(html).not.toContain("SECRET POLICY DRAFT");
    if (index === 2) {
      expect(html).toContain(`?lesson=first&amp;curriculum=intro`);
      expect(html).toContain('href="/curricula/intro"');
    }
  }
});

test("reader does not load workspace and picks up republished content on reload", async ({
  page,
  request,
}) => {
  let workspaceReads = 0;
  await page.route("**/api/workspace", async (route) => {
    workspaceReads++;
    await route.continue();
  });
  await page.goto(`/docs/${ids[0]}`);
  await expect(page).toHaveTitle(`${items[0].title} | Acme Learning`);
  expect(workspaceReads).toBe(0);
  await fixture(request, {
    documents: documents(
      items.map((item) => ({ ...item, title: "New published revision" })),
    ).map((row) => ({ ...row, published_revision: 2, revision: 3 })),
  });
  await page.reload();
  await expect(page).toHaveTitle("New published revision | Acme Learning");
  await expect(
    page.getByRole("heading", { name: "New published revision" }),
  ).toHaveCount(1);
  await expect(page.getByRole("heading", { name: items[0].title })).toHaveCount(
    0,
  );
});

async function expectReadingWidth(page: Page) {
  const geometry = await page.locator("article.article").evaluate((article) => {
    const main = article.closest("main")!;
    const style = getComputedStyle(main);
    const available =
      main.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight);
    const rect = article.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    return {
      actual: rect.width,
      expected: Math.min(
        available,
        parseFloat(getComputedStyle(article).maxWidth),
      ),
      center: rect.x + rect.width / 2,
      mainCenter: mainRect.x + mainRect.width / 2,
      overflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    };
  });
  expect(Math.abs(geometry.actual - geometry.expected)).toBeLessThan(2);
  expect(Math.abs(geometry.center - geometry.mainCenter)).toBeLessThan(2);
  expect(geometry.overflow).toBe(false);
}

test("short and long articles fill the shared reading width in both apps", async ({
  page,
  request,
}, info) => {
  for (const app of ["production", "demo"]) {
    for (const [index, section] of ["docs", "updates"].entries()) {
      for (const length of ["short", "long"]) {
        const item = {
          ...items[index],
          title:
            length === "short"
              ? "Test update"
              : "A longer reading title with useful details for everyone",
          summary:
            length === "short"
              ? "la, la, la"
              : "Useful information for the reader. ".repeat(12),
          body:
            length === "short"
              ? "This is text."
              : "A longer paragraph explaining the published information. ".repeat(
                  30,
                ),
        };
        if (app === "production") {
          await fixture(request, { documents: documents([item]) });
          await page.goto(`/${section}/${item.id}`);
        } else {
          await page.goto("http://localhost:3132");
          const data = freshWorkspace();
          data.content = [item] as typeof data.content;
          await page.evaluate((data) => {
            localStorage.setItem(
              "fieldbook.workspace.v1",
              JSON.stringify(data),
            );
            sessionStorage.setItem("fieldbook.profile.v1", "demo-learner");
          }, data);
          await page.goto(`http://localhost:3132/#${section}/${item.id}`);
          await page.reload();
        }
        await expect(page.locator("article h1")).toHaveText(item.title);
        await expectReadingWidth(page);
        if (length === "short")
          await page.screenshot({
            path: info.outputPath(`${app}-${section}-short.png`),
            fullPage: true,
          });
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "200%";
        });
        await expectReadingWidth(page);
      }
    }
  }
});

test("content feedback saves ratings and comments with retry and focus return", async ({
  page,
  request,
}, info) => {
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
  let fail = false;
  const writes: Array<{ rating: string; comment: string }> = [];
  await page.route("**/api/feedback**", async (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { saved: null } });
    const entry = route.request().postDataJSON();
    writes.push(entry);
    if (fail)
      return route.fulfill({
        status: 503,
        json: { error: "Feedback temporarily unavailable. Try again." },
      });
    await route.fulfill({ json: { saved: true } });
  });
  await page.goto(`/updates/${ids[1]}`);
  const region = page.getByRole("region", { name: "Content feedback" });
  const useful = region.getByRole("button", { name: "Useful", exact: true });
  await useful.click();
  const form = page.getByRole("form", {
    name: "Did you find this useful?",
    exact: true,
  });
  await expect(form.getByRole("textbox")).toBeFocused();
  await expect(
    form.getByRole("button", { name: "Send", exact: true }),
  ).toBeEnabled();
  expect(writes.at(-1)).toMatchObject({ rating: "up", comment: "" });
  await form.getByRole("textbox").fill("Clear and useful. Keep this draft.");
  {
    fail = true;
    await form.getByRole("button", { name: "Send", exact: true }).click();
    await expect(form.getByRole("alert")).toContainText(
      "Feedback temporarily unavailable",
    );
    await expect(form.getByRole("textbox")).toHaveValue(
      "Clear and useful. Keep this draft.",
    );
    await page.screenshot({
      path: info.outputPath("feedback-save-error.png"),
      fullPage: true,
    });
    await expect(
      form.getByRole("button", { name: "Send", exact: true }),
    ).toBeInViewport({ ratio: 1 });
    fail = false;
  }
  await page.screenshot({
    path: info.outputPath("content-feedback-open.png"),
    fullPage: true,
  });
  await form.getByRole("button", { name: "Send", exact: true }).click();
  await expect(form).toBeHidden();
  await expect(useful).toBeFocused();
  await expect(region.getByRole("status")).toHaveText("Feedback saved.");
  await region
    .getByRole("button", { name: "Did you find this useful?", exact: true })
    .click();
  await expect(form.getByRole("textbox")).toHaveValue(
    "Clear and useful. Keep this draft.",
  );
  await form.getByRole("textbox").fill("Unsent draft");
  await form.getByRole("button", { name: "Not useful", exact: true }).click();
  await expect(
    form.getByRole("button", { name: "Send", exact: true }),
  ).toBeEnabled();
  expect(writes.at(-1)).toMatchObject({
    rating: "down",
    comment: "Clear and useful. Keep this draft.",
  });
  await form.getByRole("textbox").press("Escape");
  await expect(form).toBeHidden();
  await page.screenshot({
    path: info.outputPath("content-feedback-compact.png"),
    fullPage: true,
  });
});
