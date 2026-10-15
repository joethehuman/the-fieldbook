import { test, expect, type Page } from "@playwright/test";

import { readFile } from "node:fs/promises";

import { freshWorkspace } from "../../lib/store";

import {
  authoringUser,
  setupAuthoringProvider,
  syncAuthoringProvider,
} from "./provider-fixture";

import { returnToContent } from "./editor-helpers";

type Kind = "doc" | "brief" | "course";

const label = (kind: Kind) =>
  kind === "course"
    ? "Lesson content"
    : kind === "doc"
      ? "Doc content"
      : "Update content";

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
  const control = {
    started: false,
    fail: false,
    type: "image/png",
    release: () => releaseUpload(),
  };
  if (installed) {
    await setupAuthoringProvider(page, state);
    await page.route("**/api/admin/snapshot?**", (route) =>
      route.fulfill({ json: { data: state, user: authoringUser } }),
    );
    await page.route("**/api/content*", async (route) => {
      if (route.request().method() === "GET")
        return route.fulfill({ json: state.content[0] });
      state.content[0] = {
        ...route.request().postDataJSON().content,
        revision: state.content[0].revision! + 1,
      };
      await syncAuthoringProvider(page, state);
      return route.fulfill({ json: state.content[0] });
    });
    await page.route("**/api/upload", async (route) => {
      const body = route.request().postDataJSON();
      if (body.complete)
        return route.fulfill({
          json: {
            url: `/api/media/00000000-0000-4000-8000-000000000010.${control.type.startsWith("video/") ? "mp4" : "png"}`,
          },
        });
      control.type = body.type;
      await new Promise<void>((resolve) => {
        releaseUpload = resolve;
        control.started = true;
      });
      if (control.fail)
        return route.fulfill({
          status: 503,
          json: { error: "Upload unavailable" },
        });
      return route.fulfill({
        json: {
          id: "00000000-0000-4000-8000-000000000010",
          upload: {
            url: "https://test.supabase.co/storage/upload/synthetic",
            method: "PUT",
            headers: { "Content-Type": control.type },
          },
        },
      });
    });
    await page.route("https://test.supabase.co/**", (route) =>
      route.fulfill({ json: {} }),
    );
    await page.route("**/api/media/**", (route) =>
      route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=",
          "base64",
        ),
      }),
    );
  } else
    await page.addInitScript((data) => {
      localStorage.setItem("fieldbook.workspace.v1", JSON.stringify(data));
      sessionStorage.setItem("fieldbook.profile.v1", "demo-admin");
    }, state);
  const open = async () => {
    await page.goto(installed ? "/admin/content" : "/#admin", {
      waitUntil: "domcontentloaded",
    });
    await page.getByRole("link", { name: item.title, exact: true }).click();
  };
  return { open, control, state };
}

async function engineChunk(installed: boolean) {
  const directory = installed ? ".next" : "demo/.next";
  const manifest = JSON.parse(
    await readFile(`${directory}/react-loadable-manifest.json`, "utf8"),
  ) as Record<string, { id: number; files: string[] }>;
  const entry = Object.entries(manifest).find(([key]) =>
    key.endsWith(
      "components/patterns/writing-editor.tsx -> ./writing-editor-engine",
    ),
  )![1];
  // Hold only the engine module, not vendor chunks also needed by the app shell.
  for (const file of entry.files.filter((file) => file.endsWith(".js"))) {
    if (
      new RegExp(`\\b${entry.id}:`).test(
        await readFile(`${directory}/${file}`, "utf8"),
      )
    )
      return file;
  }
  throw new Error("Editor engine chunk missing from the built app");
}

for (const kind of ["doc", "brief", "course"] as const) {
  test(`${kind} editor cold load and refresh stay quiet; warm navigation reuses the tools`, async ({
    page,
  }, info) => {
    const installed = info.project.name.startsWith("production");
    const { open } = await fixture(page, installed, kind);
    const file = await engineChunk(installed);
    let held = 0;
    let release!: () => void;
    let gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(`**/_next/${file}`, async (route) => {
      held++;
      await gate;
      await route.continue();
    });
    const opening = open();
    await expect.poll(() => held).toBe(1);
    const loading = page.locator(
      '.writing-root .writing-surface[aria-busy="true"]',
    );
    await expect(loading).toBeVisible();
    await expect(loading).toHaveText("");
    await expect(page.getByText(/Loading (writing|editing) tools/)).toHaveCount(
      0,
    );
    await page.screenshot({
      path: info.outputPath(`${kind}-quiet-cold-load.png`),
    });
    release();
    await opening;
    await expect(
      page.getByRole("textbox", { name: label(kind), exact: true }),
    ).toBeVisible();
    await expect(loading).toHaveCount(0);

    gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(() => held).toBe(2);
    await expect(loading).toBeVisible();
    await expect(loading).toHaveText("");
    release();
    await expect(
      page.getByRole("textbox", { name: label(kind), exact: true }),
    ).toBeVisible();
    // Exercise a warm client navigation. Browser Back after reload can create
    // another document, where fetching this chunk again is expected.
    await returnToContent(page);
    await page
      .getByRole("link", { name: "Quiet editor fixture", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: label(kind), exact: true }),
    ).toBeVisible();
    expect(held).toBe(2);
    await expect(loading).toHaveCount(0);
  });
}

test("uploaded video uses native playback controls and plays without custom controls", async ({
  page,
}, info) => {
  test.skip(
    !info.project.name.startsWith("production"),
    "Private uploaded media is installation-only",
  );
  const { open, state } = await fixture(page, true, "course");
  // A small browser-generated clip exercises real decoding without external media or storage.
  const clip = Buffer.from(
    await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      const context = canvas.getContext("2d")!;
      const stream = canvas.captureStream(10);
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => chunks.push(event.data);
      const recorded = new Promise<Blob>((resolve) => {
        recorder.onstop = () =>
          resolve(new Blob(chunks, { type: "video/webm" }));
      });
      recorder.start();
      let frame = 0;
      const frames = setInterval(() => {
        context.fillStyle = "#334155";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.fillStyle = "#ffffff";
        context.font = "20px sans-serif";
        context.fillText(`Synthetic video ${frame++}`, 60, 96);
      }, 100);
      setTimeout(() => {
        recorder.stop();
        clearInterval(frames);
        stream.getTracks().forEach((track) => track.stop());
      }, 700);
      return Array.from(new Uint8Array(await (await recorded).arrayBuffer()));
    }),
  );
  const url = "/api/media/00000000-0000-4000-8000-000000000010.webm";
  state.content[0].lessons[0].body = `[Video](${url})`;
  await page.route("**/api/media/**", (route) =>
    route.fulfill({ contentType: "video/webm", body: clip }),
  );
  await open();
  const writing = page.getByRole("textbox", {
    name: "Lesson content",
    exact: true,
  });
  const video = writing.locator("video");
  await expect
    .poll(() =>
      video.evaluate((element) => (element as HTMLVideoElement).readyState),
    )
    .toBeGreaterThanOrEqual(1);
  await expect(video).toHaveAttribute("controls", "");
  await expect(writing.locator(".course-video-actions")).toHaveCount(0);
  await expect(writing.getByRole("combobox")).toHaveCount(0);
  expect(
    await video.evaluate(
      (element) => (element as HTMLVideoElement).playbackRate,
    ),
  ).toBe(1);
  await video.evaluate(async (element) => {
    const player = element as HTMLVideoElement;
    player.playbackRate = 1.5;
    await player.play();
  });
  await expect
    .poll(() =>
      video.evaluate((element) => (element as HTMLVideoElement).currentTime),
    )
    .toBeGreaterThan(0.1);
  await video.evaluate((element) => {
    const player = element as HTMLVideoElement;
    player.pause();
    player.dispatchEvent(new Event("timeupdate"));
  });
  await page.screenshot({ path: info.outputPath("native-video-controls.png") });
  await expect(
    writing.getByRole("button", { name: "Retry video", exact: true }),
  ).toHaveCount(0);
});

for (const workflow of [
  "paste image",
  "upload image",
  "upload video",
] as const) {
  for (const failure of [false, true]) {
    test(`${workflow}: native media controls save verified URLs and preserve prose on failure=${failure}`, async ({
      page,
    }, info) => {
      test.skip(
        !info.project.name.startsWith("production"),
        "Uploads need the isolated installed-app fixture",
      );
      const { open, state, control } = await fixture(page, true, "course");
      control.fail = failure;
      await open();
      const writer = page.getByRole("textbox", {
        name: "Lesson content",
        exact: true,
      });
      await writer.fill("Before media");
      await page.keyboard.press("Enter");
      if (workflow === "paste image") {
        await writer.evaluate((node) => {
          const data = new DataTransfer();
          data.items.add(
            new File([new Uint8Array([137, 80, 78, 71])], "media.png", {
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
      } else {
        const type = workflow === "upload video" ? "Video" : "Image";
        await page.keyboard.type(`/${type.toLowerCase()}`);
        await page
          .getByRole("option", {
            name: new RegExp(`^${type === "Video" ? "Upload video" : type} `),
          })
          .first()
          .click();
        await page.getByRole("tab", { name: "Upload", exact: true }).click();
        await page.locator('.bn-tab-panel input[type="file"]').setInputFiles({
          name: type === "Video" ? "media.mp4" : "media.png",
          mimeType: type === "Video" ? "video/mp4" : "image/png",
          buffer: Buffer.from("synthetic"),
        });
      }
      await expect.poll(() => control.started).toBe(true);
      const publish = page.locator(".topbar").getByRole("button", {
        name: /Publish|Review requirements/,
        includeHidden: true,
      });
      await expect(publish).toBeDisabled();
      expect(state.content[0].lessons[0].body).not.toContain("/api/media/");
      control.release();
      if (failure) {
        await expect(
          page.locator(".writing-editor").getByRole("alert"),
        ).toContainText("Upload unavailable");
        await expect(writer).toContainText("Before media");
        expect(state.content[0].lessons[0].body).not.toContain("/api/media/");
      } else {
        const type = workflow === "upload video" ? "video" : "img";
        await expect(writer.locator(type)).toHaveAttribute(
          "src",
          /\/api\/media\//,
        );
        await expect
          .poll(() => state.content[0].lessons[0].body)
          .toContain("/api/media/");
        expect(
          state.content[0].lessons[0].bodyDocument?.blocks.some(
            (block) => block.type === (type === "img" ? "image" : "video"),
          ),
        ).toBe(true);
        expect(state.content[0].lessons[0].body).toContain("Before media");
        expect(
          JSON.stringify(state.content[0].lessons[0].bodyDocument),
        ).not.toMatch(/blob:|storage\/upload/);
        await page.reload();
        await expect(writer.locator(type)).toHaveAttribute(
          "src",
          /\/api\/media\//,
        );
        await expect(writer).toContainText("Before media");
      }
    });
  }
}
