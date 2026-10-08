import { expect, test, type Locator } from "@playwright/test";

async function sampleTransition(trigger: Locator) {
  return trigger.evaluate(async (button) => {
    const region = button.closest("#failure-messages")!;
    const neighbour = region.querySelector("[data-alert-neighbour]")!;
    const samples: {
      y: number;
      height: number;
      width: number;
      left: number;
    }[] = [];
    const sample = () => {
      const bounds = neighbour.getBoundingClientRect();
      const alert = region.querySelector('[data-slot="alert"]');
      samples.push({
        y: bounds.top - region.getBoundingClientRect().top,
        left: bounds.left,
        width: bounds.width,
        height: alert?.getBoundingClientRect().height || 0,
      });
    };
    sample();
    (button as HTMLButtonElement).click();
    const start = performance.now();
    while (performance.now() - start < 350) {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      sample();
    }
    return samples;
  });
}

test("server-rendered notices keep their space while hydrating", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/_next/**/*.js", async route => { await gate; await route.continue(); });
  await page.goto("/ui", { waitUntil: "domcontentloaded" });
  const alert = page.locator('#catalog-feedback [data-slot="alert"]').first();
  await alert.waitFor();
  await page.evaluate(() => document.fonts.ready);
  const initial = await alert.evaluate(node => node.getBoundingClientRect().height);
  const measurements = page.evaluate(async () => {
    const heights: number[] = [];
    const start = performance.now();
    while (performance.now() - start < 1200) {
      heights.push(document.querySelector('#catalog-feedback [data-slot="alert"]')!.getBoundingClientRect().height);
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    }
    return heights;
  });
  release();
  const heights = await measurements;
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(initial - 1);
  expect(Math.max(...heights)).toBeLessThanOrEqual(initial + 1);
});

test("failure messages animate space without horizontal reflow or a final jump", async ({
  page,
}, info) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/ui/writing");
  const region = page.locator("#failure-messages");
  await region.scrollIntoViewIfNeeded();
  const opening = await sampleTransition(
    region.getByRole("button", { name: "Show failure", exact: true }),
  );
  const full = opening.at(-1)!.height;
  expect(full).toBeGreaterThan(40);
  expect(
    opening.some((sample) => sample.height > 2 && sample.height < full - 2),
  ).toBe(true);
  const movement = opening.at(-1)!.y - opening[0].y;
  expect(movement).toBeGreaterThan(full);
  for (const sample of opening) {
    expect(Math.abs(sample.left - opening[0].left)).toBeLessThan(1);
    expect(Math.abs(sample.width - opening[0].width)).toBeLessThan(1);
  }
  await expect(region.getByRole("alert")).toContainText(
    "Your changes couldn’t be saved. Try again.",
  );
  await region.screenshot({ path: info.outputPath("failure-message.png") });
  const closing = await sampleTransition(
    region.getByRole("button", { name: "Dismiss message" }),
  );
  expect(closing.at(-1)!.height).toBe(0);
  expect(
    closing.some((sample) => sample.height > 2 && sample.height < full - 2),
  ).toBe(true);
  expect(Math.abs(closing.at(-1)!.y - opening[0].y)).toBeLessThan(1);
  // Once the animation reaches zero, removing the DOM node must not drop a gap.
  const lastVisible = closing.findLastIndex((sample) => sample.height > 0);
  expect(
    Math.abs(closing[lastVisible + 1].y - closing[lastVisible].y),
  ).toBeLessThan(3);
  await expect(region.getByRole("alert")).toHaveCount(0);
  await expect(
    region.getByRole("button", { name: "Retry example" }),
  ).toBeVisible();
});

test("dismissal stays dismissed on unrelated renders and a new failure returns", async ({
  page,
}, info) => {
  await page.goto("/ui/writing");
  const region = page.locator("#failure-messages");
  await region.getByRole("button", { name: "Long message" }).click();
  await region.getByRole("button", { name: "Show failure" }).click();
  const alert = region.getByRole("alert");
  await expect(alert).toContainText("Reference:");
  await expect
    .poll(() => alert.evaluate((node) => node.getAnimations().length))
    .toBe(0);
  const bounds = await alert.boundingBox();
  const closeBounds = await alert
    .getByRole("button", { name: "Dismiss message" })
    .boundingBox();
  expect(closeBounds!.x + closeBounds!.width).toBeLessThanOrEqual(
    bounds!.x + bounds!.width,
  );
  expect(
    await alert.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  await alert.screenshot({ path: info.outputPath("long-failure-message.png") });
  const dismiss = alert.getByRole("button", { name: "Dismiss message" });
  await dismiss.focus();
  await dismiss.press("Enter");
  await expect(alert).toHaveCount(0);
  await expect(
    region.getByRole("button", { name: "Show failure" }),
  ).toBeFocused();
  await region.getByRole("button", { name: /^Other action/ }).click();
  await expect(alert).toHaveCount(0);
  await region.getByRole("button", { name: "Retry example" }).click();
  await expect(alert).toBeVisible();
  await region.getByRole("button", { name: "Long message" }).click();
  await expect(alert).toHaveText(
    "Your changes couldn’t be saved. Try again.",
  );
});

test("reduced motion dismisses immediately", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/ui/writing");
  const region = page.locator("#failure-messages");
  await region.getByRole("button", { name: "Show failure" }).click();
  expect(
    await region
      .getByRole("alert")
      .evaluate((node) => node.getAnimations().length),
  ).toBe(0);
  await region.getByRole("button", { name: "Dismiss message" }).click();
  await expect(region.getByRole("alert")).toHaveCount(0);
});

test("long failures and close controls fit with enlarged text", async ({
  page,
}, info) => {
  await page.goto("/ui/writing");
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "200%";
  });
  const region = page.locator("#failure-messages");
  await region.getByRole("button", { name: "Long message" }).click();
  await region.getByRole("button", { name: "Show failure" }).click();
  const alert = region.getByRole("alert");
  await expect
    .poll(() => alert.evaluate((node) => node.getAnimations().length))
    .toBe(0);
  expect(
    await region.evaluate((node) => node.scrollWidth <= node.clientWidth),
  ).toBe(true);
  const geometry = await alert.evaluate((node) => {
    const close = node
      .querySelector('button[aria-label="Dismiss message"]')!
      .getBoundingClientRect();
    const bounds = node.getBoundingClientRect();
    return {
      right: close.right <= bounds.right,
      bottom: close.bottom <= bounds.bottom,
      overflow: node.scrollWidth - node.clientWidth,
    };
  });
  expect(geometry).toEqual({ right: true, bottom: true, overflow: 0 });
  await alert.screenshot({
    path: info.outputPath("enlarged-failure-message.png"),
  });
  await alert.getByRole("button", { name: "Dismiss message" }).click();
  await expect(alert).toHaveCount(0);
  await expect(
    region.getByRole("button", { name: "Retry example" }),
  ).toBeVisible();
});

test("quick dismissal reverses appearance without jumping to full height", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/ui/writing");
  const region = page.locator("#failure-messages");
  await region.getByRole("button", { name: "Show failure" }).click();
  const change = await region.evaluate((node) => {
    const alert = node.querySelector<HTMLElement>('[data-slot="alert"]')!;
    const opening = alert.getAnimations()[0];
    opening.pause();
    opening.currentTime = 20;
    const before = alert.getBoundingClientRect().height;
    alert
      .querySelector<HTMLButtonElement>('button[aria-label="Dismiss message"]')!
      .click();
    return { before, after: alert.getBoundingClientRect().height };
  });
  expect(change.before).toBeGreaterThan(0);
  expect(Math.abs(change.after - change.before)).toBeLessThan(1);
  await expect(region.getByRole("alert")).toHaveCount(0);
});

test("pasted-image failure dismisses without changing the draft and repeats", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Oliver Anderson/ }).click();
  await page.goto("/#admin/content");
  await page.getByRole("button", { name: "Doc", exact: true }).click();
  const writer = page
    .locator('.writing-content[contenteditable="true"]')
    .first();
  await writer.fill("Preserve this draft.");
  const paste = () =>
    writer.evaluate((node) => {
      const data = new DataTransfer();
      data.items.add(
        new File([new Uint8Array([137, 80, 78, 71])], "audit.png", {
          type: "image/png",
        }),
      );
      node.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    });
  await paste();
  const alert = page.locator(".writing-editor").getByRole("alert");
  await expect(alert).toHaveText("Uploads are unavailable in this view.");
  await alert.getByRole("button", { name: "Dismiss message" }).click();
  await expect(alert).toHaveCount(0);
  await expect(writer).toHaveText("Preserve this draft.");
  await paste();
  await expect(alert).toHaveText("Uploads are unavailable in this view.");
  await expect(writer).toHaveText("Preserve this draft.");
});

test("dismissing validation copy preserves the field's invalid state", async ({
  page,
}) => {
  await page.goto("/ui");
  const input = page.getByRole("textbox", {
    name: "Invalid input",
    exact: true,
  });
  const error = page.locator("#catalog-invalid-error");
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(error).toContainText("Installation name is required.");
  await error
    .getByRole("button", { name: "Dismiss message", exact: true })
    .click();
  await expect(error).toHaveCount(0);
  await expect(input).toHaveAttribute("aria-invalid", "true");
  expect(
    await input.evaluate(
      (node) => (node as HTMLInputElement).validity.valueMissing,
    ),
  ).toBe(true);
});

test("demo startup failure keeps Reset demo available after dismissal", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem("fieldbook.workspace.v1", "invalid saved sample data");
  });
  await page.goto("/");
  const alert = page.locator('[data-slot="alert"]');
  await expect(alert).toBeVisible();
  await alert
    .getByRole("button", { name: "Dismiss message", exact: true })
    .click();
  await expect(alert).toHaveCount(0);
  await page.getByRole("button", { name: "Reset demo", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Choose a demo profile" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Oliver Anderson/ }).click();
  await expect(page.locator(".main-content")).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem("fieldbook.profile.v1"))).toBe("demo-admin");
});
