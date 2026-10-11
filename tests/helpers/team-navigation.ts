import { expect, type Page } from "@playwright/test";

/** Chart and directory rows share the same action menu. */
export async function teamCommand(
  page: Page,
  name: string,
  command = "Open team",
) {
  const trigger = page.getByRole("button", {
    name: `Actions for ${name}`,
    exact: true,
  });
  const next = page
    .getByRole("navigation", { name: "Teams pages", exact: true })
    .getByRole("button", { name: "Next", exact: true });
  while (
    !(await trigger.count()) &&
    (await next.isVisible()) &&
    (await next.isEnabled())
  )
    await next.click();
  await trigger.click();
  const item = page.getByRole("menuitem", {
    name: command === "Open team" ? /^(Open team|Manage team)$/ : command,
    exact: true,
  });
  await item.click();
  if (command === "Open team")
    await expect(
      page.getByRole("heading", { name, exact: true }),
    ).toBeVisible();
}
