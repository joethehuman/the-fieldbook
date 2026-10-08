import { returnToContent } from "./editor-helpers";
import { expect, test, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { courseViewPaths } from "../../lib/course-destination";
import { setupAuthoringProvider, authoringUser } from "./provider-fixture";
async function waitForDraftSaved(page: Page) {
  await expect(page.locator(".editor-heading [role=status]")).toContainText(
    "Saved",
  );
}

const docId = "00000000-0000-4000-8000-000000000101";
const courseId = "00000000-0000-4000-8000-000000000102";
const groupId = "url-group";
const teamId = "url-team";
const curriculumId = "url-curriculum";
async function setup(page: Page, production: boolean, role = "admin") {
  const data = freshWorkspace();
  const doc = structuredClone(
    data.content.find((item) => item.kind === "doc")!,
  );
  const course = structuredClone(
    data.content.find((item) => item.kind === "course")!,
  );
  Object.assign(doc, {
    id: docId,
    title: "URL writing fixture",
    revision: 1,
    publishedRevision: 1,
    status: "published",
  });
  Object.assign(course, {
    id: courseId,
    title: "URL course fixture",
    revision: 1,
    publishedRevision: 1,
    status: "published",
    groups: [groupId],
    assignments: [
      { groupId, assignedAt: new Date().toISOString(), due: { type: "none" } },
    ],
    questions: [],
  });
  course.lessons = [
    { id: "lesson-one", title: "First lesson", body: "Published lesson body." },
  ];
  data.content = [doc, course];
  data.publishedContent = structuredClone(data.content);
  data.groups = [
    { id: groupId, name: "URL learning group", requiredCourseIds: [courseId] },
  ];
  data.curricula = [
    {
      id: curriculumId,
      name: "URL curriculum",
      description: "A stable curriculum destination.",
      courseIds: [courseId],
      status: "published",
    },
  ];
  data.teams = [
    {
      id: teamId,
      name: "URL team",
      managerId: production ? authoringUser.id : "demo-admin",
    },
  ];
  data.users = [data.users.find((person) => person.id === "demo-admin")!];
  data.users[0].groups = [groupId];
  data.users[0].teamId = teamId;
  data.progress = {};
  if (production) {
    await setupAuthoringProvider(page, data);
    await page.request.post("http://127.0.0.1:3130/fixture", {
      data: {
        settings: data.settings,
        groups: data.groups,
        curricula: data.curricula,
        teams: data.teams,
        role,
        userGroups: [groupId],
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
  } else {
    await page.addInitScript((state) => {
      if (!localStorage.getItem("fieldbook.workspace.v1"))
        localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(state));
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    }, data);
  }
  return data;
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
function destination(production: boolean, path: string) {
  return production ? path : "/#" + path.slice(1);
}
async function at(page: Page, production: boolean, path: string) {
  await expect
    .poll(() => new URL(page.url())[production ? "pathname" : "hash"])
    .toBe(production ? path : "#" + path.slice(1));
}

test("core Admin pages keep clean destinations on refresh and browser history", async ({
  page,
}, info) => {
  const production = info.project.name.startsWith("production");
  await setup(page, production);
  await page.goto(destination(production, "/admin"));
  await section(page, production ? "People" : "Demo profiles");
  await at(page, production, "/admin/people");
  await section(page, "Teams");
  await at(page, production, "/admin/teams");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Teams", exact: true }),
  ).toBeVisible();
  await section(page, "Identity");
  await at(page, production, "/admin/settings/identity");
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Installation name", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("identity.png") });
  await section(page, "Content");
  await at(page, production, "/admin/content");
  await page.goBack();
  await at(page, production, "/admin/settings/identity");
  await expect(
    page.getByRole("textbox", { name: "Installation name", exact: true }),
  ).toBeVisible();
  await page.goForward();
  await at(page, production, "/admin/content");
  await expect(
    page.getByRole("button", { name: "Doc", exact: true }),
  ).toBeVisible();
});

test("content editors reopen the saved draft and preserve the dedicated workspace", async ({
  page,
}, info) => {
  const production = info.project.name.startsWith("production");
  await setup(page, production);
  await page.goto(destination(production, "/admin/content"));
  await page
    .getByRole("row")
    .filter({ hasText: "URL writing fixture" })
    .getByRole("button", { name: "Edit", exact: true })
    .click();
  const path = `/admin/content/${docId}/edit`;
  await at(page, production, path);
  const title = page.getByRole("textbox", { name: "Title", exact: true });
  await title.fill("A saved URL draft");
  await waitForDraftSaved(page);
  await page.reload();
  await expect(title).toHaveValue("A saved URL draft");
  await expect(page.locator('[contenteditable="true"]').first()).toBeVisible();
  await page.screenshot({ path: info.outputPath("saved-editor.png") });
  await expect(
    page.getByRole("tab", { name: "People", exact: true }),
  ).toHaveCount(0);
  await returnToContent(page);
  await at(page, production, "/admin/content");
  await page.goBack();
  await at(page, production, path);
  await expect(title).toHaveValue("A saved URL draft");
});

test("dirty settings Cancel retains the form and Confirm completes native Back", async ({
  page,
}, info) => {
  const production = info.project.name.startsWith("production");
  await setup(page, production);
  await page.goto(destination(production, "/admin/content"));
  await section(page, "Identity");
  const name = page.getByRole("textbox", {
    name: "Installation name",
    exact: true,
  });
  await name.fill("An unsaved organization");
  // Let the existing native-history protection register the dirty form.
  await expect(
    page.getByRole("button", { name: "Save settings", exact: true }),
  ).toBeEnabled();
  if (production)
    await expect
      .poll(() =>
        page.evaluate(() => history.state?.__fieldbookNavigation?.kind),
      )
      .toBe("sentinel");
  await page.evaluate(() => history.back());
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await at(page, production, "/admin/settings/identity");
  await expect(name).toHaveValue("An unsaved organization");
  await page.evaluate(() => history.back());
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Confirm", exact: true }).click();
  await at(page, production, "/admin/content");
  await expect(
    page.getByRole("button", { name: "Doc", exact: true }),
  ).toBeVisible();
});

test("record destinations reopen groups, teams, curricula and profiles", async ({
  page,
}, info) => {
  const production = info.project.name.startsWith("production");
  await setup(page, production);
  for (const [path, text] of [
    [`/admin/groups/${groupId}/learning`, "Assigned courses and curricula"],
    [`/admin/teams/${teamId}`, "URL team"],
    [`/admin/curricula/${curriculumId}/edit`, "URL curriculum"],
  ]) {
    await page.goto(destination(production, path));
    await expect(
      page.getByText(text, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();
    await page.reload();
    await at(page, production, path);
    await expect(
      page.getByText(text, { exact: true }).filter({ visible: true }).first(),
    ).toBeVisible();
  }
  const id = production ? authoringUser.id : "demo-admin";
  await page.goto(destination(production, `/admin/people/${id}/edit`));
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("Courses collections retain the destination after refresh and curriculum return", async ({
  page,
}, info) => {
  const production = info.project.name.startsWith("production");
  await setup(page, production);
  for (const view of [
    "yours",
    "assigned",
    "in-progress",
    "completed",
    "all",
    "curricula",
  ] as const) {
    await page.goto(destination(production, courseViewPaths[view]));
    await expect(
      page.getByRole("button", { name: "Back to courses", exact: false }),
    ).toBeVisible();
    await page.reload();
    await at(page, production, courseViewPaths[view]);
    await expect(
      page.getByRole("button", { name: "Back to courses", exact: false }),
    ).toBeVisible();
  }
  await page.getByText("URL curriculum", { exact: true }).last().click();
  await at(page, production, `/curricula/${curriculumId}`);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "URL curriculum", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: info.outputPath("curriculum.png") });
  await page.getByText(/^← Back/).click();
  await at(page, production, "/courses/curricula");
});

test("unknown and restricted Admin URLs deny access before returning private payloads", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("production"),
    "Server authority belongs to the installed application.",
  );
  await setup(page, true, "contributor");
  for (const path of [
    "/admin/people",
    "/admin/teams",
    "/admin/settings/identity",
    "/admin/content/missing/edit",
    "/admin/unknown",
  ])
    expect((await page.request.get(path)).status(), path).toBe(404);
  expect((await page.request.get("/admin/content")).status()).toBe(200);
  expect((await page.request.get("/admin/settings/mcp")).status()).toBe(200);
  await page.context().clearCookies();
  const response = await page.request.get("/admin/content", {
    maxRedirects: 0,
  });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toContain("next=%2Fadmin%2Fcontent");
});

test("new content adopts its saved ID without losing the draft or history guard", async ({
  page,
}, info) => {
  const production = info.project.name.startsWith("production");
  await setup(page, production);
  await page.goto(destination(production, "/admin/content"));
  await page.getByRole("button", { name: "Doc", exact: true }).click();
  await at(page, production, "/admin/content/new/doc");
  const title = page.getByRole("textbox", { name: "Title", exact: true });
  await title.fill("A new stable draft");
  await waitForDraftSaved(page);
  await expect
    .poll(() => new URL(page.url())[production ? "pathname" : "hash"])
    .toMatch(/admin\/content\/[^/]+\/edit$/);
  await expect(title).toHaveValue("A new stable draft");
  await page.reload();
  await expect(title).toHaveValue("A new stable draft");
});

test("Course collections update from controls, keep Back/Forward and return from a course", async ({
  page,
}, info) => {
  const production = info.project.name.startsWith("production");
  await setup(page, production);
  await page.goto(destination(production, "/courses"));
  await page
    .getByRole("button", { name: "View all for you", exact: false })
    .click();
  await at(page, production, "/courses/for-you");
  await page.getByRole("button", { name: "Your courses", exact: true }).click();
  await at(page, production, "/courses/yours");
  await page.goBack();
  await at(page, production, "/courses/for-you");
  await page.goForward();
  await at(page, production, "/courses/yours");
  await page.getByText("URL course fixture", { exact: true }).last().click();
  await at(page, production, `/courses/${courseId}`);
  await page.reload();
  await page.getByText(/^← Exit course$/).click();
  await at(page, production, "/courses/yours");
});

test("Admin and Team progress person destinations survive refresh and respect scope", async ({
  page,
}, info) => {
  const production = info.project.name.startsWith("production");
  await setup(page, production);
  const id = production ? authoringUser.id : "demo-admin";
  for (const path of [`/admin/progress/people/${id}`, `/team/people/${id}`]) {
    await page.goto(destination(production, path));
    await expect(
      page.getByRole("button", { name: "Back to progress", exact: true }),
    ).toBeVisible();
    await page.reload();
    await at(page, production, path);
    await expect(
      page.getByRole("button", { name: "Back to progress", exact: true }),
    ).toBeVisible();
    const overview = path.startsWith("/admin") ? "/admin/progress" : "/team";
    await page.goto(destination(production, overview));
    await page
      .getByRole("combobox", { name: "Sort team members", exact: true })
      .click();
    await page.getByRole("option", { name: "Name (Z–A)", exact: true }).click();
    await page.keyboard.press("Escape");
    await page.locator(`[data-person-id="${id}"]`).click();
    await at(page, production, path);
    await page
      .getByRole("button", { name: "Back to progress", exact: true })
      .click();
    await at(page, production, overview);
    await expect(
      page.getByRole("combobox", { name: "Sort team members", exact: true }),
    ).toContainText("Sort: Name (Z–A)");
  }
  if (production)
    expect(
      (await page.request.get("/team/people/outside-scope")).status(),
    ).toBe(404);
});

test("a failed or slow destination read retains the current screen and allows retry", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("production"),
    "Demo destinations use local data.",
  );
  await setup(page, true);
  await page.goto("/admin/content");
  let release!: () => void;
  const hold = new Promise<void>((done) => {
    release = done;
  });
  await page.route("**/api/admin/snapshot?scope=feedback", async (route) => {
    await hold;
    await route.fulfill({
      status: 503,
      json: { error: "Synthetic destination unavailable" },
    });
  });
  await section(page, "Feedback");
  await expect(
    page.getByRole("button", { name: "Doc", exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/content$/);
  release();
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: "Synthetic destination unavailable" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/admin\/content$/);
  await page.unroute("**/api/admin/snapshot?scope=feedback");
  await section(page, "Feedback");
  await at(page, true, "/admin/feedback");
});
