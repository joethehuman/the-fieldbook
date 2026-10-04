import { replaceWritingText } from "./editor-helpers";
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
  await page.getByRole("link", { name: item.title, exact: true }).click();
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

test("Update corrections preserve freshness and the Publishing checkbox renews only the next explicit Publish", async ({ page }, info) => {
  const installed = info.project.name.startsWith("production");
  const { read, before } = await setup(page, installed, "brief");
  const feedDate = before.feedAt || before.updatedAt;
  const details = page.getByRole("button", { name: /^Details/ });
  const renewal = page.getByRole("checkbox", { name: "Bring this update to the top" });
  const publish = page.getByRole("button", { name: "Publish", exact: true });
  await details.click();
  await expect(renewal).not.toBeChecked();
  await page.screenshot({ path: info.outputPath("update-publishing.png"), fullPage: true });
  await details.click();
  await page.getByLabel("Title", { exact: true }).fill("A typo correction");
  await expect.poll(async () => (await read()).title).toBe("A typo correction");
  expect((await read(true)).title).toBe(before.title);
  await publish.click();
  await expect.poll(async () => (await read(true)).title).toBe("A typo correction");
  expect((await read(true)).feedAt).toBe(feedDate);
  await details.click();
  await renewal.check();
  await details.click();
  await page.getByLabel("Title", { exact: true }).fill("An intentional renewed update");
  await expect.poll(async () => (await read()).title).toBe("An intentional renewed update");
  expect((await read(true)).feedAt).toBe(feedDate);
  await details.click();
  await expect(renewal).toBeChecked();
  await details.click();
  await publish.click();
  await expect.poll(async () => (await read(true)).feedAt).not.toBe(feedDate);
  const renewedDate = (await read(true)).feedAt;
  await details.click();
  await expect(renewal).not.toBeChecked();
  await details.click();
  await page.getByLabel("Title", { exact: true }).fill("A later minor correction");
  await expect.poll(async () => (await read()).title).toBe("A later minor correction");
  await publish.click();
  await expect.poll(async () => (await read(true)).title).toBe("A later minor correction");
  expect((await read(true)).feedAt).toBe(renewedDate);
  if (installed) {
    await details.click();
    await renewal.check();
    await details.click();
    let publications = 0;
    await page.route("**/api/content", async (route) => {
      if (route.request().method() !== "POST" || !route.request().postDataJSON().publish) return route.continue();
      publications++;
      await route.fetch();
      await route.abort("failed");
    });
    await publish.click();
    await page.getByRole("button", { name: "Retry saving", exact: true }).click();
    await details.click();
    await expect(renewal).not.toBeChecked();
    expect(publications).toBe(1);
  }
});

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
      await expect(current.getByRole("button", { name: "Publish", exact: true })).toBeDisabled();
      const details = await openContentSettings(current);
      await expect(current.getByRole("button", { name: "Draft recovery", exact: true })).toHaveCount(0);
      await details.getByRole("button", { name: "Revert to published version", exact: true }).click();
      await current.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(current.getByLabel("Title", { exact: true })).toHaveValue("");
      await details.getByRole("button", { name: "Revert to published version", exact: true }).click();
      await current.getByRole("button", { name: "Confirm", exact: true }).click();
      await expect.poll(async () => (await read()).title).toBe(before.title);
      await expect(current.getByLabel("Title", { exact: true })).toHaveValue(before.title);
      await expect(details.getByRole("button", { name: "Revert to published version", exact: true })).toBeDisabled();
      expect((await read(true)).title).toBe(before.title);
      expect((await read()).version).toBe(before.version);
      if (kind === "course") expect((await read()).assignments).toEqual(before.assignments);
      await current.screenshot({ path: info.outputPath(`published-revert-${kind}.png`) });
      await current.getByLabel("Title", { exact: true }).fill("");
      await expect.poll(async () => (await read()).title).toBe("");
      await expect(details.getByRole("button", { name: "Add a title", exact: true })).toBeEnabled();
      await current.getByLabel("Title", { exact: true }).fill(before.title);
      await expect(
        current.getByRole("button", { name: "Published", exact: true }),
      ).toBeDisabled();
      await current
        .getByLabel("Title", { exact: true })
        .fill("Explicitly published latest title");
      await current
        .getByRole("button", { name: "Publish", exact: true })
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

for (const lostResponse of [false, true])
  test(`retry saves newer open edits after ${lostResponse ? "a committed save with a lost response" : "a rejected save"}`, async ({ page }, info) => {
    test.skip(!info.project.name.startsWith("production"), "Synthetic API failure requires installed mode.");
    const { read } = await setup(page, true, "doc");
    let writes = 0;
    await page.route("**/api/content", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      writes++;
      if (writes !== 1) return route.fallback();
      if (lostResponse) {
        await route.fetch();
        return route.abort();
      }
      return route.fulfill({ status: 503, json: { error: "Temporary save failure" } });
    });
    await page.getByLabel("Title", { exact: true }).fill("First attempt");
    await expect(page.locator(".editor-heading [role=status]")).toHaveText("Changes not saved");
    await page.getByLabel("Title", { exact: true }).fill("Newest open edits");
    await page.waitForTimeout(1000);
    expect(writes).toBe(1);
    await page.screenshot({ path: info.outputPath(`save-failure-${lostResponse}.png`) });
    await page.getByRole("button", { name: "Retry saving", exact: true }).click();
    await expect(page.locator(".editor-heading [role=status]")).toHaveText("Saved");
    expect((await read()).title).toBe("Newest open edits");
    expect((await read(true)).title).toBe("Autosave fixture");
    expect(writes).toBe(2);
    await expect(page.getByRole("button", { name: "Download your changes" })).toHaveCount(0);
  });

test("conflicting retry keeps open edits and requires a confirmed saved-draft reload", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("production"), "Synthetic conflict requires installed mode.");
  const { read, before } = await setup(page, true, "doc");
  let writes = 0;
  await page.route("**/api/content", async (route) => {
    if (route.request().method() !== "POST") return route.fallback();
    writes++;
    return route.fulfill({ status: 409, json: { error: "Another author changed this draft" } });
  });
  await page.getByLabel("Title", { exact: true }).fill("Keep my open work");
  await expect(page.locator(".editor-heading [role=status]")).toHaveText("Changes not saved");
  await page.route("**/api/content?*draft=true*", route => route.fulfill({ json: { ...before, title: "Other author's work", revision: 2 } }));
  await page.getByRole("button", { name: "Retry saving", exact: true }).click();
  await expect(page.locator("form.editor [role=alert]")).toContainText("another session");
  expect(writes).toBe(1);
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Keep my open work");
  await page.getByRole("button", { name: "Load saved draft", exact: true }).click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Keep my open work");
  await page.getByRole("button", { name: "Load saved draft", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Other author's work");
  expect(writes).toBe(1);
  expect((await read(true)).title).toBe(before.title);
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
  const writing = page.getByRole("textbox", {
    name: "Doc content",
    exact: true,
  });
  await writing.fill(
    "The newest local Markdown survives the earlier response.",
  );
  await expect(writing).toBeEnabled();
  await page
    .getByRole("button", { name: "Publish", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Publish", exact: true }),
  ).toBeDisabled();
  expect(requests).toHaveLength(1);
  release();
  await expect
    .poll(async () => (await read(true)).body)
    .toContain("newest local Markdown");
  await expect(writing).toHaveText(
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
  await replaceWritingText(page, "A small inline lesson correction.");
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
    .getByRole("button", { name: "Publish", exact: true })
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
