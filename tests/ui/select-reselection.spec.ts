import { test, expect, type Locator } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";

test.use({ hasTouch: true });

async function touch(item: Locator, phase: "tap" | "scroll" | "cancel") {
  const box = (await item.boundingBox())!;
  const start = {
    identifier: 1,
    clientX: box.x + 20,
    clientY: box.y + box.height / 2,
  };
  await item.dispatchEvent("touchstart", {
    touches: [start],
    changedTouches: [start],
  });
  if (phase === "cancel") {
    await item.dispatchEvent("touchcancel", {
      touches: [],
      changedTouches: [start],
    });
  } else {
    const end =
      phase === "scroll" ? { ...start, clientY: start.clientY - 30 } : start;
    if (phase === "scroll")
      await item.dispatchEvent("touchmove", {
        touches: [end],
        changedTouches: [end],
      });
    await item.dispatchEvent("touchend", {
      touches: [],
      changedTouches: [end],
    });
  }
}

test("the current option dismisses on a completed click after mouse highlighting", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("fieldbook.profile.v1", "demo-learner"),
  );
  await page.goto("/#courses");
  const trigger = page.getByRole("combobox", {
    name: "Sort courses",
    exact: true,
  });
  await trigger.click();
  const selected = page.locator(
    '[data-slot="select-item"][data-state="checked"]',
  );
  await selected.hover();
  // A browser or assistive activation can deliver click without a mouse pointerup.
  await selected.dispatchEvent("click", { button: 0, detail: 1 });
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
});

test("a completed touch on the current option dismisses without waiting for a compatibility click", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "phone", "Touch interaction.");
  await page.addInitScript(() =>
    sessionStorage.setItem("fieldbook.profile.v1", "demo-learner"),
  );
  await page.goto("/#courses");
  const trigger = page.getByRole("combobox", {
    name: "Sort courses",
    exact: true,
  });
  await trigger.tap();
  const selected = page.locator(
    '[data-slot="select-item"][data-state="checked"]',
  );
  await touch(selected, "tap");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
});

test("single-choice dropdowns dismiss when the current value is activated throughout the app", async ({
  page,
}, info) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin"),
  );
  for (const [route, label] of [
    ["/#courses", "Sort courses"],
    ["/#courses/yours", "Sort courses"],
    ["/#admin/content", "Sort content"],
    ["/#admin/feedback", "Sort feedback"],
    ...(info.project.name === "phone"
      ? [["/#admin/content", "Administration section"]]
      : []),
  ]) {
    await page.goto(route);
    const trigger = page.getByRole("combobox", { name: label, exact: true });
    await expect(trigger).toBeVisible();
    const value = await trigger.textContent();
    if (info.project.name === "phone") await trigger.tap();
    else await trigger.click();
    const selected = page.locator(
      '[data-slot="select-item"][data-state="checked"]',
    );
    await expect(selected).toBeVisible();
    if (info.project.name === "phone") await selected.tap();
    else await selected.click();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(trigger).toHaveText(value!);
    await expect(trigger).toBeFocused();
    await expect(page).toHaveURL(
      new RegExp(route.slice(1).replaceAll("/", "\\/")),
    );
  }
  await page.screenshot({ path: info.outputPath("dropdown-dismissed.png") });
});

test("default and controlled dropdowns keep values, callbacks and keyboard behavior on reselection", async ({
  page,
}) => {
  await page.goto("/ui#control-pilot");
  const changes = page.getByRole("status", {
    name: "Dropdown changes",
    exact: true,
  });
  for (const label of ["Default choice", "Controlled choice"]) {
    const trigger = page.getByRole("combobox", { name: label, exact: true });
    for (const input of ["mouse", "touch", "Enter", "Space"]) {
      await trigger.click();
      const current = page.getByRole("option", {
        name: "First choice",
        exact: true,
      });
      if (input === "mouse") await current.click();
      else if (input === "touch") await current.tap();
      else await current.press(input);
      await expect(trigger).toHaveAttribute("aria-expanded", "false");
      await expect(trigger).toBeFocused();
      await expect(trigger).toHaveText("First choice");
      await expect(changes).toContainText("0 value changes");
    }
  }
  for (const [index, label] of [
    "Default choice",
    "Controlled choice",
  ].entries()) {
    const trigger = page.getByRole("combobox", { name: label, exact: true });
    await trigger.tap();
    await page
      .getByRole("option", { name: "Second choice", exact: true })
      .tap();
    await expect(trigger).toHaveText("Second choice");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(changes).toContainText(`${index + 1} value changes`);
    await trigger.tap();
    await page
      .getByRole("option", { name: "Second choice", exact: true })
      .tap();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(changes).toContainText(`${index + 1} value changes`);
  }
});

test("scrolling, cancelled touches and disabled options do not dismiss or change a dropdown", async ({
  page,
}) => {
  await page.goto("/ui#control-pilot");
  const trigger = page.getByRole("combobox", {
    name: "Default choice",
    exact: true,
  });
  await trigger.tap();
  const current = page.getByRole("option", {
    name: "First choice",
    exact: true,
  });
  await touch(current, "scroll");
  await expect(page.getByRole("listbox")).toBeVisible();
  await touch(current, "cancel");
  await expect(page.getByRole("listbox")).toBeVisible();
  const disabled = page.getByRole("option", {
    name: "Unavailable choice",
    exact: true,
  });
  await disabled.dispatchEvent("click");
  await touch(disabled, "tap");
  await expect(page.getByRole("listbox")).toBeVisible();
  await current.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveText("First choice");
  await expect(
    page.getByRole("status", { name: "Dropdown changes", exact: true }),
  ).toContainText("0 value changes");
});

test("nested filter dropdowns dismiss on their current option and retain the filter panel", async ({
  page,
}) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin"),
  );
  await page.goto("/#admin/content");
  await page.getByRole("button", { name: "Filters", exact: true }).tap();
  const filters = page.locator(
    '[data-slot="popover-content"][aria-label="Collection filters"]',
  );
  for (const trigger of await filters.getByRole("combobox").all()) {
    const value = await trigger.textContent();
    await trigger.tap();
    await page.locator('[data-slot="select-item"][data-state="checked"]').tap();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(trigger).toHaveText(value!);
    await expect(filters).toBeVisible();
  }
});

test("searchable hierarchy pickers dismiss on the selected option", async ({
  page,
}) => {
  await page.goto("/ui#catalog-hierarchy-picker");
  const picker = page.locator(
    '#catalog-hierarchy-picker [data-slot="hierarchy-picker"]',
  );
  const trigger = picker.getByRole("button");
  await trigger.tap();
  await page.getByRole("option", { name: /Territory$/, exact: false }).tap();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toHaveText("Territory");
  await expect(trigger).toBeFocused();
});

test("editable category suggestions dismiss on the current category", async ({
  page,
}) => {
  const data = freshWorkspace();
  delete data.settings!.contentCategories;
  const item = data.content.find((item) => item.kind === "brief")!;
  await page.addInitScript((data) => {
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
  }, data);
  await page.goto("/#admin/content");
  await page.getByRole("link", { name: item.title, exact: true }).click();
  const input = page.getByPlaceholder("Choose or add category…", {
    exact: true,
  });
  if (!(await input.isVisible()))
    await page.getByRole("button", { name: "Details", exact: true }).click();
  await input.tap();
  await page.getByRole("option", { name: item.category, exact: true }).tap();
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await expect(input).toHaveValue(item.category);
  await expect(input).toBeFocused();
});
