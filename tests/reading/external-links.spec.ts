import { test, expect } from "@playwright/test";
const backend = "http://127.0.0.1:3130";
const links = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    label: "Product docs",
    url: "https://example.test/product-docs",
  },
];

for (const role of ["admin", "manager", "learner", "guest"]) {
  test(`external links: ${role} receives universal menu links after installation access`, async ({
    page,
    request,
  }, info) => {
    await request.post(`${backend}/fixture`, {
      data: {
        role: role === "guest" ? "learner" : role,
        settings: {
          access: role === "guest" ? "public" : "private",
          externalLinks: links,
          privacy: undefined,
        },
      },
    });
    if (role !== "guest") {
      const token = await (
        await request.post(`${backend}/auth/v1/token`, { data: {} })
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
    await page.goto("/updates");
    const account = page.getByRole("button", {
      name: "Account menu",
      exact: true,
    });
    if (!(await account.isVisible()))
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
    await account.click();
    const link = page.getByRole("menuitem", {
      name: "Product docs (opens in a new tab)",
      exact: true,
    });
    await expect(link).toHaveAttribute("href", links[0].url);
    await expect(link).toHaveAttribute("target", "_blank");
    await page
      .context()
      .route("https://example.test/**", (route) =>
        route.fulfill({ body: "External documentation" }),
      );
    const opened = page.waitForEvent("popup");
    await link.click();
    const popup = await opened;
    await popup.waitForLoadState();
    expect(popup.url()).toBe(links[0].url);
    expect(await popup.evaluate(() => window.opener === null)).toBe(true);
    expect(page.url()).toContain("/updates");
    await popup.close();
    await page.screenshot({
      path: info.outputPath(`external-links-${role}.png`),
    });
  });
}

test("external links: private signed-out and standalone account pages exclude links", async ({
  page,
  request,
}) => {
  await request.post(`${backend}/fixture`, {
    data: {
      settings: {
        access: "private",
        externalLinks: links,
        privacy: { published: null },
      },
    },
  });
  await page.goto("/updates");
  await expect(page).toHaveURL(/\/sign-in(?:\?|$)/);
  expect(await page.content()).not.toContain(links[0].url);
  await expect(page.getByRole("button", { name: "Account menu" })).toHaveCount(
    0,
  );
  await page.goto("/privacy");
  const account = page.getByRole("button", {
    name: "Account menu",
    exact: true,
  });
  if (!(await account.isVisible()))
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await account.click();
  await expect(
    page.getByRole("group", { name: "Links", exact: true }),
  ).toHaveCount(0);
  expect(await page.content()).not.toContain(links[0].url);
});

test("external links: long labels and keyboard links fit at enlarged text", async ({
  page,
  request,
}, info) => {
  const longLinks = [
    "Product documentation for all departments",
    "Learning portal for new team members",
    "Company resources and support contacts",
  ].map((label, index) => ({
    ...links[0],
    id: `00000000-0000-4000-8000-00000000000${index + 1}`,
    label: label.slice(0, 40),
  }));
  await request.post(`${backend}/fixture`, {
    data: { settings: { access: "public", externalLinks: longLinks } },
  });
  await page.goto("/updates");
  await page.evaluate(() => (document.documentElement.style.fontSize = "200%"));
  const account = page.getByRole("button", {
    name: "Account menu",
    exact: true,
  });
  if (!(await account.isVisible()))
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
  await account.focus();
  await page.keyboard.press("ArrowDown");
  const menu = page.getByRole("menu");
  await expect(
    menu.getByRole("menuitem", { name: /^Product documentation/ }),
  ).toBeVisible();
  expect(
    await menu.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
  expect(await menu.evaluate(element => {
    const bounds = element.getBoundingClientRect();
    return bounds.left >= 0 && bounds.right <= innerWidth + 1;
  })).toBe(true);
  await page.screenshot({
    path: info.outputPath("external-links-enlarged.png"),
  });
  const first = menu.getByRole("menuitem", { name: /^Product documentation/ });
  await first.focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    menu.getByRole("menuitem", { name: /^Learning portal/ }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(account).toBeFocused();
});
