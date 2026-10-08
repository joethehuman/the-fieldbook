import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { guestFixture } from "../guest-fixture";
import { reconcileLearning } from "../../lib/learning-groups";
import { updateProgress } from "../../lib/store";
import { gradeQuiz } from "../../lib/course-quiz";

async function setup(
  page: Page,
  info: TestInfo,
  role = "guest",
  selected: string | null = "visitors",
) {
  let data = guestFixture();
  data.settings!.guestGroupId = selected;
  let fail = "",
    delay = 0;
  const production = info.project.name.startsWith("production");
  if (production) {
    for (const item of [...data.content, ...(data.publishedContent || [])])
      item.publishedRevision = 1;
  }
  const savedUsers = JSON.stringify(data.users);
  async function syncProvider(nextRole = "admin", userGroups: string[] = []) {
    await page.request.post("http://127.0.0.1:3130/fixture", {
      data: {
        settings: data.settings,
        groups: data.groups,
        curricula: data.curricula,
        role: nextRole,
        userGroups,
        documents: data.content.map((item) => ({
          id: item.id,
          published: item.status === "published" ? item : null,
          draft: item,
          revision: 1,
          published_revision: 1,
          updated_at: item.updatedAt,
        })),
      },
    });
  }
  if (production) {
    await syncProvider();
    if (role === "admin") {
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
    }
    for (const kind of ["settings", "governance"])
      await page.route(`**/api/${kind}`, async (route) => {
        if (delay) await new Promise((r) => setTimeout(r, delay));
        if (fail === kind)
          return route.fulfill({
            status: 409,
            json: { error: "Synthetic save conflict. Reload before saving." },
          });
        const b = route.request().postDataJSON();
        if (kind === "settings")
          data = {
            ...data,
            settings: b.settings,
            revision: (data.revision || 0) + 1,
          };
        else
          data = reconcileLearning(data, {
            ...data,
            groups: b.groups,
            users: data.users,
            curricula: b.curricula,
            teams: b.teams,
            governanceRevision: (data.governanceRevision || 0) + 1,
          });
        await syncProvider();
        await route.fulfill({
          json: {
            revision:
              kind === "settings" ? data.revision : data.governanceRevision,
          },
        });
      });
    await page.route("**/api/progress", async (route) => {
      const b = route.request().postDataJSON(),
        c = data.content.find((c) => c.id === b.contentId)!;
      const lessons = [
        ...new Set([...(b.lessons || []), ...(b.lessonId ? [b.lessonId] : [])]),
      ];
      const graded = b.selections ? gradeQuiz(c, b.selections) : undefined;
      await route.fulfill({
        json: {
          lessons,
          passed: !!b.complete,
          attemptPassed: graded?.passed,
          attempt: graded && { at: new Date().toISOString(), version: c.version, passed: graded.passed, answers: graded.answers },
        },
      });
    });
  } else
    await page.addInitScript(
      ({ data, role }) => {
        if (!localStorage.getItem("fieldbook.workspace.v1")) {
          localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
          sessionStorage.setItem(
            "fieldbook.profile.v1",
            role === "guest" ? "guest" : `demo-${role}`,
          );
        }
      },
      { data, role },
    );
  await page.goto(
    role === "admin"
      ? production
        ? "/admin"
        : "/#admin"
      : production
        ? "/courses"
        : "/",
  );
  if (role === "admin")
    await expect(page.locator(".admin-layout")).toBeVisible();
  else
    await expect(
      page.getByRole("heading", { name: "Courses", exact: true }).first(),
    ).toBeVisible();
  return {
    production,
    fail: (value: string) => {
      fail = value;
    },
    delay: (value: number) => {
      delay = value;
    },
    getData: async () =>
      production
        ? data
        : await page.evaluate(() =>
            JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
          ),
    change: async (fn: (d: typeof data) => void) => {
      fn(data);
      if (production) await syncProvider();
      else
        await page.evaluate(
          (d) =>
            localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(d)),
          data,
        );
    },
    signIn: async () => {
      if (production) {
        await syncProvider("learner", ["account"]);
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
            url: new URL(page.url()).origin,
          },
        ]);
      } else
        await page.evaluate(() =>
          sessionStorage.setItem("fieldbook.profile.v1", "demo-learner"),
        );
      await page.goto(production ? "/courses" : "/");
    },
    unchangedPeople: async () =>
      expect(
        JSON.stringify(
          production
            ? data.users
            : (
                await page.evaluate(() =>
                  JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
                )
              ).users,
        ),
      ).toBe(savedUsers),
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
async function select(page: Page, name: string, option: string) {
  await page.getByRole("combobox", { name, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
async function shot(page: Page, info: TestInfo, name: string) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath(name + ".png"),
    fullPage: name !== "create-dialog",
    animations: "disabled",
  });
}
async function save(page: Page) {
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    page.getByText("Settings saved.", { exact: true }),
  ).toBeVisible();
}
async function nav(page: Page, name: string) {
  const open = page.getByRole("button", { name: "Open navigation" });
  if (await open.isVisible()) await open.click();
  const navigation = page.getByRole("navigation", { name: "Primary" });
  const label = new RegExp(`^${name}(\\s+\\d+)?$`);
  await navigation
    .getByRole("link", { name: label })
    .or(navigation.getByRole("button", { name: label }))
    .first()
    .click();
}

test("optional existing selection, explicit named creation, save flow and retained private setting", async ({
  page,
}, info) => {
  const f = await setup(page, info, "admin", null);
  await section(page, "Access");
  await expect(
    page.getByText(
      "Your library is public. Select a group to recommend content to guests.",
    ),
  ).toBeVisible();
  const picker = page.getByRole("combobox", {
    name: "Learning group for guests",
  });
  await picker.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("option", { name: "Broader learning group / Visitors", exact: true }).click();
  expect((await f.getData()).settings.guestGroupId).toBeNull();
  await save(page);
  expect((await f.getData()).settings.guestGroupId).toBe("visitors");
  await shot(page, info, "existing-selected");
  await page
    .getByRole("button", { name: "Create guest group", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Create guest group");
  await page
    .getByRole("textbox", { name: "Group name", exact: true })
    .fill("Public readers");
  await shot(page, info, "create-dialog");
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  await expect(picker).toContainText("Public readers");
  const created = (await f.getData()).groups.find(
    (g: any) => g.name === "Public readers",
  );
  expect(created).toBeTruthy();
  expect((await f.getData()).settings.guestGroupId).toBe("visitors");
  await save(page);
  expect((await f.getData()).settings.guestGroupId).toBe(created.id);
  await select(page, "Who can browse?", "Signed-in members only");
  await expect(picker).toHaveCount(0);
  await save(page);
  expect((await f.getData()).settings.guestGroupId).toBe(created.id);
  await select(page, "Who can browse?", "Anyone — accounts are optional");
  await save(page);
  await expect(picker).toContainText("Public readers");
  await f.unchangedPeople();
});

test("deleted group is visible to admin and can be cleared without requiring a replacement", async ({
  page,
}, info) => {
  const f = await setup(page, info, "admin", "gone");
  await section(page, "Access");
  await expect(
    page.getByText(/The selected group is unavailable/),
  ).toBeVisible();
  await shot(page, info, "unavailable");
  await select(
    page,
    "Learning group for guests",
    "None — no personalized recommendations.",
  );
  await save(page);
  expect((await f.getData()).settings.guestGroupId).toBeNull();
  await f.unchangedPeople();
});

test("guest Updates and curriculum learning, browser progress and account transition", async ({
  page,
}, info) => {
  const f = await setup(page, info);
  await expect(page.locator(".for-you")).toContainText("Guest introduction");
  await expect(page.locator(".for-you")).toContainText(
    "0 of 2 recommended courses complete",
  );
  await expect(page.locator(".for-you")).not.toContainText(
    /past their due date|days left in onboarding/,
  );
  await shot(page, info, "guest-courses");
  await page.getByRole("button", { name: "View all for you" }).click();
  await expect(
    page
      .getByRole("group", { name: "Course views" })
      .getByRole("button", { name: "For you" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page
      .getByRole("group", { name: "Course views" })
      .getByRole("button", { name: "Your courses" }),
  ).toHaveCount(0);
  await expect(
    page.locator(".library .course-card").filter({ hasText: "Assigned" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Back to courses" }).click();
  if (f.production) {
    const open = page.getByRole("button", { name: "Open navigation" });
    if (await open.isVisible()) await open.click();
    const account = page.locator(".sidebar-bottom");
    await expect(account.getByText("Guest", { exact: true })).toBeVisible();
    await expect(account).not.toContainText("Progress stays in this browser");
    await account.getByRole("button", { name: "Account menu" }).click();
    await expect(
      page.getByRole("menuitem", { name: "Sign in with Google" }),
    ).toBeVisible();
    await expect(page.getByRole("menu")).toContainText(
      "Sign in with Google to save course progress across devices and browsers.",
    );
    await page.keyboard.press("Escape");
    const close = page.getByRole("button", { name: "Close navigation" });
    if (await close.isVisible()) await close.click();
  }
  await page
    .locator(".for-you")
    .getByRole(f.production ? "link" : "button", { name: /Guest introduction/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Guest introduction", exact: true }),
  ).toBeVisible();
  await shot(page, info, "guest-curriculum");
  await page
    .getByRole(f.production ? "link" : "button", { name: /Foundation course/ })
    .first()
    .click();
  await page.getByRole("button", { name: "Quiz Check your knowledge" }).click();
  await page.getByRole("radio", { name: "Correct", exact: true }).check();
  await page.getByRole("button", { name: "Submit and see results" }).click();
  await expect(
    page.getByRole("heading", { name: "1 of 1 correct" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close course" }).click();
  await page.reload();
  await nav(page, "Courses");
  await expect(page.locator(".for-you")).toContainText(
    "1 of 2 recommended courses complete",
  );
  await nav(page, "Updates");
  await expect(page.locator(".updates-section").first()).toContainText(
    "Recommended update",
  );
  await expect(page.locator(".updates-section").first()).not.toContainText(
    "Other update",
  );
  await shot(page, info, "guest-updates");
  await f.unchangedPeople();
  await f.signIn();
  await expect(page.locator(".for-you")).toContainText("Optional course");
  await expect(page.locator(".for-you")).not.toContainText(
    "Guest introduction",
  );
  if (f.production)
    await expect(
      page.getByRole("region", { name: "Import browser progress" }),
    ).toBeVisible();
  await f.unchangedPeople();
});

test("no selection and publication changes preserve a usable library with honest empty states", async ({
  page,
}, info) => {
  const f = await setup(page, info, "guest", null);
  await expect(page.locator(".for-you")).toContainText(
    "No recommendations yet",
  );
  await expect(
    page.getByRole(f.production ? "link" : "button", {
      name: /Foundation course/,
    }),
  ).toBeVisible();
  await shot(page, info, "guest-empty");
  await expect(
    page.getByRole("button", { name: "View all for you" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "All courses", exact: true }).click();
  await expect(page.locator("#all-courses")).toBeInViewport();
  await nav(page, "Updates");
  await expect(
    page.getByRole("heading", { name: "For you", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "All updates", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".updates-section").first()).toContainText(
    "Recommended update",
  );
  await expect(page.locator(".updates-section").first()).toContainText(
    "Other update",
  );
  await f.change((d) => {
    d.settings!.guestGroupId = "visitors";
    d.content[1].status = "draft";
  });
  await page.goto(f.production ? "/courses" : "/");
  await expect(page.locator(".for-you")).toContainText(
    "0 of 1 recommended courses complete",
  );
  await f.change((d) => {
    d.groups = d.groups.filter((g) => g.id !== "visitors");
  });
  await page.reload();
  await expect(page.locator(".for-you")).toContainText(
    "No recommendations yet",
  );
});

test("settings and group failures preserve edits, successful retry and pending disabled controls", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("production"),
    "HTTP failures are covered on the installed app",
  );
  const f = await setup(page, info, "admin", null);
  await section(page, "Access");
  f.fail("governance");
  await page
    .getByRole("button", { name: "Create guest group", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Group name", exact: true })
    .fill("New guests");
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Synthetic save conflict" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Learning group for guests" }),
  ).toContainText("None");
  expect(
    (await f.getData()).groups.some((g: any) => g.name === "New guests"),
  ).toBe(false);
  f.fail("settings");
  await select(page, "Learning group for guests", "Broader learning group / Visitors");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Synthetic save conflict" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Learning group for guests" }),
  ).toContainText("Visitors");
  await shot(page, info, "save-failure");
  f.fail("");
  f.delay(600);
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Saving…", exact: true }),
  ).toBeDisabled();
  await shot(page, info, "saving");
  await expect(
    page.getByText("Settings saved.", { exact: true }),
  ).toBeVisible();
  await f.unchangedPeople();
});

test("public to private removes anonymous learning and keeps the saved group", async ({
  page,
}, info) => {
  const f = await setup(page, info);
  if (f.production)
    await page.route("**/auth/sign-in?**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<h1>Synthetic sign-in destination</h1>",
      }),
    );
  await f.change((d) => {
    d.settings!.access = "private";
  });
  await page.reload();
  if (f.production) await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
  else
    await expect(
      page.getByRole("heading", { name: "Choose a demo profile" }),
    ).toBeVisible();
  await expect(page.locator(".for-you")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Continue as guest" }),
  ).toHaveCount(0);
  expect((await f.getData()).settings.guestGroupId).toBe("visitors");
  await f.unchangedPeople();
});

test("guest reader failure and retry remain recoverable", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("production"),
    "HTTP failures are specific to the installed application",
  );
  const f = await setup(page, info);
  await page.request.post("http://127.0.0.1:3130/fixture", {
    data: { settings: { access: "public" }, fail: true },
  });
  await page.goto("/courses");
  await expect(
    page.getByRole("heading", { name: "Unable to load this page" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Export CSV" })).toHaveCount(0);
  await shot(page, info, "guest-reader-error");
  await f.change(() => {});
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Courses", exact: true }),
  ).toBeVisible();
});
