import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import { setupAuthoringProvider, authoringUser } from "./provider-fixture";
import { openContentSettings } from "./editor-helpers";

async function setup(
  page: Page,
  installed: boolean,
  kind: "course" | "brief",
  guestMode: "dedicated" | "shared" | "none" | "private" = "dedicated",
) {
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
    access: guestMode === "private" ? "private" : "public",
    guestGroupId:
      guestMode === "none"
        ? null
        : guestMode === "shared"
          ? "sales-group"
          : "visitors",
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
    groups: (guestMode === "shared" ? i === 1 : i === 0) ? ["sales-group"] : [],
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
    .getByRole("button", { name: "Edit audience", exact: true })
    .click();
  const panel = page.getByRole("dialog", {
    name: kind === "course" ? "Course audience" : "Update audience",
    exact: true,
  });
  await expect(panel).toBeVisible();
  return { data, item, panel, read, details };
}
test("shared workflow parks new choices, retains saved sources and contains review/cancel", async ({
  page,
}, info) => {
  const { panel } = await setup(
    page,
    info.project.name.startsWith("production"),
    "course",
  );
  await expect(
    panel.getByRole("checkbox", {
      name: "Assign directly to Team: Sales",
      exact: true,
    }),
  ).toBeChecked();
  await panel
    .getByRole("checkbox", {
      name: "Assign directly to Group: Account executives",
      exact: true,
    })
    .check();
  const selectBounds = await panel.boundingBox();
  await panel.getByRole("radio", { name: "Organization", exact: true }).check();
  await expect(
    panel.getByText("Separately saved audiences", { exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", { name: "Remove Sales", exact: true }),
  ).toBeVisible();
  await expect(
    panel.getByRole("button", {
      name: "Remove Account executives",
      exact: true,
    }),
  ).toHaveCount(0);
  await panel
    .getByRole("checkbox", { name: "Also include public guests", exact: true })
    .check();
  await expect(panel).toContainText("All 4 registered people");
  await page.screenshot({ path: info.outputPath("audience-organization.png") });
  await panel
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await expect(
    panel.getByRole("button", { name: "Save assignments", exact: true }),
  ).toBeVisible();
  expect(await panel.boundingBox()).toEqual(selectBounds);
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await panel
    .getByRole("button", { name: "View people and due dates", exact: true })
    .click();
  expect(await panel.boundingBox()).toEqual(selectBounds);
  await expect(
    panel.getByRole("table", { name: "Assignment recipients" }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath("audience-review-expanded.png"),
  });
  await panel.getByRole("button", { name: "← Back", exact: true }).click();
  await panel
    .getByRole("radio", { name: "Specific teams or groups", exact: true })
    .check();
  await expect(
    panel.getByRole("checkbox", {
      name: "Assign directly to Group: Account executives",
      exact: true,
    }),
  ).toBeChecked();
  await panel.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    panel.getByText("Discard audience changes?", { exact: true }),
  ).toBeVisible();
  expect(await panel.boundingBox()).toEqual(selectBounds);
  await panel
    .getByRole("button", { name: "Keep editing", exact: true })
    .click();
  await expect(
    panel.getByRole("checkbox", {
      name: "Assign directly to Team: Sales",
      exact: true,
    }),
  ).toBeChecked();
  await panel
    .getByRole("button", { name: "Close audience editor", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(panel).not.toBeVisible();
  await page
    .getByRole("button", { name: "Edit audience", exact: true })
    .click();
  await expect(
    panel.getByRole("checkbox", {
      name: "Assign directly to Team: Sales",
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    panel.getByRole("checkbox", {
      name: "Assign directly to Group: Account executives",
      exact: true,
    }),
  ).not.toBeChecked();
});

test("search keeps internal geometry for many, one and zero matches", async ({
  page,
}, info) => {
  const { panel } = await setup(
    page,
    info.project.name.startsWith("production"),
    "course",
  );
  const search = panel.getByRole("searchbox");
  await search.scrollIntoViewIfNeeded();
  const bounds = async () => ({
    dialog: await panel.boundingBox(),
    search: await search.boundingBox(),
    list: await panel
      .getByLabel("Matching audiences", { exact: true })
      .boundingBox(),
    summary: await panel
      .getByLabel("Selected audiences", { exact: true })
      .boundingBox(),
    footer: await panel.locator('[data-slot="dialog-footer"]').boundingBox(),
  });
  const before = await bounds();
  await search.pressSequentially("Account executives");
  expect(await bounds()).toEqual(before);
  await expect(
    panel.getByRole("checkbox", {
      name: "Assign directly to Group: Account executives",
      exact: true,
    }),
  ).toBeVisible();
  await search.fill("No matches here");
  expect(await bounds()).toEqual(before);
  await search.fill("");
  expect(await bounds()).toEqual(before);
  await page.screenshot({
    path: info.outputPath("audience-search-stable.png"),
  });
  await panel
    .getByRole("checkbox", {
      name: "Assign directly to Group: Account executives",
      exact: true,
    })
    .check();
  await search.fill("Account executives");
  await panel
    .getByRole("button", { name: "Review changes", exact: true })
    .click();
  await panel.getByRole("button", { name: "← Back", exact: true }).click();
  await expect(search).toHaveValue("Account executives");
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
    .getByRole("radio", {
      name: "Organization",
      exact: true,
    })
    .check();
  await panel
    .getByRole("checkbox", { name: "Also include public guests", exact: true })
    .check();
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
  const restore = page.getByRole("alertdialog", {
    name: "Confirm action",
    exact: true,
  });
  await restore.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await read()).updateTeams).toEqual(["org"]);
  await page
    .getByRole("button", { name: "Revert to published version", exact: true })
    .click();
  await restore.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect.poll(async () => (await read()).updateTeams).toBeUndefined();
  expect((await read()).groups).toEqual([]);
  expect((await read(true)).groups).toEqual([]);
  await page
    .getByRole("button", { name: "Edit audience", exact: true })
    .click();
  await panel.getByRole("radio", { name: "Organization", exact: true }).check();
  await panel
    .getByRole("checkbox", { name: "Also include public guests", exact: true })
    .check();
  await panel
    .getByRole("button", { name: "Apply to draft", exact: true })
    .click();
  await expect.poll(async () => (await read()).updateTeams).toEqual(["org"]);
  await page.getByRole("button", { name: "Publish", exact: true }).click();
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

for (const mode of ["none", "private", "shared"] as const)
  test(`guest shortcut respects ${mode} configuration`, async ({
    page,
  }, info) => {
    const { panel, read } = await setup(
      page,
      info.project.name.startsWith("production"),
      "brief",
      mode,
    );
    const guest = panel.getByRole("checkbox", {
      name: "Also include public guests",
      exact: true,
    });
    if (mode !== "shared") {
      await expect(guest).toHaveCount(0);
      return;
    }
    await expect(panel).toContainText(
      "Uses Account executives. Also includes 1 registered person.",
    );
    await guest.check();
    await expect(panel).toContainText("1 person selected");
    await panel
      .getByRole("button", { name: "Apply to draft", exact: true })
      .click();
    await expect
      .poll(async () => (await read()).groups)
      .toEqual(["sales-group"]);
  });
