import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import { setupAuthoringProvider, authoringUser } from "./provider-fixture";
import { openContentSettings } from "./editor-helpers";

async function setup(page: Page, installed: boolean, kind: "course" | "brief") {
  const data = withPublishedSnapshots(freshWorkspace());
  const item = structuredClone(data.content.find((c) => c.kind === kind)!);
  item.id = "00000000-0000-4000-8000-000000000102";
  item.title = "Audience picker fixture";
  item.groups = [];
  item.assignments = [];
  item.revision = 1;
  item.publishedRevision = 1;
  item.cardArt = {
    source: "generated",
    shortTitle: "Audience picker",
    seed: 1,
    version: 2,
  };
  data.content = [item];
  data.publishedContent = [structuredClone(item)];
  data.settings = {
    ...data.settings!,
    access: "public",
    guestGroupId: "visitors",
    organizationTeamId: "org",
  };
  data.groups = [
    { id: "sales-group", name: "Account executives", learningItems: [] },
    { id: "visitors", name: "Visitors", learningItems: [] },
  ];
  data.teams = [
    {
      id: "org",
      name: "Organization",
      system: "organization",
      learningItems: [],
    },
    {
      id: "sales",
      name: "Sales",
      parentId: "org",
      learningItems: kind === "course" ? [{ kind: "course", id: item.id }] : [],
    },
  ];
  data.curricula = [];
  data.progress = {};
  data.users = [
    data.users.find((u) => u.role === "admin")!,
    ...data.users.filter((u) => u.role === "learner").slice(0, 2),
    {
      ...data.users.find((u) => u.role === "learner")!,
      id: "demo-contributor",
      name: "Jordan Patel",
      email: "contributor@example.test",
      role: "contributor" as const,
    },
  ].map((u, i) => ({
    ...u,
    groups: i === 0 ? ["sales-group"] : [],
    teamId: i === 0 ? "sales" : undefined,
    active: true,
  }));
  const read = async (live = false): Promise<any> =>
    installed
      ? (
          await page.request.get(
            live
              ? `http://127.0.0.1:3130/rest/v1/fb_documents?id=eq.${item.id}`
              : `/api/content?id=${item.id}&draft=true`,
          )
        )
          .json()
          .then((result) => (live ? result[0].published : result))
      : page.evaluate(
          ({ id, live }) => {
            const d = JSON.parse(
              localStorage.getItem("fieldbook.workspace.v1")!,
            );
            return (live ? d.publishedContent : d.content).find(
              (c: any) => c.id === id,
            );
          },
          { id: item.id, live },
        );
  if (installed) {
    await setupAuthoringProvider(page, data);
    await page.request.post("http://127.0.0.1:3130/fixture", {
      data: {
        settings: data.settings,
        groups: data.groups,
        teams: data.teams,
        users: data.users.map((u) => ({ ...u, team_id: u.teamId })),
        curricula: [],
        documents: data.content.map((c) => ({
          id: c.id,
          draft: c,
          published: data.publishedContent![0],
          revision: 1,
          published_revision: 1,
          updated_at: c.updatedAt,
        })),
      },
    });
    await page.route("**/api/admin/snapshot?**", (route) =>
      route.fulfill({ json: { data, user: authoringUser } }),
    );
  } else
    await page.addInitScript((workspace) => {
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
    }, data);
  await page.goto(installed ? "/admin" : "/#admin");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const details = await openContentSettings(page);
  await details
    .getByRole("button", { name: "Assign to teams or groups", exact: true })
    .click();
  const panel = page.getByRole("dialog", {
    name: "Assign to teams or groups",
    exact: true,
  });
  await expect(panel).toBeVisible();
  return { data, item, panel, read, details };
}
test("shared picker recognizes Organization coverage, retains separate links and preserves cancellation", async ({
  page,
}, info) => {
  const { panel } = await setup(
    page,
    info.project.name.startsWith("production"),
    "course",
  );
  await expect(panel.getByRole("row").nth(1)).toContainText(
    "Team: Organization",
  );
  await expect(
    panel.getByRole("checkbox", {
      name: "Assign directly to Team: Sales",
      exact: true,
    }),
  ).toBeChecked();
  await panel
    .getByRole("checkbox", {
      name: "Assign directly to Team: Organization",
      exact: true,
    })
    .check();
  const sales = panel.getByRole("row").filter({ hasText: "Team: Sales" });
  await expect(sales).toContainText("Separate assignment retained");
  await expect(
    panel.getByRole("checkbox", {
      name: "Assign directly to Group: Account executives",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    panel.getByLabel("Group: Account executives included", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("checkbox", { name: "Public guests", exact: true }),
  ).not.toBeChecked();
  await panel
    .getByRole("checkbox", { name: "Public guests", exact: true })
    .check();
  await expect(panel).toContainText(
    "Everyone in the organization · 4 people · Public guests also included",
  );
  await page.screenshot({ path: info.outputPath("audience-organization.png") });
  await panel
    .getByRole("checkbox", {
      name: "Assign directly to Team: Sales",
      exact: true,
    })
    .click();
  await expect(
    panel.getByLabel("Team: Sales included", { exact: true }),
  ).toBeVisible();
  await panel.getByRole("searchbox").fill("no match");
  await expect(panel.getByText("No matching teams or groups.")).toBeVisible();
  await panel.getByRole("searchbox").fill("");
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  const confirm = page.getByRole("alertdialog", {
    name: "Confirm action",
    exact: true,
  });
  await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(panel).toBeVisible();
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  await confirm.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(panel).not.toBeVisible();
  await page
    .getByRole("button", { name: "Assign to teams or groups", exact: true })
    .click();
  await expect(
    panel.getByRole("checkbox", {
      name: "Assign directly to Team: Sales",
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    panel.getByRole("checkbox", {
      name: "Assign directly to Team: Organization",
      exact: true,
    }),
  ).not.toBeChecked();
});
test("Update picker applies to the draft, saves team/guest audiences, then publishes them explicitly", async ({
  page,
}, info) => {
  const { panel, read } = await setup(
    page,
    info.project.name.startsWith("production"),
    "brief",
  );
  await panel
    .getByRole("checkbox", {
      name: "Assign directly to Team: Organization",
      exact: true,
    })
    .check();
  await panel
    .getByRole("checkbox", { name: "Public guests", exact: true })
    .check();
  await panel.getByRole("searchbox").fill("Sales");
  await expect(
    panel.getByLabel("Team: Sales included", { exact: true }),
  ).toBeVisible();
  await panel.getByRole("searchbox").fill("");
  await page.screenshot({ path: info.outputPath("update-audience-draft.png") });
  await panel
    .getByRole("button", { name: "Apply to draft", exact: true })
    .click();
  await expect(panel).not.toBeVisible();
  await expect.poll(async () => (await read()).updateTeams).toEqual(["org"]);
  expect((await read()).groups).toEqual(["visitors"]);
  expect((await read(true)).updateTeams).toBeUndefined();
  expect((await read(true)).groups).toEqual([]);
  await page
    .getByRole("button", { name: "Revert to published version", exact: true })
    .click();
  const restore = page.getByRole("alertdialog", { name: "Confirm action", exact: true });
  await restore.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await read()).updateTeams).toEqual(["org"]);
  await page.getByRole("button", { name: "Revert to published version", exact: true }).click();
  await restore.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect.poll(async () => (await read()).updateTeams).toBeUndefined();
  expect((await read()).groups).toEqual([]);
  expect((await read(true)).groups).toEqual([]);
  await page.getByRole("button", { name: "Assign to teams or groups", exact: true }).click();
  await panel.getByRole("checkbox", { name: "Assign directly to Team: Organization", exact: true }).check();
  await panel.getByRole("checkbox", { name: "Public guests", exact: true }).check();
  await panel.getByRole("button", { name: "Apply to draft", exact: true }).click();
  await expect.poll(async () => (await read()).updateTeams).toEqual(["org"]);
  await page
    .getByRole("button", { name: "Publish", exact: true })
    .click();
  await expect
    .poll(async () => (await read(true)).updateTeams)
    .toEqual(["org"]);
  expect((await read(true)).groups).toEqual(["visitors"]);
  expect((await read(true)).version).toBe(1);
  if (info.project.name.startsWith("production")) {
    await page.goto("/updates");
    await expect(
      page.getByRole("heading", { name: "For you", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Audience picker fixture",
        exact: true,
      }),
    ).toBeVisible();
    await page.context().clearCookies();
    await page.goto("/updates");
    await expect(
      page.getByRole("heading", { name: "For you", exact: true }),
    ).toBeVisible();
  }
});
