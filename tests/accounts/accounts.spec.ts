import { test, expect, type Page } from "@playwright/test";
const backend = "http://127.0.0.1:3130/fixture";
const file = "00000000-0000-4000-8000-000000000001.png";
async function bounds(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
async function simulateOAuthReturn(page: Page, next: string) {
  // Intercept the first-party request: Chromium does not reliably route a
  // subsequent redirect request, which could otherwise reach a real hostname.
  await page.route("**/auth/login", async (route) => {
    const response = await route.fetch({ maxRedirects: 0 });
    expect(response.status()).toBe(302);
    const provider = new URL(response.headers().location);
    expect(provider.origin).toBe("https://test.supabase.co");
    expect(provider.searchParams.get("provider")).toBe("google");
    expect(provider.searchParams.get("code_challenge")).toBeTruthy();
    const callback = new URL(provider.searchParams.get("redirect_to")!);
    expect(callback.origin).toBe("http://localhost:3131");
    expect(callback.searchParams.get("next")).toBe(next);
    callback.searchParams.set("code", "synthetic");
    await route.fulfill({
      response,
      headers: { ...response.headers(), location: callback.toString() },
    });
  });
}
async function login(page: Page, next = "/admin") {
  await page.goto(`/auth/sign-in?next=${encodeURIComponent(next)}`);
  await simulateOAuthReturn(page, next);
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(new RegExp(next.split("?")[0]));
}
test.beforeEach(async ({ request, page }) => {
  for (const pattern of ["**/api/branding/logo*", "**/api/media/*"])
    await page.route(pattern, async (route) => {
      const response = await route.fetch({ maxRedirects: 0 });
      if (response.status() !== 307) return route.fulfill({ response });
      expect(response.headers().location).toBe(
        "https://test.supabase.co/storage/v1/object/sign/synthetic",
      );
      // Follow the real application's signed redirect into a synthetic image response.
      return route.fulfill({
        response: await request.get("http://127.0.0.1:3130/logo"),
      });
    });
  await request.post(backend, { data: {} });
});
test("private deep link goes directly to branded sign-in and survives synthetic OAuth", async ({
  page,
  request,
}, info) => {
  const next = "/docs/guide?source=email#setup";
  await page.goto(next);
  await expect(page).toHaveURL("/sign-in");
  await expect(
    page.getByRole("heading", { name: "Sign in to Acme Learning" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to browsing" }),
  ).toHaveCount(0);
  await expect(
    page.getByText(/Reference:|Try again|Sign in to view/),
  ).toHaveCount(0);
  expect(
    (await page.context().cookies()).find(
      (c) => c.name === "fieldbook-sign-in-return",
    )?.value,
  ).toContain("guide");
  const workspace = await request.get("/api/workspace");
  expect(workspace.status()).toBe(401);
  expect(await workspace.json()).not.toHaveProperty("requestId");
  expect((await request.get(`/api/media/${file}`)).status()).toBe(401);
  await expect(page.locator(".logo img")).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".logo img")
        .evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBe(32);
  const html = await page.content();
  expect(html).not.toContain("SECRET POLICY DRAFT");
  expect(html).not.toContain('"registration"');
  await bounds(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("private-sign-in.png"),
    fullPage: true,
  });
  await simulateOAuthReturn(page, next);
  await page.getByRole("link", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(next);
});
test("public browse, alternate brand, defaults and failed image fallback", async ({
  page,
  request,
}, info) => {
  await request.post(backend, {
    data: {
      settings: {
        access: "public",
        name: "Northstar Academy",
        welcomeDescription: "Build useful things together.",
      },
    },
  });
  await page.goto("/docs");
  if ((page.viewportSize()?.width || 0) < 768)
    await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(
    page
      .getByRole("button", { name: "Sign in with Google", exact: true })
      .first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Sign in with Google", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Sign in to Northstar Academy" }),
  ).toBeVisible();
  await expect(
    page.getByText("Sign in to save course progress across devices.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Back to browsing" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Privacy policy" }),
  ).toHaveAttribute("href", "https://example.test/privacy");
  await bounds(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("public-sign-in.png"),
    fullPage: true,
  });
  await request.post(backend, {
    data: {
      brokenLogo: true,
      settings: {
        name: "A very long installation name for accessible account layouts",
        access: "public",
      },
    },
  });
  await page.reload();
  await expect(page.locator(".logo svg")).toBeVisible();
  await expect(page.locator(".logo img")).toHaveCount(0);
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  await bounds(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("fallback-enlarged.png"),
    fullPage: true,
  });
  await request.post(backend, {
    data: {
      settings: {
        name: null,
        logoUrl: null,
        welcomeDescription: null,
        privacy: null,
      },
    },
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Sign in to Fieldbook" }),
  ).toBeVisible();
  await expect(page.locator(".logo svg")).toBeVisible();
});
test("provider failure stays recoverable, cancellation preserves return, unsafe redirects rejected", async ({
  page,
  request,
}) => {
  await request.post(backend, { data: { fail: true } });
  await page.goto("/docs/guide");
  await expect(page.getByText(/Reference:/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await page.goto("/sign-in");
  await expect(
    page.getByRole("heading", { name: "Account services are unavailable" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Try again" })).toBeVisible();
  await request.post(backend, { data: {} });
  await page.getByRole("link", { name: "Try again" }).click();
  await expect(
    page.getByRole("heading", { name: "Sign in to Acme Learning" }),
  ).toBeVisible();
  await page.goto(
    "/auth/callback?error=access_denied&next=%2Fdocs%2Fguide%23setup",
  );
  await expect(page.locator("[data-slot=alert]")).toContainText("cancelled");
  const cookies = await page.context().cookies();
  expect(
    decodeURIComponent(
      cookies.find((c) => c.name === "fieldbook-sign-in-return")!.value,
    ),
  ).toBe("/docs/guide#setup");
  await page.goto("/auth/sign-in?next=https%3A%2F%2Fevil.test");
  expect(
    (await page.context().cookies()).find(
      (c) => c.name === "fieldbook-sign-in-return",
    )?.value,
  ).toBe("%2F");
});
test("settings authorization, saved identity and private content protection", async ({
  page,
  request,
}, info) => {
  expect(
    (
      await request.post("/api/settings", {
        headers: { Origin: "http://localhost:3131" },
        data: { settings: {}, expected: 1 },
      })
    ).status(),
  ).toBe(401);
  await login(page);
  const picker = page.getByRole("combobox", { name: "Administration section" });
  if ((page.viewportSize()?.width || 0) < 1024) {
    await picker.click();
    await page.getByRole("option", { name: /Identity/ }).click();
  } else await page.getByRole("tab", { name: /Identity/ }).click();
  await page
    .getByLabel("Installation name", { exact: true })
    .fill("Updated Academy");
  await page
    .getByLabel("Welcome description (optional)")
    .fill("A useful place to learn.");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  await expect(page.locator(".logo")).toContainText("Updated Academy");
  await bounds(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("branding-settings.png"),
    fullPage: true,
  });
  await page.context().clearCookies();
  await page.goto("/sign-in");
  await expect(
    page.getByRole("heading", { name: "Sign in to Updated Academy" }),
  ).toBeVisible();
  await expect(page.getByText("A useful place to learn.")).toBeVisible();
  await request.post(backend, { data: { role: "learner" } });
  await login(page, "/courses");
  expect(
    (
      await page.request.post("/api/settings", {
        headers: { Origin: "http://localhost:3131" },
        data: { settings: {}, expected: 1 },
      })
    ).status(),
  ).toBe(403);
});
test("consent and connection identity preserve purpose and demo stays simulated", async ({
  page,
}, info) => {
  await page.route("**/api/consent?**", (route) =>
    route.fulfill({
      json: {
        client: { name: "Synthetic AI" },
        user: { email: "admin@example.test" },
        scope: "openid email",
      },
    }),
  );
  await page.goto("/oauth/consent?authorization_id=synthetic");
  await expect(page.locator(".logo")).toContainText("Acme Learning");
  await expect(
    page.getByRole("heading", {
      name: "Allow Synthetic AI to manage content?",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Read published content and drafts."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Allow connection" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Deny", exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Allow connection" }),
  ).toBeFocused();
  await bounds(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("consent.png"),
    fullPage: true,
  });
  await page.route("**/api/connections", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.goto("/connections");
  await expect(page.locator(".logo")).toContainText("Acme Learning");
  await expect(
    page.getByRole("heading", { name: "AI connections", exact: true }),
  ).toBeVisible();
  await page.goto("http://127.0.0.1:3132");
  if ((page.viewportSize()?.width || 0) < 768)
    await page.getByRole("button", { name: "Open navigation" }).click();
  const account = page.locator('[data-slot="account-button"]');
  await account.getByText("Alex Edwards", { exact: true }).click();
  await account.locator('[data-slot="initials-avatar"]').click();
  await expect(
    page.getByRole("heading", { name: "Explore Fieldbook" }),
  ).toHaveCount(0);
  await expect(account.getByText(/Demo workspace/)).toBeVisible();
  await account.screenshot({
    path: info.outputPath("demo-account-action.png"),
  });
  await page.getByRole("button", { name: "Switch demo profile" }).click();
  await expect(
    page.getByText("INTERACTIVE DEMO", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Demo profiles are not secure/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue as guest" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Continue with Google" }),
  ).toHaveCount(0);
  await bounds(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("demo-profiles.png"),
    fullPage: true,
  });
});

test("signed-out consent and connections preserve destinations and consent decisions", async ({
  page,
}) => {
  await page.goto("/connections");
  await expect(page).toHaveURL("/sign-in");
  expect(
    decodeURIComponent(
      (await page.context().cookies()).find(
        (c) => c.name === "fieldbook-sign-in-return",
      )!.value,
    ),
  ).toBe("/connections");
  await page.goto("/oauth/consent?authorization_id=synthetic-return");
  await expect(page).toHaveURL("/sign-in");
  expect(
    decodeURIComponent(
      (await page.context().cookies()).find(
        (c) => c.name === "fieldbook-sign-in-return",
      )!.value,
    ),
  ).toBe("/oauth/consent?authorization_id=synthetic-return");
  await page.route("**/api/consent?**", (route) =>
    route.fulfill({
      json: {
        client: { name: "Synthetic AI" },
        user: { email: "admin@example.test" },
        scope: "openid email",
      },
    }),
  );
  const decisions: unknown[] = [];
  await page.route("**/api/consent", (route) => {
    decisions.push(route.request().postDataJSON());
    return route.fulfill({
      json: { redirect_url: "http://localhost:3131/sign-in" },
    });
  });
  for (const allow of [false, true]) {
    await page.goto("/oauth/consent?authorization_id=synthetic-return");
    await page
      .getByRole("button", {
        name: allow ? "Allow connection" : "Deny",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL("/sign-in");
  }
  expect(decisions).toEqual([
    { id: "synthetic-return", allow: false },
    { id: "synthetic-return", allow: true },
  ]);
});

test("expired, denied and provider-failed callback outcomes remain distinct", async ({
  page,
  request,
}) => {
  await page.request.get("/auth/login", { maxRedirects: 0 });
  await page.goto("/auth/callback?code=expired&next=%2Fdocs%2Fguide");
  await expect(page.locator("[data-slot=alert]")).toContainText(
    "cancelled or could not be completed",
  );
  await page.request.get("/auth/login", { maxRedirects: 0 });
  await page.goto("/auth/callback?code=provider-error&next=%2Fdocs%2Fguide");
  await expect(page.locator("[data-slot=alert]")).toContainText(
    "services are unavailable",
  );
  await expect(page.locator("[data-slot=alert]")).toContainText("Reference:");
  await request.post(backend, { data: { role: "inactive" } });
  await page.request.get("/auth/login", { maxRedirects: 0 });
  await page.goto("/auth/callback?code=synthetic&next=%2Fdocs%2Fguide");
  await expect(page.locator("[data-slot=alert]")).toContainText(
    "not allowed to join",
  );
  expect(
    decodeURIComponent(
      (await page.context().cookies()).find(
        (c) => c.name === "fieldbook-sign-in-return",
      )!.value,
    ),
  ).toBe("/docs/guide");
});

test("only the account action signs out; identity is inert", async ({
  page,
}, info) => {
  await login(page);
  if ((page.viewportSize()?.width || 0) < 768)
    await page.getByRole("button", { name: "Open navigation" }).click();
  const account = page.locator('[data-slot="account-button"]');
  let signOuts = 0;
  await page.route("**/auth/logout", async (route) => {
    signOuts++;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });
  await account.locator('[data-slot="initials-avatar"]').click();
  await account.getByText("Administrator", { exact: true }).click();
  await account.locator(".font-semibold").last().click();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  expect(signOuts).toBe(0);
  await expect(account.getByText(/Demo workspace/)).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath("account-action.png") });
  const signOut = page.getByRole("button", { name: "Sign out", exact: true });
  await signOut.focus();
  await page.keyboard.press("Enter");
  await expect.poll(() => signOuts).toBe(1);
  await page.waitForURL("/");
});

test("shared settings library and connection states work in the server app", async ({
  page,
}, info) => {
  await login(page);
  async function section(name: string) {
    await expect(
      page.getByRole("heading", { name: "Administration", exact: true }),
    ).toBeVisible();
    const picker = page.getByRole("combobox", {
      name: "Administration section",
    });
    if (await picker.isVisible()) {
      await picker.click();
      await page.getByRole("option", { name, exact: true }).click();
      await expect(picker).toBeFocused();
    } else await page.getByRole("tab", { name, exact: true }).click();
  }
  await section("Assignment window");
  await expect(
    page.getByRole("spinbutton", { name: "New user onboarding window (days)" }),
  ).toHaveAccessibleDescription(/Changes recalculate targets for everyone/);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("server-settings-window.png"),
    fullPage: true,
  });
  await section("Privacy");
  await expect(
    page.getByRole("textbox", { name: "Privacy contact email (optional)" }),
  ).toHaveAccessibleDescription(
    "Provide an email address, an HTTPS contact page, or both.",
  );
  const bold = page.getByRole("button", { name: "Bold", exact: true });
  const heading = page.getByRole("combobox", { name: "Heading level" });
  await heading.scrollIntoViewIfNeeded();
  // Let native scroll notifications finish before opening a focus tooltip:
  // Radix intentionally dismisses tooltips when an ancestor scrolls.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await heading.focus();
  await page.keyboard.press("Tab");
  await expect(bold).toBeFocused();
  await expect(page.getByRole("tooltip")).toHaveText("Bold");
  await page.keyboard.press("Escape");
  await bounds(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("server-settings-privacy.png"),
    fullPage: true,
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/connections", async (route) => {
    await gate;
    await route.fulfill({ json: [] });
  });
  await page.goto("/connections");
  await expect(
    page.getByRole("status", { name: "Loading connections" }),
  ).toBeVisible();
  await expect(
    page.getByText("No AI connections yet.", { exact: true }),
  ).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("server-connections-loading.png"),
    fullPage: true,
  });
  release();
  await expect(
    page.getByRole("heading", { name: "No AI connections yet." }),
  ).toBeVisible();
  await expect(
    page.getByRole("status", { name: "Loading connections" }),
  ).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("server-connections-empty.png"),
    fullPage: true,
  });
});
