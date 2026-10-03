import { test, expect, type Locator } from "@playwright/test";

async function fullFocusRing(control: Locator) {
  await control.scrollIntoViewIfNeeded();
  await control.focus();
  await expect(control).toBeFocused();
  const clipped = await control.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const failures: string[] = [];
    // Shared Input/Button use a two-pixel ring plus a two-pixel offset.
    for (
      let parent = element.parentElement;
      parent;
      parent = parent.parentElement
    ) {
      const style = getComputedStyle(parent);
      if (!/(auto|scroll|hidden|clip)/.test(style.overflowX)) continue;
      const box = parent.getBoundingClientRect();
      const left = box.left + parent.clientLeft;
      const right = left + parent.clientWidth;
      if (bounds.left - 4 < left - 0.5 || bounds.right + 4 > right + 0.5)
        failures.push(parent.className || parent.tagName);
    }
    return failures;
  });
  expect(clipped).toEqual([]);
}

for (const role of ["admin", "contributor", "manager"]) {
  test(`outer focus rings fit the shared ${role} scroll surface`, async ({
    page,
  }, info) => {
    await page.addInitScript(
      (profile) => sessionStorage.setItem("fieldbook.profile.v1", profile),
      `demo-${role}`,
    );
    await page.goto(role === "manager" ? "/#team" : "/#admin");
    const search =
      role === "manager"
        ? page.getByRole("combobox", {
            name: "Search teams or people",
            exact: true,
          })
        : page.getByRole("searchbox", { name: "Search content", exact: true });
    await fullFocusRing(search);
    await page.keyboard.press("Escape");
    await expect(search).toBeFocused();
    await page.screenshot({ path: info.outputPath(`${role}-focus-ring.png`) });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  });
}
