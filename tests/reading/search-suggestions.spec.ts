import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import type { Content } from "../../lib/types";

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function fixture(
  page: Page,
  request: APIRequestContext,
  signedIn: boolean,
) {
  const base = freshWorkspace().content.find((item) => item.kind === "course")!;
  const courses: Content[] = [
    "Assigned course",
    "Started course",
    "Guest course",
  ].map((title, i) => ({
    ...base,
    id: id(i + 1),
    title,
    body: "Published body",
    status: "published",
    version: 1,
    groups: [i === 2 ? "PRIVATE-GUEST-GROUP" : "PRIVATE-READER-GROUP"],
    assignments: undefined,
    lessons: [
      { id: "first", title: "First lesson", body: "First body" },
      { id: "next", title: "Second lesson", body: "Second body" },
    ],
    questions: [],
  }));
  const documents: Content[] = [
    ...courses,
    {
      ...courses[0],
      id: id(4),
      kind: "brief",
      title: "Relevant update",
      groups: ["PRIVATE-GUEST-GROUP", "PRIVATE-READER-GROUP"],
    },
    {
      ...courses[0],
      id: id(5),
      kind: "doc",
      title: "Reference guide",
      category: "Reference",
      folder: "",
      sectionId: undefined,
      groups: [],
    },
  ];
  const state = {
    settings: {
      access: "public",
      guestGroupId: "PRIVATE-GUEST-GROUP",
      docCategoryOrder: ["Reference"],
      logoUrl: "",
    },
    groups: [
      {
        id: "PRIVATE-READER-GROUP",
        name: "PRIVATE-READER-NAME",
        requiredCourseIds: [id(1), id(2)],
      },
      {
        id: "PRIVATE-GUEST-GROUP",
        name: "PRIVATE-GUEST-NAME",
        requiredCourseIds: [id(3)],
      },
    ],
    users: [
      {
        id: id(10),
        auth_user_id: id(10),
        email: "reader@example.test",
        name: "Reader",
        role: "learner",
        active: true,
        groups: ["PRIVATE-READER-GROUP"],
      },
    ],
    progress: [
      {
        user_id: id(10),
        content_id: id(2),
        version: 1,
        lessons: ["first"],
        passed: false,
        attempts: [],
      },
      {
        user_id: id(80),
        content_id: id(1),
        version: 1,
        lessons: ["PRIVATE-OTHER-PROGRESS"],
        passed: true,
        attempts: [],
      },
    ],
    documents: [
      ...documents.map((item) => ({
        id: item.id,
        published: item,
        draft: { ...item, title: "PRIVATE-DRAFT" },
        revision: 2,
        published_revision: 1,
      })),
      {
        id: id(99),
        published: null,
        draft: {
          ...courses[0],
          id: id(99),
          title: "PRIVATE-DRAFT-ONLY",
          status: "draft",
        },
        revision: 1,
        published_revision: null,
      },
    ],
  };
  await request.post("http://127.0.0.1:3130/fixture", { data: state });
  if (signedIn) {
    const token = await (
      await request.post("http://127.0.0.1:3130/auth/v1/token", { data: {} })
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
  return state;
}
async function openSearch(page: Page) {
  const input = page.getByRole("textbox", { name: "Search all content" });
  const trigger = page.getByRole("button", {
    name: "Open search",
    exact: true,
  });
  await expect(input.or(trigger).first()).toBeVisible();
  if (await trigger.isVisible()) await trigger.click();
  else await input.click();
  return input;
}
for (const signedIn of [false, true]) {
  test(`${signedIn ? "learner" : "guest"} suggestions load on demand, expose only links and open content or browse`, async ({
    page,
    request,
  }, info) => {
    const state = await fixture(page, request, signedIn);
    const responses: number[] = [];
    const aiRequests: string[] = [];
    page.on("response", (response) => {
      if (response.url().endsWith("/api/search/suggestions"))
        responses.push(response.status());
    });
    page.on("request", (request) => {
      if (request.url().includes("/api/ask-ai")) aiRequests.push(request.url());
    });
    await page.goto("/courses");
    expect(responses).toEqual([]);
    const input = await openSearch(page);
    const panel = page.locator('[data-slot="search-panel"]');
    const suggestions = panel.getByRole("list", { name: "Suggested content" });
    await expect(suggestions.getByRole("link")).toHaveCount(signedIn ? 4 : 3);
    const first = suggestions.getByRole("link").first();
    await expect(first).toContainText(
      signedIn ? "Started course" : "Guest course",
    );
    await expect(first).toContainText(
      signedIn ? "Continue course" : "Recommended course",
    );
    expect(responses).toEqual([200]);
    const response = await page.request.get("/api/search/suggestions");
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    expect(
      response
        .headers()
        .vary.split(",")
        .map((value) => value.trim()),
    ).toContain("Cookie");
    const body = await response.text();
    expect(body).not.toMatch(
      /PRIVATE-|Published body|First body|email|groups|attempts|questions/,
    );
    const data = JSON.parse(body);
    expect(Object.keys(data[0]).sort()).toEqual([
      "contentId",
      "detail",
      "href",
      "kind",
      "lessonId",
      "title",
    ]);
    await page.screenshot({
      path: info.outputPath("installed-search-suggestions.png"),
    });
    await input.press("ArrowDown");
    await expect(first).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(panel).toHaveCount(0);
    await expect(page.locator(".lesson-nav [aria-current=step]")).toContainText(
      signedIn ? "Second lesson" : "First lesson",
    );
    await openSearch(page);
    await panel
      .getByRole("navigation", { name: "Browse content" })
      .getByRole("link", { name: "Docs", exact: true })
      .click();
    await expect(
      page
        .locator("main")
        .getByRole("heading", { name: "Reference guide", exact: true }),
    ).toBeVisible();
    expect(aiRequests).toEqual([]);
    await request.post("http://127.0.0.1:3130/fixture", {
      data: { ...state, settings: { ...state.settings, access: "private" } },
    });
    expect((await request.get("/api/search/suggestions")).status()).toBe(401);
    if (signedIn) {
      await request.post("http://127.0.0.1:3130/fixture", {
        data: {
          ...state,
          users: state.users.map((user) => ({ ...user, active: false })),
        },
      });
      expect((await page.request.get("/api/search/suggestions")).status()).toBe(
        403,
      );
    } else {
      await request.post("http://127.0.0.1:3130/fixture", {
        data: { ...state, settings: { ...state.settings, guestGroupId: null } },
      });
      const fallback = await (
        await request.get("/api/search/suggestions")
      ).json();
      expect(fallback.map((item: { title: string }) => item.title)).toEqual([
        "Relevant update",
        "Reference guide",
      ]);
    }
  });
}
test("suggestion failure retains Search and Browse without blocking navigation", async ({
  page,
  request,
}) => {
  await fixture(page, request, false);
  await page.route("**/api/search/suggestions", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Synthetic unavailable" }),
    }),
  );
  await page.goto("/courses");
  await openSearch(page);
  const panel = page.locator('[data-slot="search-panel"]');
  await expect(panel.getByRole("status")).toContainText("You can still search");
  await expect(
    panel.getByRole("navigation", { name: "Browse content" }).getByRole("link"),
  ).toHaveCount(3);
  await panel.getByRole("link", { name: "Updates", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(
    page
      .locator("main")
      .getByRole("heading", { name: "Relevant update", exact: true }),
  ).toBeVisible();
});

test("suggestion and Browse navigation preserve dirty installed editors until approval", async ({
  page,
  request,
}) => {
  const state = await fixture(page, request, true);
  await request.post("http://127.0.0.1:3130/fixture", {
    data: {
      ...state,
      users: state.users.map((user) => ({ ...user, role: "admin" })),
    },
  });
  let failedSaves = 0;
  await page.route("**/api/content", (route) => {
    failedSaves++;
    return route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "Synthetic save failure" }),
    });
  });
  await page.goto(`/admin/content/${id(5)}/edit`);
  const title = page.getByRole("textbox", { name: "Title", exact: true });
  await title.fill("Keep this unpublished title");
  await expect.poll(() => failedSaves).toBeGreaterThan(0);
  const panel = page.locator('[data-slot="search-panel"]');
  const dialog = page.getByRole("alertdialog");
  await openSearch(page);
  await panel
    .getByRole("navigation", { name: "Browse content" })
    .getByRole("link", { name: "Docs", exact: true })
    .click();
  await expect(dialog).toHaveCount(1);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(title).toHaveValue("Keep this unpublished title");
  await openSearch(page);
  await panel
    .getByRole("list", { name: "Suggested content" })
    .getByRole("link", { name: /Reference guide/ })
    .click();
  await expect(dialog).toHaveCount(1);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(title).toHaveValue("Keep this unpublished title");
  await openSearch(page);
  await panel
    .getByRole("navigation", { name: "Browse content" })
    .getByRole("link", { name: "Docs", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await expect(
    page
      .locator("main")
      .getByRole("heading", { name: "Reference guide", exact: true }),
  ).toBeVisible();
});
