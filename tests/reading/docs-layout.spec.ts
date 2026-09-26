import { test, expect } from "@playwright/test";
import { defaultSettings } from "../../lib/settings";
import { freshWorkspace } from "../../lib/store";
import type { Content } from "../../lib/types";
const backend = "http://127.0.0.1:3130";
const docs: Content[] = Array.from({ length: 42 }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(100 + i).padStart(12, "0")}`,
  kind: "doc",
  status: "published",
  title: `${String(i).padStart(2, "0")} A long document title that stays readable when navigation wraps`,
  category: i < 40 ? "Getting started" : "Reference",
  folder: "",
  version: 1,
  duration: 0,
  summary: "A practical guide to using the shared document layout.",
  body: `## Overview\n\n${"Readable prose about a useful subject. ".repeat(90)}\n\n### Details\n\n${"Specific guidance to try. ".repeat(90)}\n\n## Overview\n\n${"The repeated heading has a unique destination. ".repeat(80)}\n\n## Finish\n\n${"Last section. ".repeat(70)}\n\n\`\`\`\n${"a_long_code_value_".repeat(40)}\n\`\`\`\n\n| Column | Long value |\n| --- | --- |\n| Value | ${"Table content ".repeat(20)} |`,
  updatedAt: "2026-01-02",
  groups: [],
  lessons: [],
  questions: [],
}));
const rows = (items = docs) =>
  items.map((item) => ({
    id: item.id,
    published: item,
    draft: { ...item, title: "SECRET DRAFT TITLE" },
    revision: 2,
    published_revision: 1,
    updated_at: item.updatedAt,
  }));
async function fixture(request: any, items = docs) {
  await request.post(`${backend}/fixture`, {
    data: {
      settings: {
        access: "public",
        logoUrl: "",
        docCategoryOrder: [
          "Getting started",
          "Reference",
          "Secret draft section",
        ],
      },
      documents: [
        ...rows(items),
        {
          id: "00000000-0000-4000-8000-000000999999",
          published: null,
          draft: { ...docs[0], title: "DRAFT ONLY TITLE" },
          revision: 1,
          updated_at: "2026-01-03",
        },
      ],
    },
  });
}
for (const app of ["demo", "production"] as const) {
  test(`${app}: Docs opens the first document in sidebar order`, async ({
    page,
    request,
  }, info) => {
    const arranged = [
      { ...docs[0], category: "Getting started" },
      { ...docs[40], category: "Reference", folder: "Guides" },
      { ...docs[41], category: "Reference", folder: "Guides" },
    ];
    await fixture(request, arranged);
    if (app === "demo") {
      const data = freshWorkspace();
      data.content = arranged;
      data.settings = {
        ...defaultSettings,
        docCategoryOrder: ["Reference", "Getting started"],
      };
      await page.addInitScript((workspace) => {
        localStorage.setItem(
          "fieldbook.workspace.v1",
          JSON.stringify(workspace),
        );
        sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
      }, data);
      await page.goto("http://localhost:3132/#docs");
    } else {
      await request.post(`${backend}/fixture`, {
        data: {
          settings: {
            access: "public",
            docCategoryOrder: ["Reference", "Getting started"],
          },
          documents: rows(arranged),
        },
      });
      await page.goto("/docs");
      await expect(page).toHaveURL(new RegExp(`/docs/${arranged[1].id}$`));
    }
    await expect(page.locator("article h1")).toHaveText(arranged[1].title);
    await expect(page.getByRole("link", { name: /Back to docs/ })).toHaveCount(
      0,
    );
    if (info.project.name === "phone")
      await page.getByRole("button", { name: "Open navigation" }).click();
    await expect(
      page
        .getByRole("navigation", { name: "Documents", exact: true })
        .getByRole("link", { name: arranged[1].title }),
    ).toHaveAttribute("aria-current", "page");
    if (info.project.name === "phone")
      await page.getByRole("button", { name: "Close navigation" }).click();
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`${app}-docs-landing-${info.project.name}.png`),
    });
  });

  test(`${app}: Docs has a useful empty page`, async ({
    page,
    request,
  }, info) => {
    await fixture(request, []);
    if (app === "demo") {
      const data = freshWorkspace();
      data.content = [];
      data.publishedContent = [];
      await page.addInitScript((workspace) => {
        localStorage.setItem(
          "fieldbook.workspace.v1",
          JSON.stringify(workspace),
        );
        sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
      }, data);
      await page.goto("http://localhost:3132/#docs");
    } else await page.goto("/docs");
    await expect(
      page.getByRole("heading", { name: "No docs yet" }),
    ).toBeVisible();
    await expect(page.locator("article")).toHaveCount(0);
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`${app}-docs-empty-${info.project.name}.png`),
    });
  });
}
for (const app of ["demo", "production"] as const) {
  test(`${app}: heading links, history, tree scrolling, neighbors and reflow`, async ({
    page,
    request,
  }, info) => {
    await fixture(request);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    if (app === "demo") {
      const data = freshWorkspace();
      data.content = docs;
      data.settings = {
        ...defaultSettings,
        docCategoryOrder: ["Getting started", "Reference"],
      };
      await page.addInitScript((data) => {
        localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
        sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
      }, data);
    }
    const url = (index: number, heading = "") =>
      app === "demo"
        ? `http://localhost:3132/#docs/${docs[index].id}${heading ? `?heading=${heading}` : ""}`
        : `/docs/${docs[index].id}${heading ? `#${heading}` : ""}`;
    await page.goto(url(39, "heading-overview-2"));
    await expect(page.locator("article h1")).toHaveText(docs[39].title);
    await expect
      .poll(() =>
        page
          .locator("#heading-overview-2")
          .evaluate((el) => Math.round(el.getBoundingClientRect().top)),
      )
      .toBeGreaterThanOrEqual(0);
    await expect(
      page.locator(
        '[aria-label="Article sections"] a[aria-current="location"]',
      ),
    ).toHaveAttribute("href", /heading-overview-2$/);
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`${app}-fragment.png`),
      fullPage: false,
    });
    if (info.project.name === "phone")
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
    const tree = page.getByRole("navigation", {
      name: "Documents",
      exact: true,
      includeHidden: true,
    });
    await expect(
      tree.getByRole("link", { name: docs[39].title }),
    ).toHaveAttribute("aria-current", "page");
    const fixedTop = await page
      .locator(".primary-navigation")
      .evaluate((el) => el.getBoundingClientRect().top);
    const metrics = await tree.evaluate((el) => ({
      top: el.scrollTop,
      height: el.clientHeight,
      total: el.scrollHeight,
    }));
    expect(metrics.total).toBeGreaterThan(metrics.height);
    expect(metrics.top).toBeGreaterThan(0);
    await tree.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(
      await page
        .locator(".primary-navigation")
        .evaluate((el) => el.getBoundingClientRect().top),
    ).toBe(fixedTop);
    await expect(tree.getByRole("link").first()).toHaveCSS(
      "text-align",
      "left",
    );
    await expect(tree.locator(".document-section-heading")).toHaveCount(2);
    await expect(tree.locator(".document-subsection-trigger")).toHaveCount(0);
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`${app}-tree-scrolled.png`),
    });
    if (info.project.name === "phone")
      await page
        .getByRole("button", { name: "Close navigation", exact: true })
        .click();
    await page.locator("#main-content").evaluate((el) => el.scrollTo(0, 0));
    const bar = page.locator(".topbar");
    await expect(bar).toHaveCSS("position", "relative");
    await page.screenshot({ path: info.outputPath(`${app}-bar-top.png`) });
    await page.locator("#main-content").evaluate((el) => el.scrollTo(0, 1400));
    await expect
      .poll(() => bar.evaluate((el) => el.getBoundingClientRect().top))
      .toBe(0);
    const search = page.getByRole("textbox", { name: "Search all content" });
    await search.fill("readable");
    const panel = page.locator('[data-slot="search-panel"]');
    await expect(panel).toBeVisible();
    expect(
      await panel.evaluate((el) => el.getBoundingClientRect().top),
    ).toBeGreaterThanOrEqual(
      await search.evaluate((el) => el.getBoundingClientRect().bottom),
    );
    expect(
      await panel.evaluate((el) => el.getBoundingClientRect().bottom),
    ).toBeLessThanOrEqual(await page.evaluate(() => innerHeight));
    await page.screenshot({
      path: info.outputPath(`${app}-bar-scrolled-search.png`),
    });
    await search.press("Escape");
    await expect(search).toBeFocused();
    await search.fill("");
    const pagination = page.getByRole("navigation", {
      name: "Previous and next documents",
    });
    await pagination.scrollIntoViewIfNeeded();
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`${app}-previous-next.png`),
    });
    await pagination.getByRole("link", { name: /Next/ }).click();
    await expect(page.locator("article h1")).toHaveText(docs[40].title);
    expect(await tree.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`${app}-cross-section.png`),
    });
    await expect(
      pagination.getByRole("link", { name: /Previous/ }),
    ).toContainText(docs[39].title);
    await page.goBack();
    await expect(page.locator("article h1")).toHaveText(docs[39].title);
    await page.goto(url(0));
    const marker = page.locator("#heading-overview > .heading-permalink");
    await page.mouse.move(0, 0);
    await expect(marker).toHaveText("");
    await expect(marker.locator("svg")).toHaveCount(1);
    await expect(marker).toHaveCSS("opacity", "0");
    await marker.focus();
    await expect(marker).toHaveCSS("opacity", "1");
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`${app}-heading-focus.png`),
    });
    await marker.press("Tab");
    const outline = page.getByRole("complementary", { name: "On this page" });
    if (info.project.name === "phone") {
      await expect(outline.locator("summary")).toHaveCSS(
        "justify-content",
        "flex-start",
      );
      await outline.locator("summary").click();
    } else {
      await expect(outline.locator("summary")).toBeHidden();
      await expect(outline.locator(".reading-outline-title")).toBeVisible();
      await expect(
        outline.getByRole("navigation", { name: "Article sections" }),
      ).toBeVisible();
    }
    const lastHeading = outline.getByRole("link", {
      name: "Finish",
      exact: true,
    });
    await lastHeading.focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#heading-finish")).toBeInViewport();
    expect(
      await page
        .locator("#heading-finish")
        .evaluate((el) => el.getBoundingClientRect().top),
    ).toBeGreaterThanOrEqual(
      await bar.evaluate((el) => el.getBoundingClientRect().bottom),
    );
    await expect(
      outline.getByRole("link", {
        name: "Finish",
        exact: true,
        includeHidden: true,
      }),
    ).toHaveAttribute("aria-current", "location");
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`${app}-heading-click.png`),
    });
    await page.goBack();
    await page.goto(url(0));
    await expect(
      pagination.getByRole("link", { name: /Previous/ }),
    ).toHaveCount(0);
    await page.goto(url(41));
    await expect(pagination.getByRole("link", { name: /Next/ })).toHaveCount(0);
    for (const [width, height, scale] of [
      [1024, 700, 100],
      [1440, 550, 100],
      [375, 700, 200],
    ]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(
        (scale) => (document.documentElement.style.fontSize = `${scale}%`),
        scale,
      );
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      await page.locator("article h1").scrollIntoViewIfNeeded();
      await page.screenshot({
        animations: "disabled",
        path: info.outputPath(`${app}-${width}-${scale}.png`),
      });
    }
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await expect(page.locator(".sidebar")).toHaveClass(/open/);
    const account = page.getByRole("button", { name: "Account menu" });
    expect(
      await page
        .locator('[data-slot="account-button"] > .min-w-0')
        .evaluate((el) => el.getBoundingClientRect().width),
    ).toBeGreaterThan(90);
    await account.focus();
    await expect(account).toBeInViewport();
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`${app}-enlarged-account.png`),
    });
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: "Open navigation", exact: true }),
    ).toBeFocused();
    await expect(tree).not.toBeVisible();
    expect(errors).toEqual([]);
  });
}
for (const app of ["demo", "production"] as const) {
  test(`${app}: Docs headings stay fixed, subsections disclose, and mobile Docs stays open`, async ({
    page,
    request,
    browser,
  }, info) => {
    const hierarchy = [
      { ...docs[0], title: "Start here", folder: "" },
      { ...docs[1], title: "Reference guide", folder: "Guides" },
    ];
    await fixture(request, hierarchy);
    if (app === "demo") {
      const data = freshWorkspace();
      data.content = hierarchy;
      data.settings = {
        ...defaultSettings,
        docCategoryOrder: ["Getting started"],
      };
      await page.addInitScript((workspace) => {
        localStorage.setItem(
          "fieldbook.workspace.v1",
          JSON.stringify(workspace),
        );
        sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
      }, data);
    }
    await page.goto(
      app === "demo" ? "http://localhost:3132/#learn" : "/courses",
    );
    const narrow = info.project.name === "phone";
    if (narrow)
      await page.getByRole("button", { name: "Open navigation" }).click();
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole(app === "demo" ? "button" : "link", { name: "Docs" })
      .click();
    const sidebar = page.locator(".sidebar");
    const tree = page.getByRole("navigation", {
      name: "Documents",
      exact: true,
    });
    if (narrow) await expect(sidebar).toHaveClass(/open/);
    await expect(
      tree.getByRole("heading", { name: "Getting started" }),
    ).toBeVisible();
    await expect(
      tree.getByRole("button", { name: "Getting started" }),
    ).toHaveCount(0);
    await expect(tree.getByRole("link", { name: "Start here" })).toBeVisible();
    const guides = tree.getByRole("button", { name: "Guides" });
    await expect(guides).toHaveAttribute("aria-expanded", "false");
    await expect(
      tree.getByRole("link", { name: "Reference guide" }),
    ).toBeHidden();
    await guides.click();
    await expect(guides).toHaveAttribute("aria-expanded", "true");
    await expect(
      tree.getByRole("link", { name: "Reference guide" }),
    ).toBeVisible();
    await guides.focus();
    await page.keyboard.press("Enter");
    await expect(guides).toHaveAttribute("aria-expanded", "false");
    await page.keyboard.press("Enter");
    await expect(guides).toHaveAttribute("aria-expanded", "true");
    await guides.evaluate((element) => (element as HTMLElement).blur());
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath(`${app}-docs-navigation-${info.project.name}.png`),
    });
    await page.reload();
    if (narrow) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await expect(sidebar).toHaveClass(/open/);
    }
    await expect(tree.getByRole("button", { name: "Guides" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await tree.getByRole("link", { name: "Reference guide" }).click();
    await expect(page.locator("article h1")).toHaveText("Reference guide");
    if (narrow) await expect(sidebar).not.toHaveClass(/open/);
    if (narrow) {
      await page.getByRole("button", { name: "Open navigation" }).click();
      await expect(
        tree.getByRole("button", { name: "Guides" }),
      ).toHaveAttribute("aria-expanded", "true");
      await page
        .getByRole("navigation", { name: "Primary" })
        .getByRole(app === "demo" ? "button" : "link", { name: "Courses" })
        .click();
      await expect(sidebar).not.toHaveClass(/open/);
    }
    if (app === "production" && !narrow) {
      const noScript = await browser.newContext({ javaScriptEnabled: false });
      const noScriptPage = await noScript.newPage();
      await noScriptPage.goto(`http://localhost:3131/docs/${hierarchy[0].id}`);
      await expect(
        noScriptPage
          .getByRole("navigation", { name: "Documents", exact: true })
          .getByRole("link", { name: "Reference guide", exact: true }),
      ).toBeVisible();
      await noScript.close();
    }
  });
}
test("server navigation is published-only, updates across publication and works without JavaScript", async ({
  request,
  browser,
}, info) => {
  await fixture(request);
  const html = await (await request.get(`/docs/${docs[39].id}`)).text();
  expect(html).toContain(docs[40].title);
  expect(html).not.toContain("SECRET DRAFT TITLE");
  expect(html).not.toContain("DRAFT ONLY TITLE");
  expect(html).not.toContain("Secret draft section");
  await fixture(
    request,
    docs.filter((doc) => doc.id !== docs[40].id),
  );
  const updated = await (await request.get(`/docs/${docs[39].id}`)).text();
  expect(updated).not.toContain(docs[40].title);
  expect(updated).toContain(docs[41].title);
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto(
    `http://localhost:3131/docs/${docs[39].id}#heading-overview-2`,
  );
  await expect(page.locator("#heading-overview-2")).toBeInViewport();
  await expect(
    page
      .getByRole("navigation", { name: "Previous and next documents" })
      .getByRole("link", { name: /Next/ }),
  ).toContainText(docs[41].title);
  await page.screenshot({
    animations: "disabled",
    path: info.outputPath("docs-no-js.png"),
  });
  await context.close();
});
