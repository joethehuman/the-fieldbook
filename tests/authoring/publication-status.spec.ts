import { test, expect } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";

test("publication badges stay compact while unpublished edits remain visible", async ({
  page,
}, info) => {
  const production = info.project.name.startsWith("production");
  const data = freshWorkspace();
  const source = data.content.find((item) => item.kind === "doc")!;
  data.content = [
    {
      ...source,
      id: "status-live",
      title: "Published fixture",
      status: "published",
      revision: 2,
      publishedRevision: 2,
    },
    {
      ...source,
      id: "status-edits",
      title: "Unpublished edits fixture",
      status: "draft",
      revision: 3,
      publishedRevision: 2,
    },
    {
      ...source,
      id: "status-draft",
      title: "Draft fixture",
      status: "draft",
      revision: 1,
      publishedRevision: undefined,
    },
  ];
  if (production) {
    await page.route("**/api/workspace", (route) =>
      route.fulfill({
        json: {
          data,
          user: data.users.find((user) => user.id === "demo-admin"),
        },
      }),
    );
  } else {
    await page.addInitScript((workspace) => {
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    }, data);
  }
  await page.goto(production ? "/team" : "/#admin");
  if (production) {
    const menu = page.getByRole("button", { name: "Open navigation" });
    if ((page.viewportSize()?.width ?? 1000) < 768) await menu.click();
    await page.getByRole("button", { name: "Manage organization" }).click();
  }
  const table = page.locator('table[data-layout="content"]');
  const edited = table
    .getByRole("row")
    .filter({ hasText: "Unpublished edits fixture" });
  await expect(edited.locator('[data-slot="badge"]')).toHaveText(
    production ? "Published" : "Draft",
  );
  await expect(
    edited.getByText("Unpublished edits", { exact: true }),
  ).toHaveCount(production ? 1 : 0);
  await expect(
    table
      .getByRole("row")
      .filter({ hasText: "Published fixture" })
      .locator('[data-slot="badge"]'),
  ).toHaveText("Published");
  await expect(
    table
      .getByRole("row")
      .filter({ hasText: "Draft fixture" })
      .locator('[data-slot="badge"]'),
  ).toHaveText("Draft");
  for (const size of ["100%", "200%"]) {
    await page.evaluate((fontSize) => {
      document.documentElement.style.fontSize = fontSize;
    }, size);
    const badgesFit = await table
      .locator('[data-slot="badge"]')
      .evaluateAll((badges) =>
        badges.every((badge) => {
          const box = badge.getBoundingClientRect();
          const cell = badge.closest("td")!;
          const style = getComputedStyle(cell);
          return (
            box.height <= parseFloat(getComputedStyle(badge).lineHeight) + 2 &&
            box.width <=
              cell.clientWidth -
                parseFloat(style.paddingLeft) -
                parseFloat(style.paddingRight)
          );
        }),
      );
    expect(badgesFit).toBe(true);
  }
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "100%";
  });
  await edited.locator('[data-slot="badge"]').scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("publication-status.png") });
});
