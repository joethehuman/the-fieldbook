import { expect, test, type Page } from "@playwright/test";
import { freshWorkspace, type Workspace } from "../../lib/store";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import type { Content } from "../../lib/types";
import { authoringUser, setupAuthoringProvider } from "./provider-fixture";
import { closeContentSettings, openContentSettings, waitForDraftSaved } from "./editor-helpers";

async function setup(page: Page, installed: boolean, role: "admin" | "contributor", kind: Content["kind"], saved: boolean, empty: boolean) {
  const state = withPublishedSnapshots(freshWorkspace());
  const actor = { ...authoringUser, role };
  state.users = [actor];
  const source = structuredClone(state.content.find((entry) => entry.kind === kind)!);
  const draft: Content = {
    ...source, id: "00000000-0000-4000-8000-000000000980", title: `Pending ${kind}`,
    status: "draft", revision: 1, publishedRevision: null, category: "", folder: "",
    sectionId: undefined, sectionOrder: undefined, groups: [], assignments: [], updateTeams: [],
    summary: "Placement check.", body: "Draft text.", questions: [], coverImageUrl: undefined, cardArt: undefined,
    lessons: kind === "course" ? [{ id: "lesson", title: "Lesson", body: "Lesson text." }] : [],
  };
  source.category = "Existing destination";
  source.folder = kind === "doc" ? "Existing subsection" : "";
  source.sectionId = undefined;
  state.content = empty ? [draft] : [source, draft];
  state.publishedContent = empty ? [] : [source];
  state.settings = {
    ...state.settings!, docCategoryOrder: [],
    docSections: saved && !empty ? [
      { id: "parent", name: "Existing destination", legacyCategory: "Existing destination" },
      { id: "child", name: "Existing subsection", parentId: "parent", legacyCategory: "Existing destination", legacyFolder: "Existing subsection" },
    ] : [],
    ...(saved ? { contentCategories: {
      course: empty ? [] : ["Existing destination", "Empty destination"],
      brief: empty ? [] : ["Existing destination", "Empty destination"],
    } } : { contentCategories: undefined }),
  };
  if (installed) {
    await setupAuthoringProvider(page, state);
    await page.request.post(`http://127.0.0.1:${process.env.FIELDBOOK_BACKEND_TEST_PORT || 3130}/fixture`, { data: {
      role, settings: state.settings, groups: [], curricula: [],
      users: [{ ...actor, auth_user_id: actor.id, group_joined_at: {}, effective_group_joined_at: {} }],
      documents: state.content.map((item) => ({
        id: item.id, draft: item, published: item.id === draft.id ? null : source,
        revision: item.revision || 1, published_revision: item.id === draft.id ? null : 1, updated_at: item.updatedAt,
      })),
    } });
  } else {
    state.users[0].id = role === "admin" ? "demo-admin" : "demo-contributor";
    await page.addInitScript((workspace: Workspace) => {
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
      sessionStorage.setItem("fieldbook.profile.v1", workspace.users[0].id);
    }, state);
  }
  await page.goto(installed ? `/admin/content/${draft.id}/edit` : `/#admin/content/${draft.id}/edit`);
  await expect(page.getByRole("textbox", { name: "Title", exact: true })).toHaveValue(draft.title);
  return {
    draft,
    read: async (): Promise<Content> => installed
      ? (await page.request.get(`/api/content?id=${draft.id}&draft=true`)).json()
      : page.evaluate((id) => JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!).content.find((item: Content) => item.id === id), draft.id),
  };
}

for (const role of ["admin", "contributor"] as const) {
  for (const kind of ["doc", "course", "brief"] as const) {
    for (const saved of [false, true]) for (const empty of [false, true]) {
      test(`${role} ${kind} placement: ${saved ? "saved" : "legacy"} ${empty ? "empty" : "populated"} destinations`, async ({ page }, info) => {
        const installed = info.project.name.startsWith("production");
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        const fixture = await setup(page, installed, role, kind, saved, empty);
        const details = await openContentSettings(page);
        const organization = details.locator("#writing-organization");
        const label = kind === "doc" ? "Section" : "Category";
        const destination = kind === "doc" ? "Existing destination / Existing subsection" : "Existing destination";
        const helper = `Ask an administrator to create a new ${kind === "doc" ? "section" : "category"}.`;
        const legacyAdmin = role === "admin" && kind !== "doc" && !saved;
        const picker = legacyAdmin
          ? organization.getByRole("combobox", { name: label, exact: true })
          : organization.getByRole("button", { name: label, exact: true });
        if (role === "contributor") {
          const text = organization.getByText(helper, { exact: true });
          await expect(text).toBeVisible();
          await expect(organization.getByRole("button", { name: /Create (?:section|category)/ })).toHaveCount(0);
          await expect(picker).toHaveAttribute("aria-describedby", await text.getAttribute("id") || "");
          const [controlBox, helperBox] = await Promise.all([picker.boundingBox(), text.boundingBox()]);
          expect(helperBox!.y).toBeGreaterThanOrEqual(controlBox!.y + controlBox!.height);
          await expect(page.getByRole("listbox")).toHaveCount(0);
          await page.screenshot({ path: info.outputPath("placement-helper.png"), fullPage: true });
        } else await expect(organization.getByText(helper, { exact: true })).toHaveCount(0);

        await picker.click();
        if (!legacyAdmin) {
          const search = page.getByRole("combobox", { name: kind === "doc" ? "Search sections" : "Categories", exact: true });
          if (empty) {
            await expect(page.getByText(role === "contributor"
              ? `An administrator must create a ${kind === "doc" ? "section" : "category"} first.`
              : `No ${kind === "doc" ? "sections" : "categories"} yet. Create one below.`, { exact: true })).toBeVisible();
            await page.screenshot({ path: info.outputPath("placement-empty-dropdown.png"), fullPage: true });
          } else {
            await expect(page.getByRole("option", { name: destination, exact: true })).toBeVisible();
            if (saved && kind !== "doc") await expect(page.getByRole("option", { name: "Empty destination", exact: true })).toBeVisible();
            await search.fill("A destination that does not exist");
            await expect(page.getByText(`No matching ${kind === "doc" ? "sections" : "categories"}.`, { exact: true })).toBeVisible();
            await expect(page.getByRole("option")).toHaveCount(0);
            await page.screenshot({ path: info.outputPath("placement-search-dropdown.png"), fullPage: true });
            await search.fill("");
            await page.getByRole("option", { name: destination, exact: true }).click();
            await waitForDraftSaved(page);
            await expect.poll(async () => (await fixture.read()).category).toBe("Existing destination");
            if (kind === "doc") expect((await fixture.read()).folder).toBe("Existing subsection");
          }
          if (empty) await page.keyboard.press("Escape");
        } else if (!empty) {
          await page.getByRole("option", { name: "Existing destination", exact: true }).click();
          await waitForDraftSaved(page);
          await expect.poll(async () => (await fixture.read()).category).toBe("Existing destination");
        } else await page.keyboard.press("Escape");

        if (empty) {
          await closeContentSettings(page);
          await page.getByRole("textbox", { name: "Title", exact: true }).fill("Unfinished placement draft");
          await waitForDraftSaved(page);
          await expect.poll(async () => (await fixture.read()).title).toBe("Unfinished placement draft");
          expect((await fixture.read()).category).toBe("");
          await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
          expect((await fixture.read()).publishedRevision).toBeNull();
          await openContentSettings(page);
          await expect(page.locator("#writing-readiness")).toContainText(kind === "doc" ? "Choose a Docs section" : "Choose a category");
          if (role === "admin") {
            if (legacyAdmin) {
              await picker.fill("Created destination");
              await page.getByRole("option", { name: "Add “Created destination”", exact: true }).click();
            } else {
              await organization.getByRole("button", { name: `Create ${kind === "doc" ? "section" : "category"}`, exact: true }).click();
              if (kind === "doc") {
                await organization.getByRole("textbox", { name: "New section name", exact: true }).fill("Created destination");
                await organization.getByRole("button", { name: "Create section", exact: true }).click();
              } else {
                const dialog = page.getByRole("dialog");
                await dialog.getByLabel("Category name", { exact: true }).fill("Created destination");
                await dialog.getByRole("button", { name: "Create category", exact: true }).click();
              }
            }
            await expect.poll(async () => (await fixture.read()).category).toBe("Created destination");
            await waitForDraftSaved(page);
          }
        }
        await page.screenshot({ path: info.outputPath("placement-details.png"), fullPage: true });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        expect(errors).toEqual([]);
      });
    }
  }
}
