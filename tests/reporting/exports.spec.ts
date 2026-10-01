import {
  test,
  expect,
  type Page,
  type Locator,
  type TestInfo,
} from "@playwright/test";
import { readFile } from "node:fs/promises";
import { learningUiFixture } from "../fixtures/learning-ui";
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
    await expect(picker).toContainText(name);
  } else {
    const tab = page.getByRole("tab", { name, exact: true });
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
  }
}
async function select(page: Page, name: string, option: string) {
  await page.getByRole("combobox", { name, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
function fixture(): Workspace {
  const data = learningUiFixture();
  data.users[0].name = 'Zoë "Example", 東京';
  data.users[0].email = "zoe@example.test";
  data.teams!.push(
    { id: "child", name: "Subteam", parentId: "sales-team" },
    { id: "other", name: "Sibling team" },
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
      id: "f1",
      contentId: "course-1",
      userId: data.users[0].id,
      version: 1,
      rating: "up",
      comment: 'Zoë, "hello"\n東京',
      updatedAt: "2026-09-21T17:30:00Z",
    },
    {
      id: "f2",
      contentId: "course-1",
      userId: data.users[0].id,
      version: 1,
      rating: "down",
      comment: "=1+2",
      updatedAt: "2026-09-20T17:30:00Z",
    },
    {
      id: "f3",
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
async function setup(
  page: Page,
  info: TestInfo,
  role = "admin",
  data = fixture(),
) {
  const production = info.project.name.startsWith("production");
  const user = data.users.find((u) => u.id === `demo-${role}`)!;
  if (production) {
    const actorId = "00000000-0000-4000-8000-000000000010";
    const oldId = user.id;
    user.id = actorId;
    for (const team of data.teams || [])
      if (team.managerId === oldId) team.managerId = actorId;
    if (data.progress[oldId]) {
      data.progress[actorId] = data.progress[oldId];
      delete data.progress[oldId];
    }
    await page.request.post("http://127.0.0.1:3130/fixture", {
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
    });
    const token = await (
      await page.request.post("http://127.0.0.1:3130/auth/v1/token", {
        data: {},
      })
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
  await page.getByRole("button", { name: /^Filters(?: \(\d+\))?$/ }).click();
  await select(page, "Reporting team", "Sales team");
  await page.keyboard.press("Escape");
  await page
    .getByRole("searchbox", { name: "Find a team member" })
    .fill("zoe@example.test");
  const displayed = page.locator('table[data-layout="progress"] tbody tr');
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
  expect(rows[1].slice(0, 6)).toEqual([
    'Zoë "Example", 東京',
    "zoe@example.test",
    "Subteam",
    "3",
    "1",
    "33",
  ]);
  await expect(displayed).toContainText(rows[1][6]);
  await screenshot(page, info, "team-filtered");
  await page.getByRole("button", { name: "View courses", exact: true }).click();
  const detail = await download(
    page,
    page.getByRole("button", { name: "Export CSV", exact: true }).nth(1),
    info,
    "member",
  );
  expect(detail.rows).toHaveLength(4);
  expect(detail.rows[1][8]).toBe("Completed");
  expect(detail.rows.flat().join(" ")).not.toContain(
    "Self-directed exploration",
  );
  await screenshot(page, info, "member-assignments");
  await page
    .getByRole("searchbox", { name: "Find a team member" })
    .fill("no-match");
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
  await page
    .getByRole("button", { name: "Sort: Newest first", exact: true })
    .click();
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
  await page.getByRole("button", { name: /^Filters(?: \(\d+\))?$/ }).click();
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
    .getByRole("button", { name: "Courses & progress" })
    .click();
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
  await page
    .getByRole("searchbox", { name: "Find a team member" })
    .fill("Large person");
  const displayed = page.locator(
    'table[data-layout="progress"]:visible tbody tr',
  );
  await expect(displayed).toHaveCount(1205);
  const displayedNames = await displayed
    .locator("td:first-child strong")
    .allTextContents();
  expect(new Set(displayedNames)).toEqual(
    new Set(Array.from({ length: 1205 }, (_, i) => `Large person ${i}`)),
  );
  const result = await download(
    page,
    page.getByRole("button", { name: "Export CSV", exact: true }),
    info,
    "large",
  );
  expect(result.rows).toHaveLength(1206);
  expect(result.rows.slice(1).map((row) => row[0])).toEqual(displayedNames);
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

test("pending and failed route reports keep Admin navigation and recover locally", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("production"),
    "Server-only route read",
  );
  await setup(page, info);
  await expect(
    page.getByRole("status").filter({ hasText: "Content ready" }),
  ).toBeVisible();
  await page.request.post("http://127.0.0.1:3130/controls", {
    data: { teamReadDelayMs: 1800, governanceUnavailable: true },
  });
  const navigation = page.locator('[data-slot="admin-navigation"]');
  const top = (await navigation.boundingBox())?.y;
  await page.evaluate(() => {
    (window as any).reportNavigation = document.querySelector(
      '[data-slot="admin-navigation"]',
    );
  });
  await section(page, "Progress");
  await expect(
    page.getByRole("status").filter({ hasText: "Retrieving progress" }),
  ).toBeVisible();
  expect((await navigation.boundingBox())?.y).toBe(top);
  await expect(page.getByRole("button", { name: "Export CSV" })).toHaveCount(0);
  await screenshot(page, info, "loading");
  await expect(
    page.getByRole("heading", { name: "Unable to load this section" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (window as any).reportNavigation ===
        document.querySelector('[data-slot="admin-navigation"]'),
    ),
  ).toBe(true);
  await expect(page.getByRole("button", { name: "Export CSV" })).toHaveCount(0);
  await screenshot(page, info, "unavailable");
  await page.request.post("http://127.0.0.1:3130/controls", {
    data: { teamReadDelayMs: 0, governanceUnavailable: false },
  });
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Export CSV", exact: true }),
  ).toBeEnabled();
});

test("Admin defers reporting reads until those routes are used", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("production"),
    "Server-only data path",
  );
  await setup(page, info);
  await expect(
    page.getByRole("status").filter({ hasText: "Content ready" }),
  ).toBeVisible();
  const reads = async () =>
    await (await page.request.get("http://127.0.0.1:3130/reads")).json();
  expect(await reads()).toMatchObject({ governanceReads: 0, feedbackReads: 0 });
  await section(page, "Progress");
  await expect(page.getByRole("button", { name: "Export CSV" })).toBeEnabled();
  expect(await reads()).toMatchObject({ governanceReads: 1, feedbackReads: 0 });
  await section(page, "Feedback");
  await expect(
    page.getByRole("heading", { name: "Feedback", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Export CSV" })).toBeEnabled();
  expect(await reads()).toMatchObject({ governanceReads: 1, feedbackReads: 1 });
  await expect(page.getByText("Loading section", { exact: true })).toHaveCount(
    0,
  );
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
    .getByRole("button", { name: "Courses & progress" })
    .click();
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
  await page
    .getByRole("searchbox", { name: "Find a team member" })
    .fill("no match");
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
  await expect(
    page.locator('table[data-layout="progress"] tbody tr'),
  ).toHaveCount(data.users.filter((user) => user.active).length);
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

test("People fieldset footers preserve default-stage saving in both applications", async ({
  page,
}, info) => {
  const { data, production } = await setup(page, info);
  if (production)
    await page.route("**/api/settings", async (route) => {
      data.settings = route.request().postDataJSON().settings;
      const previous = data.revision ?? 1;
      data.revision = previous + 1;
      await page.request.patch(
        `http://127.0.0.1:3130/rest/v1/fb_config?revision=eq.${previous}`,
        { data: { settings: data.settings, revision: data.revision } },
      );
      await route.fulfill({ json: { revision: data.revision } });
    });
  await section(page, production ? "People" : "Demo profiles");
  await page
    .getByRole("button", { name: "New user defaults", exact: true })
    .click();
  const group = page.getByRole("region", { name: "New users", exact: true });
  await expect(group.getByRole("combobox")).toHaveAccessibleDescription(
    /Applies to newly added users/,
  );
  await expect(group.locator('[data-slot="card-footer"]')).toHaveCSS(
    "background-color",
    "rgb(250, 250, 250)",
  );
  await select(
    page,
    "Default onboarding stage for new users",
    "New user — onboarding window",
  );
  await expect(
    page.getByRole("status").filter({ hasText: "Default saved" }),
  ).toBeVisible();
  if (production) {
    const pending = page.getByRole("region", {
      name: "Pending accounts",
      exact: true,
    });
    await expect(pending.locator('[data-slot="card-footer"]')).toContainText(
      "No email is sent.",
    );
  }
  await screenshot(page, info, "people-fieldset-footers");
  if (production) {
    await page.goto("/admin");
  } else await page.reload();
  await expect(page.locator(".admin-layout")).toBeVisible();
  await section(page, production ? "People" : "Demo profiles");
  await page
    .getByRole("button", { name: "New user defaults", exact: true })
    .click();
  await expect(group.getByRole("combobox")).toContainText(
    "New user — onboarding window",
  );
});
