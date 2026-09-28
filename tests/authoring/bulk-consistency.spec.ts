import { test, expect, type Page } from "@playwright/test";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import { freshWorkspace } from "../../lib/store";
import { setupAuthoringProvider, authoringUser } from "./provider-fixture";
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
test("bulk content group assignment preserves complete organization; pending batches share the menu", async ({
  page,
}, info) => {
  const production = info.project.name.startsWith("production");
  const data = withPublishedSnapshots(freshWorkspace());
  data.governanceRevision = 10;
  data.pendingUsers = ["Pending one", "Pending two"].map((name, i) => ({
    name,
    email: `pending${i}@example.test`,
    role: "learner" as const,
    groups: [],
  }));
  const course = data.content.find((c) => c.kind === "course")!;
  course.title = "Bulk assignment fixture";
  const group = data.groups[0];
  const expectedUsers = data.users.length;
  const expectedTeams = data.teams!.length;
  let writes = 0;
  const revisions: number[] = [];
  if (production) {
    await setupAuthoringProvider(page, data);
    await page.route("**/api/admin/snapshot?**", (route) => {
      const scope = new URL(route.request().url()).searchParams.get("scope");
      return route.fulfill({
        json: {
          user: authoringUser,
          data:
            scope === "content"
              ? { ...data, users: [authoringUser], teams: [], pendingUsers: [] }
              : data,
        },
      });
    });
    await page.route("**/api/governance", (route) => {
      const body = route.request().postDataJSON();
      revisions.push(body.expected);
      expect(body.expected).toBe(data.governanceRevision);
      if (body.operation === "pending")
        data.pendingUsers = data.pendingUsers!.map((p) =>
          p.email === body.email ? { ...p, groups: body.groups } : p,
        );
      else {
        expect(body.users).toHaveLength(expectedUsers);
        expect(body.teams).toHaveLength(expectedTeams);
        data.groups = body.groups;
        data.curricula = body.curricula;
      }
      writes++;
      data.governanceRevision!++;
      return route.fulfill({ json: { revision: data.governanceRevision } });
    });
  } else
    await page.addInitScript((workspace) => {
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
    }, data);
  await page.goto(production ? "/admin" : "/#admin");
  await page
    .getByRole("checkbox", {
      name: "Select Bulk assignment fixture",
      exact: true,
    })
    .check();
  await page.getByRole("button", { name: "Bulk actions", exact: true }).click();
  await page
    .getByRole("menuitem", { name: "Add to learning groups", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: group.name, exact: true }).check();
  await dialog
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(dialog).toHaveCount(0);
  if (production) {
    expect(writes).toBe(1);
    expect(data.groups[0].learningItems!.some((i) => i.id === course.id)).toBe(
      true,
    );
  }
  if (production) {
    await section(page, production ? "People" : "Demo profiles");
    await page
      .getByRole("checkbox", {
        name: /^Select (page|all) .*Pending accounts/,
      })
      .check();
    await page
      .getByRole("group", { name: "Pending accounts" })
      .getByRole("button", { name: "Bulk actions", exact: true })
      .click();
    await page
      .getByRole("menuitem", { name: "Add to learning groups", exact: true })
      .click();
    await dialog
      .getByRole("checkbox", { name: group.name, exact: true })
      .check();
    await page.screenshot({
      path: info.outputPath("pending-account-bulk.png"),
    });
    await dialog
      .getByRole("button", { name: "Apply changes", exact: true })
      .click();
    await expect(dialog).toHaveCount(0);
    if (production) {
      expect(writes).toBe(3);
      expect(revisions).toEqual([10, 11, 12]);
      expect(data.pendingUsers!.every((p) => p.groups.includes(group.id))).toBe(
        true,
      );
      const pending = page.locator("#pending-accounts");
      await pending
        .getByRole("searchbox", { name: "Find a pending account" })
        .fill("Pending one");
      await expect(pending.getByRole("checkbox")).toHaveCount(0);
      await expect(
        pending.getByRole("button", { name: "Bulk actions", exact: true }),
      ).toHaveCount(0);
      await pending
        .getByRole("button", { name: "Actions", exact: true })
        .click();
      await page
        .getByRole("menuitem", {
          name: "Remove from learning groups",
          exact: true,
        })
        .click();
      await dialog
        .getByRole("checkbox", { name: group.name, exact: true })
        .check();
      await dialog
        .getByRole("button", { name: "Apply changes", exact: true })
        .click();
      await expect(dialog).toHaveCount(0);
      expect(writes).toBe(4);
      expect(data.pendingUsers![0].groups).not.toContain(group.id);
      expect(data.pendingUsers![1].groups).toContain(group.id);
    }
  }
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
