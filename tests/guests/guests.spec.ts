import { test, expect, type Page, type TestInfo } from "@playwright/test";
import { guestFixture } from "../guest-fixture";
import { guestRecommendations } from "../../lib/guest-recommendations";
import { reconcileLearning } from "../../lib/learning-groups";
import { updateProgress } from "../../lib/store";

async function setup(
  page: Page,
  info: TestInfo,
  role = "guest",
  selected: string | null = "visitors",
) {
  let data = guestFixture();
  data.settings!.guestGroupId = selected;
  let current = role,
    fail = "",
    delay = 0;
  const production = info.project.name.startsWith("production");
  if (production) {
    for (const item of [...data.content, ...(data.publishedContent || [])])
      item.publishedRevision = 1;
  }
  const savedUsers = JSON.stringify(data.users);
  const workspace = () => {
    if (current === "guest") {
      const p = guestRecommendations(data);
      const content = p.content.map((c) => ({
        ...c,
        questions: c.questions.map(({ answer, ...q }) => q),
      }));
      return {
        data: {
          schema: 1,
          settings: p.settings,
          users: [p.user],
          groups: p.groups,
          curricula: p.curricula,
          content,
          publishedContent: content,
          progress: {},
          teams: [],
          feedback: [],
        },
        user: null,
      };
    }
    const user = data.users.find((u) => u.id === `demo-${current}`)!;
    return { data, user };
  };
  if (production) {
    await page.request.post("http://127.0.0.1:3130/fixture", {
      data: {
        settings: data.settings,
        groups: data.groups,
        curricula: data.curricula,
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
    await page.route("**/api/workspace", async (route) => {
      if (fail === "load")
        return route.fulfill({
          status: 503,
          json: { error: "Workspace temporarily unavailable." },
        });
      if (delay) await new Promise((r) => setTimeout(r, delay));
      if (current === "guest" && data.settings!.access === "private")
        return route.fulfill({
          status: 401,
          json: { error: "Sign in to continue." },
        });
      await route.fulfill({ json: workspace() });
    });
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
            users: b.users,
            curricula: b.curricula,
            teams: b.teams,
            governanceRevision: (data.governanceRevision || 0) + 1,
          });
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
      const passed =
        !!b.answers && c.questions.every((q, i) => q.answer === b.answers[i]);
      await route.fulfill({
        json: {
          lessons,
          passed,
          attemptPassed: b.answers ? passed : undefined,
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
  await page.goto(role === "admin" ? (production ? "/team" : "/#admin") : "/");
  if (production && role === "admin") {
    const menu = page.getByRole("button", { name: "Open navigation" });
    if (await menu.isVisible()) await menu.click();
    await page.getByRole("button", { name: "Manage organization" }).click();
  }
  const ready = role === "admin" ? "Administration" : "Courses";
  await expect(
    page.getByRole("heading", { name: ready, exact: true }).first(),
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
      if (!production)
        await page.evaluate(
          (d) =>
            localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(d)),
          data,
        );
    },
    signIn: async () => {
      current = "learner";
      if (!production)
        await page.evaluate(() =>
          sessionStorage.setItem("fieldbook.profile.v1", "demo-learner"),
        );
      await page.goto("/");
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
  const link = navigation.getByRole("link", { name: label }).first();
  if (await link.count()) await link.click();
  else await navigation.getByRole("button", { name: label }).first().click();
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
  await page.getByRole("option", { name: "Visitors", exact: true }).click();
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
    "0 of 2 assigned courses complete",
  );
  await expect(page.locator(".for-you")).not.toContainText(
    /past their target|days left in onboarding/,
  );
  await shot(page, info, "guest-courses");
  await page
    .locator(".for-you")
    .getByRole("button", { name: /Guest introduction/ })
    .click();
  await expect(
    page.getByRole("heading", { name: "Guest introduction", exact: true }),
  ).toBeVisible();
  await shot(page, info, "guest-curriculum");
  await page
    .getByRole("button", { name: "Start curriculum", exact: true })
    .first()
    .click();
  if (f.production)
    await page.getByRole("link", { name: /One lesson/ }).click();
  await page.getByRole("button", { name: "Continue to quiz" }).click();
  await page.getByRole("radio", { name: "Correct", exact: true }).check();
  await page.getByRole("button", { name: "Check answers" }).click();
  await expect(
    page.getByText("Great work. You’ve completed this course."),
  ).toBeVisible();
  await page.reload();
  await nav(page, "Courses");
  await expect(page.locator(".for-you")).toContainText(
    "1 of 2 assigned courses complete",
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
    page.getByRole("button", { name: /Foundation course/ }),
  ).toBeVisible();
  await shot(page, info, "guest-empty");
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
  await page.goto("/");
  await expect(page.locator(".for-you")).toContainText(
    "0 of 1 assigned courses complete",
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
  await select(page, "Learning group for guests", "Visitors");
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
  if (f.production) await expect(page).toHaveURL(/\/auth\/sign-in\?/);
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

test("guest workspace loading, failure and retry remain recoverable", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("production"),
    "HTTP load states are specific to the installed application",
  );
  const f = await setup(page, info);
  f.delay(900);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Just a sec…" }),
  ).toBeVisible();
  await shot(page, info, "guest-loading");
  await expect(page.locator(".for-you")).toContainText("Guest introduction");
  f.delay(0);
  f.fail("load");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Workspace temporarily unavailable." }),
  ).toBeVisible();
  await shot(page, info, "guest-load-error");
  f.fail("");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".for-you")).toContainText("Guest introduction");
});
