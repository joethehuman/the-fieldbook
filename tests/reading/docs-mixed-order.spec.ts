import { test, expect } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { defaultSettings } from "../../lib/settings";
import type { DocSection } from "../../lib/docs-navigation";

for (const app of ["demo", "production"] as const) {
  test(`${app}: mixed Docs order controls the sidebar, initial article and Previous/Next`, async ({ page, request }, info) => {
    const data = freshWorkspace();
    const base = data.content.find((item) => item.kind === "doc")!;
    const docs = [
      ["first", "First guide", "root"],
      ["second", "Second guide", "root"],
      ["recipe", "Recipe guide", "recipes"],
      ["ai-doc", "AI guide", "ai"],
    ].map(([label, title, sectionId], index) => ({
      ...base, id: `00000000-0000-4000-8000-${String(index + 801).padStart(12, "0")}`,
      title, sectionId, category: "Start", folder: sectionId === "root" ? "" : sectionId,
      status: "published" as const, body: `## Overview\n\n${label} content.`,
    }));
    const sections: DocSection[] = [
      { id: "root", name: "Start", itemOrder: [
        { kind: "section", id: "recipes" }, { kind: "doc", id: docs[0].id },
        { kind: "section", id: "ai" }, { kind: "doc", id: docs[1].id },
      ] },
      { id: "recipes", name: "Recipes", parentId: "root" },
      { id: "ai", name: "AI", parentId: "root" },
    ];
    if (app === "demo") {
      data.content = docs;
      data.publishedContent = docs;
      data.settings = { ...defaultSettings, ...data.settings, docSections: sections, docCategoryOrder: [] };
      await page.addInitScript((workspace) => {
        localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
        sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
      }, data);
      await page.goto("http://localhost:3132/#docs");
    } else {
      const draft = { ...docs[0], id: "00000000-0000-4000-8000-000000999801", title: "SECRET MIXED DRAFT", sectionId: "hidden", status: "draft" };
      sections.push({ id: "hidden", name: "SECRET MIXED SECTION", parentId: "root" });
      sections[0].itemOrder!.splice(1, 0, { kind: "section", id: "hidden" }, { kind: "doc", id: draft.id });
      await request.post("http://127.0.0.1:3130/fixture", { data: {
        settings: { access: "public", docSections: sections, docCategoryOrder: [] },
        documents: [...docs.map((doc) => ({ id: doc.id, draft: doc, published: doc, revision: 1, published_revision: 1, updated_at: doc.updatedAt })),
          { id: draft.id, draft, published: null, revision: 1, updated_at: draft.updatedAt }],
      } });
      const response = await request.get("/docs");
      const html = await response.text();
      expect(html).not.toContain("SECRET MIXED");
      await page.goto("/docs");
    }
    await expect(page.locator("article h1")).toHaveText("Recipe guide");
    const tree = page.getByRole("navigation", { name: "Documents", exact: true });
    if (!(await tree.isVisible())) await page.getByRole("button", { name: "Open navigation", exact: true }).click();
    const order = await tree.locator(".document-section-children > *").evaluateAll((items) => items.map((item) =>
      (item.querySelector(".document-subsection-trigger span") || item).textContent?.trim()));
    expect(order).toEqual(["Recipes", "First guide", "AI", "Second guide"]);
    await page.screenshot({ path: info.outputPath(`${app}-mixed-reader.png`), fullPage: true });
    if (info.project.name === "phone") await page.getByRole("button", { name: "Close navigation", exact: true }).click();
    for (const title of ["First guide", "AI guide", "Second guide"]) {
      await page.getByRole("navigation", { name: "Previous and next documents" }).getByRole("link", { name: /Next/ }).click();
      await expect(page.locator("article h1")).toHaveText(title);
    }
    await page.getByRole("navigation", { name: "Previous and next documents" }).getByRole("link", { name: /Previous/ }).click();
    await expect(page.locator("article h1")).toHaveText("AI guide");
  });
}
