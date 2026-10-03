import { test, expect } from "@playwright/test";
import { learningUiFixture } from "../fixtures/learning-ui";
import { exerciseLessonScrollOwner, expectElasticPage, expectEdgeSpring } from "../fixtures/native-overscroll";

test.beforeEach(async ({ page }) => {
  const data = learningUiFixture();
  data.progress["demo-admin"] = [];
  const doc = data.content.find((item) => item.kind === "doc")!;
  doc.id = "spring-doc";
  doc.body = "## Local scrolling\n\n```\n" + "a_long_code_value_".repeat(80) + "\n```\n\n" + "Useful guidance.\n\n".repeat(100);
  data.publishedContent = data.content.filter((item) => item.status === "published");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const course = data.content.find((item) => item.id === "course-2")!;
  course.lessons = course.lessons.map((lesson, index) => ({
    ...lesson, body: index === 0 ? "An extended lesson explanation.\n\n".repeat(80) : "A concise explanation.", videoUrl: undefined,
  }));
  await page.addInitScript((workspace) => {
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(workspace));
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
  }, data);
});

test("visible edge spring is limited to learner pages and respects reduced motion", async ({ page }) => {
  for (const path of ["/", "/#courses", "/#updates", "/#docs"]) {
    await page.goto(path);
    await expectElasticPage(page);
    await expectEdgeSpring(page, page.locator(".main-content"), "top");
    await expectEdgeSpring(page, page.locator(".main-content"), "bottom");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await expectElasticPage(page, false);
    await page.locator(".main-content").hover();
    await page.mouse.wheel(0, 180);
    await expect(page.locator(".main-content > .elastic-scroll-boundary > .elastic-scroll-motion")).toHaveCSS("transform", "none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
  }
  await page.goto("/#admin");
  await expectElasticPage(page, false);
  await expect(page.locator(".main-content")).not.toHaveAttribute("data-elastic-scroll", "true");
});

test("lesson pane owns native input and bottom actions remain reachable through layout changes", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "This story resizes desktop through short and enlarged-phone layouts.");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/#courses/course-2");
  await exerciseLessonScrollOwner(page, "Put it into practice", (name) => info.outputPath(name));
});

test("edge spring leaves horizontal content, controls and native zoom alone", async ({ page }) => {
  await page.goto("/#docs/spring-doc");
  const main = page.locator(".main-content");
  await expectElasticPage(page);
  const motion = main.locator(":scope > .elastic-scroll-boundary > .elastic-scroll-motion");
  const code = page.locator("article pre");
  await code.scrollIntoViewIfNeeded();
  await code.hover();
  await page.mouse.wheel(220, 0);
  await expect.poll(() => code.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await page.mouse.wheel(0, -180);
  await expect(motion).toHaveCSS("transform", "none");
  const search = page.getByPlaceholder("Search Fieldbook or Ask AI");
  await search.hover();
  await page.mouse.wheel(0, -180);
  await expect(motion).toHaveCSS("transform", "none");
  await main.evaluate((element) => element.scrollTo(0, 0));
  await main.hover({ position: { x: 40, y: 40 } });
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -180);
  await page.keyboard.up("Control");
  await expect(motion).toHaveCSS("transform", "none");
  await expectEdgeSpring(page, main, "top");
});

test("a touch edge pull visibly moves and releases without replacing native touch scrolling", async ({ page }, info) => {
  test.skip(info.project.name !== "phone", "Touch story runs on the narrow page layout.");
  await page.goto("/#docs/spring-doc");
  const main = page.locator(".main-content");
  await expectElasticPage(page);
  const motion = main.locator(":scope > .elastic-scroll-boundary > .elastic-scroll-motion");
  const client = await page.context().newCDPSession(page);
  await client.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  const box = (await main.boundingBox())!;
  const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + 120);
  const start = (await motion.boundingBox())!.y;
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + 90 }] });
  await expect.poll(async () => (await motion.boundingBox())!.y - start).toBeGreaterThan(8);
  expect(await main.evaluate((element) => element.scrollTop)).toBe(0);
  await page.screenshot({ path: info.outputPath("touch-edge-spring.png") });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(motion).toHaveCSS("transform", "none");
  await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y + 180 }] });
  for (const amount of [30, 60, 100, 150])
    await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + 180 - amount }] });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(() => main.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect(motion).toHaveCSS("transform", "none");
  await client.detach();
});
