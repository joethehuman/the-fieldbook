import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace, type Workspace } from "../../lib/store";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import { authoringUser, setupAuthoringProvider } from "./provider-fixture";

// Headless Chromium hides scrollbars by default; this picker must show overflow.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });

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
async function setup(page: Page, installed: boolean, manyCourses = false) {
  let data = withPublishedSnapshots(freshWorkspace());
  const sample = data.content.find((c) => c.kind === "course")!;
  data.content = ["Foundation", "Discovery"].map((title, i) => ({
    ...structuredClone(sample),
    id: `00000000-0000-4000-8000-00000000010${i + 5}`,
    title: `${title} course`,
    groups: [],
    assignments: [],
    revision: 1,
    publishedRevision: 1,
    status: "published",
  }));
  if (manyCourses)
    data.content.push(
      ...Array.from({ length: 12 }, (_, i) => ({
        ...structuredClone(data.content[0]),
        id: `00000000-0000-4000-8000-0000000002${String(i).padStart(2, "0")}`,
        title: `Practice course ${String(i + 1).padStart(2, "0")}`,
        description:
          "A practical course about clear decisions, consistent follow-through, and working together through change.",
      })),
    );
  data.publishedContent = structuredClone(data.content);
  data.groups = [
    {
      id: "ae",
      name: "Account executives",
      learningItems: [{ kind: "curriculum", id: "p" }],
    },
    { id: "pilot", name: "Pilot", learningItems: [] },
  ];
  data.teams = [
    {
      id: "sales",
      name: "Sales",
      learningItems: [{ kind: "course", id: data.content[0].id }],
    },
  ];
  data.curricula = [
    {
      id: "p",
      name: "Foundation playlist",
      description: "Foundation learning",
      status: "published",
      courseIds: [data.content[0].id],
    },
    {
      id: "q",
      name: "Discovery playlist",
      description: "Discovery learning",
      status: "published",
      courseIds: [data.content[1].id],
    },
  ];
  data.users = [
    data.users.find((u) => u.role === "admin")!,
    data.users.find((u) => u.role === "learner")!,
  ].map((u) => ({
    ...u,
    groups: ["ae"],
    teamId: "sales",
    learningAssignments: [],
    effectiveGroupIds: undefined,
  }));
  data.progress = {};
  data.governanceRevision = 10;
  let writes = 0,
    prepares = 0;
  await page.emulateMedia({ reducedMotion: "reduce" });
  if (installed) {
    await setupAuthoringProvider(page, data);
    await page.route("**/api/admin/snapshot?**", (route) => {
      if (
        new URL(route.request().url()).searchParams.get("scope") ===
        "governance"
      )
        prepares++;
      return route.fulfill({ json: { data, user: authoringUser } });
    });
    await page.route("**/api/governance", (route) => {
      writes++;
      const input = route.request().postDataJSON();
      expect(input.expected).toBe(data.governanceRevision);
      data = {
        ...data,
        groups: input.groups,
        teams: input.teams,
        curricula: input.curricula,
        users: input.users,
        governanceRevision: data.governanceRevision! + 1,
      };
      return route.fulfill({ json: { revision: data.governanceRevision } });
    });
  } else
    await page.addInitScript((workspace) => {
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
    }, data);
  await page.goto(installed ? "/admin" : "/#admin");
  return {
    writes: () => writes,
    prepares: () => prepares,
    read: (): Promise<Workspace> =>
      installed
        ? Promise.resolve(data)
        : page.evaluate(() =>
            JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
          ),
  };
}
async function selectCourses(page: Page) {
  await section(page, "Content");
  for (const name of ["Foundation course", "Discovery course"])
    await page
      .getByRole("checkbox", { name: `Select ${name}`, exact: true })
      .check();
}
async function bulk(page: Page, name: string) {
  await page.getByRole("button", { name: "Bulk actions", exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: "Learning audience",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  return dialog;
}

test("course bulk Add/Remove uses the stable workflow and preserves other assignments", async ({
  page,
}, info) => {
  const installed = info.project.name.startsWith("production"),
    state = await setup(page, installed);
  await selectCourses(page);
  const dialog = await bulk(page, "Assign to teams or groups");
  await dialog
    .getByRole("searchbox", { name: "Find a team or group" })
    .fill("Pilot");
  await dialog
    .getByRole("checkbox", {
      name: "Assign directly to Group: Pilot",
      exact: true,
    })
    .check();
  await dialog
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  expect(state.writes()).toBe(0);
  await dialog.getByRole("button", { name: "← Back", exact: true }).click();
  await expect(
    dialog.getByRole("searchbox", { name: "Find a team or group" }),
  ).toHaveValue("Pilot");
  await expect(
    dialog.getByRole("checkbox", {
      name: "Assign directly to Group: Pilot",
      exact: true,
    }),
  ).toBeChecked();
  await dialog
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await page.screenshot({ path: info.outputPath("bulk-learning-review.png") });
  await dialog
    .getByRole("button", { name: "Save assignments", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  let saved = await state.read();
  expect(
    saved.groups.find((g) => g.id === "pilot")!.learningItems,
  ).toHaveLength(2);
  expect(saved.groups.find((g) => g.id === "ae")!.learningItems).toEqual([
    { kind: "curriculum", id: "p" },
  ]);
  expect(
    saved.teams!.find((team) => team.id === "sales")!.learningItems,
  ).toHaveLength(1);
  await selectCourses(page);
  const remove = await bulk(page, "Remove team or group assignments");
  await remove
    .getByRole("checkbox", { name: "Group: Pilot", exact: true })
    .check();
  await remove
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await remove
    .getByRole("button", { name: "Save assignments", exact: true })
    .click();
  await expect(remove).not.toBeVisible();
  saved = await state.read();
  expect(saved.groups.find((g) => g.id === "pilot")!.learningItems).toEqual([]);
  expect(
    saved.teams!.find((team) => team.id === "sales")!.learningItems,
  ).toHaveLength(1);
  if (installed) {
    expect(state.writes()).toBe(2);
    expect(state.prepares()).toBeGreaterThanOrEqual(2);
  }
});

test("group course list scrolls without moving search, filters, pagination or modal actions", async ({
  page,
}, info) => {
  const installed = info.project.name.startsWith("production");
  await setup(page, installed, true);
  await section(page, "Learning groups");
  await page
    .getByRole("button", { name: "Account executives", exact: true })
    .click();
  await page
    .getByRole("tab", { name: "Assigned Courses", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Assign Courses", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Assign Courses",
    exact: true,
  });
  const results = dialog.locator('[data-slot="selection-results"]');
  const search = dialog.getByRole("searchbox", {
    name: "Find courses or curricula",
    exact: true,
  });
  const geometry = () =>
    dialog.evaluate((element) => {
      const top = (selector: string) =>
        element.querySelector(selector)?.getBoundingClientRect().top;
      const body = element.querySelector<HTMLElement>(
        '[data-slot="dialog-body"]',
      )!;
      const list = element.querySelector<HTMLElement>(
        '[data-slot="selection-results"]',
      )!;
      return {
        search: top('input[type="search"]'),
        filters: top('[data-slot="collection-controls"]'),
        pagination: top('nav[aria-label="Search results pages"]'),
        footer: top('[data-slot="dialog-footer"]'),
        bodyScroll: body.scrollTop,
        bodyHeight: body.clientHeight,
        bodyContent: body.scrollHeight,
        resultsHeight: list.clientHeight,
        resultsContent: list.scrollHeight,
      };
    });
  await expect(results).toHaveAttribute("data-scroll-fade-after", "true");
  await expect(results).toHaveAttribute("data-scroll-fade-before", "false");
  const before = await geometry();
  expect(before.bodyContent).toBeLessThanOrEqual(before.bodyHeight + 1);
  expect(before.resultsContent).toBeGreaterThan(before.resultsHeight);
  expect(
    await results.evaluate(
      (element) => element.offsetWidth - element.clientWidth,
    ),
  ).toBeGreaterThan(0);
  if (!info.project.name.endsWith("phone"))
    expect(
      await results.evaluate((element) => {
        const third = element.querySelectorAll('[data-slot="field"]')[2];
        return (
          third.getBoundingClientRect().bottom <=
          element.getBoundingClientRect().bottom - 16
        );
      }),
    ).toBe(true);
  await page.screenshot({ path: info.outputPath("group-course-list-top.png") });
  await results.hover();
  await page.mouse.wheel(0, 150);
  await expect(results).toHaveAttribute("data-scroll-fade-before", "true");
  const after = await geometry();
  expect(after.search).toBe(before.search);
  expect(after.filters).toBe(before.filters);
  expect(after.pagination).toBe(before.pagination);
  expect(after.footer).toBe(before.footer);
  expect(after.bodyScroll).toBe(0);
  await page.screenshot({
    path: info.outputPath("group-course-list-middle.png"),
  });
  await results.getByRole("checkbox").last().focus();
  await expect(results).toHaveAttribute("data-scroll-fade-after", "false");
  expect((await geometry()).bodyScroll).toBe(0);
  await search.fill("Foundation course");
  await expect(
    results.getByRole("checkbox", { name: /^Foundation course\b/ }),
  ).toHaveCount(1);
  await expect(results).toHaveAttribute("data-scroll-fade-after", "false");
  await expect(results).toHaveAttribute("data-scroll-fade-before", "false");
  const single = await geometry();
  await search.fill("no-matching-course");
  await expect(results).toContainText(
    "No content matches your search or filters.",
  );
  expect((await geometry()).resultsHeight).toBe(single.resultsHeight);
  expect((await geometry()).footer).toBe(before.footer);
  await page.screenshot({
    path: info.outputPath("group-course-list-empty.png"),
  });
  if (info.project.name.endsWith("phone")) {
    await page.setViewportSize({ width: 375, height: 500 });
    await search.fill("");
    await expect(results.getByRole("checkbox")).toHaveCount(10);
    expect((await geometry()).resultsHeight).toBeGreaterThanOrEqual(128);
    await results.getByRole("checkbox").last().focus();
    await expect(results.getByRole("checkbox").last()).toBeInViewport();
    await expect(
      dialog.getByRole("button", { name: "Review changes", exact: true }),
    ).toBeInViewport();
    await page.screenshot({
      path: info.outputPath("group-course-list-short-screen.png"),
    });
  }
});

test("group-context selection retains search on Back, guards discard, and reviews direct removal", async ({
  page,
}, info) => {
  const installed = info.project.name.startsWith("production"),
    state = await setup(page, installed);
  await section(page, "Learning groups");
  await page
    .getByRole("button", { name: "Account executives", exact: true })
    .click();
  await page
    .getByRole("tab", { name: "Assigned Courses", exact: true })
    .click();
  const trigger = page.getByRole("button", {
    name: "Assign Courses",
    exact: true,
  });
  await trigger.click();
  const dialog = page.getByRole("dialog", {
    name: "Assign Courses",
    exact: true,
  });
  const search = dialog.getByRole("searchbox", {
    name: "Find courses or curricula",
    exact: true,
  });
  await search.fill("Discovery course");
  await dialog.getByRole("checkbox", { name: /^Discovery course\b/ }).check();
  await dialog
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await dialog.getByRole("button", { name: "← Back", exact: true }).click();
  await expect(search).toHaveValue("Discovery course");
  await dialog
    .getByRole("button", { name: "Close audience editor", exact: true })
    .click();
  await expect(
    dialog.getByRole("heading", { name: "Discard audience changes?" }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await expect(search).toHaveValue("Discovery course");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await dialog
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(state.writes()).toBe(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await search.fill("Foundation course");
  await dialog.getByRole("checkbox", { name: /^Foundation course\b/ }).check();
  await dialog
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await expect(
    dialog.getByText("No new course assignments.", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Save assignments", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("button", { name: "Remove Foundation course", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await expect(
    dialog.getByText("No new course assignments.", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByLabel("Audience changes")).toContainText(
    "Foundation course",
  );
  await page.screenshot({ path: info.outputPath("group-learning-review.png") });
  await dialog
    .getByRole("button", { name: "Save assignments", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const saved = await state.read();
  expect(saved.groups.find((g) => g.id === "ae")!.learningItems).toEqual([
    { kind: "curriculum", id: "p" },
  ]);
  expect(
    saved.teams!.find((team) => team.id === "sales")!.learningItems,
  ).toHaveLength(1);
  if (installed) expect(state.writes()).toBe(2);
});

test("curriculum bulk assignment uses the same modal and one save for overlapping playlists", async ({
  page,
}, info) => {
  const installed = info.project.name.startsWith("production"),
    state = await setup(page, installed);
  await section(page, "Curricula");
  for (const name of ["Foundation playlist", "Discovery playlist"])
    await page
      .getByRole("checkbox", { name: `Select ${name}`, exact: true })
      .check();
  const dialog = await bulk(page, "Assign to teams or groups");
  await dialog
    .getByRole("checkbox", {
      name: "Assign directly to Group: Pilot",
      exact: true,
    })
    .check();
  await dialog
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  expect(state.writes()).toBe(0);
  await dialog
    .getByRole("button", { name: "Save assignments", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  const saved = await state.read();
  expect(saved.groups.find((g) => g.id === "pilot")!.learningItems).toEqual([
    { kind: "curriculum", id: "p" },
    { kind: "curriculum", id: "q" },
  ]);
  expect(saved.groups.find((g) => g.id === "ae")!.learningItems).toEqual([
    { kind: "curriculum", id: "p" },
  ]);
  if (installed) expect(state.writes()).toBe(1);
});
