import { teamCommand } from "../helpers/team-navigation";
import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace, type Workspace } from "../../lib/store";

async function section(page: Page) {
  const picker = page.getByRole("combobox", {
    name: "Administration section",
    exact: true,
  });
  if (await picker.isVisible()) {
    await picker.click();
    await page.getByRole("option", { name: "Teams", exact: true }).click();
  } else await page.getByRole("tab", { name: "Teams", exact: true }).click();
}
async function saved(page: Page): Promise<Workspace> {
  return page.evaluate(() =>
    JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
  );
}
async function action(page: Page, name: string) {
  const nameOfTeam = await page.locator('[data-slot="section-header"]').filter({ has: page.getByRole("button", { name: "Edit team details", exact: true }) }).getByRole("heading").innerText();
  await page.getByRole("button", { name: `Actions for ${nameOfTeam}`, exact: true }).click();
  await page.getByRole("menuitem", { name, exact: true }).click();
}

test("search hierarchy, move existing branch, detach and guard deletion", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone", "This check exercises chart expansion and connectors; phone directory management has separate coverage.");
  const data = freshWorkspace();
  const organizationId = data.teams!.find(
    (team) => team.system === "organization",
  )!.id;
  // Keep this movement fixture independent of the larger demo seed.
  data.teams = data
    .teams!.filter((team) => [organizationId, "sales-team"].includes(team.id))
    .map((team) =>
      team.id === "sales-team"
        ? {
            ...team,
            name: "Sales team",
            learningItems: [],
            requiredCourseIds: [],
          }
        : team,
    );
  data.groups = [];
  data.curricula = [];
  data.users = data.users
    .filter((user) =>
      ["demo-admin", "demo-manager", "demo-learner"].includes(user.id),
    )
    .map((user) => ({
      ...user,
      groups: [],
      teamId:
        user.teamId && user.teamId !== "sales-team" ? undefined : user.teamId,
    }));
  data.teams!.push(
    { id: "other", name: "Customer success", parentId: organizationId },
    {
      id: "child",
      name: "Regional customer success with a long descriptive name",
      parentId: "other",
    },
    {
      id: "deep",
      name: "Enterprise EMEA account executives and solutions engineering",
      parentId: "child",
    },
  );
  data.users.find((user) => user.id === "demo-learner")!.teamId = "deep";
  data.users = data.users.map((user) => ({
    ...user,
    groupJoinedAt: Object.fromEntries(
      user.groups.map((id) => [id, "2026-01-01T00:00:00.000Z"]),
    ),
    effectiveGroupJoinedAt: Object.fromEntries(
      user.groups.map((id) => [id, "2026-01-01T00:00:00.000Z"]),
    ),
  }));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    if (!localStorage.getItem("fieldbook.workspace.v1"))
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto("/#admin");
  await expect(page.locator(".admin-layout")).toBeVisible();
  const baseline = await saved(page);
  await section(page);
  const expand = page.getByRole("button", {
    name: "Browse Customer success subteams",
    exact: true,
  });
  await expand.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", {
      name: "Actions for Regional customer success with a long descriptive name",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Find teams", exact: true })
    .fill("Regional");
  await expect(page.locator('[data-slot="hierarchy-browser"]')).toContainText(
    "Customer success / Regional customer success with a long descriptive name",
  );
  await expect(
    page.getByRole("button", { name: "Actions for Sales team", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: info.outputPath("hierarchy-search.png"),
    fullPage: true,
  });
  await page
    .getByRole("searchbox", { name: "Find teams", exact: true })
    .fill("");
  await expect(expand).toHaveAttribute("aria-expanded", "true");
  await expand.click();
  await expect(expand).toHaveAttribute("aria-expanded", "false");
  await expect(expand).toBeFocused();
  await teamCommand(page, "Sales team");
  await expect(
    page.getByRole("tab", { name: "Subteams", exact: true }),
  ).toHaveCount(0);
  await action(page, "Move existing team here");
  await page
    .getByRole("radio", {
      name: "Customer success Organization / Customer success",
      exact: true,
    })
    .check();
  const movePicker = page.getByRole("dialog", {
    name: "Move a team into Sales team",
    exact: true,
  });
  await expect(movePicker).toContainText("Sales team / Customer success");
  await movePicker
    .getByRole("button", { name: "Review move", exact: true })
    .click();
  const effects = page.getByRole("dialog", {
    name: "Review team move",
    exact: true,
  });
  await expect(effects).toContainText("Sales team / Customer success");
  await info.attach("review-dialog-dom", {
    body: JSON.stringify(
      await page.locator('[role="dialog"]').evaluateAll((nodes) =>
        nodes.map((node) => ({
          title: document.getElementById(
            node.getAttribute("aria-labelledby") || "",
          )?.textContent,
          ariaHidden: node.getAttribute("aria-hidden"),
          parentAriaHidden: node.parentElement?.getAttribute("aria-hidden"),
          dataSlot: node.getAttribute("data-slot"),
        })),
      ),
      null,
      2,
    ),
    contentType: "application/json",
  });
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await effects.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(effects).toHaveCount(0);
  await expect(movePicker).toBeVisible();
  await expect(
    movePicker.getByRole("button", { name: "Review move", exact: true }),
  ).toBeFocused();
  expect(
    (await saved(page)).teams!.find((team) => team.id === "other")!.parentId,
  ).toBe(organizationId);
  await movePicker
    .getByRole("button", { name: "Review move", exact: true })
    .click();
  await page.screenshot({
    path: info.outputPath("branch-move-review.png"),
    fullPage: true,
  });
  await expect(effects).toBeVisible();
  await effects.getByRole("button", { name: "Move team", exact: true }).click();
  await expect(movePicker).toHaveCount(0);
  let after = await saved(page);
  expect(after.teams!.find((team) => team.id === "other")!.parentId).toBe(
    "sales-team",
  );
  expect(after.teams!.find((team) => team.id === "child")!.parentId).toBe(
    "other",
  );
  expect(after.teams!.find((team) => team.id === "deep")!.parentId).toBe(
    "child",
  );
  expect(after.users).toEqual(baseline.users);
  expect(after.progress).toEqual(baseline.progress);
  expect(after.groups).toEqual(baseline.groups);
  await page
    .getByRole("button", { name: "Back to teams", exact: true })
    .click();
  await page
    .getByRole("searchbox", { name: "Find teams", exact: true })
    .fill("Enterprise EMEA");
  await expect(
    page.getByRole("button", {
      name: "Actions for Enterprise EMEA account executives and solutions engineering",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('[data-slot="hierarchy-browser"]')).toContainText(
    "Sales team / Customer success / Regional customer success with a long descriptive name",
  );
  await page.getByRole("searchbox", { name: "Find teams", exact: true }).clear();
  for (const name of ["Sales team", "Customer success", "Regional customer success with a long descriptive name"]) {
    const branch = page.getByRole("button", { name: `Browse ${name} subteams`, exact: true });
    if (await branch.getAttribute("aria-expanded") !== "true") await branch.click();
  }
  await page.screenshot({
    path: info.outputPath("four-level-hierarchy.png"),
    fullPage: true,
  });
  await page
    .getByRole("searchbox", { name: "Find teams", exact: true })
    .fill("Customer success");
  await teamCommand(page, "Customer success");
  await action(page, "Move team");
  const parentMove = page.getByRole("dialog", { name: "Move team", exact: true });
  await parentMove.getByRole("combobox", { name: "Destination", exact: true }).click();
  await page.getByRole("option", { name: "Organization", exact: true }).click();
  await parentMove.getByRole("button", { name: "Apply changes", exact: true }).click();
  const moveReview = page.getByRole("dialog", { name: "Review changes", exact: true });
  await expect(moveReview).toBeVisible();
  await moveReview.getByRole("button", { name: "Apply changes", exact: true }).click();
  await expect(parentMove).not.toBeVisible();
  after = await saved(page);
  expect(after.teams!.find((team) => team.id === "other")!.parentId).toBe(
    organizationId,
  );
  await action(page, "Delete team");
  const parentDeletion = page.getByRole("dialog", {
    name: "Delete 1 team?",
    exact: true,
  });
  await expect(parentDeletion).toContainText("Surviving subteams move to Organization");
  const beforeCancel = await saved(page);
  await parentDeletion
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  expect((await saved(page)).teams).toEqual(beforeCancel.teams);
  await page
    .getByRole("button", { name: "Back to teams", exact: true })
    .click();
  await page.getByRole("button", { name: "Add team", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Team name", exact: true })
    .fill("Empty team");
  await dialog.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await teamCommand(page, "Empty team");
  await action(page, "Delete team");
  const deletion = page.getByRole("dialog", {
    name: "Delete 1 team?",
    exact: true,
  });
  await expect(deletion).toContainText("Deleted teams cannot be restored");
  await deletion
    .getByRole("button", { name: "Delete teams", exact: true })
    .click();
  await expect(
    page.getByRole("searchbox", { name: "Find teams", exact: true }),
  ).toBeVisible();
  expect(
    (await saved(page)).teams!.some((team) => team.name === "Empty team"),
  ).toBe(false);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});

test("direct learning prevents empty-team deletion and survives a team rename", async ({
  page,
}, info) => {
  const data = freshWorkspace();
  const organization = data.teams!.find(
    (team) => team.system === "organization",
  )!;
  const course = data.content.find(
    (content) => content.kind === "course" && content.status === "published",
  )!;
  data.teams!.push({
    id: "assigned-empty",
    name: "Assignment audience",
    parentId: organization.id,
    learningItems: [{ kind: "course", id: course.id }],
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.goto("/#admin");
  await expect(page.locator(".admin-layout")).toBeVisible();
  await section(page);
  const baseline = await saved(page);
  await teamCommand(page, "Assignment audience");
  await action(page, "Delete team");
  await expect(page.locator("[data-slot=alert]")).toContainText(
    "remove its assigned learning first",
  );
  await expect(
    page.getByRole("dialog", {
      name: "Delete Assignment audience?",
      exact: true,
    }),
  ).toHaveCount(0);
  expect((await saved(page)).teams).toEqual(baseline.teams);
  await page.getByRole("button", { name: "Edit team details", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "Edit Assignment audience",
    exact: true,
  });
  await editor
    .getByRole("textbox", { name: "Team name", exact: true })
    .fill("Renamed assignment audience");
  await editor.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(editor).toHaveCount(0);
  const after = await saved(page);
  expect(after.teams!.find((team) => team.id === "assigned-empty")).toEqual({
    ...baseline.teams!.find((team) => team.id === "assigned-empty")!,
    name: "Renamed assignment audience",
  });
  expect(after.groups).toEqual(baseline.groups);
  expect(after.curricula).toEqual(baseline.curricula);
  expect(after.progress).toEqual(baseline.progress);
  await action(page, "Delete team");
  await expect(page.locator("[data-slot=alert]")).toContainText(
    "remove its assigned learning first",
  );
  await page.screenshot({
    path: info.outputPath("team-direct-learning-deletion-guard.png"),
    fullPage: true,
  });
});
