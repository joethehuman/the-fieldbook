import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { defaultAskAiSettings } from "../../lib/ai";

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
async function signedIn(
  page: Page,
  request: APIRequestContext,
  role = "admin",
) {
  await request.post("http://127.0.0.1:3130/fixture", {
    data: { settings: { access: "public" }, role },
  });
  const token = await (
    await request.post("http://127.0.0.1:3130/auth/v1/token", { data: {} })
  ).json();
  await page.context().addCookies([
    {
      name: "sb-test-auth-token",
      value:
        "base64-" +
        Buffer.from(
          JSON.stringify({
            ...token,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
          }),
        ).toString("base64url"),
      domain: "localhost",
      path: "/",
    },
  ]);
}
const setupCalls = async (request: APIRequestContext) =>
  (await (await request.get("http://127.0.0.1:3130/reads")).json())
    .aiGenerations;

test("Admin configures, tests and saves AI; toggles restore search and draft guards preserve edits", async ({
  page,
  request,
}, info) => {
  await signedIn(page, request);
  await page.goto("/admin");
  await section(page, "Ask AI");
  await expect(
    page.getByRole("switch", { name: "Enable Ask AI" }),
  ).not.toBeChecked();
  await expect(page.getByLabel("Setup status")).toContainText(
    "Published-content retrieval is ready",
  );
  expect(await setupCalls(request)).toBe(0);
  await page.getByRole("button", { name: "Test answer", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Test answer received" }),
  ).toContainText("setup check code is ready");
  expect(await setupCalls(request)).toBe(2);
  const model = page.getByRole("combobox", { name: "Model", exact: true });
  await model.click();
  await page.getByRole("option", { name: /Synthetic paid model/ }).click();
  await expect(page.getByLabel("Selected model details")).toContainText(
    "$0.02",
  );
  await expect(
    page.getByText("Test answer received.", { exact: false }),
  ).toHaveCount(0);
  await page
    .getByLabel("Answer guidance", { exact: true })
    .fill("Keep answers to two sentences.");
  await section(page, "Identity");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Answer guidance", { exact: true })).toHaveValue(
    "Keep answers to two sentences.",
  );
  await page
    .getByRole("button", { name: "Reset to default", exact: true })
    .click();
  await expect(page.getByLabel("Answer guidance", { exact: true })).toHaveValue(
    defaultAskAiSettings.guidance,
  );
  await page.getByRole("checkbox", { name: "Updates", exact: true }).uncheck();
  await page
    .getByRole("checkbox", { name: "Courses and lessons", exact: true })
    .uncheck();
  await expect(
    page.getByRole("checkbox", { name: "Docs", exact: true }),
  ).toBeDisabled();
  await page.getByRole("switch", { name: "Enable Ask AI" }).check();
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(page.getByText("Unsaved changes", { exact: true })).toHaveCount(
    0,
  );
  expect(await setupCalls(request)).toBe(2); // save/check never generate
  await expect(
    page.getByPlaceholder("Search Fieldbook or Ask AI", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await section(page, "Ask AI");
  await expect(
    page.getByRole("switch", { name: "Enable Ask AI" }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Updates", exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("combobox", { name: "Model", exact: true }),
  ).toContainText("Synthetic paid model");
  await expect(
    page.getByRole("button", { name: "Check setup", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: info.outputPath("ask-ai-admin.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Check setup", exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({ path: info.outputPath("ask-ai-admin-setup.png") });
  if (info.project.name === "desktop") {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page
      .getByRole("button", { name: "Check setup", exact: true })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: info.outputPath("ask-ai-admin-tablet.png") });
    await page.setViewportSize({ width: 1440, height: 1000 });
  }
  await page.getByRole("switch", { name: "Enable Ask AI" }).uncheck();
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(page.getByText("Unsaved changes", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page.getByPlaceholder("Search Fieldbook", { exact: true }),
  ).toBeVisible();
  const guidance = page.getByLabel("Answer guidance", { exact: true });
  await guidance.fill("Keep this unsaved draft.");
  await page.route("**/api/settings", (route) =>
    route.fulfill({
      status: 409,
      json: { error: "Settings changed. Reload before saving." },
    }),
  );
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Settings changed" }),
  ).toBeVisible();
  await expect(guidance).toHaveValue("Keep this unsaved draft.");
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(guidance).toHaveValue(defaultAskAiSettings.guidance);
  await guidance.fill("Discard on confirmed navigation.");
  await section(page, "Identity");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await section(page, "Ask AI");
  await expect(guidance).toHaveValue(defaultAskAiSettings.guidance);
  await page.goto("/courses");
  await expect(
    page.getByPlaceholder("Search Fieldbook", { exact: true }),
  ).toBeVisible();
});

test("Admin setup API enforces origin, role and bounded input; learner data hides configuration", async ({
  page,
  request,
}) => {
  await signedIn(page, request);
  const data = { action: "check", settings: defaultAskAiSettings };
  expect(
    (
      await page.request.post("/api/admin/ask-ai", {
        data,
        headers: { Origin: "https://untrusted.example" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/admin/ask-ai", {
        data: { ...data, prompt: "unbounded request" },
        headers: { Origin: "http://localhost:3131" },
      })
    ).status(),
  ).toBe(400);
  await signedIn(page, request, "contributor");
  expect(
    (
      await page.request.post("/api/admin/ask-ai", {
        data: { ...data, action: "test" },
        headers: { Origin: "http://localhost:3131" },
      })
    ).status(),
  ).toBe(403);
  await page.goto("/admin");
  await expect(
    page.getByRole("tab", { name: "Ask AI", exact: true }),
  ).toHaveCount(0);
  expect(await setupCalls(request)).toBe(0);
});

test("Demo Admin controls and test answer stay local; saved off state restores basic search", async ({
  page,
}, info) => {
  const data = freshWorkspace();
  let calls = 0;
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
  await page.route("**/api/admin/ask-ai", (route) => {
    calls++;
    return route.abort();
  });
  await page.goto("http://localhost:3132/#admin");
  await section(page, "Ask AI");
  await expect(
    page.getByRole("switch", { name: "Enable Ask AI" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Test answer", exact: true }).click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "This feature is not available in the demo site." }),
  ).toBeVisible();
  await page.getByRole("switch", { name: "Enable Ask AI" }).uncheck();
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    page.getByPlaceholder("Search Fieldbook", { exact: true }),
  ).toBeVisible();
  expect(calls).toBe(0);
  await page.screenshot({
    path: info.outputPath("ask-ai-admin-demo.png"),
    fullPage: true,
  });
});
