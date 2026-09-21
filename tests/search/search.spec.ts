import { test, expect } from "@playwright/test";
const fixture = "http://127.0.0.1:3130/fixture";
test.beforeEach(async ({ request }) => {
  await request.post(fixture, { data: { reset: true } });
});
test("server search through SQL, stable lesson destination, publication and access", async ({
  page,
  request,
}, info) => {
  await page.goto("/courses");
  const input = page.getByRole("textbox", { name: "Search all content" });
  await expect(input).toBeVisible();
  await page.evaluate(() => {
    const state = window as typeof window & { searchTimes: number[] };
    state.searchTimes = [];
    let started = 0,
      query = "";
    document
      .querySelector('input[aria-label="Search all content"]')!
      .addEventListener("input", (e) => {
        started = performance.now();
        query = (e.target as HTMLInputElement).value;
      });
    new MutationObserver(() => {
      const region = document.querySelector('[aria-label="Search results"]');
      if (
        started &&
        region?.getAttribute("aria-busy") === "false" &&
        region
          .querySelector('[role="status"]')
          ?.textContent?.includes(`“${query}”`)
      ) {
        state.searchTimes.push(performance.now() - started);
        started = 0;
      }
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
  });
  const times = [];
  for (const query of [
    "quorum",
    "election",
    "quor",
    "distributed",
    "quorum election",
    "quorom",
    "distributed systems",
    "election",
    "quorum",
    "quorum election",
  ]) {
    const start = performance.now();
    await input.fill(query);
    await expect(
      page.getByRole("link", { name: /Distributed systems/ }),
    ).toBeVisible();
    times.push(performance.now() - start);
  }
  console.log(
    "LOCAL END-TO-END (typing + debounce + HTTP + SQL + render)",
    JSON.stringify(times),
  );
  console.log(
    "BROWSER INPUT-TO-RENDER MS",
    JSON.stringify(
      await page.evaluate(
        () => (window as typeof window & { searchTimes: number[] }).searchTimes,
      ),
    ),
  );
  const response = await request.get("/api/search?q=quorum&type=course");
  expect(response.headers()["cache-control"]).toContain("no-store");
  const json = await response.json();
  expect(json.results[0].publishedRevision).toBe(4);
  expect(json.results[0].lessonId).toBe("consensus");
  await page.screenshot({
    path: info.outputPath("server-search.png"),
    fullPage: true,
  });
  await page.getByRole("link", { name: /Distributed systems/ }).click();
  await expect(
    page.getByRole("heading", { name: "Consensus", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Consensus", exact: true }),
  ).toBeVisible();
  await request.post(fixture, { data: { unpublish: true } });
  expect(
    (await (await request.get("/api/search?q=quorum")).json()).results,
  ).toEqual([]);
  await request.post(fixture, { data: { access: "private" } });
  const denied = await request.get("/api/search?q=quorum");
  expect(denied.status()).toBe(401);
  expect(denied.headers()["cache-control"]).toContain("no-store");
});
test("rapid queries, loading, failure recovery, keyboard and empty results", async ({
  page,
  request,
}, info) => {
  await page.goto("/courses");
  const input = page.getByRole("textbox", { name: "Search all content" });
  // Delay an already completed older response, so it arrives after the new one.
  await page.route("**/api/search?**", async (route) => {
    const response = await route.fetch();
    if (new URL(route.request().url()).searchParams.get("q") === "quorum")
      await new Promise((r) => setTimeout(r, 700));
    await route.fulfill({ response });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await input.fill("quorum");
  await expect(
    page.locator('[data-slot="search-panel"] [data-slot="skeleton"]'),
  ).toHaveCount(12);
  expect(
    await page
      .locator('[data-slot="skeleton"]')
      .first()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await expect(
    page.getByRole("region", { name: "Search results" }).getByRole("status"),
  ).toContainText("Searching");
  await page.screenshot({
    path: info.outputPath("search-loading.png"),
    fullPage: true,
  });
  await page.waitForTimeout(200);
  await input.fill("zzqxvnothing");
  await expect(
    page.getByRole("heading", { name: "No results", exact: true }),
  ).toBeVisible();
  await page.waitForTimeout(800);
  await expect(
    page.getByRole("link", { name: /Distributed systems/ }),
  ).toHaveCount(0);
  await page.unroute("**/api/search?**");
  await request.post(fixture, { data: { fail: true } });
  await input.fill("quorum");
  await expect(
    page.getByRole("region", { name: "Search results" }).getByRole("alert"),
  ).toContainText("Search could not load");
  await page.screenshot({
    path: info.outputPath("search-error.png"),
    fullPage: true,
  });
  await request.post(fixture, { data: { fail: false } });
  await page.getByRole("button", { name: "Retry search" }).click();
  await expect(
    page.getByRole("link", { name: /Distributed systems/ }),
  ).toBeVisible();
  await input.focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    page.getByRole("link", { name: /Distributed systems/ }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Consensus", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
