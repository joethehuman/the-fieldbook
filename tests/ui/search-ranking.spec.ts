import { test, expect } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";

test("demo search keeps customer titles first while typing, correcting typos and filtering", async ({
  page,
}, info) => {
  const data = freshWorkspace();
  const titleCount = data.content.filter(
    (item) => item.status === "published" && /\bcustomer\b/i.test(item.title),
  ).length;
  await page.addInitScript((data) => {
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
    sessionStorage.setItem("fieldbook.profile.v1", "demo-learner");
  }, data);
  await page.goto("/#courses");
  const input = page.getByRole("textbox", { name: "Search all content" });
  const trigger = page.getByRole("button", {
    name: "Open search",
    exact: true,
  });
  await expect(input.or(trigger).first()).toBeVisible();
  if (!(await input.isVisible())) await trigger.click();
  const region = page.getByRole("region", { name: "Search results" });
  const results = region.getByRole("link");
  for (const query of ["cust", "custome", "customer", "custmoer"]) {
    await input.fill(query);
    await expect(region.getByRole("status")).toContainText(`for “${query}”`);
    await expect(results.nth(titleCount)).toBeAttached();
    for (let index = 0; index < titleCount; index++)
      await expect(results.nth(index).getByRole("heading")).toHaveText(
        /customer/i,
      );
  }
  await input.fill("custome");
  await expect(region.getByRole("status")).toContainText("for “custome”");
  await region.getByRole("button", { name: "Docs", exact: true }).click();
  await expect(results.first().getByRole("heading")).toHaveText(
    "Customer Data Handling",
  );
  await expect(results.filter({ hasText: "Customer Escalations" })).toHaveCount(
    0,
  );
  await expect(
    results.filter({ hasText: "Customer Support Update" }),
  ).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("customer-prefix.png") });
  await region.getByRole("link", { name: /Customer Data Handling/ }).click();
  await expect(
    page.getByRole("heading", { name: "Customer Data Handling", exact: true }),
  ).toBeVisible();
});
