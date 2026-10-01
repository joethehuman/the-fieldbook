import { test, expect, type Page } from "@playwright/test";
import { freshWorkspace, type Workspace } from "../../lib/store";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import { reconcileLearning } from "../../lib/learning-groups";
import { authoringUser, setupAuthoringProvider } from "./provider-fixture";
import { openContentSettings } from "./editor-helpers";

async function setup(
  page: Page,
  installed: boolean,
  kind: "doc" | "brief" | "course",
) {
  let data = withPublishedSnapshots(freshWorkspace());
  data = reconcileLearning(data, data);
  const item = structuredClone(
    data.content.find((entry) => entry.kind === kind && (kind !== "course" || entry.assignments?.length))!,
  );
  const previousId = item.id;
  item.id = kind === "doc" ? "00000000-0000-4000-8000-000000000101" : kind === "brief"
    ? "00000000-0000-4000-8000-000000000102" : "00000000-0000-4000-8000-000000000103";
  data.groups = data.groups.map((group) => ({ ...group,
    requiredCourseIds: group.requiredCourseIds?.map((id) => id === previousId ? item.id : id),
    learningItems: group.learningItems?.map((entry) => entry.kind === "course" && entry.id === previousId ? { ...entry, id: item.id } : entry),
  }));
  data.curricula = data.curricula?.map((curriculum) => ({ ...curriculum,
    courseIds: curriculum.courseIds.map((id) => id === previousId ? item.id : id),
  }));
  data.progress = Object.fromEntries(Object.entries(data.progress).map(([id, entries]) => [id,
    entries.map((progress) => progress.content_id === previousId ? { ...progress, content_id: item.id } : progress),
  ]));
  item.title = "Autosave fixture";
  if (kind === "course") {
    item.lessons = [
      {
        id: "lesson-one",
        title: "First lesson",
        body: "A complete first lesson.",
        videoUrl: "https://example.test/legacy.mp4",
      },
    ];
    item.questions = [];
  } else item.body = "A complete writing fixture.";
  item.status = "published";
  item.revision = 1;
  item.publishedRevision = 1;
  data.content = [item];
  data.publishedContent = [structuredClone(item)];
  if (installed) {
    await setupAuthoringProvider(page, data);
    await page.route("**/api/admin/snapshot?**", (route) =>
      route.fulfill({ json: { data, user: authoringUser } }),
    );
  } else {
    await page.addInitScript((state) => {
      if (!localStorage.getItem("fieldbook.workspace.v1"))
        localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(state));
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    }, data);
  }
  await page.goto(installed ? "/admin" : "/#admin");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByRole("textbox", {
      name:
        kind === "course"
          ? "Lesson content"
          : kind === "doc"
            ? "Doc content"
            : "Update content",
      exact: true,
    })
    .waitFor();
  const read = async (live = false) =>
    installed
      ? (
          await page.request.get(
            `/api/content?id=${encodeURIComponent(item.id)}${live ? "" : "&draft=true"}`,
          )
        ).json()
      : page.evaluate(
          ({ id, live }) => {
            const state = JSON.parse(
              localStorage.getItem("fieldbook.workspace.v1")!,
            );
            return (live ? state.publishedContent : state.content).find(
              (entry: { id: string }) => entry.id === id,
            );
          },
          { id: item.id, live },
        );
  return { read, before: item, data };
}

test("Docs, Updates and Courses quietly save incomplete drafts, revert to Published and explicitly publish current edits", async ({
  page,
}, info) => {
  const installed = info.project.name.startsWith("production");
  for (const kind of ["doc", "brief", "course"] as const) {
    const context = await page
      .context()
      .browser()!
      .newContext({ viewport: page.viewportSize()! });
    const current = await context.newPage();
    try {
      const { read, before } = await setup(current, installed, kind);
      await expect(
        current.getByRole("button", { name: "Published", exact: true }),
      ).toBeDisabled();
      await current.waitForTimeout(1100); // Observe the autosave debounce without editing.
      expect((await read()).revision).toBe(1);
      await current.getByLabel("Title", { exact: true }).fill("");
      await expect.poll(async () => (await read()).title).toBe("");
      expect((await read(true)).title).toBe(before.title);
      await expect(current.getByRole("button", { name: "Publish changes", exact: true })).toBeDisabled();
      const details = await openContentSettings(current);
      await expect(details.getByRole("button", { name: "Add a title", exact: true })).toBeEnabled();
      await current.getByLabel("Title", { exact: true }).fill(before.title);
      await expect(
        current.getByRole("button", { name: "Published", exact: true }),
      ).toBeDisabled();
      await current
        .getByLabel("Title", { exact: true })
        .fill("Explicitly published latest title");
      await current
        .getByRole("button", { name: "Publish changes", exact: true })
        .click();
      await expect
        .poll(async () => (await read(true)).title)
        .toBe("Explicitly published latest title");
      await expect(
        current.getByRole("button", { name: "Published", exact: true }),
      ).toBeDisabled();
      await expect(current.locator("form.editor")).toBeVisible();
      expect((await read()).version).toBe(before.version);
      if (kind === "course") {
        expect((await read()).assignments).toEqual(before.assignments);
        expect((await read()).lessons[0].videoUrl).toBe(
          before.lessons[0].videoUrl,
        );
      }
    } finally {
      await context.close();
    }
  }
});

test("typing survives a slow draft response and Publish serializes the newest content", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("production"),
    "A delayed API response requires the installed fixture.",
  );
  const { read } = await setup(page, true, "doc");
  const requests: {
    publish: boolean;
    content: { title: string; body: string };
  }[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/content", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    requests.push(route.request().postDataJSON());
    if (requests.length === 1) await gate;
    return route.continue();
  });
  await page.getByLabel("Title", { exact: true }).fill("First request title");
  await expect.poll(() => requests.length).toBe(1);
  await page.getByLabel("Title", { exact: true }).fill("Newest local title");
  await page.getByRole("tab", { name: "Markdown", exact: true }).click();
  const writing = page.getByRole("textbox", {
    name: "Doc content Markdown",
    exact: true,
  });
  await writing.fill(
    "The newest local Markdown survives the earlier response.",
  );
  await expect(writing).toBeEnabled();
  await page
    .getByRole("button", { name: "Publish changes", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Publish changes", exact: true }),
  ).toBeDisabled();
  expect(requests).toHaveLength(1);
  release();
  await expect
    .poll(async () => (await read(true)).body)
    .toContain("newest local Markdown");
  await expect(writing).toHaveValue(
    "The newest local Markdown survives the earlier response.",
  );
  expect((await read(true)).title).toBe("Newest local title");
  expect(requests.map((request) => request.publish)).toEqual([false, true]);
});

test("an assigned course stages a new version through autosaves and consumes it only on Publish", async ({
  page,
}, info) => {
  const installed = info.project.name.startsWith("production");
  const { read, before, data } = await setup(page, installed, "course");
  await page.getByRole("button", { name: /^Details/ }).click();
  const version = page.getByRole("checkbox", {
    name: "Publish a new version and start a new completion window",
  });
  await version.check();
  await page.getByRole("button", { name: /^Details/ }).click();
  await page.getByRole("tab", { name: "Markdown", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Lesson content Markdown", exact: true })
    .fill("A small inline lesson correction.");
  await expect
    .poll(async () => (await read()).lessons[0].body)
    .toBe("A small inline lesson correction.");
  expect((await read()).version).toBe(before.version);
  expect((await read()).assignments).toEqual(before.assignments);
  expect((await read(true)).lessons[0].body).toBe(before.lessons[0].body);
  await page.getByRole("button", { name: /^Details/ }).click();
  await expect(version).toBeChecked();
  await page.getByRole("button", { name: /^Details/ }).click();
  await page
    .getByRole("button", { name: "Publish changes", exact: true })
    .click();
  await expect
    .poll(async () => (await read(true)).version)
    .toBe(before.version + 1);
  await page.getByRole("button", { name: /^Details/ }).click();
  await expect(version).not.toBeChecked();
  if (!installed)
    expect(
      await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("fieldbook.workspace.v1")!).progress,
      ),
    ).toEqual(data.progress);
});
