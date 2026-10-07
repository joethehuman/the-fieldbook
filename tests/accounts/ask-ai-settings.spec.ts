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
  // The demo hydrates before choosing its responsive navigation surface.
  await expect
    .poll(
      async () =>
        (await picker.isVisible()) ||
        (await page.getByRole("tab", { name, exact: true }).isVisible()),
    )
    .toBe(true);
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
    data: {
      settings: {
        access: "public",
        organizationTeamId: "00000000-0000-4000-8000-000000000090",
      },
      role,
    },
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

async function picture(
  page: Page,
  options: { path: string; fullPage?: boolean },
) {
  await page
    .getByRole("switch", { name: "Enable Ask AI" })
    .evaluate(async (element) => {
      await Promise.all(
        element
          .getAnimations({ subtree: true })
          .map((animation) => animation.finished.catch(() => {})),
      );
    });
  await page.screenshot(options);
}

test("Admin configures and saves AI without generation; toggles restore search and draft guards preserve edits", async ({
  page,
  request,
}, info) => {
  await signedIn(page, request);
  await page.goto("/admin");
  await section(page, "Ask AI");
  await expect(
    page.getByRole("switch", { name: "Enable Ask AI" }),
  ).not.toBeChecked();
  expect(await setupCalls(request)).toBe(0);
  for (const name of ["Primary model", "Fallback model"])
    await expect(page.getByRole("combobox", { name, exact: true })).toHaveCount(
      0,
    );
  await expect(page.getByLabel("Model router")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Check setup", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("switch", { name: "Enable Ask AI" }).check();
  await expect(
    page.getByRole("button", { name: "Save settings", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("Choose a primary model to enable AI."),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Primary model", exact: true })
    .click();
  await expect(
    page.getByRole("option", { name: "Synthetic compatible 8", exact: true }),
  ).toHaveCount(1);
  await page
    .getByRole("option", { name: "Synthetic free model", exact: true })
    .click();
  await expect(page.getByLabel("Model router")).toContainText(
    "Vercel AI Gateway",
  );
  await expect(page.getByLabel("Model router")).toContainText("Configured");
  expect(await setupCalls(request)).toBe(0);
  const model = page.getByRole("combobox", {
    name: "Primary model",
    exact: true,
  });
  await model.click();
  await page.getByRole("option", { name: /Synthetic paid model/ }).click();
  await page
    .getByRole("combobox", { name: "Fallback model", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Synthetic free model", exact: true })
    .click();
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
  expect(await setupCalls(request)).toBe(0); // Opening Admin and saving never generate
  await expect(
    page.getByPlaceholder("Search or Ask AI", { exact: true }),
  ).toBeVisible();
  await section(page, "Identity");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await section(page, "Ask AI");
  await page.reload();
  await section(page, "Ask AI");
  await expect(
    page.getByRole("switch", { name: "Enable Ask AI" }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Updates", exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("combobox", { name: "Primary model", exact: true }),
  ).toContainText("Synthetic paid model");
  await expect(
    page.getByRole("combobox", { name: "Fallback model", exact: true }),
  ).toContainText("Synthetic free model");
  await expect(page.getByLabel("Model router")).toContainText("Configured");
  await expect(page.getByText("Unsaved changes", { exact: true })).toHaveCount(
    0,
  );
  await picture(page, {
    path: info.outputPath("ask-ai-admin.png"),
    fullPage: true,
  });
  if (info.project.name === "desktop") {
    await page.setViewportSize({ width: 1024, height: 768 });
    await picture(page, {
      path: info.outputPath("ask-ai-admin-tablet.png"),
      fullPage: true,
    });
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
  await page.getByRole("switch", { name: "Enable Ask AI" }).check();
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    page.getByPlaceholder("Search or Ask AI", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Primary model", exact: true }),
  ).toContainText("Synthetic paid model");
  await expect(
    page.getByRole("combobox", { name: "Fallback model", exact: true }),
  ).toContainText("Synthetic free model");
  await page.getByRole("switch", { name: "Enable Ask AI" }).uncheck();
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  for (const name of ["Primary model", "Fallback model"])
    await expect(page.getByRole("combobox", { name, exact: true })).toHaveCount(
      0,
    );
  await page.getByRole("switch", { name: "Enable Ask AI" }).check();
  const guidance = page.getByLabel("Answer guidance", { exact: true });
  await guidance.fill("Keep this unsaved draft.");
  await page.route("**/api/settings", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "The database operation failed. Try again." },
    }),
  );
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "database operation failed" }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").filter({ hasText: "database operation failed" }),
  ).toBeInViewport();
  await picture(page, {
    path: info.outputPath("ask-ai-save-failure.png"),
    fullPage: true,
  });
  await expect(guidance).toHaveValue("Keep this unsaved draft.");
  await expect(
    page.getByRole("button", { name: "Review saved copy", exact: true }),
  ).toHaveCount(0);
  await section(page, "Identity");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(guidance).toHaveValue("Keep this unsaved draft.");
  await page.unroute("**/api/settings");
  await guidance.fill("A recovered setting saves normally.");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(page.getByText("Unsaved changes", { exact: true })).toHaveCount(
    0,
  );
  await section(page, "Identity");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await section(page, "Ask AI");
  await expect(guidance).toHaveValue("A recovered setting saves normally.");
  await guidance.fill("A lost response is confirmed automatically.");
  await page.route("**/api/settings", async (route) => {
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.abort("failed");
  });
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(page.getByText("Unsaved changes", { exact: true })).toHaveCount(
    0,
  );
  await page.unroute("**/api/settings");
  await section(page, "Identity");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await section(page, "Ask AI");
  await guidance.fill("Keep this unsaved draft.");

  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(guidance).toHaveValue(
    "A lost response is confirmed automatically.",
  );
  await guidance.fill("Discard on confirmed navigation.");
  await section(page, "Identity");
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await section(page, "Ask AI");
  await expect(guidance).toHaveValue(
    "A lost response is confirmed automatically.",
  );
  await page.goto("/courses");
  await expect(
    page.getByPlaceholder("Search or Ask AI", { exact: true }),
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
        data,
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

test("Demo Admin controls stay local; saved off state restores basic search", async ({
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
  await expect(page.getByLabel("Model router")).toContainText("Demo only");
  await expect(
    page.getByRole("button", { name: "Test primary", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("combobox", { name: "Primary model", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Example primary model", exact: true })
    .click();
  await page
    .getByRole("combobox", { name: "Fallback model", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Example backup model", exact: true })
    .click();
  await picture(page, {
    path: info.outputPath("ask-ai-admin-demo-on.png"),
    fullPage: true,
  });
  await page.getByRole("switch", { name: "Enable Ask AI" }).uncheck();
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    page.getByPlaceholder("Search Fieldbook", { exact: true }),
  ).toBeVisible();
  expect(calls).toBe(0);
  await picture(page, {
    path: info.outputPath("ask-ai-admin-demo.png"),
    fullPage: true,
  });
});

test("Admin uses neutral router metadata and opaque model IDs; changing routers requires selection", async ({
  page,
  request,
}, info) => {
  await signedIn(page, request);
  await request.post("http://127.0.0.1:3130/fixture", {
    data: {
      settings: {
        access: "public",
        askAi: {
          ...defaultAskAiSettings,
          enabled: true,
          model: "test/primary",
          fallbackModel: "test/backup",
        },
      },
      role: "admin",
    },
  });
  await page.route("**/api/admin/ask-ai", (route) =>
    route.fulfill({
      json: {
        setup: {
          router: {
            id: "synthetic",
            name: "Independent model router",
            supportsFallback: false,
          },
          selectionRouter: "vercel",
          checkedAt: "",
          models: [{ id: "local-model:version", name: "Local catalog model" }],
          catalog: { ready: true, message: "" },
          connection: { configured: true, message: "" },
          retrieval: { ready: true, message: "" },
        },
      },
    }),
  );
  await page.goto("/admin");
  await section(page, "Ask AI");
  await page.getByRole("switch", { name: "Enable Ask AI" }).check();
  await expect(page.getByLabel("Model router")).toContainText(
    "Independent model router",
  );
  await expect(
    page.getByText("The model router changed.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Primary model", exact: true }),
  ).toContainText("Choose a primary model");
  await page
    .getByRole("combobox", { name: "Primary model", exact: true })
    .click();
  await page
    .getByRole("option", { name: "Local catalog model", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Fallback model", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByText("This router does not support a fallback."),
  ).toBeVisible();
  const rejected = await page.request.post("/api/settings", {
    data: {
      settings: {
        ...freshWorkspace().settings,
        askAi: {
          ...defaultAskAiSettings,
          enabled: true,
          router: "synthetic",
          model: "local-model:version",
        },
      },
      expected: 1,
    },
    headers: { Origin: "http://localhost:3131" },
  });
  expect(rejected.status()).toBe(409);
  expect(await setupCalls(request)).toBe(0);
  await picture(page, {
    path: info.outputPath("ask-ai-neutral-router.png"),
    fullPage: true,
  });
  await page.getByRole("switch", { name: "Enable Ask AI" }).uncheck();
  await expect(
    page.getByRole("combobox", { name: "Primary model", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("switch", { name: "Enable Ask AI" }).check();
  await expect(
    page.getByText("The model router changed.", { exact: false }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Primary model", exact: true }),
  ).toContainText("Local catalog model");
});

test("Missing router warns inline; late metadata cannot reveal controls after switching off", async ({
  page,
  request,
}, info) => {
  await signedIn(page, request);
  await page.route("**/api/admin/ask-ai", (route) =>
    route.fulfill({
      json: {
        setup: {
          router: null,
          selectionRouter: "vercel",
          checkedAt: "",
          models: [],
          catalog: { ready: false, message: "Model list unavailable." },
          connection: {
            configured: false,
            message:
              "Connect a supported model router in the installation configuration.",
          },
          retrieval: { ready: false, message: "" },
        },
      },
    }),
  );
  await page.goto("/admin");
  await section(page, "Ask AI");
  await page.getByRole("switch", { name: "Enable Ask AI" }).check();
  await expect(page.getByLabel("Model router")).toContainText(
    "No router available",
  );
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Connect a supported model router" }),
  ).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "Primary model", exact: true }),
  ).toBeDisabled();
  await picture(page, {
    path: info.outputPath("ask-ai-missing-router.png"),
    fullPage: true,
  });
  await page.getByRole("switch", { name: "Enable Ask AI" }).uncheck();
  await page.unroute("**/api/admin/ask-ai");
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/admin/ask-ai", async (route) => {
    await waiting;
    await route.fulfill({
      json: {
        setup: {
          router: { id: "vercel", name: "Late router", supportsFallback: true },
          catalog: { ready: true },
          connection: { configured: true },
          retrieval: { ready: true },
          models: [],
        },
      },
    });
  });
  const sent = page.waitForRequest("**/api/admin/ask-ai");
  await page.getByRole("switch", { name: "Enable Ask AI" }).check();
  await sent;
  await page.getByRole("switch", { name: "Enable Ask AI" }).uncheck();
  release();
  await expect(page.getByLabel("Model router")).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "Primary model", exact: true }),
  ).toHaveCount(0);
  expect(await setupCalls(request)).toBe(0);
});
