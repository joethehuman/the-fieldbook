import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
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
  assignments: [],
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
test("server HTML, metadata, redaction and one item read per request", async ({
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
      1,
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
    expect((await request.get(path)).status()).toBe(404);
  await fixture(request, {
    documents: documents().map((row) => ({ ...row, published: null })),
  });
  expect((await request.get(`/docs/${ids[0]}`)).status()).toBe(404);
  await fixture(request, { fail: true });
  expect(
    (await request.get(`/docs/${ids[0]}`)).status(),
  ).toBeGreaterThanOrEqual(500);
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
    await page.getByRole("button", { name: "← Back to docs" }).click();
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
    expect(html).not.toContain("Synthetic Admin");
    expect(html).not.toContain("SECRET DRAFT");
    if (expired)
      expect(response.headers()["set-cookie"]).toContain("sb-test-auth-token");
    const page = await context.newPage();
    await page.goto(`/docs/${ids[0]}`);
    await expect(
      page.getByRole("heading", { name: items[0].title }),
    ).toBeVisible();
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
}) => {
  await page.goto(`/courses/${ids[2]}?lesson=first`);
  await page.getByRole("button", { name: "Complete & continue" }).click();
  await page.getByRole("button", { name: "Continue to quiz" }).click();
  await page.getByRole("radio", { name: "Second", exact: true }).check();
  await page.getByRole("button", { name: "Check answers" }).click();
  await expect(
    page.getByText("Great work. You’ve completed this course."),
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

test("republishing during hydration keeps article and metadata on one revision", async ({
  page,
  request,
}) => {
  let changed = false;
  await page.route("**/api/workspace", async (route) => {
    if (!changed) {
      changed = true;
      await fixture(request, {
        documents: documents(
          items.map((item) => ({ ...item, title: "New published revision" })),
        ).map((row) => ({ ...row, published_revision: 2, revision: 3 })),
      });
    }
    await route.continue();
  });
  await page.goto(`/docs/${ids[0]}`);
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
