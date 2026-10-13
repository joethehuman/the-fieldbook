import { test, expect } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import { setupAuthoringProvider } from "./provider-fixture";
import { openContentSettings, closeContentSettings } from "./editor-helpers";

for (const publishedRule of [false, true, undefined]) {
  test(`published completion rule ${publishedRule ?? "legacy"} permits corrections and requires a new version only for rule changes`, async ({
    page,
  }, info) => {
    test.skip(
      !info.project.name.startsWith("production"),
      "Exercises the installed content-summary projection.",
    );
    const data = withPublishedSnapshots(freshWorkspace());
    const course = {
      ...data.content.find((item) => item.kind === "course")!,
      id: "00000000-0000-4000-8000-000000000103",
      title: "Course publication fixture",
      summary: "A course for checking publication rules.",
      revision: 1,
      publishedRevision: 1,
      requirePassing: publishedRule,
      groups: [],
      assignments: [],
      lessons: [
        { id: "lesson", title: "Lesson", body: "Original lesson text." },
      ],
      questions: [
        {
          id: "question",
          prompt: "Which answer is correct?",
          options: ["First", "Second"],
          answer: 0,
        },
      ],
      coverImageUrl: undefined,
      cardArt: undefined,
    };
    data.content = [course];
    data.publishedContent = [structuredClone(course)];
    await setupAuthoringProvider(page, data);
    const read = async (draft = false) =>
      (
        await page.request.get(
          `/api/content?id=${course.id}${draft ? "&draft=true" : ""}`,
        )
      ).json();
    const warning = page.getByText(
      "Publish a new version for the changed completion rule",
      { exact: true },
    );
    const publish = page.getByRole("button", { name: "Publish", exact: true });
    await page.goto(`/admin/content/${course.id}/edit`);
    await page
      .getByRole("textbox", { name: "Lesson content", exact: true })
      .fill("A minor lesson correction.");
    await expect
      .poll(async () => (await read(true)).lessons[0].body)
      .toBe("A minor lesson correction.");
    await expect(warning).toHaveCount(0);
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect
      .poll(async () => (await read()).lessons[0].body)
      .toBe("A minor lesson correction.");
    expect((await read()).version).toBe(course.version);
    expect((await read()).requirePassing ?? true).toBe(publishedRule ?? true);

    // Reload so the real lightweight server projection supplies the baseline.
    await page.reload();
    await openContentSettings(page);
    const rule = page.getByRole("checkbox", {
      name: "Require all answers correct to complete",
      exact: true,
    });
    await rule.setChecked(!(publishedRule ?? true));
    await expect
      .poll(async () => (await read(true)).requirePassing)
      .toBe(!(publishedRule ?? true));
    await expect(warning).toBeVisible();
    await expect(publish).toBeDisabled();
    expect((await read()).requirePassing ?? true).toBe(publishedRule ?? true);
    await page
      .getByRole("checkbox", {
        name: "Publish new version and reassign to audiences.",
        exact: true,
      })
      .check();
    await closeContentSettings(page);
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect
      .poll(async () => (await read()).version)
      .toBe(course.version + 1);
    expect((await read()).requirePassing).toBe(!(publishedRule ?? true));
    await page.reload();
    await expect(
      page.getByRole("textbox", { name: "Lesson content", exact: true }),
    ).toBeVisible();
    await expect(warning).toHaveCount(0);
  });
}
