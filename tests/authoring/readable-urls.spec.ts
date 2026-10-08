import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { contentPath, curriculumPath } from "../../lib/navigation";
import { adminHref } from "../../lib/admin-destination";
import {
  setupAuthoringProvider,
  syncAuthoringProvider,
} from "./provider-fixture";

const docId = "00000000-0000-4000-8000-000000000801";
const courseId = "00000000-0000-4000-8000-000000000802";
const updateId = "00000000-0000-4000-8000-000000000803";
const curriculumId = "url-curriculum";
async function setup(page: Page, installed: boolean) {
  const data = freshWorkspace();
  data.settings!.access = "public";
  data.content = (["doc", "course", "brief"] as const).map((kind, index) => ({
    ...structuredClone(data.content.find((item) => item.kind === kind)!),
    id: [docId, courseId, updateId][index],
    title: `Readable ${kind} title`,
    body: `## Overview\n\nPublished evidence for readable navigation. [Legacy heading](/docs/${docId}#heading-overview)`,
    status: "published" as const,
    revision: 1,
    publishedRevision: 1,
    groups: [],
    assignments: [],
    updateTeams: [],
    questions: [],
    lessons:
      kind === "course"
        ? [
            { id: "first", title: "First lesson", body: "First principle." },
            { id: "second", title: "Second lesson", body: "Second principle." },
          ]
        : [],
  }));
  data.publishedContent = structuredClone(data.content);
  data.groups = [
    { id: "url-group", name: "Readable group", requiredCourseIds: [] },
  ];
  data.curricula = [
    {
      id: curriculumId,
      name: "Readable curriculum",
      description: "A learning path",
      courseIds: [courseId],
      status: "published",
    },
  ];
  if (installed) await setupAuthoringProvider(page, data);
  else
    await page.addInitScript((state) => {
      if (!localStorage.getItem("fieldbook.workspace.v1"))
        localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(state));
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    }, data);
  return data;
}
const href = (installed: boolean, path: string) =>
  installed ? path : "/#" + path.slice(1);
async function at(page: Page, installed: boolean, path: string) {
  await expect
    .poll(() =>
      installed
        ? new URL(page.url()).pathname + new URL(page.url()).search
        : new URL(page.url()).hash,
    )
    .toBe(installed ? path : "#" + path.slice(1));
}
async function adminTab(page: Page, name: string) {
  const picker = page.getByRole("combobox", {
    name: "Administration section",
    exact: true,
  });
  if (await picker.isVisible()) {
    await picker.click();
    await page.getByRole("option", { name, exact: true }).click();
  } else await page.getByRole("tab", { name, exact: true }).click();
}
test("reader links normalize old titles and IDs, preserve lessons, and use published names", async ({
  page,
}, info) => {
  const installed = info.project.name.startsWith("production");
  const data = await setup(page, installed);
  if (installed) {
    data.content[0].title = "Unpublished secret title";
    await syncAuthoringProvider(page, data);
  }
  await page.goto(href(installed, `/docs/${docId}`));
  await expect(
    page.getByRole("heading", { name: "Readable doc title", exact: true }),
  ).toBeVisible();
  await at(page, installed, contentPath("doc", docId, "Readable doc title"));
  if (installed) {
    await page
      .getByRole("link", { name: "Legacy heading", exact: true })
      .click();
    await expect.poll(() => new URL(page.url()).hash).toBe("#heading-overview");
    await at(page, true, contentPath("doc", docId, "Readable doc title"));
  } else {
    await page.goto(href(false, `/docs/${docId}?heading=heading-overview`));
    await at(
      page,
      false,
      contentPath("doc", docId, "Readable doc title") +
        "?heading=heading-overview",
    );
  }
  await page.goto(href(installed, contentPath("doc", docId, "Old name")));
  await at(page, installed, contentPath("doc", docId, "Readable doc title"));
  await page.goto(href(installed, `/updates/${updateId}`));
  await at(
    page,
    installed,
    contentPath("brief", updateId, "Readable brief title"),
  );
  await page.goto(href(installed, `/curricula/${curriculumId}`));
  await expect(
    page.getByRole("heading", { name: "Readable curriculum", exact: true }),
  ).toBeVisible();
  await at(
    page,
    installed,
    curriculumPath(curriculumId, "Readable curriculum"),
  );
  await page.goto(
    href(installed, `/courses/${courseId}?lesson=second&from=%2Fcourses%2Fall`),
  );
  if (installed) {
    await at(
      page,
      true,
      contentPath("course", courseId, "Readable course title") +
        "?lesson=second&from=%2Fcourses%2Fall",
    );
    await expect(
      page.getByRole("heading", { name: "Second lesson", exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Second lesson", exact: true }),
    ).toBeVisible();
  } else
    await expect(
      page.getByRole("heading", { name: "Readable course title", exact: true }),
    ).toBeVisible();
});
test("Admin content types survive refresh, history, and a saved editor rename", async ({
  page,
}, info) => {
  const installed = info.project.name.startsWith("production");
  await setup(page, installed);
  await page.goto(href(installed, "/admin/content/docs"));
  await expect(
    page
      .getByRole("group", { name: "Content type" })
      .getByRole("button", { name: "Docs", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("group", { name: "Content type" })
    .getByRole("button", { name: "Updates", exact: true })
    .click();
  await at(page, installed, "/admin/content/updates");
  await page.reload();
  await expect(
    page
      .getByRole("group", { name: "Content type" })
      .getByRole("button", { name: "Updates", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.goBack();
  await at(page, installed, "/admin/content/docs");
  const editor = {
    tab: "content" as const,
    contentKind: "doc" as const,
    id: docId,
    view: "edit" as const,
  };
  await page
    .getByRole("link", { name: "Readable doc title", exact: true })
    .click();
  await at(page, installed, adminHref(editor, "Readable doc title"));
  const title = page.getByRole("textbox", { name: "Title", exact: true });
  await title.fill("Renamed document");
  await expect(page.getByRole("banner").getByRole("status")).toContainText(
    "Saved",
  );
  await at(page, installed, adminHref(editor, "Renamed document"));
  await page.reload();
  await expect(title).toHaveValue("Renamed document");
  const back = page.getByRole("button", {
    name: "Back to content",
    exact: true,
  });
  if (await back.isVisible()) await back.click();
  else await page.goBack();
  await at(page, installed, "/admin/content/docs");
  await adminTab(page, "Recently deleted");
  await page.getByRole("button", { name: "Users", exact: true }).click();
  await at(page, installed, "/admin/settings/recently-deleted/users");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Users", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: info.outputPath("readable-admin-tabs.png") });
});

test("named Admin records retain nested panels on refresh and accept legacy paths", async ({
  page,
}, info) => {
  const installed = info.project.name.startsWith("production");
  await setup(page, installed);
  await page.goto(href(installed, "/admin/groups/url-group/learning"));
  const group = adminHref(
    { tab: "groups", id: "url-group", panel: "learning" },
    "Readable group",
  );
  await at(page, installed, group);
  await expect(
    page.getByRole("heading", {
      name: "Assigned courses and curricula",
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", {
      name: "Assigned courses and curricula",
      exact: true,
    }),
  ).toBeVisible();
  await page.goto(href(installed, "/admin/curricula/url-curriculum/edit"));
  await at(
    page,
    installed,
    adminHref(
      { tab: "curricula", id: curriculumId, view: "edit" },
      "Readable curriculum",
    ),
  );
  await expect(
    page.getByRole("textbox", { name: "Name", exact: true }),
  ).toHaveValue("Readable curriculum");
});
