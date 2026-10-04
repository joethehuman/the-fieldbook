import { test, expect, type Locator, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { defaultSettings } from "../../lib/settings";

async function openSettings(page: Page) {
  await expect(page.locator(".admin-layout")).toBeVisible();
  const picker = page.getByRole("combobox", { name: "Administration section" });
  if (await picker.isVisible()) {
    await picker.click();
    await page
      .getByRole("option", { name: "Docs navigation", exact: true })
      .click();
  } else
    await page
      .getByRole("tab", { name: "Docs navigation", exact: true })
      .click();
}

async function openOrderingFixture(page: Page, long = false) {
  const data = freshWorkspace();
  const base = data.content.find((item) => item.kind === "doc")!;
  data.content = [
    {
      ...base,
      id: "first",
      title: "First guide",
      category: "Start",
      folder: "",
      sectionId: "start",
      sectionOrder: 1,
    },
    {
      ...base,
      id: "second",
      title: "Second guide",
      category: "Start",
      folder: "",
      sectionId: "start",
      sectionOrder: 2,
    },
    {
      ...base,
      id: "draft",
      title: "Draft guide",
      category: "Start",
      folder: "",
      sectionId: "start",
      sectionOrder: 3,
      status: "draft",
    },
    {
      ...base,
      id: "child-first",
      title: "Install first",
      category: "Start",
      folder: "Install",
      sectionId: "install",
      sectionOrder: 1,
    },
    {
      ...base,
      id: "child-second",
      title: "Install second",
      category: "Start",
      folder: "Install",
      sectionId: "install",
      sectionOrder: 2,
    },
  ];
  data.content = data.content.map((doc) => ({
    ...doc,
    revision: 1,
    ...(doc.status === "published" ? { publishedRevision: 1 } : {}),
  }));
  data.settings = {
    ...defaultSettings,
    ...data.settings,
    docCategoryOrder: [],
    docSections: [
      { id: "start", name: "Start" },
      { id: "reference", name: "Reference with a longer section name" },
      { id: "install", name: "Install", parentId: "start" },
      { id: "usage", name: "Usage", parentId: "start" },
      { id: "troubleshooting", name: "Troubleshooting", parentId: "start" },
    ],
  };
  if (long)
    data.settings.docSections!.push(
      ...Array.from({ length: 28 }, (_, index) => ({
        id: `extra-${index}`,
        name: `Extra section ${index + 1}`,
      })),
    );
  await page.addInitScript((workspace) => {
    if (!localStorage.getItem("fieldbook.workspace.v1"))
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
  }, data);
  await page.goto("/#admin");
  await openSettings(page);
  return data;
}

test("document move actions stage, discard and save the reader order without changing drafts", async ({
  page,
}, info) => {
  const fixture = await openOrderingFixture(page);
  const first = page.getByRole("button", { name: "New section", exact: true });
  const toggle = page.getByRole("button", {
    name: "Show documents",
    exact: true,
  });
  const firstBox = await first.boundingBox(),
    toggleBox = await toggle.boundingBox();
  expect(Math.abs(firstBox!.y - toggleBox!.y)).toBeLessThan(1);
  const header = page
    .locator('[data-slot="reorder-row"]')
    .filter({ has: page.getByText("Start", { exact: true }) });
  const title = await header.locator("strong").boundingBox(),
    count = await header.locator("small").boundingBox();
  expect(Math.abs(title!.x - count!.x)).toBeLessThan(1);
  await toggle.click();
  const documents = page.getByRole("list", {
    name: "Documents in Start",
    exact: true,
  });
  await expect(
    documents.locator('[data-slot="reorder-row"]').first(),
  ).toContainText("First guide");
  await page
    .getByRole("button", {
      name: "Actions for document Second guide",
      exact: true,
    })
    .click();
  await page.getByRole("menuitem", { name: "Move up", exact: true }).click();
  await expect(
    documents.locator('[data-slot="reorder-row"]').first(),
  ).toContainText("Second guide");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!).settings
          .docSections[0].docOrder,
    ),
  ).toBeUndefined();
  await page
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(
    documents.locator('[data-slot="reorder-row"]').first(),
  ).toContainText("First guide");
  await page
    .getByRole("button", {
      name: "Actions for document Second guide",
      exact: true,
    })
    .click();
  await page.getByRole("menuitem", { name: "Move up", exact: true }).click();
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    page.getByText("Settings saved.", { exact: true }),
  ).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
  );
  expect(saved.settings.docSections[0].docOrder).toEqual([
    "second",
    "first",
    "draft",
  ]);
  expect(saved.content).toEqual(fixture.content);
  await page.reload();
  await openSettings(page);
  await page
    .getByRole("button", { name: "Show documents", exact: true })
    .click();
  await expect(
    documents.locator('[data-slot="reorder-row"]').first(),
  ).toContainText("Second guide");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("docs-order-settings.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Hide documents", exact: true })
    .click();
  await expect(documents).toHaveCount(0);
  const docsButton = page.getByRole("button", { name: "Docs", exact: true });
  if (!(await docsButton.isVisible()))
    await page.getByRole("button", { name: "Open navigation" }).click();
  await docsButton.click();
  const tree = page.getByRole("navigation", { name: "Documents", exact: true });
  if (!(await tree.isVisible()))
    await page.getByRole("button", { name: "Open navigation" }).click();
  const links = tree.getByRole("link");
  expect(
    (await links.allTextContents()).filter((title) => /guide/.test(title)),
  ).toEqual(["Second guide", "First guide"]);
  await expect(tree.getByText("Draft guide", { exact: true })).toHaveCount(0);
});

async function dragAfter(
  page: Page,
  source: Locator,
  target: Locator,
  screenshot: string,
  branch = false,
) {
  await source.scrollIntoViewIfNeeded();
  const handle = await source.boundingBox(),
    row = await target.boundingBox();
  expect(handle && row).toBeTruthy();
  await page.mouse.move(
    handle!.x + handle!.width / 2,
    handle!.y + handle!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handle!.x + handle!.width / 2 + 12,
    handle!.y + handle!.height / 2 + 12,
    { steps: 5 },
  );
  const origin = source.locator(
    "xpath=ancestor::li[@data-sortable-preview][1]",
  );
  await expect(origin).toHaveAttribute(
    branch ? "data-branch-dragging" : "data-dragging",
    "true",
  );
  await page.mouse.move(row!.x + row!.width / 2, row!.y + row!.height * 0.8, {
    steps: 10,
  });
  await expect(target).toHaveAttribute("data-drop", "after");
  await page.screenshot({ path: screenshot });
  await page.mouse.up();
}

test("subsection and document drags show their origin and insertion destination and retain branches", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Native mouse drag; move actions cover every viewport.",
  );
  await openOrderingFixture(page);
  await page.getByRole("button", { name: "Expand Start", exact: true }).click();
  const child = (name: string) =>
    page
      .getByRole("button", { name: `Actions for Start → ${name}`, exact: true })
      .locator("xpath=ancestor::li[@data-sortable-preview][1]");
  await dragAfter(
    page,
    page.getByRole("button", { name: /^Reorder Start → Install;/ }),
    child("Usage"),
    info.outputPath("subsection-drag.png"),
    true,
  );
  const children = child("Usage").locator("xpath=..");
  await expect(children.locator(":scope > li").nth(0)).toContainText("Usage");
  await expect(children.locator(":scope > li").nth(1)).toContainText("Install");
  await page
    .getByRole("button", { name: "Show documents", exact: true })
    .click();
  const documents = page.getByRole("list", {
    name: "Documents in Start",
    exact: true,
  });
  await dragAfter(
    page,
    documents.getByRole("button", { name: /^Reorder document First guide;/ }),
    documents.locator('[data-slot="reorder-row"]').nth(1),
    info.outputPath("document-drag.png"),
  );
  await expect(
    documents.locator('[data-slot="reorder-row"]').first(),
  ).toContainText("Second guide");
  const childDocuments = page.getByRole("list", {
    name: "Documents in Start → Install",
    exact: true,
  });
  await childDocuments.scrollIntoViewIfNeeded();
  await dragAfter(
    page,
    childDocuments.getByRole("button", {
      name: /^Reorder document Install first;/,
    }),
    childDocuments.locator('[data-slot="reorder-row"]').nth(1),
    info.outputPath("subsection-document-drag.png"),
  );
  await expect(
    childDocuments.locator('[data-slot="reorder-row"]').first(),
  ).toContainText("Install second");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    page.getByText("Settings saved.", { exact: true }),
  ).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
  );
  expect(
    saved.settings.docSections
      .filter((section: { parentId?: string }) => section.parentId === "start")
      .map((section: { id: string }) => section.id),
  ).toEqual(["usage", "install", "troubleshooting"]);
  expect(
    saved.settings.docSections.find(
      (section: { id: string }) => section.id === "install",
    ).docOrder,
  ).toEqual(["child-second", "child-first"]);
  expect(
    saved.content.find((doc: { id: string }) => doc.id === "child-first")
      .sectionId,
  ).toBe("install");
});

test("Docs settings move and rename a subsection without losing published placement", async ({
  page,
}, info) => {
  const data = freshWorkspace();
  const base = data.content.find((item) => item.kind === "doc")!;
  data.content = [
    {
      ...base,
      id: "root-doc",
      title: "Root guide",
      category: "Start",
      folder: "",
      sectionId: "start",
    },
    {
      ...base,
      id: "child-doc",
      title: "Install guide",
      category: "Start",
      folder: "Install",
      sectionId: "install",
    },
  ];
  data.settings = {
    ...defaultSettings,
    ...data.settings,
    docSections: [
      { id: "start", name: "Start" },
      { id: "reference", name: "Reference" },
      { id: "install", name: "Install", parentId: "start" },
    ],
    docCategoryOrder: [],
  };
  await page.addInitScript((workspace) => {
    if (!localStorage.getItem("fieldbook.workspace.v1"))
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
  }, data);
  await page.goto("/#admin");
  await openSettings(page);
  await page.getByRole("button", { name: "Expand Start" }).click();
  await page
    .getByRole("button", { name: "Actions for Start → Install" })
    .click();
  await page.getByRole("menuitem", { name: "Move to…" }).click();
  await page
    .getByRole("dialog")
    .getByRole("combobox", { name: "Destination" })
    .click();
  await page.getByRole("option", { name: "Reference", exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Move section" })
    .click();
  if (
    await page
      .getByRole("button", { name: "Expand Reference", exact: true })
      .isVisible()
  )
    await page
      .getByRole("button", { name: "Expand Reference", exact: true })
      .click();
  await expect(
    page.getByRole("button", { name: "Actions for Reference → Install" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Actions for Reference → Install" })
    .click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page
    .getByRole("dialog")
    .getByRole("textbox", { name: "Rename section" })
    .fill("Installation");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save name" })
    .click();
  await expect(
    page.getByRole("button", { name: "Actions for Reference → Installation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New section", exact: true }).click();
  await page.getByRole("textbox", { name: "New section name" }).fill("Guides");
  await page.getByRole("button", { name: "Create section" }).click();
  await expect(
    page.getByRole("button", { name: "Actions for Guides", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Actions for Guides", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Add subsection" }).click();
  await page.getByRole("textbox", { name: "New section name" }).fill("Setup");
  await page.getByRole("button", { name: "Create section" }).click();
  await expect(
    page.getByRole("button", { name: "Actions for Guides → Setup" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Actions for Guides", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "Add subsection" }).click();
  await page.getByRole("textbox", { name: "New section name" }).fill("setup");
  await page.getByRole("button", { name: "Create section" }).click();
  await expect(
    page.getByText("Sections under the same parent need different names."),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Actions for Reference → Installation" })
    .click();
  await page.getByRole("menuitem", { name: "Delete section" }).click();
  await expect(
    page.getByText("Move this section's documents before deleting it."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved.")).toBeVisible();
  await page.reload();
  await openSettings(page);
  await page.getByRole("button", { name: "Expand Reference" }).click();
  await expect(
    page.getByRole("button", { name: "Actions for Reference → Installation" }),
  ).toBeVisible();
  const current = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
  );
  expect(
    current.settings.docSections.find(
      (section: { id: string }) => section.id === "install",
    ).parentId,
  ).toBe("reference");
  expect(
    current.settings.docSections.find(
      (section: { id: string }) => section.id === "install",
    ).name,
  ).toBe("Installation");
  expect(
    current.content.find((item: { id: string }) => item.id === "child-doc")
      .sectionId,
  ).toBe("install");
  const docsButton = page.getByRole("button", { name: "Docs", exact: true });
  if (!(await docsButton.isVisible()))
    await page.getByRole("button", { name: "Open navigation" }).click();
  await docsButton.click();
  const tree = page.getByRole("navigation", {
    name: "Documents",
    exact: true,
    includeHidden: true,
  });
  if (!(await tree.isVisible()))
    await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(tree.getByRole("heading", { name: "Reference" })).toBeVisible();
  await expect(tree.getByRole("button", { name: "Reference" })).toHaveCount(0);
  const installation = tree.getByRole("button", { name: "Installation" });
  await expect(installation).toHaveAttribute("aria-expanded", "false");
  await installation.click();
  await expect(tree.getByRole("link", { name: "Install guide" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
  await page.screenshot({
    path: info.outputPath("docs-hierarchy.png"),
    fullPage: true,
  });
});

async function chooseMoveDestination(
  page: Page,
  rowAction: string,
  destination: string,
  document = false,
) {
  await page.getByRole("button", { name: rowAction, exact: true }).click();
  await page.getByRole("menuitem", { name: "Move to…", exact: true }).click();
  const dialog = page.getByRole("dialog", {
    name: document ? "Move document" : "Move section",
    exact: true,
  });
  await dialog
    .getByRole("combobox", { name: "Destination", exact: true })
    .click();
  await page.getByRole("option", { name: destination, exact: true }).click();
  await dialog
    .getByRole("button", {
      name: document ? "Move document" : "Move section",
      exact: true,
    })
    .click();
}

test("cross-section row and mixed bulk moves remain pending, discard and save, with sticky actions on a long page", async ({
  page,
}, info) => {
  const before = await openOrderingFixture(page, true);
  await page
    .getByRole("button", { name: "Show documents", exact: true })
    .click();
  await page.getByRole("button", { name: "Expand Start", exact: true }).click();
  await chooseMoveDestination(
    page,
    "Actions for document First guide",
    "Start → Usage",
    true,
  );
  await expect(
    page.getByRole("list", { name: "Documents in Start → Usage", exact: true }),
  ).toContainText("First guide");
  expect(
    await page.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem("fieldbook.workspace.v1")!,
        ).content.find((doc: any) => doc.id === "first").sectionId,
    ),
  ).toBe("start");
  const bar = page.locator('[data-slot="pending-changes-bar"]');
  await expect(bar).toContainText("Unsaved changes");
  await page.evaluate(() => {
    let owner: HTMLElement | null = document.querySelector(
      '[data-slot="pending-changes-bar"]',
    )!.parentElement;
    while (
      owner &&
      !(
        owner.scrollHeight > owner.clientHeight &&
        /(auto|scroll)/.test(getComputedStyle(owner).overflowY)
      )
    )
      owner = owner.parentElement;
    const scroller = owner || document.scrollingElement!;
    scroller.scrollTop = scroller.scrollHeight;
  });
  await expect(bar).toBeInViewport();
  await expect(bar).toHaveCSS("opacity", "1");
  const frame = await page.locator('[data-slot="pending-changes-region"]').evaluate((region) => {
    const outer = region.getBoundingClientRect();
    const inner = region.querySelector('[data-slot="pending-changes-bar"]')!.getBoundingClientRect();
    const card = document.getElementById("settings-docs")!.getBoundingClientRect();
    return {
      left: outer.left, right: outer.right, top: outer.top,
      bottom: outer.bottom, barTop: inner.top, barBottom: inner.bottom,
      barLeft: inner.left, barRight: inner.right, cardLeft: card.left, cardRight: card.right,
      background: getComputedStyle(region).backgroundColor,
    };
  });
  expect(frame.left).toBeLessThan(frame.cardLeft);
  expect(frame.right).toBeGreaterThan(frame.cardRight);
  expect(frame.barTop).toBeGreaterThan(frame.top);
  expect(frame.barLeft).toBe(frame.cardLeft);
  expect(frame.barRight).toBe(frame.cardRight);
  expect(frame.barBottom).toBe(frame.bottom);
  await expect(bar).toHaveCSS("border-bottom-left-radius", "0px");
  await expect(bar).toHaveCSS("border-bottom-right-radius", "0px");
  expect(frame.background).not.toBe("rgba(0, 0, 0, 0)");
  await page.screenshot({
    path: info.outputPath("sticky-unsaved-changes.png"),
  });
  await bar
    .getByRole("button", { name: "Discard changes", exact: true })
    .click();
  await expect(bar).toBeHidden();
  await expect(
    page.getByRole("list", { name: "Documents in Start", exact: true }),
  ).toContainText("First guide");
  await page
    .getByRole("checkbox", { name: "Select document First guide", exact: true })
    .check();
  await page
    .getByRole("checkbox", { name: "Select Start → Install", exact: true })
    .check();
  await page.getByRole("button", { name: "Bulk actions", exact: true }).click();
  await page.getByRole("menuitem", { name: "Move to…", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("combobox", { name: "Destination", exact: true })
    .click();
  await page
    .getByRole("option", {
      name: "Reference with a longer section name",
      exact: true,
    })
    .click();
  await dialog
    .getByRole("button", { name: "Apply changes", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Actions for Reference with a longer section name → Install",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("list", {
      name: "Documents in Reference with a longer section name",
      exact: true,
    }),
  ).toContainText("First guide");
  await bar.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(
    page.getByText("Settings saved.", { exact: true }),
  ).toBeVisible();
  await expect(bar).toBeHidden();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
  );
  expect(saved.content.find((doc: any) => doc.id === "first").sectionId).toBe(
    "reference",
  );
  expect(
    saved.publishedContent.find((doc: any) => doc.id === "first").sectionId,
  ).toBe("reference");
  expect(saved.content.find((doc: any) => doc.id === "first").body).toBe(
    before.content.find((doc) => doc.id === "first")!.body,
  );
  expect(saved.content.find((doc: any) => doc.id === "draft").status).toBe(
    "draft",
  );
  expect(
    saved.settings.docSections.find((section: any) => section.id === "install")
      .parentId,
  ).toBe("reference");
  expect(
    saved.content.find((doc: any) => doc.id === "child-first").sectionId,
  ).toBe("install");
  await page.reload();
  await openSettings(page);
  await page
    .getByRole("button", { name: "Show documents", exact: true })
    .click();
  await expect(
    page.getByRole("list", {
      name: "Documents in Reference with a longer section name",
      exact: true,
    }),
  ).toContainText("First guide");
});

async function pendingTransitionHeights(action: Locator) {
  return action.evaluate((element) => new Promise<number[]>((resolve) => {
    const frame = document.querySelector('[data-slot="pending-changes-region"]')!;
    const heights = [frame.getBoundingClientRect().height];
    const started = performance.now();
    (element as HTMLElement).click();
    const sample = () => {
      heights.push(frame.getBoundingClientRect().height);
      if (performance.now() - started < 300) requestAnimationFrame(sample);
      else resolve(heights);
    };
    requestAnimationFrame(sample);
  }));
}

test("pending save bar opens and closes smoothly without a dormant gap, and respects reduced motion", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openOrderingFixture(page);
  const bar = page.locator('[data-slot="pending-changes-bar"]');
  const region = page.locator('[data-slot="pending-changes-region"]');
  const footer = page.locator('#settings-docs [data-slot="card-footer"]');
  const footerHeight = (await footer.boundingBox())!.height;
  await expect(bar).toBeHidden();
  await expect(page.getByRole("button", { name: "Save settings", exact: true })).toHaveCount(0);
  await expect(footer.getByRole("button")).toHaveCount(0);
  const guidance = page.locator("#settings-docs-guidance");
  await expect(guidance).toHaveText("Drag to reorder or move items between sections, or use Move to… in the menus.");
  const footerContentWidth = await footer.evaluate((element) => {
    const style = getComputedStyle(element);
    return element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  });
  expect((await guidance.boundingBox())!.width).toBeCloseTo(footerContentWidth, 1);
  expect(await bar.locator("button").first().evaluate((button) => {
    button.focus();
    return document.activeElement === button;
  })).toBe(false);

  await page.getByRole("button", { name: "Actions for Start", exact: true }).click();
  const opening = await pendingTransitionHeights(page.getByRole("menuitem", { name: "Move down", exact: true }));
  expect(opening[0]).toBe(0);
  const expanded = opening.at(-1)!;
  expect(expanded).toBeGreaterThan(40);
  expect(opening.some((height) => height > 1 && height < expanded - 1)).toBe(true);
  await expect(bar).toHaveCSS("opacity", "1");
  expect((await footer.boundingBox())!.height).toBe(footerHeight);
  await page.locator(".admin-panel").evaluate((owner) => { owner.scrollTop = 0; });
  const card = page.locator("#settings-docs");
  const headerBox = (await bar.boundingBox())!;
  const cardBox = (await card.boundingBox())!;
  expect(cardBox.y).toBe(headerBox.y + headerBox.height);
  expect(cardBox.x).toBe(headerBox.x);
  expect(cardBox.width).toBe(headerBox.width);
  await expect(card).toHaveCSS("border-top-width", "0px");
  await page.screenshot({ path: info.outputPath("connected-save-header.png") });

  const closing = await pendingTransitionHeights(bar.getByRole("button", { name: "Discard changes", exact: true }));
  expect(closing.at(-1)).toBe(0);
  expect(closing.some((height) => height > 1 && height < expanded - 1)).toBe(true);
  await expect(bar).toBeHidden();
  await expect(card).toHaveCSS("border-top-width", "1px");
  await expect(card).not.toHaveCSS("border-top-left-radius", "0px");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Actions for Start", exact: true }).click();
  const immediate = await pendingTransitionHeights(page.getByRole("menuitem", { name: "Move down", exact: true }));
  expect(immediate[0]).toBe(0);
  expect(immediate.slice(1).every((height) => Math.abs(height - expanded) < 1)).toBe(true);
  await expect(region).toHaveCSS("transition-property", "none");
  await expect(bar).toHaveCSS("opacity", "1");
});

async function dragInto(
  page: Page,
  source: Locator,
  target: Locator,
  screenshot: string,
  branch = false,
) {
  await source.scrollIntoViewIfNeeded();
  const from = await source.boundingBox(),
    to = await target.boundingBox();
  expect(from && to).toBeTruthy();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    from!.x + from!.width / 2 + 12,
    from!.y + from!.height / 2 + 12,
    { steps: 5 },
  );
  await expect(
    source.locator("xpath=ancestor::li[@data-sortable-preview][1]"),
  ).toHaveAttribute(branch ? "data-branch-dragging" : "data-dragging", "true");
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2, {
    steps: 12,
  });
  await page.mouse.move(to!.x + to!.width / 2 + 1, to!.y + to!.height / 2 + 1);
  await expect(target).toHaveAttribute("data-drop-inside", "true");
  await expect(target).toContainText("Move to");
  await page.screenshot({ path: screenshot });
  await page.mouse.up();
}

test("native drag moves documents and subsection branches into another section, including an empty destination", async ({
  page,
}, info) => {
  test.skip(
    info.project.name !== "desktop",
    "Native mouse drag; menus cover phone and tablet.",
  );
  await openOrderingFixture(page);
  await page
    .getByRole("button", { name: "Show documents", exact: true })
    .click();

  const reference = page
    .getByRole("button", {
      name: "Actions for Reference with a longer section name",
      exact: true,
    })
    .locator('xpath=ancestor::li[@data-slot="reorder-row"][1]');
  await dragInto(
    page,
    page.getByRole("button", { name: /^Reorder document First guide;/ }),
    reference,
    info.outputPath("cross-document-destination.png"),
  );
  await expect(
    page.getByRole("list", {
      name: "Documents in Reference with a longer section name",
      exact: true,
    }),
  ).toContainText("First guide");
  await page
    .getByRole("button", { name: "Hide documents", exact: true })
    .click();
  await page.getByRole("button", { name: "Expand Start", exact: true }).click();
  await dragInto(
    page,
    page.getByRole("button", { name: /^Reorder Start → Install;/ }),
    reference,
    info.outputPath("cross-subsection-destination.png"),
    true,
  );
  await page
    .getByRole("button", { name: "Show documents", exact: true })
    .click();
  await expect(
    page.getByRole("list", {
      name: "Documents in Reference with a longer section name → Install",
      exact: true,
    }),
  ).toContainText("Install first");
  await expect(
    page.getByRole("list", {
      name: "Documents in Reference with a longer section name → Install",
      exact: true,
    }),
  ).toContainText("Install second");
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect(
    page.getByText("Settings saved.", { exact: true }),
  ).toBeVisible();
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!),
  );
  expect(saved.content.find((doc: any) => doc.id === "first").sectionId).toBe(
    "reference",
  );
  expect(
    saved.settings.docSections.find((section: any) => section.id === "install")
      .parentId,
  ).toBe("reference");
});
