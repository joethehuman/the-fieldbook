import { test, expect, type Page } from "@playwright/test";
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
  await page.getByRole("button", { name: "Expand Reference" }).click();
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
