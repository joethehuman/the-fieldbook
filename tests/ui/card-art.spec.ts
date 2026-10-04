import { test, expect, type Page, type Locator } from "@playwright/test";
import { freshWorkspace } from "../../lib/store";
import type { CardArt } from "../../lib/card-art";

async function seedWorkspace(
  page: Page,
  data: ReturnType<typeof freshWorkspace>,
) {
  await page.addInitScript((workspace) => {
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    if (!localStorage.getItem("fieldbook.workspace.v1"))
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
  }, data);
}

async function openArtwork(page: Page, id: string) {
  await page.goto(`/#admin/content/${id}/edit`);
  const toggle = page.getByRole("button", { name: /^Details/ });
  if ((await toggle.getAttribute("aria-expanded")) !== "true")
    await toggle.click();
  const editor = page.getByRole("region", { name: "Card artwork editor" });
  await expect(editor).toBeVisible();
  return editor;
}

async function storedArt(page: Page, id: string): Promise<CardArt> {
  return page.evaluate(
    (itemId) =>
      JSON.parse(
        localStorage.getItem("fieldbook.workspace.v1") || "{}",
      ).content.find((item: { id: string }) => item.id === itemId).cardArt,
    id,
  );
}

async function geometry(svg: Locator) {
  return svg.evaluateAll((elements) =>
    elements.map((svg) =>
      Array.from(svg.querySelectorAll("*")).map((element) => [
        element.tagName,
        ...Array.from(element.attributes)
          .filter((attribute) => !["fill", "stroke"].includes(attribute.name))
          .map((attribute) => [attribute.name, attribute.value]),
      ]),
    ),
  );
}

test("catalog shows thirty generated compositions within each card's layout", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/ui");
  const gallery = page.getByRole("region", { name: "Generated card artwork" });
  await expect(gallery.locator(".card-artwork")).toHaveCount(30);
  await expect(gallery.getByText("Design 1", { exact: true })).toBeVisible();
  const compositions = await gallery
    .locator(".card-artwork")
    .evaluateAll((cards) =>
      cards.map((card) => card.getAttribute("data-art-composition")),
    );
  expect(compositions).toEqual(
    Array.from({ length: 30 }, (_, slot) => String(slot)),
  );
  const outside = await gallery.locator(".card-artwork").evaluateAll(
    (cards) =>
      cards.filter((card) => {
        const box = card.getBoundingClientRect();
        return box.left < -1 || box.right > innerWidth + 1;
      }).length,
  );
  expect(outside).toBe(0);
  expect(errors).toEqual([]);
  await gallery.screenshot({
    path: info.outputPath("card-art-compositions.png"),
  });
});

test("Identity palette modes recolor fixed artwork and keep the saved choice", async ({
  page,
}, info) => {
  await seedWorkspace(page, freshWorkspace());
  await page.goto("/#admin/settings/identity");
  const palette = page.getByRole("region", { name: "Card artwork palette" });
  await expect(palette.locator(".card-artwork")).toHaveCount(3);
  const svg = palette.locator(".card-artwork-geometry");
  const originalGeometry = await geometry(svg);
  const card = palette.locator(".card-artwork").first();
  const before = await card.getAttribute("style");
  const select = palette.getByRole("combobox", { name: "Palette mode" });
  await select.click();
  await page.getByRole("option", { name: "Dusk", exact: true }).click();
  const dusk = await card.getAttribute("style");
  expect(dusk).not.toBe(before);
  expect(await geometry(svg)).toEqual(originalGeometry);
  await select.click();
  await page
    .getByRole("option", { name: "Custom three colors", exact: true })
    .click();
  await palette
    .getByRole("textbox", { name: "Primary / canvas hex value" })
    .fill("#e8efdd");
  await palette
    .getByRole("textbox", { name: "Accent 1 / lines hex value" })
    .fill("#5a8060");
  await palette
    .getByRole("textbox", { name: "Accent 2 / highlights hex value" })
    .fill("#d18c5d");
  expect(await card.getAttribute("style")).not.toBe(dusk);
  expect(await geometry(svg)).toEqual(originalGeometry);
  await select.click();
  await page
    .getByRole("option", { name: "Follow installation accent", exact: true })
    .click();
  expect(await card.getAttribute("style")).toBe(before);
  await select.click();
  await page.getByRole("option", { name: "Dusk", exact: true }).click();
  await page
    .getByRole("button", { name: "Save settings", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("fieldbook.workspace.v1") || "{}")
            .settings.cardPalette,
      ),
    )
    .toEqual({ mode: "preset", preset: "dusk" });
  await page.reload();
  await expect(select).toContainText("Dusk");
  expect(await card.getAttribute("style")).toBe(dusk);
  expect(await geometry(svg)).toEqual(originalGeometry);
  await palette.screenshot({ path: info.outputPath("card-art-identity.png") });
});

test("Shuffle opts into v6, avoids repeats and reloads the exact saved SVG without publishing", async ({
  page,
}, info) => {
  const data = freshWorkspace();
  const item = data.content.find((entry) => entry.kind === "brief")!;
  item.cardArt = {
    source: "generated",
    shortTitle: "A saved version two title",
    version: 2,
    seed: 716,
  };
  const originalArt = { ...item.cardArt };
  await seedWorkspace(page, data);
  const editor = await openArtwork(page, item.id);
  const artwork = editor.locator(".card-artwork");
  expect(await storedArt(page, item.id)).toEqual(originalArt);
  await editor
    .getByRole("textbox", { name: "Short title" })
    .fill("Choose a problem worth solving");
  await expect
    .poll(() => storedArt(page, item.id))
    .toEqual({ ...originalArt, shortTitle: "Choose a problem worth solving" });
  const first = await editor.locator(".card-artwork-geometry").innerHTML();
  const seen = new Set<string>();
  for (let i = 0; i < 25; i++) {
    await editor.getByRole("button", { name: "Shuffle artwork" }).click();
    seen.add((await artwork.getAttribute("data-art-composition")) || "");
  }
  expect(seen.size).toBe(25);
  const shuffled = await editor.locator(".card-artwork-geometry").innerHTML();
  expect(shuffled).not.toBe(first);
  await expect(
    page.locator(".editor-heading [role=status] > .sr-only"),
  ).toHaveText(/^Saved(?:\. Unpublished edits)?$/);
  const saved = await storedArt(page, item.id);
  expect(saved.version).toBe(6);
  expect(saved.shortTitle).toBe("Choose a problem worth solving");
  const publishedArt = await page.evaluate(
    (itemId) =>
      JSON.parse(
        localStorage.getItem("fieldbook.workspace.v1") || "{}",
      ).publishedContent.find((entry: { id: string }) => entry.id === itemId)
        .cardArt,
    item.id,
  );
  expect(publishedArt).toEqual(originalArt);
  await page.reload();
  const restored = await openArtwork(page, item.id);
  await expect(
    restored.getByRole("textbox", { name: "Short title" }),
  ).toHaveValue(saved.shortTitle);
  expect(await restored.locator(".card-artwork-geometry").innerHTML()).toBe(
    shuffled,
  );
  expect(await storedArt(page, item.id)).toEqual(saved);
  await restored.screenshot({
    path: info.outputPath("card-art-shuffle-reloaded.png"),
  });
});

for (const version of [2, 3, 4, 5, 6] as const) {
  test(`existing v${version} upload returns to generated artwork without losing its saved choice`, async ({
    page,
  }, info) => {
    const data = freshWorkspace();
    const item = data.content.find((entry) => entry.kind === "brief")!;
    const imageUrl = "/artwork-mode-fixture.png";
    item.cardArt = {
      source: "upload",
      shortTitle: "A saved generated choice",
      version,
      seed: 4294967295,
      imageUrl,
    };
    await page.route("**/artwork-mode-fixture.png", (route) =>
      route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZRCYAAAAASUVORK5CYII=",
          "base64",
        ),
      }),
    );
    await seedWorkspace(page, data);
    const editor = await openArtwork(page, item.id);
    await expect(editor.locator(".card-artwork-image")).toBeVisible();
    const source = editor.getByRole("combobox", { name: "Artwork source" });
    await source.click();
    await page.getByRole("option", { name: "Generated", exact: true }).click();
    await expect(editor.locator(".card-artwork-geometry")).toBeVisible();
    await expect(editor.locator(".card-artwork-geometry")).toHaveAttribute(
      "data-generation",
      "6",
    );
    const generated = { ...item.cardArt, source: "generated" };
    await expect.poll(() => storedArt(page, item.id)).toEqual(generated);
    const rendered = await editor.locator(".card-artwork-geometry").innerHTML();
    // The demo has no upload handler; retaining that boundary is intentional.
    await expect(source).toBeDisabled();
    await expect(
      page.locator(".editor-heading [role=status] > .sr-only"),
    ).toHaveText(/^Saved(?:\. Unpublished edits)?$/);
    await page.reload();
    const restored = await openArtwork(page, item.id);
    expect(await restored.locator(".card-artwork-geometry").innerHTML()).toBe(
      rendered,
    );
    expect(await storedArt(page, item.id)).toEqual(generated);
    await restored.screenshot({
      path: info.outputPath(`card-art-mode-v${version}.png`),
    });
  });
}
