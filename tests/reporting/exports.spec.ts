import {
  test,
  expect,
  type Page,
  type Locator,
  type TestInfo,
} from "@playwright/test";
import { readFile } from "node:fs/promises";
import { learningUiFixture } from "../fixtures/learning-ui";
import { legacyWorkspace } from "../fixtures/legacy-workspace";
import { freshWorkspace } from "../../lib/store";
import { reconcileLearning } from "../../lib/learning-groups";
import type { Workspace } from "../../lib/store";

// Read actual browser downloads, independently of the application's serializer.
function parse(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false;
  text = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else quoted = !quoted;
    } else if (!quoted && c === ",") {
      row.push(value);
      value = "";
    } else if (!quoted && c === "\r" && text[i + 1] === "\n") {
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
      i++;
    } else value += c;
  }
  expect(quoted).toBe(false);
  expect(value).toBe("");
  return rows;
}
async function download(
  page: Page,
  button: Locator,
  info: TestInfo,
  file: string,
  keyboard = false,
) {
  const pending = page.waitForEvent("download");
  if (keyboard) {
    await button.focus();
    await page.keyboard.press("Enter");
  } else await button.click();
  const result = await pending;
  expect(result.suggestedFilename()).toMatch(/-\d{4}-\d{2}-\d{2}\.csv$/);
  await result.saveAs(info.outputPath(file + ".csv"));
  const bytes = await readFile(info.outputPath(file + ".csv"));
  expect([...bytes.subarray(0, 3)]).toEqual([239, 187, 191]);
  expect(await result.failure()).toBeNull();
  return {
    rows: parse(bytes.toString("utf8")),
    filename: result.suggestedFilename(),
  };
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
async function searchPeople(page: Page, query: string) {
  const search = page.getByRole("combobox", {
    name: "Search teams or people",
    exact: true,
  });
  await search.fill(query);
  await page.getByRole("option", { name: /^Show matching people/ }).click();
}
async function searchTeam(page: Page, name: string) {
  const search = page.getByRole("combobox", {
    name: "Search teams or people",
    exact: true,
  });
  await search.fill(name);
  await page
    .getByRole("group", { name: "Teams", exact: true })
    .getByRole("option", { name: new RegExp(`^${name} —`) })
    .click();
}
async function select(page: Page, name: string, option: string) {
  await page.getByRole("combobox", { name, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
export function fixture(): Workspace {
  const data = learningUiFixture(legacyWorkspace());
  data.users[0].name = 'Zoë "Example", 東京';
  data.users[0].email = "zoe@example.test";
  data.teams!.push(
    { id: "child", name: "Subteam", parentId: "sales-team" },
    {
      id: "other",
      name: "Sibling team",
      parentId: data.settings!.organizationTeamId!,
    },
  );
  data.users[0].teamId = "child";
  data.users.push({
    ...data.users[0],
    id: "outsider",
    teamId: "other",
    name: "SECRET OUTSIDER",
    email: "outsider@example.test",
  });
  const optional = {
    ...data.content.find((c) => c.id === "course-1")!,
    id: "optional",
    title: "Self-directed exploration",
    groups: [],
    assignments: [],
  };
  data.content.push(optional);
  data.progress[data.users[0].id].push({
    content_id: optional.id,
    version: optional.version,
    lessons: [optional.lessons[0].id],
    passed: false,
  });
  data.feedback = [
    {
      id: "00000000-0000-4000-8000-000000000101",
      contentId: "course-1",
      userId: data.users[0].id,
      version: 1,
      rating: "up",
      comment: 'Zoë, "hello"\n東京',
      updatedAt: "2026-09-21T17:30:00Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000102",
      contentId: "course-1",
      userId: data.users[0].id,
      version: 1,
      rating: "down",
      comment: "=1+2",
      updatedAt: "2026-09-20T17:30:00Z",
    },
    {
      id: "00000000-0000-4000-8000-000000000103",
      contentId: "removed",
      userId: "removed",
      version: 1,
      rating: "up",
      comment: "",
      updatedAt: "2026-09-19T17:30:00Z",
    },
  ];
  return data;
}
export async function setup(
  page: Page,
  info: TestInfo,
  role = "admin",
  data = fixture(),
) {
  const production = info.project.name.startsWith("production");
  const user = data.users.find((u) => u.id === `demo-${role}`)!;
  if (production) {
    const actorId = "00000000-0000-4000-8000-000000000010";
    const ids = new Map(
      data.users.map((entry, n) => [
        entry.id,
        entry === user
          ? actorId
          : `00000000-0000-4000-8000-${String(n + 100).padStart(12, "0")}`,
      ]),
    );
    for (const entry of data.users) entry.id = ids.get(entry.id)!;
    for (const team of data.teams || [])
      if (team.managerId)
        team.managerId = ids.get(team.managerId) || team.managerId;
    data.progress = Object.fromEntries(
      Object.entries(data.progress).map(([id, rows]) => [
        ids.get(id) || id,
        rows,
      ]),
    );
    for (const item of data.content)
      for (const assignment of item.assignments || [])
        if (assignment.userId)
          assignment.userId = ids.get(assignment.userId) || assignment.userId;
    for (const rating of data.feedback || [])
      rating.userId = ids.get(rating.userId) || rating.userId;
    await page.request.post(
      `http://127.0.0.1:${process.env.FIELDBOOK_BACKEND_TEST_PORT || 3130}/fixture`,
      {
        data: {
          settings: data.settings,
          groups: data.groups,
          curricula: data.curricula,
          role,
          userGroups: user.groups,
          teams: data.teams,
          users: data.users.map((entry) => ({
            id: entry.id,
            name: entry.name,
            email: entry.email,
            role: entry.role,
            active: entry.active,
            groups: entry.groups,
            auth_user_id: entry.registered === false ? null : entry.id,
            hire_date: entry.hireDate || null,
            onboarding_days: entry.onboardingDays || null,
            learning_assignments: entry.learningAssignments,
            team_id: entry.teamId || null,
            onboarding_start: entry.onboardingStart || null,
            group_joined_at: entry.groupJoinedAt || {},
            effective_group_joined_at: entry.effectiveGroupJoinedAt || {},
          })),
          progress: Object.entries(data.progress).flatMap(([id, rows]) =>
            rows.map((entry) => ({ ...entry, user_id: id })),
          ),
          feedback: (data.feedback || []).map((entry) => ({
            id: entry.id,
            user_id: entry.userId,
            content_id: entry.contentId,
            version: entry.version,
            rating: entry.rating,
            comment: entry.comment,
            updated_at: entry.updatedAt,
          })),
          documents: data.content.map((item) => ({
            id: item.id,
            published: item.status === "published" ? item : null,
            draft: item,
            revision: item.revision || 1,
            published_revision: item.status === "published" ? 1 : null,
            updated_at: item.updatedAt,
          })),
        },
      },
    );
    const token = await (
      await page.request.post(
        `http://127.0.0.1:${process.env.FIELDBOOK_BACKEND_TEST_PORT || 3130}/auth/v1/token`,
        {
          data: {},
        },
      )
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
        url: new URL(String(info.project.use.baseURL)).origin,
      },
    ]);
    await page.route("**/api/workspace", (route) =>
      route.fulfill({ json: { data, user } }),
    );
  } else
    await page.addInitScript(
      ({ data, id }) => {
        if (!localStorage.getItem("fieldbook.workspace.v1"))
          localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
        sessionStorage.setItem("fieldbook.profile.v1", id);
      },
      { data, id: user.id },
    );
  await page.goto(
    production
      ? role === "manager"
        ? "/team"
        : "/admin"
      : role === "manager"
        ? "/#team"
        : "/#admin",
  );
  await expect(
    page.getByRole("heading", {
      name: role === "manager" ? "Team progress" : "Administration",
      exact: true,
    }),
  ).toBeVisible();
  return { data, production };
}
async function screenshot(page: Page, info: TestInfo, name: string) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath(name + ".png"),
    fullPage: true,
  });
}

test("progress filters, keyboard download, member details and empty report", async ({
  page,
}, info) => {
  await setup(page, info);
  await section(page, "Progress");
  await searchTeam(page, "Sales team");
  await searchPeople(page, "zoe@example.test");
  const displayed = page.locator(
    'table[data-layout="progressPeople"] tbody tr',
  );
  await expect(displayed).toHaveCount(1);
  const { rows, filename } = await download(
    page,
    page.getByRole("button", { name: "Export CSV", exact: true }),
    info,
    "team",
    true,
  );
  expect(filename).toMatch(/^team-progress-/);
  expect(rows).toHaveLength(2);
  expect(rows[1].slice(0, 3)).toEqual([
    'Zoë "Example", 東京',
    "zoe@example.test",
    "Subteam",
  ]);
  expect(rows[1].slice(4, 7)).toEqual(["3", "1", "33"]);
  await expect(displayed.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "33");
  await screenshot(page, info, "team-filtered");
  await page.locator("button[data-person-id]").click();
  await expect(page.getByRole("heading", { name: /’s assignments$/ })).toBeVisible();
  const detail = await download(
    page,
    page.getByRole("button", { name: "Export CSV", exact: true }),
    info,
    "member",
  );
  expect(detail.rows).toHaveLength(4);
  expect(detail.rows.slice(1).filter((row) => row[5] === "Complete")).toHaveLength(1);
  expect(detail.rows.flat().join(" ")).not.toContain(
    "Self-directed exploration",
  );
  await screenshot(page, info, "member-assignments");
  const courseRows = page.locator('table[data-layout="progressAssignments"] tbody tr');
  await expect(page.getByRole("combobox", { name: "Sort assignments", exact: true })).toContainText("Assigned (newest)");
  // Check the rendered order against dates in the actual export, rather than fixture array order.
  const assignedColumn = detail.rows[0].indexOf("Assigned at");
  const datedRows = detail.rows.slice(1).filter((row) => row[assignedColumn]);
  expect(datedRows.map((row) => row[assignedColumn])).toEqual(
    datedRows.map((row) => row[assignedColumn]).sort((a, b) => Date.parse(b) - Date.parse(a)),
  );
  expect(await courseRows.locator("td:first-child strong").allTextContents()).toEqual(detail.rows.slice(1).map((row) => row[2]));
  await page.getByRole("searchbox", { name: "Search courses", exact: true }).fill("platform");
  await expect(courseRows).toHaveCount(1);
  await expect(courseRows).toContainText("Know the platform");
  const filtered = await download(page, page.getByRole("button", { name: "Export CSV", exact: true }), info, "member-filtered");
  expect(filtered.rows).toHaveLength(2);
  expect(filtered.rows[1][2]).toBe("Know the platform");
  await page.getByRole("searchbox", { name: "Search courses", exact: true }).fill("no matching course");
  await expect(courseRows).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search courses", exact: true }).fill("");
  await page.getByRole("button", { name: "Filters", exact: true }).click();
  await select(page, "Course status", "Complete");
  await page.keyboard.press("Escape");
  await expect(courseRows).toHaveCount(1);
  await expect(courseRows).toContainText("Start with the customer");
  await page.getByRole("button", { name: "Remove Complete filter", exact: true }).click();
  await select(page, "Sort assignments", "Title (A–Z)");
  await page.keyboard.press("Escape");
  await expect(courseRows.locator("td:first-child strong")).toHaveText([
    "From discovery to next steps", "Know the platform", "Start with the customer",
  ]);

  await page.getByRole("button", { name: "Back to progress" }).click();
  await searchPeople(page, "no-match");
  const empty = await download(
    page,
    page.getByRole("button", { name: "Export CSV", exact: true }),
    info,
    "empty",
  );
  expect(empty.rows).toHaveLength(1);
  await screenshot(page, info, "empty");
});

test("manager exports include subteams and exclude sibling teams", async ({
  page,
}, info) => {
  let workspaceReads = 0;
  let documentNavigations = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/workspace")) workspaceReads++;
    if (request.isNavigationRequest()) documentNavigations++;
  });
  const { production } = await setup(page, info, "manager");
  if (production) {
    const menu = page.getByRole("button", { name: "Open navigation" });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole("link", { name: "Courses", exact: true }).click();
    if (await menu.isVisible()) await menu.click();
    await page.getByRole("button", { name: "Account menu" }).click();
    await page.getByRole("menuitem", { name: "My team’s progress" }).click();
    await expect(page).toHaveURL(/\/team$/);
    expect(workspaceReads).toBe(0);
    expect(documentNavigations).toBe(1);
    expect(await page.content()).not.toContain("SECRET OUTSIDER");
  }
  const result = await download(
    page,
    page.getByRole("button", { name: "Export CSV", exact: true }),
    info,
    "manager",
  );
  expect(result.rows).toHaveLength(6);
  expect(result.rows.flat().join(" ")).not.toContain("SECRET OUTSIDER");
  expect(result.rows.flat()).toContain("Subteam");
  await screenshot(page, info, "manager");
});

test("feedback filters and sorting preserve text, formula protection and timestamps", async ({
  page,
}, info) => {
  await setup(page, info);
  await section(page, "Feedback");
  await select(page, "Sort feedback", "Oldest first");
  await page.keyboard.press("Escape");
  const result = await download(
    page,
    page.getByRole("button", { name: "Export CSV", exact: true }),
    info,
    "feedback",
  );
  expect(result.rows).toHaveLength(4);
  expect(result.rows[1].slice(0, 5)).toEqual([
    "Removed content",
    "Removed content",
    "1",
    "Former user",
    "Useful",
  ]);
  expect(result.rows[2][5]).toBe("'=1+2");
  expect(result.rows[3][5]).toBe('Zoë, "hello"\n東京');
  expect(result.rows[3][6]).toBe("2026-09-21T17:30:00.000Z");
  await page
    .getByRole("group", { name: "Feedback type", exact: true })
    .getByRole("button", { name: "Courses", exact: true })
    .click();
  await page.getByRole("button", { name: /^Filters/ }).click();
  await select(page, "Feedback rating", "Useful");
  await page.keyboard.press("Escape");
  await page.getByRole("searchbox", { name: "Search feedback" }).fill("東京");
  const filtered = await download(
    page,
    page.getByRole("button", { name: "Export CSV", exact: true }),
    info,
    "feedback-filtered",
  );
  expect(filtered.rows).toHaveLength(2);
  expect(filtered.rows[1][5]).toBe('Zoë, "hello"\n東京');
  await expect(page.locator('article[data-slot="card"]')).toHaveCount(1);
  await screenshot(page, info, "feedback");
});

test("person course list, assignment details and optional history agree with tables", async ({
  page,
}, info) => {
  const { production } = await setup(page, info);
  await section(page, production ? "People" : "Demo profiles");
  await page
    .getByRole("row")
    .filter({ hasText: "zoe@example.test" })
    .getByRole("button", { name: /^Actions for/ })
    .click();
  await page.getByRole("menuitem", { name: "Progress", exact: true }).click();
  const buttons = page.getByRole("button", { name: "Export CSV", exact: true });
  const list = await download(page, buttons.first(), info, "assigned");
  const courseRows = page.locator('table[data-layout="courses"] tbody tr');
  expect(list.rows.length - 1).toBe(await courseRows.count());
  const firstTitle = list.rows[1][3];
  await page.getByRole("textbox", { name: "Find a course" }).fill(firstTitle);
  const filtered = await download(
    page,
    buttons.first(),
    info,
    "assigned-filtered",
  );
  expect(filtered.rows).toHaveLength(2);
  await page
    .getByRole("button", { name: "View progress", exact: true })
    .click();
  const detail = await download(
    page,
    buttons.nth(1),
    info,
    "assignment-detail",
  );
  expect(detail.rows).toHaveLength(2);
  expect(detail.rows[1][8]).toBe("Complete");
  expect(detail.rows[1][9]).toBe("Complete");
  const optional = await download(page, buttons.last(), info, "optional");
  expect(optional.rows[1][6]).toBe("Optional");
  expect(optional.rows[1][9]).toBe("1 of 2 lessons");
  await screenshot(page, info, "person-courses");
});

test("large reports download every row in displayed order", async ({
  page,
}, info) => {
  const data = fixture();
  data.users.push(
    ...Array.from({ length: 1205 }, (_, i) => ({
      ...data.users[0],
      id: `large-${i}`,
      name: `Large person ${i}`,
      email: `large-${i}@example.test`,
    })),
  );
  await setup(page, info, "admin", data);
  await section(page, "Progress");
  await searchPeople(page, "Large person");
  const result = await download(
    page,
    page.getByRole("button", { name: "Export CSV", exact: true }),
    info,
    "large",
  );
  expect(result.rows).toHaveLength(1206);
  const displayed = page.locator(
    'table[data-layout="progressPeople"] tbody tr',
  );
  await expect(displayed).toHaveCount(25);
  const exportedNames = result.rows.slice(1).map((row) => row[0]);
  expect(exportedNames.slice(0, 25)).toEqual(
    await displayed.locator("td:first-child button[data-person-id]").allTextContents(),
  );
  expect(new Set(exportedNames)).toEqual(
    new Set(Array.from({ length: 1205 }, (_, i) => `Large person ${i}`)),
  );
});

test("download preparation failure is visible, retryable and creates no file", async ({
  page,
}, info) => {
  await setup(page, info);
  await section(page, "Progress");
  const downloads: string[] = [];
  page.on("download", (d) => downloads.push(d.suggestedFilename()));
  await page.evaluate(() => {
    (window as any).originalCreate = URL.createObjectURL;
    URL.createObjectURL = () => {
      throw new Error("Synthetic Blob failure");
    };
  });
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "CSV could not be prepared" }),
  ).toContainText("CSV could not be prepared");
  expect(downloads).toEqual([]);
  await screenshot(page, info, "export-error");
  await page.evaluate(() => {
    URL.createObjectURL = (window as any).originalCreate;
  });
  await download(
    page,
    page.getByRole("button", { name: "Export CSV", exact: true }),
    info,
    "retry",
  );
  await expect(
    page.getByText("CSV could not be prepared", { exact: false }),
  ).toHaveCount(0);
});

test("unavailable or pending admin report never offers export", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("production"),
    "Workspace HTTP loading belongs to production",
  );
  let release!: () => void;
  await page.route("**/api/admin/snapshot?**", async (route) => {
    if (!route.request().url().includes("scope=progress"))
      return route.continue();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await route.fulfill({
      status: 503,
      json: {
        error: "The data could not be read completely. Reload and try again.",
      },
    });
  });
  await setup(page, info);
  const navigation = page.locator('[data-slot="admin-navigation"]');
  const top = (await navigation.boundingBox())?.y;
  await section(page, "Progress");
  await expect.poll(() => !!release).toBe(true);
  await expect(page.locator(".admin-workspace")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  expect((await navigation.boundingBox())?.y).toBe(top);
  await expect(page.getByRole("button", { name: "Export CSV" })).toHaveCount(0);
  await screenshot(page, info, "loading");
  release();
  await expect(
    page.getByText(
      "The data could not be read completely. Reload and try again.",
    ),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Export CSV" })).toHaveCount(0);
  await screenshot(page, info, "unavailable");
});

test("admin warms lightweight lists and loads full reporting inputs on demand without duplicate reads", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("production"),
    "Server-only data path",
  );
  const reads = { people: 0, progress: 0, feedback: 0 };
  await page.route("**/api/admin/snapshot?**", async (route) => {
    const scope = new URL(route.request().url()).searchParams.get("scope");
    if (scope === "people" || scope === "progress" || scope === "feedback")
      reads[scope]++;
    await route.continue();
  });
  await setup(page, info);
  await expect.poll(() => reads.people).toBe(1);
  expect(reads.progress).toBe(0);
  await expect.poll(() => reads.feedback).toBe(1);
  await section(page, "Progress");
  await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
  await section(page, "Feedback");
  await expect(page.getByRole("heading", { name: "Feedback" })).toBeVisible();
  expect(reads).toEqual({ people: 1, progress: 1, feedback: 1 });
  await expect(page.getByText("Opening section…")).toHaveCount(0);
});

test("failed progress update disables exports until the complete report reloads", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("production"),
    "Production mutation and refresh boundary",
  );
  await setup(page, info);
  await section(page, "People");
  await page
    .getByRole("row")
    .filter({ hasText: "zoe@example.test" })
    .getByRole("button", { name: /^Actions for/ })
    .click();
  await page.getByRole("menuitem", { name: "Progress", exact: true }).click();
  await page
    .getByRole("button", { name: "View progress", exact: true })
    .nth(1)
    .click();
  let release!: () => void;
  await page.route("**/api/assignments", async (route) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    // The mutation succeeded but its required complete reload fails.
    await page.route("**/api/admin/snapshot?**", (r) =>
      r.fulfill({ status: 503, json: { error: "Report reload unavailable" } }),
    );
    await route.fulfill({ json: { ok: true } });
  });
  await page
    .getByRole("button", { name: "Mark complete", exact: true })
    .first()
    .click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Confirm", exact: true })
    .click();
  const exports = page.getByRole("button", { name: "Export CSV", exact: true });
  await expect(exports.first()).toBeDisabled();
  await expect(page.getByText("Updating report…").first()).toBeVisible();
  await screenshot(page, info, "mutation-pending");
  release();
  await expect(
    page
      .getByText("Reload the report before exporting after a failed change.")
      .first(),
  ).toBeVisible();
  for (const button of await exports.all()) await expect(button).toBeDisabled();
  await screenshot(page, info, "mutation-error");
  // A full successful load is the recovery; no retry of the uncertain mutation.
  await page.unroute("**/api/admin/snapshot?**");
  await page.goto("/admin");
  await expect(page.locator(".admin-layout")).toBeVisible();
  await section(page, "Progress");
  await expect(
    page.getByRole("button", { name: "Export CSV", exact: true }),
  ).toBeEnabled();
});

test("preparation state prevents duplicate clicks and reports a changed filter without downloading", async ({
  page,
}, info) => {
  await setup(page, info);
  await section(page, "Progress");
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  const downloads: string[] = [];
  page.on("download", (d) => downloads.push(d.suggestedFilename()));
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  const preparing = page.getByRole("button", {
    name: "Preparing CSV…",
    exact: true,
  });
  await expect(preparing).toBeDisabled();
  await expect(preparing).toHaveAttribute("aria-busy", "true");
  await screenshot(page, info, "preparing");
  await searchPeople(page, "no match");
  await page.clock.runFor(10);
  await expect(
    page.getByText(
      "CSV could not be prepared. Reload the report and try again.",
    ),
  ).toBeVisible();
  expect(downloads).toEqual([]);
});

test("app bar stays visible over long administration reports", async ({
  page,
}, info) => {
  const data = fixture();
  data.users.push(
    ...Array.from({ length: 60 }, (_, i) => ({
      ...data.users[0],
      id: `extra-${i}`,
      name: `Report member ${i}`,
      email: `member${i}@example.test`,
    })),
  );
  await setup(page, info, "admin", data);
  await section(page, "Progress");
  await page.screenshot({ path: info.outputPath("bar-report-top.png") });
  const panel = page.getByRole("tabpanel", { name: "Progress" });
  await panel.evaluate((el) => el.scrollTo(0, 1000));
  expect(await panel.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect(
    await page
      .locator(".topbar")
      .evaluate((el) => el.getBoundingClientRect().top),
  ).toBe(0);
  await page.screenshot({ path: info.outputPath("bar-report-scrolled.png") });
  await page.getByRole("textbox", { name: "Search all content" }).fill("sales");
  await expect(page.locator('[data-slot="search-panel"]')).toBeVisible();
  await page.screenshot({ path: info.outputPath("bar-report-search.png") });
});

test("People connects hire-date guidance and preregistration to the shared roster", async ({
  page,
}, info) => {
  const { data, production } = await setup(page, info);
  await section(page, production ? "People" : "Demo profiles");
  await expect(
    page.getByRole("button", { name: "New user defaults", exact: true }),
  ).toHaveCount(0);
  if (production) {
    await page
      .getByRole("button", { name: "Pre-register user", exact: true })
      .click();
    const registration = page.getByRole("dialog", {
      name: "Pre-register user",
      exact: true,
    });
    await expect(registration).toContainText("No email is sent.");
    await registration
      .getByRole("button", { name: "Cancel", exact: true })
      .click();
  }
  await page
    .getByRole("row")
    .filter({ hasText: data.users[0].email })
    .getByRole("link", { name: data.users[0].name, exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByLabel("Hire date", { exact: true }),
  ).toHaveAccessibleDescription(/Signing in does not start this window/);
  await screenshot(page, info, "people-hire-date-guidance");
});

test("people ring, statuses, pending people and team search reconcile with CSV", async ({
  page,
}, info) => {
  let data = fixture();
  const current = data.users.find((u) => u.id === "demo-rep-2")!;
  data.progress[current.id] = data.content
    .filter((c) => ["course-1", "course-2", "course-3"].includes(c.id))
    .map((c) => ({
      content_id: c.id,
      version: c.version,
      lessons: c.lessons.map((l) => l.id),
      passed: true,
    }));
  data.users.push({
    ...data.users[0],
    id: "pending",
    name: "Pending learner",
    email: "pending@example.test",
    registered: false,
    hireDate: "2000-01-01",
  });
  data = reconcileLearning(data, data, "2026-01-01T00:00:00Z");
  for (const u of data.users)
    for (const a of u.learningAssignments || [])
      a.dueDate = u.id === "demo-learner" ? "2000-01-01" : "2040-01-01";
  data.users[0].hireDate = "2000-01-01";
  await setup(page, info, "admin", data);
  await section(page, "Progress");
  const overview = page.locator('[data-slot="progress-overview"]');
  await expect(
    overview.getByRole("progressbar", {
      name: "People up to date",
      exact: true,
    }),
  ).toHaveAttribute("aria-valuenow", "11");
  await expect(
    overview.getByRole("button", { name: "Overdue 1", exact: true }),
  ).toBeVisible();
  await overview
    .getByRole("button", { name: "Overdue 1", exact: true })
    .click();
  const rows = page.locator('table[data-layout="progressPeople"] tbody tr');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("zoe@example.test");
  await expect(rows).toContainText("Existing user");
  const overdue = await download(
    page,
    page.getByRole("button", { name: "Export CSV", exact: true }),
    info,
    "overdue",
  );
  expect(overdue.rows).toHaveLength(2);
  expect(overdue.rows[1][overdue.rows[0].indexOf("Overdue courses")]).toBe("2");
  await screenshot(page, info, "batch3-overdue");
  await overview
    .getByRole("heading", { name: "Learning status", exact: true })
    .scrollIntoViewIfNeeded();
  await screenshot(page, info, "batch3-status");
  await rows.first().scrollIntoViewIfNeeded();
  await screenshot(page, info, "batch3-people");
  await overview
    .getByRole("button", { name: "Overdue 1", exact: true })
    .click();
  await searchTeam(page, "Sales team");
  await expect(rows).toHaveCount(6);
  await searchPeople(page, "pending@example.test");
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("Pending learner");
  const pending = await download(
    page,
    page.getByRole("button", { name: "Export CSV", exact: true }),
    info,
    "pending",
  );
  expect(pending.rows).toHaveLength(2);
  expect(pending.rows[0]).not.toContain("Sign-in status");
  expect(pending.rows[0]).toContain("User type");
  expect(pending.rows[1][0]).toBe("Pending learner");
});

test("due dates off removes overdue language and no assignments stays N/A", async ({
  page,
}, info) => {
  const data = fixture();
  data.settings!.dueDatesEnabled = false;
  await setup(page, info, "admin", data);
  await section(page, "Progress");
  const overview = page.locator('[data-slot="progress-overview"]');
  await expect(overview).toContainText("Due dates are off");
  await expect(
    overview.getByRole("button", { name: /Overdue|Within due dates/ }),
  ).toHaveCount(0);
  await searchPeople(page, "contributor@example.com");
  const row = page.locator(
    'table[data-layout="progressPeopleNoDates"] tbody tr',
  );
  await expect(row).toHaveCount(1);
  await expect(row.getByRole("img", { name: /^No assigned courses/ })).toBeVisible();
  await expect(row).toContainText("—");
  const result = await download(
    page,
    page.getByRole("button", { name: "Export CSV", exact: true }),
    info,
    "unassigned",
  );
  expect(result.rows[0]).not.toContain("Overdue courses");
  expect(result.rows[1][result.rows[0].indexOf("Completion (%)")]).toBe("");
  expect(result.rows[1][result.rows[0].indexOf("Learning status")]).toBe(
    "No assigned courses",
  );
  await screenshot(page, info, "batch3-no-dates");
});

test("person back preserves page, sort, filter and scroll", async ({
  page,
}, info) => {
  const data = fixture();
  data.users.push(
    ...Array.from({ length: 60 }, (_, i) => ({
      ...data.users[0],
      id: `preserved-${i}`,
      name: `Preserved person ${String(i).padStart(2, "0")}`,
      email: `preserved-${i}@example.test`,
    })),
  );
  await setup(page, info, "admin", data);
  await section(page, "Progress");
  await searchPeople(page, "Preserved person");
  await select(page, "Sort team members", "Name (Z–A)");
  await page.keyboard.press("Escape");
  const pages = page.getByRole("navigation", { name: "People progress pages" });
  await pages.getByRole("button", { name: "Next", exact: true }).click();
  await expect(pages).toContainText("Page 2 of 3");
  const table = page.locator('table[data-layout="progressPeople"]');
  const names = await table
    .locator("tbody td:first-child button[data-person-id]")
    .allTextContents();
  const open = table
    .locator("button[data-person-id]")
    .first();
  await open.scrollIntoViewIfNeeded();
  const panel = page.locator(".admin-panel");
  const position = await panel.evaluate((el) => el.scrollTop);
  await open.click();
  await expect(
    page.getByRole("heading", { name: /’s assignments$/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to progress" }).click();
  await expect(pages).toContainText("Page 2 of 3");
  expect(
    await table.locator("tbody td:first-child button[data-person-id]").allTextContents(),
  ).toEqual(names);
  expect(await panel.evaluate((el) => el.scrollTop)).toBeCloseTo(position, 0);
  await expect(open).toBeFocused();
});

test("changed saved report blocks CSV until refresh and revoked access blocks details", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("production"),
    "Server revalidation boundary",
  );
  await setup(page, info);
  await section(page, "Progress");
  let fresh: any;
  await page.route("**/api/reports/progress", async (route) => {
    const response = await route.fetch();
    fresh = await response.json();
    fresh.progressReport.people[0].completed = 0;
    fresh.progressReport.people[0].assigned = 7;
    await route.fulfill({ json: fresh });
  });
  const files: string[] = [];
  page.on("download", (d) => files.push(d.suggestedFilename()));
  await page.getByRole("button", { name: "Export CSV", exact: true }).click();
  await expect(
    page.getByText(
      "CSV could not be prepared. Reload the report and try again.",
    ),
  ).toBeVisible();
  expect(files).toEqual([]);
  await page
    .getByRole("button", { name: "Refresh report", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Export CSV", exact: true }),
  ).toBeEnabled();
  await download(
    page,
    page.getByRole("button", { name: "Export CSV", exact: true }),
    info,
    "refreshed",
  );
  await page.route("**/api/reports/progress?personId=**", (route) =>
    route.fulfill({ status: 403, json: { error: "Reporting access changed" } }),
  );
  await page
    .locator("button[data-person-id]")
    .first()
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Reporting access changed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export CSV", exact: true }),
  ).toBeDisabled();
  await screenshot(page, info, "batch3-detail-denied");
});

test("progress scope is distinct from optional people filters and stays stable", async ({
  page,
}, info) => {
  const data = fixture();
  data.groups.push({
    id: "pilot",
    name: "Pilot audience",
    requiredCourseIds: [],
  });
  data.users[0].groups.push("pilot");
  data.users.find((user) => user.id === "outsider")!.groups.push("pilot");
  await setup(page, info, "admin", data);
  await section(page, "Progress");
  await expect(
    page.getByRole("heading", { name: "Progress", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("People & completion", { exact: true }),
  ).toHaveCount(0);
  const search = page.getByRole("combobox", {
    name: "Search teams or people",
    exact: true,
  });
  await search.click();
  await expect(
    page
      .getByRole("group", { name: "Teams", exact: true })
      .getByRole("option", { name: /^Organization —/ }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("option", { name: /Entire organization/ }),
  ).toHaveCount(0);
  await searchTeam(page, "Sales team");
  const overview = page.locator('[data-slot="progress-overview"]');
  const controls = page.locator('[data-slot="collection-controls"]');
  expect((await overview.boundingBox())!.y).toBeLessThan(
    (await controls.boundingBox())!.y,
  );
  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(
    page.getByRole("combobox", { name: "Sign-in status", exact: true }),
  ).toHaveCount(0);
  const group = page.getByRole("combobox", {
    name: "Learning group",
    exact: true,
  });
  await expect(group).toHaveAccessibleDescription(/all their assigned courses/);
  await select(page, "Learning group", "Pilot audience");
  await page.getByRole("combobox", { name: "User type", exact: true }).click();
  await expect(
    page.getByRole("option", { name: "New users", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("option", { name: "Existing users", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  const rows = page.locator('table[data-layout="progressPeople"] tbody tr');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("zoe@example.test");
  // This group assigns no courses. Its members still report all their assignments.
  await expect(rows.getByRole("progressbar", { name: /^1 of 3 courses complete/ })).toBeVisible();
  await expect(rows).not.toContainText("SECRET OUTSIDER");
  await expect(rows).not.toContainText("Onboarding");
  await expect(rows).not.toContainText("Signed in");
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  const activePeople = data.users.filter((user) => user.active).length;
  await expect(
    page.getByText(`Organization · ${activePeople} users.`, { exact: false }),
  ).toBeVisible();
  await expect(rows).toHaveCount(activePeople);
  await screenshot(page, info, "progress-refined-scope");
});

test("refreshed Hooli organization reports all 200 people through bounded pages and matching CSV", async ({
  page,
}, info) => {
  await setup(page, info, "admin", freshWorkspace());
  await section(page, "Progress");
  await expect(
    page.getByText("Organization · 200 users.", { exact: false }),
  ).toBeVisible();
  const table = page.getByRole("region", {
    name: "People progress",
    exact: true,
  });
  await expect(
    table.getByRole("row").filter({ has: page.getByRole("cell") }),
  ).toHaveCount(25);
  const overview = page.locator('[data-slot="progress-overview"]');
  await expect(overview.locator(':scope > [data-slot="card"]')).toHaveCount(2);
  const exported = await download(
    page,
    page.getByRole("button", { name: "Export CSV", exact: true }),
    info,
    "hooli-organization",
  );
  expect(exported.rows).toHaveLength(201);
  const assigned = exported.rows[0].indexOf("Assigned courses");
  expect(assigned).toBeGreaterThanOrEqual(0);
  expect(
    exported.rows.slice(1).reduce((sum, row) => sum + Number(row[assigned]), 0),
  ).toBe(1481);
  await screenshot(page, info, "hooli-progress");
});

test("two-chart overview stays bounded with fifty teams and filter row appears left-aligned above People", async ({
  page,
}, info) => {
  const data = fixture();
  data.teams!.push(
    ...Array.from({ length: 50 }, (_, index) => ({
      id: `region-${index}`,
      name: `Regional team ${String(index + 1).padStart(2, "0")}`,
      parentId: data.settings!.organizationTeamId!,
    })),
  );
  await setup(page, info, "admin", data);
  await section(page, "Progress");
  const overview = page.locator('[data-slot="progress-overview"]');
  await expect(overview.locator(':scope > [data-slot="card"]')).toHaveCount(2);
  await expect(
    overview.getByRole("heading", { name: "Progress by team", exact: true }),
  ).toHaveCount(0);
  const controls = page.locator('[data-slot="collection-controls"]');
  const primary = controls.locator('[data-slot="collection-primary-row"]');
  const headingRow = controls.locator(
    '[data-slot="collection-applied-filters"]',
  );
  const table = page.getByRole("region", {
    name: "People progress",
    exact: true,
  });
  const tableOffset = async () =>
    (await table.boundingBox())!.y -
    ((await primary.boundingBox())!.y + (await primary.boundingBox())!.height);
  const baseline = await tableOffset();
  expect((await headingRow.boundingBox())!.height).toBe(0);
  await searchTeam(page, "Sales team");
  await expect(
    headingRow.getByRole("button", {
      name: "Remove Team: Sales team filter",
      exact: true,
    }),
  ).toBeVisible();
  await expect
    .poll(async () => (await headingRow.boundingBox())!.height)
    .toBe(52);
  expect(Math.abs((await tableOffset()) - baseline - 52)).toBeLessThanOrEqual(
    1,
  );
  const chip = headingRow.getByRole("button", {
    name: "Remove Team: Sales team filter",
    exact: true,
  });
  const search = page.getByRole("combobox", {
    name: "Search teams or people",
    exact: true,
  });
  expect(
    Math.abs((await chip.boundingBox())!.x - (await search.boundingBox())!.x),
  ).toBeLessThanOrEqual(1);
  const people = page.getByRole("heading", { name: "People", exact: true });
  expect((await people.boundingBox())!.y).toBeGreaterThan(
    (await headingRow.boundingBox())!.y + 52,
  );
  await screenshot(page, info, "left-aligned-progress-filters");
  await page.getByRole("button", { name: "Clear all", exact: true }).click();
  await expect
    .poll(async () => (await headingRow.boundingBox())!.height)
    .toBe(0);
  expect(Math.abs((await tableOffset()) - baseline)).toBeLessThanOrEqual(1);
  // Team discovery still reaches a later result among more than fifty teams.
  await searchTeam(page, "Regional team 50");
  await expect(
    page.getByText("Regional team 50 · 0 users.", { exact: false }),
  ).toBeVisible();
  await searchTeam(page, "Organization");
  await screenshot(page, info, "compact-progress-fifty-teams");
});

test("unified search groups results, commits a person by identity, and keeps highest-scope charts while typing", async ({
  page,
}, info) => {
  const data = fixture();
  data.users.find((user) => user.id === "outsider")!.name = data.users[0].name;
  await setup(page, info, "admin", data);
  await section(page, "Progress");
  const overview = page.locator('[data-slot="progress-overview"]');
  const baseline = await overview
    .getByRole("progressbar", { name: "People up to date", exact: true })
    .getAttribute("aria-valuenow");
  const search = page.getByRole("combobox", {
    name: "Search teams or people",
    exact: true,
  });
  await search.fill("team");
  const list = page.getByRole("listbox", {
    name: "Search results",
    exact: true,
  });
  const groups = list.getByRole("group");
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(0)).toHaveAccessibleName("Teams");
  await expect(groups.nth(1)).toHaveAccessibleName("People");
  await expect(
    overview.getByRole("progressbar", {
      name: "People up to date",
      exact: true,
    }),
  ).toHaveAttribute("aria-valuenow", baseline!);
  await search.fill("Zoë");
  const people = list.getByRole("group", { name: "People", exact: true });
  await expect(
    people.getByRole("option", { name: /zoe@example.test/ }),
  ).toHaveCount(1);
  await expect(
    people.getByRole("option", { name: /outsider@example.test/ }),
  ).toHaveCount(1);
  await people.getByRole("option", { name: /zoe@example.test/ }).click();
  await expect(search).toBeFocused();
  await expect(list).not.toBeVisible();
  const rows = page.locator('table[data-layout="progressPeople"] tbody tr');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText("zoe@example.test");
  await expect(rows).not.toContainText("outsider@example.test");
  const exported = await download(
    page,
    page.getByRole("button", { name: "Export CSV", exact: true }),
    info,
    "selected-person",
  );
  expect(exported.rows).toHaveLength(2);
  expect(exported.rows[1][1]).toBe("zoe@example.test");
  await searchTeam(page, "Sales team");
  await expect(rows).toHaveCount(5);
  await expect(
    page.getByText("Sales team · 5 users. Includes all subteams.", {
      exact: true,
    }),
  ).toBeVisible();
  await screenshot(page, info, "unified-report-search");
});

test("manager unified search never offers sibling people or teams", async ({
  page,
}, info) => {
  await setup(page, info, "manager");
  const search = page.getByRole("combobox", {
    name: "Search teams or people",
    exact: true,
  });
  await expect(
    page.getByText("Sales team · 5 users. Includes all subteams.", {
      exact: true,
    }),
  ).toBeVisible();
  await search.fill("outsider");
  await expect(
    page.getByRole("option", { name: /outsider@example.test/ }),
  ).toHaveCount(0);
  await search.fill("Sibling");
  await expect(page.getByRole("option", { name: /^Sibling team/ })).toHaveCount(
    0,
  );
  await page.keyboard.press("Escape");
  await expect(search).toBeFocused();
  await screenshot(page, info, "manager-search-scope");
});

for (const scope of ["multiple roots", "Organization"]) {
  test(`manager overview defaults to the highest permitted scope: ${scope}`, async ({
    page,
  }, info) => {
    const data = fixture();
    const manager = data.users.find((user) => user.id === "demo-manager")!;
    const root = data.teams!.find((team) =>
      scope === "Organization"
        ? team.system === "organization"
        : team.id === "other",
    )!;
    root.managerId = manager.id;
    const count =
      scope === "Organization"
        ? data.users.filter((user) => user.active).length
        : 6;
    const label = scope === "Organization" ? "Organization" : "All my teams";
    await setup(page, info, "manager", data);
    const rows = page.locator('table[data-layout="progressPeople"] tbody tr');
    await expect(rows).toHaveCount(count);
    await expect(
      page.getByText(`${label} · ${count} users.`, { exact: false }),
    ).toBeVisible();
    await searchTeam(page, "Sales team");
    await expect(rows).toHaveCount(5);
    await page.getByRole("button", { name: "Clear all", exact: true }).click();
    await expect(rows).toHaveCount(count);
    await expect(
      page.getByText(`${label} · ${count} users.`, { exact: false }),
    ).toBeVisible();
    await screenshot(page, info, `manager-highest-${scope.replace(" ", "-")}`);
  });
}


test("administrator can cancel, individually delete and bulk-delete filtered feedback", async ({ page }, info) => {
  const data = fixture();
  data.feedback!.push({ ...data.feedback![1], id: "00000000-0000-4000-8000-000000000104", updatedAt: "2026-09-19T12:00:00Z" }, {
    id: "00000000-0000-4000-8000-000000000105", userId: data.users[0].id,
    rating: "up", comment: "Keep this general feedback", updatedAt: "2026-09-18T12:00:00Z",
  });
  await setup(page, info, "admin", data);
  await section(page, "Feedback");
  const cards = page.locator('article[data-slot="card"]');
  await expect(cards).toHaveCount(5);
  await cards.first().getByRole("button", { name: /^Actions for feedback/ }).click();
  await page.getByRole("menuitem", { name: "Delete feedback", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("cannot be undone");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(cards).toHaveCount(5);
  await cards.first().getByRole("button", { name: /^Actions for feedback/ }).click();
  await page.getByRole("menuitem", { name: "Delete feedback", exact: true }).click();
  await dialog.getByRole("button", { name: "Delete feedback", exact: true }).click();
  await expect(cards).toHaveCount(4);
  await page.getByRole("searchbox", { name: "Search feedback" }).fill("=1+2");
  await expect(cards).toHaveCount(2);
  await page.getByRole("checkbox", { name: "Select all filtered feedback", exact: true }).click();
  await page.getByRole("button", { name: "Bulk actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete selected feedback", exact: true }).click();
  await expect(dialog).toContainText("2 feedback entries");
  await screenshot(page, info, "feedback-delete-confirmation");
  await dialog.getByRole("button", { name: "Delete selected feedback", exact: true }).click();
  await expect(cards).toHaveCount(0);
  await page.getByRole("searchbox", { name: "Search feedback" }).fill("");
  await expect(cards).toHaveCount(2);
  await expect(page.locator(".report-summary")).toContainText("2 ratings");
  const remaining = await download(page, page.getByRole("button", { name: "Export CSV", exact: true }), info, "feedback-deleted");
  expect(remaining.rows).toHaveLength(3);
  expect(remaining.rows.flat()).toContain("Keep this general feedback");
  expect(remaining.rows.flat()).not.toContain("'=1+2");
  await page.reload();
  await expect(cards).toHaveCount(2);
});
