import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { freshWorkspace } from "../../lib/store";
import { authoringUser, setupAuthoringProvider } from "./provider-fixture";
import { expectMarkdown, returnToContent } from "./editor-helpers";

type Kind = "doc" | "brief" | "course";
const label = (kind: Kind) => kind === "course" ? "Lesson content" : kind === "doc" ? "Doc content" : "Update content";

async function fixture(page: Page, installed: boolean, kind: Kind) {
  const state = freshWorkspace();
  const item = state.content.find((item) => item.kind === kind)!;
  item.status = "draft";
  item.revision = 1;
  item.title = "Quiet editor fixture";
  item.body = "";
  if (kind === "course") {
    item.lessons = [{ id: "one", title: "Lesson one", body: "" }];
    item.questions = [];
  }
  state.content = [item];
  state.publishedContent = [];
  let releaseUpload = () => {};
  const control = { started: false, fail: false, type: "image/png", release: () => releaseUpload() };
  if (installed) {
    await setupAuthoringProvider(page, state);
    await page.route("**/api/admin/snapshot?**", (route) => route.fulfill({ json: { data: state, user: authoringUser } }));
    await page.route("**/api/content*", (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: state.content[0] });
      state.content[0] = { ...route.request().postDataJSON().content, revision: state.content[0].revision! + 1 };
      return route.fulfill({ json: state.content[0] });
    });
    await page.route("**/api/upload", async (route) => {
      const body = route.request().postDataJSON();
      if (body.complete) return route.fulfill({ json: { url: `/api/media/00000000-0000-4000-8000-000000000010.${control.type.startsWith("video/") ? "mp4" : "png"}` } });
      control.type = body.type;
      await new Promise<void>((resolve) => { releaseUpload = resolve; control.started = true; });
      if (control.fail) return route.fulfill({ status: 503, json: { error: "Upload unavailable" } });
      return route.fulfill({ json: { id: "00000000-0000-4000-8000-000000000010", upload: {
        url: "https://test.supabase.co/storage/upload/synthetic", method: "PUT", headers: { "Content-Type": control.type },
      } } });
    });
    await page.route("https://test.supabase.co/**", (route) => route.fulfill({ json: {} }));
    await page.route("**/api/media/**", (route) => route.fulfill({ contentType: "image/png", body: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=", "base64",
    ) }));
  } else await page.addInitScript((data) => {
    localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
    sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
  }, state);
  const open = async () => {
    await page.goto(installed ? "/admin/content" : "/#admin", { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: item.title, exact: true }).click();
  };
  return { open, control, state };
}

async function engineChunk(installed: boolean) {
  const directory = installed ? ".next" : "demo/.next";
  const manifest = JSON.parse(await readFile(`${directory}/react-loadable-manifest.json`, "utf8")) as Record<string, { id: number; files: string[] }>;
  const entry = Object.entries(manifest).find(([key]) => key.endsWith("components/patterns/writing-editor.tsx -> ./writing-editor-engine"))![1];
  // Hold only the engine module, not vendor chunks also needed by the app shell.
  for (const file of entry.files.filter((file) => file.endsWith(".js"))) {
    if (new RegExp(`\\b${entry.id}:`).test(await readFile(`${directory}/${file}`, "utf8"))) return file;
  }
  throw new Error("Editor engine chunk missing from the built app");
}

for (const kind of ["doc", "brief", "course"] as const) {
  test(`${kind} editor cold load and refresh stay quiet; warm navigation reuses the tools`, async ({ page }, info) => {
    const installed = info.project.name.startsWith("production");
    const { open } = await fixture(page, installed, kind);
    const file = await engineChunk(installed);
    let held = 0;
    let release!: () => void;
    let gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route(`**/_next/${file}`, async (route) => { held++; await gate; await route.continue(); });
    const opening = open();
    await expect.poll(() => held).toBe(1);
    const loading = page.locator('.writing-root .writing-surface[aria-busy="true"]');
    await expect(loading).toBeVisible();
    await expect(loading).toHaveText("");
    await expect(page.getByText(/Loading (writing|editing) tools/)).toHaveCount(0);
    await page.screenshot({ path: info.outputPath(`${kind}-quiet-cold-load.png`) });
    release();
    await opening;
    await expect(page.getByRole("textbox", { name: label(kind), exact: true })).toBeVisible();
    await expect(loading).toHaveCount(0);

    gate = new Promise<void>((resolve) => { release = resolve; });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(() => held).toBe(2);
    await expect(loading).toBeVisible();
    await expect(loading).toHaveText("");
    release();
    await expect(page.getByRole("textbox", { name: label(kind), exact: true })).toBeVisible();
    // Exercise a warm client navigation. Browser Back after reload can create
    // another document, where fetching this chunk again is expected.
    await returnToContent(page);
    await page.getByRole("link", { name: "Quiet editor fixture", exact: true }).click();
    await expect(page.getByRole("textbox", { name: label(kind), exact: true })).toBeVisible();
    expect(held).toBe(2);
    await expect(loading).toHaveCount(0);
  });
}

for (const workflow of ["paste image", "upload image", "upload video"] as const) for (const failure of [false, true]) {
  test(`${workflow} uses the same stable loading block and quiet disabled navigation; failure=${failure}`, async ({ page }, info) => {
    test.skip(!info.project.name.startsWith("production"), "Media uploads are installation-only");
    const { open, control, state } = await fixture(page, true, "course");
    control.fail = failure;
    await open();
    const writing = page.getByRole("textbox", { name: "Lesson content", exact: true });
    await writing.fill("Before media");
    await page.keyboard.press("Enter");
    await page.mouse.move(0, 0);
    const title = page.getByRole("textbox", { name: "Lesson title", exact: true });
    const before = await title.boundingBox();
    if (workflow === "paste image") await writing.evaluate((surface) => {
      const data = new DataTransfer();
      data.items.add(new File(["synthetic"], "media.png", { type: "image/png" }));
      surface.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    else {
      await page.keyboard.press("/");
      await page.getByRole("menuitem", { name: workflow === "upload video" ? "Upload video" : "Image", exact: true }).click();
      const chooser = page.getByRole("dialog", { name: workflow === "upload video" ? "Insert video" : "Insert image", exact: true });
      if (workflow === "upload image") {
        await expect(chooser.getByRole("textbox", { name: "Alt text (optional)" })).toHaveValue("");
        await expect(chooser.getByRole("button", { name: "Choose image", exact: true })).toBeEnabled();
      }
      if (!failure) await page.screenshot({ path: info.outputPath(`${workflow}-chooser.png`) });
      const choosing = page.waitForEvent("filechooser");
      await chooser.getByRole("button", { name: workflow === "upload video" ? "Choose video" : "Choose image", exact: true }).click();
      await (await choosing).setFiles({ name: workflow === "upload video" ? "media.mp4" : "media.png", mimeType: workflow === "upload video" ? "video/mp4" : "image/png", buffer: Buffer.from("synthetic") });
    }
    await expect.poll(() => control.started).toBe(true);
    const loading = writing.getByRole("status");
    await expect(loading).toHaveText("Loading…");
    const size = await loading.boundingBox();
    expect(size?.height).toBe(56);
    await expect(loading.locator("svg")).toHaveCount(1);
    expect(await loading.locator("svg").evaluate((svg) => getComputedStyle(svg).animationName)).not.toBe("none");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await loading.locator("svg").evaluate((svg) => getComputedStyle(svg).animationName)).toBe("none");
    expect((await loading.boundingBox())?.height).toBe(size?.height);
    expect((await title.boundingBox())?.y).toBe(before?.y);
    await expect(page.getByText("Preparing upload…", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Details", exact: true })).toBeDisabled();
    if (!info.project.name.endsWith("phone")) {
      const back = page.getByRole("button", { name: "Back to content", exact: true });
      await expect(back).toBeDisabled();
      const colors = await back.evaluate((node) => ({ background: getComputedStyle(node).backgroundColor, border: getComputedStyle(node).borderColor, hovered: node.matches(":hover") }));
      expect(colors).toEqual({ background: "rgba(0, 0, 0, 0)", border: "rgba(0, 0, 0, 0)", hovered: false });
    }
    expect(state.content[0].lessons[0].body).not.toContain("/api/media/");
    await page.screenshot({ path: info.outputPath(`${workflow}-loading.png`) });
    control.release();
    if (failure) {
      await expect(page.locator(".writing-editor").getByRole("alert")).toBeVisible();
      await expect(writing).toHaveText("Before media");
      await expect(loading).toHaveCount(0);
    } else {
      const media = writing.locator(workflow === "upload video" ? "video" : "img:not([data-lexical-managed-linebreak])");
      await expect(media).toHaveAttribute("src", /\/api\/media\//);
      if (workflow === "upload image") await expect(media).toHaveAttribute("alt", "media.png");
      if (workflow === "upload video") {
        const video = writing.locator("video");
        await expect(video).toHaveAttribute("controls", "");
        expect(await video.evaluate((element) => (element as HTMLVideoElement).playbackRate)).toBe(1);
        await expect(writing.getByRole("combobox")).toHaveCount(0);
        await expect(writing.getByText("Speed", { exact: true })).toHaveCount(0);
      }
      await page.keyboard.type("After media");
      await expect(writing.locator("p").first()).toHaveText("Before media");
      await expect(writing.locator("p").last()).toHaveText("After media");
      await expectMarkdown(page, /Before media[\s\S]*\/api\/media\/[\s\S]*After media/);
    }
  });
}

test("uploaded video uses native playback controls and retains its rate on retry", async ({ page }, info) => {
  test.skip(!info.project.name.startsWith("production"), "Private uploaded media is installation-only");
  const { open, state } = await fixture(page, true, "course");
  // A small browser-generated clip exercises real decoding without external media or storage.
  const clip = Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext("2d")!;
    const stream = canvas.captureStream(10);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const recorded = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" })); });
    recorder.start();
    let frame = 0;
    const frames = setInterval(() => {
      context.fillStyle = "#334155";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = "#ffffff";
      context.font = "20px sans-serif";
      context.fillText(`Synthetic video ${frame++}`, 60, 96);
    }, 100);
    setTimeout(() => { recorder.stop(); clearInterval(frames); stream.getTracks().forEach((track) => track.stop()); }, 700);
    return Array.from(new Uint8Array(await (await recorded).arrayBuffer()));
  }));
  const url = "/api/media/00000000-0000-4000-8000-000000000010.webm";
  state.content[0].lessons[0].body = `[Video](${url})`;
  await page.route("**/api/media/**", (route) => route.fulfill({ contentType: "video/webm", body: clip }));
  await open();
  const writing = page.getByRole("textbox", { name: "Lesson content", exact: true });
  const video = writing.locator("video");
  await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(1);
  await expect(video).toHaveAttribute("controls", "");
  await expect(writing.locator(".course-video-actions")).toHaveCount(0);
  await expect(writing.getByRole("combobox")).toHaveCount(0);
  expect(await video.evaluate((element) => (element as HTMLVideoElement).playbackRate)).toBe(1);
  await video.evaluate(async (element) => {
    const player = element as HTMLVideoElement;
    player.playbackRate = 1.5;
    await player.play();
  });
  await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(0.1);
  await video.evaluate((element) => {
    const player = element as HTMLVideoElement;
    player.pause();
    player.dispatchEvent(new Event("timeupdate"));
  });
  await page.screenshot({ path: info.outputPath("native-video-controls.png") });
  await video.evaluate((element) => element.dispatchEvent(new Event("error")));
  await writing.getByRole("button", { name: "Retry video", exact: true }).click();
  await expect(video).toHaveAttribute("src", `${url}?renew=1`);
  await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(1);
  expect(await video.evaluate((element) => (element as HTMLVideoElement).playbackRate)).toBe(1.5);
  await expect(writing.getByRole("button", { name: "Retry video", exact: true })).toHaveCount(0);
});
