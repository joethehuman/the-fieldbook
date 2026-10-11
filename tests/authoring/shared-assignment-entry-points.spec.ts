import { withOrganizationTeam } from "../../lib/organization-team";
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
      ...Array.from({ length: 40 }, (_, i) => ({
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
  data = withOrganizationTeam(data);
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
async function bulk(page: Page, command: string, title: string) {
  await page.getByRole("button", { name: "Bulk actions", exact: true }).click();
  await page.getByRole("menuitem", { name: command, exact: true }).click();
  const dialog = page.getByRole("dialog", { name: title, exact: true });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  return dialog;
}
async function showPane(dialog: ReturnType<Page["getByRole"]>, right: boolean) {
  const tabs = dialog.getByRole("group", { name: "Assignment lists", exact: true });
  if (await tabs.isVisible()) await tabs.getByRole("button").nth(right ? 1 : 0).click();
}

test("course bulk addition reviews once and preserves existing team and curriculum sources", async ({ page }, info) => {
  const installed = info.project.name.startsWith("production");
  const state = await setup(page, installed);
  const before = await state.read();
  await selectCourses(page);
  const dialog = await bulk(page, "Assign to teams or groups", "Add assignments");
  await showPane(dialog, false);
  await dialog.getByRole("searchbox", { name: "Find a team or group", exact: true }).fill("Pilot");
  await dialog.getByRole("button", { name: "Add group: Pilot", exact: true }).click();
  await dialog.getByRole("button", { name: "Review changes", exact: true }).click();
  expect(state.writes()).toBe(0);
  await dialog.getByRole("button", { name: "← Back", exact: true }).click();
  await showPane(dialog, true);
  await expect(dialog.getByRole("button", { name: "Remove group: Pilot", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Review changes", exact: true }).click();
  await dialog.getByRole("button", { name: "Save assignments", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  const after = await state.read();
  expect(after.groups.find(group => group.id === "pilot")!.learningItems).toEqual([
    { kind: "course", id: before.content[0].id }, { kind: "course", id: before.content[1].id },
  ]);
  expect(after.groups.find(group => group.id === "ae")!.learningItems).toEqual(before.groups.find(group => group.id === "ae")!.learningItems);
  expect(after.teams!.find(team => team.id === "sales")!.learningItems).toEqual(before.teams!.find(team => team.id === "sales")!.learningItems);
  if (installed) expect(state.writes()).toBe(1);
});

test("group transfer searches and scrolling retain choices until the installed or demo save", async ({ page }, info) => {
  const state = await setup(page, info.project.name.startsWith("production"), true);
  await section(page, "Groups");
  await page.getByRole("link", { name: "Pilot", exact: true }).click();
  await page.getByRole("tab", { name: "Assigned Courses", exact: true }).click();
  await page.getByRole("button", { name: "Manage Courses", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Manage Courses", exact: true });
  const available = dialog.getByRole("region", { name: "Available items", exact: true });
  const search = available.getByRole("searchbox");
  const list = available.getByLabel("Available results", { exact: true });
  const footer = dialog.locator('[data-slot="dialog-footer"]');
  const before = { search: await search.boundingBox(), footer: await footer.boundingBox() };
  await expect.poll(() => list.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await available.getByRole("button", { name: "Add Practice course 40", exact: true }).click();
  expect({ search: await search.boundingBox(), footer: await footer.boundingBox() }).toEqual(before);
  await search.fill("No matching title");
  await expect(available.getByText("No matching items.", { exact: true })).toBeVisible();
  await showPane(dialog, true);
  await expect(dialog.getByRole("button", { name: "Remove Practice course 40", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Review changes", exact: true }).click();
  await dialog.getByRole("button", { name: "← Back", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Remove Practice course 40", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Review changes", exact: true }).click();
  await dialog.getByRole("button", { name: "Save assignments", exact: true }).click();
  expect((await state.read()).groups.find(group => group.id === "pilot")!.learningItems).toHaveLength(1);
});

test("curriculum bulk management preserves partial sources while assigning both playlists to a new group", async ({ page }, info) => {
  const state = await setup(page, info.project.name.startsWith("production"));
  await section(page, "Curricula");
  for (const name of ["Foundation playlist", "Discovery playlist"])
    await page.getByRole("checkbox", { name: `Select ${name}`, exact: true }).check();
  const dialog = await bulk(page, "Manage Audience", "Manage Audience");
  await showPane(dialog, false);
  await dialog.getByRole("button", { name: "Add Pilot", exact: true }).click();
  await dialog.getByRole("button", { name: "Review changes", exact: true }).click();
  await dialog.getByRole("button", { name: "Save assignments", exact: true }).click();
  const after = await state.read();
  expect(after.groups.find(group => group.id === "pilot")!.learningItems).toEqual([
    { kind: "curriculum", id: "p" }, { kind: "curriculum", id: "q" },
  ]);
  expect(after.groups.find(group => group.id === "ae")!.learningItems).toEqual([{ kind: "curriculum", id: "p" }]);
});
