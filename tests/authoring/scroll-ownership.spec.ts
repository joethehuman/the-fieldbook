import { replaceWritingText } from "./editor-helpers";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import { withPublishedSnapshots } from "../../lib/demo-publication";
import { authoringUser, setupAuthoringProvider } from "./provider-fixture";
import { openContentSettings } from "./editor-helpers";

function fixture() {
  const data = freshWorkspace();
  const course = data.content.find((item) => item.kind === "course")!;
  course.id = "00000000-0000-4000-8000-000000000101";
  course.title = "Scrolling course";
  course.groups = [];
  course.assignments = [];
  course.lessons = Array.from({ length: 40 }, (_, i) => ({
    ...course.lessons[0], id: `lesson-${i}`, title: `Lesson ${String(i + 1).padStart(2, "0")}`,
    body: i === 0 ? "A short lesson that fits the writing pane."
      : Array.from({ length: 60 }, (_, j) => `Paragraph ${j + 1}. Longer authoring content.`).join("\n\n"),
  }));
  course.questions = Array.from({ length: 8 }, (_, i) => ({ ...course.questions[0], id: `question-${i}` }));
  const doc = data.content.find((item) => item.kind === "doc")!;
  data.content = [
    course,
    ...Array.from({ length: 40 }, (_, i) => ({
      ...doc,
      id: `00000000-0000-4000-8000-000000000${String(200 + i)}`,
      title: `Scrolling guide ${String(i).padStart(2, "0")}`,
      sectionId: "scrolling",
      body: Array.from(
        { length: 50 },
        (_, j) =>
          `## Section ${j + 1}\n\nA maintained reference paragraph with enough content to scroll.\n`,
      ).join("\n"),
    })),
  ];
  data.groups = Array.from({ length: 40 }, (_, i) => ({
    id: `group-${i}`,
    name: `Audience ${String(i).padStart(2, "0")}`,
    learningItems: [],
  }));
  data.teams = [
    { id: "org", name: "Organization", system: "organization" },
    ...Array.from({ length: 40 }, (_, i) => ({
      id: `team-${i}`,
      name: `Branch ${String(i).padStart(2, "0")}`,
      parentId: "org",
    })),
  ];
  data.settings = {
    ...data.settings!,
    organizationTeamId: "org",
    docSections: [{ id: "scrolling", name: "Scrolling references" }],
  };
  const learner = data.users.find((person) => person.role === "learner")!;
  data.users.push(
    ...Array.from({ length: 30 }, (_, i) => ({
      ...learner,
      id: `person-${i}`,
      name: `Person ${String(i).padStart(2, "0")}`,
      email: `person-${i}@example.test`,
      groups: [],
      teamId: undefined,
    })),
  );
  data.progress = {};
  return withPublishedSnapshots(data);
}

async function setup(page: Page, installed: boolean) {
  const data = fixture();
  await page.emulateMedia({ reducedMotion: "reduce" });
  if (installed) {
    await setupAuthoringProvider(page, data);
    await page.route("**/api/admin/snapshot?**", (route) =>
      route.fulfill({ json: { data, user: authoringUser } }),
    );
  } else {
    await page.addInitScript((workspace) => {
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
    }, data);
  }
  await page.goto(installed ? "/admin" : "/#admin");
  await expect(page.locator(".admin-layout")).toBeVisible();
}

async function section(page: Page, name: string) {
  const mobile = page.getByRole("combobox", {
    name: "Administration section",
    exact: true,
  });
  if (await mobile.isVisible()) {
    await mobile.click();
    await page.getByRole("option", { name, exact: true }).click();
  } else await page.getByRole("tab", { name, exact: true }).click();
}

async function wheel(page: Page, target: Locator, delta: number) {
  const point = await target.evaluate((el) => {
    let box = el.getBoundingClientRect();
    let top = Math.max(0, box.top),
      bottom = Math.min(innerHeight, box.bottom);
    for (let parent = el.parentElement; parent; parent = parent.parentElement) {
      if (
        parent !== document.body &&
        parent !== document.documentElement &&
        /auto|scroll|hidden|clip/.test(getComputedStyle(parent).overflowY)
      ) {
        box = parent.getBoundingClientRect();
        top = Math.max(top, box.top);
        bottom = Math.min(bottom, box.bottom);
      }
    }
    if (bottom - top < 4)
      throw new Error("Scroll target has no visible input surface");
    box = el.getBoundingClientRect();
    return { x: box.left + box.width / 2, y: (top + bottom) / 2 };
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(0, delta);
  // Wheel input is delivered asynchronously by the browser compositor.
  await page.waitForTimeout(150);
}

async function contained(page: Page, target: Locator, anchors: Locator[] = []) {
  await expect
    .poll(() => target.evaluate((el) => el.scrollHeight - el.clientHeight))
    .toBeGreaterThan(4);
  await target.evaluate((el) => {
    el.scrollTop = 0;
  });
  await wheel(page, target, 80);
  await expect
    .poll(() => target.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  for (const end of [true, false]) {
    await target.evaluate((el, end) => {
      el.scrollTop = end ? el.scrollHeight : 0;
    }, end);
    const parents = () =>
      target.evaluate((el) => {
        const positions: number[] = [];
        for (
          let parent = el.parentElement;
          parent;
          parent = parent.parentElement
        )
          positions.push(parent.scrollTop);
        return positions;
      });
    const before = await parents();
    const boxes = await Promise.all(
      anchors.map((anchor) => anchor.boundingBox()),
    );
    await wheel(page, target, end ? 400 : -400);
    expect(await parents()).toEqual(before);
    expect(
      await Promise.all(anchors.map((anchor) => anchor.boundingBox())),
    ).toEqual(boxes);
  }
}

test("Docs tree contains both edges while the short sidebar remains directly scrollable", async ({
  page,
}, info) => {
  const installed = info.project.name.startsWith("production");
  await page.setViewportSize({ width: 1280, height: 480 });
  await setup(page, installed);
  await page.goto(
    installed
      ? "/docs/00000000-0000-4000-8000-000000000200"
      : "/#docs/00000000-0000-4000-8000-000000000200",
  );
  const sidebar = page.locator(".sidebar");
  const tree = sidebar.locator(".document-tree");
  await expect(tree).toBeVisible();
  await expect
    .poll(() => sidebar.evaluate((el) => el.scrollHeight - el.clientHeight))
    .toBeGreaterThan(0);
  await sidebar.evaluate((el) => {
    el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
  });
  await contained(page, tree, [
    sidebar.getByRole("button", { name: "Account menu", exact: true }),
  ]);
  await sidebar.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  await expect
    .poll(() => sidebar.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await page.screenshot({ path: info.outputPath("docs-short-contained.png") });
});

test("editor Details and reader outlines contain native wheel input", async ({
  page,
}, info) => {
  const installed = info.project.name.startsWith("production");
  await page.setViewportSize({ width: 1280, height: 800 });
  await setup(page, installed);
  await page
    .getByRole("searchbox", { name: "Search content", exact: true })
    .fill("Scrolling course");
  const row = page.getByRole("row").filter({ hasText: "Scrolling course" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await openContentSettings(page);
  const main = page.locator(".main-content");
  await expect(page.locator(".editor")).toHaveAttribute("data-scroll-layout", "workspace");
  await expect.poll(() => main.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  await contained(page, page.locator(".editor-frame-details"), [
    page.locator(".topbar"), page.getByRole("textbox", { name: "Title", exact: true }),
  ]);
  await page.locator(".editor-frame-details").evaluate((el) => { el.scrollTop = el.scrollHeight; });
  const last = page.getByRole("button", { name: "Revert to published version", exact: true });
  expect(await last.evaluate((el) => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(page.viewportSize()!.height);
  await page.screenshot({
    path: info.outputPath("editor-details-contained.png"),
  });
  // Exercise the wide outline without reducing the centered article's measure.
  await page.setViewportSize({ width: 1600, height: 900 });
  await page.goto(
    installed
      ? "/docs/00000000-0000-4000-8000-000000000200"
      : "/#docs/00000000-0000-4000-8000-000000000200",
  );
  const outline = page.locator(".reading-outline nav:visible");
  await expect(outline).toBeVisible();
  await contained(page, outline, [page.locator(".topbar")]);
});

test("complete editor fits at its starting position and each overflowing pane remains usable", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await setup(page, info.project.name.startsWith("production"));
  await page.getByRole("searchbox", { name: "Search content", exact: true }).fill("Scrolling course");
  await page.getByRole("row").filter({ hasText: "Scrolling course" }).getByRole("button", { name: "Edit", exact: true }).click();
  const main = page.locator(".main-content");
  const title = page.getByRole("textbox", { name: "Title", exact: true });
  const controls = page.locator(".editor-frame-controls");
  const writing = page.getByRole("textbox", { name: "Lesson content", exact: true });
  await expect(writing).toBeVisible();
  await expect(page.locator(".editor")).toHaveAttribute("data-scroll-layout", "workspace");
  await expect.poll(() => main.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  await expect.poll(() => page.locator(".writing-scroll-area").evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  await wheel(page, page.locator(".writing-scroll-area"), 700);
  expect(await main.evaluate((el) => el.scrollTop)).toBe(0);

  // An actual enabled last action must be reachable without first scrolling the page.
  await writing.click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" An unpublished edit.");
  const details = await openContentSettings(page);
  await contained(page, details, [title, controls]);
  await details.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  const revert = details.getByRole("button", { name: "Revert to published version", exact: true });
  await expect(revert).toBeEnabled();
  expect(await revert.evaluate((el) => el.getBoundingClientRect().bottom)).toBeLessThanOrEqual(page.viewportSize()!.height);
  await revert.click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await main.evaluate((el) => el.scrollTop)).toBe(0);
  await page.screenshot({ path: info.outputPath("editor-start-complete-details.png") });

  await replaceWritingText(page, Array.from({ length: 60 }, (_, i) => `Paragraph ${i + 1}. Long writing content.`).join("\n\n"));
  await contained(page, page.locator(".writing-scroll-area"), [title, controls, page.locator(".mdxeditor-toolbar")]);
  const instance = await writing.elementHandle();
  await page.getByRole("button", { name: /^Outline/ }).click();
  expect(await instance!.evaluate((el) => el.isConnected)).toBe(true);
  const outline = page.locator(".editor-frame-outline");
  await contained(page, outline, [title, controls]);
  await outline.getByRole("button", { name: "Quiz", exact: true }).click();
  const quiz = page.locator(".editor-frame-canvas");
  await contained(page, quiz, [title, controls]);
  await quiz.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await page.getByRole("button", { name: "Add question", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Question 9", exact: true })).toBeVisible();
  expect(await main.evaluate((el) => el.scrollTop)).toBe(0);
  await page.screenshot({ path: info.outputPath("editor-quiz-contained.png") });
  await outline.getByRole("button", { name: "2 Lesson 02", exact: true }).click();
  await expect(writing).toBeVisible();
  await expect.poll(() => page.locator(".writing-scroll-area").evaluate((el) => el.scrollTop)).toBe(0);
  await page.setViewportSize({ width: 1440, height: 600 });
  await expect(page.locator(".editor")).toHaveAttribute("data-scroll-layout", "workspace");
  await expect.poll(() => main.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
  await page.setViewportSize({ width: 1440, height: 420 });
  await expect(page.locator(".editor")).toHaveAttribute("data-scroll-layout", "page");
  await writing.locator("p").first().click();
  await page.keyboard.type("Reachable on a short screen. ");
  await expect(writing).toContainText("Reachable on a short screen.");
});

test("audience search and actions stay visible through long, one and zero choices", async ({
  page,
}, info) => {
  await setup(page, info.project.name.startsWith("production"));
  await page
    .getByRole("searchbox", { name: "Search content", exact: true })
    .fill("Scrolling course");
  const row = page.getByRole("row").filter({ hasText: "Scrolling course" });
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  const details = await openContentSettings(page);
  await details
    .getByRole("button", { name: /^(?:Assign audience|Edit Audience|Edit audience)$/, exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Course audience",
    exact: true,
  });
  const search = dialog.getByRole("searchbox", {
    name: "Find a team or group",
    exact: true,
  });
  const results = dialog.locator('[aria-label="Audience choices"]');
  const footer = dialog.locator('[data-slot="dialog-footer"]');
  await contained(page, results, [search, footer]);
  const bounds = await results.boundingBox();
  await search.fill("Audience 39");
  await expect(
    dialog.getByRole("checkbox", { name: /Assign directly/ }),
  ).toHaveCount(1);
  expect(await results.boundingBox()).toEqual(bounds);
  await search.fill("no such audience");
  await expect(dialog.getByText("No matching teams or groups.")).toBeVisible();
  expect(await results.boundingBox()).toEqual(bounds);
  await search.clear();
  await dialog
    .getByRole("radio", { name: "Organization", exact: true })
    .check();
  await expect(dialog.getByText(/All \d+ registered people/)).toBeVisible();
  await dialog
    .getByRole("radio", { name: "Specific teams or groups", exact: true })
    .check();
  await expect(search).toBeVisible();
  await page.screenshot({ path: info.outputPath("audience-contained.png") });
});

test("membership picker results scroll independently and retain search across tabs", async ({
  page,
}, info) => {
  await setup(page, info.project.name.startsWith("production"));
  await section(page, "Groups");
  await page.getByRole("button", { name: "Audience 00", exact: true }).click();
  await page.getByRole("button", { name: "Add Members", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const search = dialog.getByRole("searchbox", {
    name: "Find a person",
    exact: true,
  });
  await contained(page, dialog.locator('[data-slot="selection-results"]'), [
    search,
    dialog.locator('[data-slot="dialog-footer"]'),
  ]);
  await search.fill("Person 29");
  await expect(
    dialog.getByRole("checkbox", { name: /Person 29/ }),
  ).toBeVisible();
  await dialog.getByRole("tab", { name: "Teams", exact: true }).click();
  await contained(page, dialog.locator('[data-slot="selection-results"]'), [
    dialog.getByRole("searchbox", { name: "Find a team", exact: true }),
    dialog.locator('[data-slot="dialog-footer"]'),
  ]);
  await page.screenshot({ path: info.outputPath("membership-contained.png") });
});

test("short-screen parent popup fits and keeps search visible at both ends", async ({
  page,
}, info) => {
  await page.setViewportSize({
    width: info.project.name.endsWith("phone") ? 375 : 1280,
    height: 480,
  });
  await setup(page, info.project.name.startsWith("production"));
  await section(page, "Teams");
  await page.getByRole("button", { name: "Add team", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "New team", exact: true });
  const trigger = dialog
    .locator('[data-slot="hierarchy-picker"]')
    .getByRole("button");
  await trigger.click();
  const search = page.getByRole("combobox", {
    name: "Find a parent team",
    exact: true,
  });
  const popup = page.locator('[data-slot="popover-content"]');
  await expect(search).toBeFocused();
  const bounds = (await popup.boundingBox())!;
  expect(bounds.y).toBeGreaterThanOrEqual(11);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(469);
  await contained(
    page,
    page.getByRole("listbox", { name: "Find a parent team", exact: true }),
    [search, dialog],
  );
  await search.fill("Branch 39");
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveText("Branch 39");
  await expect(trigger).toBeFocused();
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await page.screenshot({ path: info.outputPath("parent-popup-short.png") });
});

test("Feedback remains a small dialog on desktop and phone", async ({
  page,
}, info) => {
  await setup(page, info.project.name.startsWith("production"));
  const navigation = page.getByRole("button", {
    name: "Open navigation",
    exact: true,
  });
  if (await navigation.isVisible()) await navigation.click();
  await page.getByRole("button", { name: "Account menu", exact: true }).click();
  await page.getByRole("menuitem", { name: /Feedback/ }).click();
  const dialog = page.getByRole("dialog", {
    name: "Share feedback",
    exact: true,
  });
  await expect(dialog).toBeVisible();
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.width).toBeLessThanOrEqual(450);
  expect(bounds.height).toBeLessThan(380);
  await page.screenshot({ path: info.outputPath("feedback-compact.png") });
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("short and enlarged membership layouts retain usable content and reachable actions", async ({
  page,
}, info) => {
  await setup(page, info.project.name.startsWith("production"));
  await section(page, "Groups");
  await page.getByRole("button", { name: "Audience 00", exact: true }).click();
  await page.getByRole("button", { name: "Add Members", exact: true }).click();
  const dialog = page.getByRole("dialog");
  for (const size of [
    { width: 1280, height: 480, fontSize: 20 },
    { width: 375, height: 480, fontSize: 20 },
    { width: 1280, height: 480, fontSize: 32 },
    { width: 375, height: 480, fontSize: 32 },
  ]) {
    await page.setViewportSize(size);
    await page.evaluate((fontSize) => {
      document.documentElement.style.fontSize = `${fontSize}px`;
    }, size.fontSize);
    const body = dialog.locator('[data-slot="dialog-body"]');
    const footer = dialog.locator('[data-slot="dialog-footer"]');
    expect(await body.evaluate((el) => el.clientHeight)).toBeGreaterThanOrEqual(
      size.fontSize * 6 - 1,
    );
    if (size.fontSize === 32) {
      expect(
        await dialog.evaluate((el) => el.scrollHeight - el.clientHeight),
      ).toBeGreaterThan(0);
      await body.scrollIntoViewIfNeeded();
      await expect(body).toBeInViewport({ ratio: 0.5 });
      await footer.scrollIntoViewIfNeeded();
      await expect(footer).toBeInViewport({ ratio: 0.8 });
    }
    const caption = dialog.getByText(/^\d+ teams · \d+ individually added/);
    const finalControl = dialog
      .locator('[data-slot="field-group"]:visible')
      .locator(":scope > *")
      .last();
    const controlBox = (await finalControl.boundingBox())!;
    const captionBox = (await caption.boundingBox())!;
    expect(controlBox.y + controlBox.height).toBeLessThanOrEqual(
      captionBox.y + 1,
    );
    const footerBox = await footer.boundingBox();
    await body.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    expect(await footer.boundingBox()).toEqual(footerBox);
    const search = dialog.getByRole("searchbox", {
      name: "Find a person",
      exact: true,
    });
    await search.fill("Person 29");
    const choice = dialog.getByRole("checkbox", { name: /Person 29/ });
    await choice.check();
    await expect(choice).toBeChecked();
    await dialog
      .getByRole("button", { name: "Clear selection", exact: true })
      .click();
    await search.clear();
    await page.screenshot({
      path: info.outputPath(
        `membership-short-enlarged-${size.width}-${size.fontSize}.png`,
      ),
    });
  }
});

test("short reporting search contains results while discovery and More remain stationary", async ({
  page,
}, info) => {
  test.skip(info.project.name.startsWith("production"), "Catalog is demo-only");
  for (const width of [1280, 375]) {
    await page.setViewportSize({ width, height: 480 });
    await page.goto("/ui#catalog-progress");
    // Reset the catalog's paging state before the next viewport scenario.
    await page.reload();
    const search = page.getByRole("combobox", {
      name: "Search teams or people",
      exact: true,
    });
    await search.click();
    const results = page.getByRole("listbox", {
      name: "Search results",
      exact: true,
    });
    const more = page.getByRole("button", {
      name: "More people (14)",
      exact: true,
    });
    await expect(more).toBeVisible();
    const popup = page.locator("[data-slot=popover-content]");
    const bounds = await popup.boundingBox();
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(480);
    await contained(page, results, [search, more]);
    await more.click();
    await expect(
      results
        .getByRole("group", { name: "People", exact: true })
        .getByRole("option"),
    ).toHaveCount(12);
    await search.fill("Example person 10");
    await expect(results.getByRole("option")).toHaveCount(1);
    await page.keyboard.press("Enter");
    await expect(results).toBeHidden();
    await expect(search).toBeFocused();
  }
});

test("compact catalog pickers preserve natural dimensions and contain long results", async ({
  page,
}, info) => {
  test.skip(
    info.project.name.startsWith("production"),
    "The component catalog belongs to the demo.",
  );
  await page.goto("/ui#scrolling-pickers");
  await page
    .getByRole("button", { name: "Choose three teams", exact: true })
    .click();
  let dialog = page.getByRole("dialog", {
    name: "Choose three teams",
    exact: true,
  });
  const small = (await dialog.boundingBox())!;
  expect(small.height).toBeLessThan(650);
  expect(small.width).toBeLessThanOrEqual(514);
  await page.screenshot({ path: info.outputPath("picker-three-compact.png") });
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("button", { name: "Choose forty teams", exact: true })
    .click();
  dialog = page.getByRole("dialog", {
    name: "Choose forty teams",
    exact: true,
  });
  await contained(page, dialog.locator('[data-slot="selection-results"]'), [
    dialog.getByRole("searchbox"),
    dialog.locator('[data-slot="dialog-footer"]'),
  ]);
  await page.screenshot({
    path: info.outputPath("picker-forty-contained.png"),
  });
});
