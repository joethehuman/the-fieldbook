import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "../components/Markdown";
import { CourseVideo } from "../components/patterns/course-video";
import { isInlineVideo } from "../lib/inline-video";

const youtube = "https://www.youtube.com/watch?v=69V__a49xtw";
const upload = "/api/media/00000000-0000-4000-8000-000000000001.mp4";

test("explicit video blocks and uploaded videos share the same import decision", () => {
  assert.equal(isInlineVideo(youtube, "Video"), true);
  assert.equal(isInlineVideo(upload, "original-filename.mp4"), true);
  assert.equal(isInlineVideo(youtube, "Watch the reference"), false);
  assert.equal(isInlineVideo("javascript:alert(1)", "Video"), false);
  assert.equal(isInlineVideo("https://example.com/page", "Video"), false);
});

test("all reading surfaces render video blocks while ordinary references remain links", () => {
  for (const linkContext of ["course", "article"] as const) {
    const html = renderToStaticMarkup(createElement(Markdown, {
      children: `[Video](${youtube})\n\n[Recording](${upload})\n\n[Reference](${youtube})`,
      linkContext,
    }));
    assert.match(html, /<iframe[^>]+youtube-nocookie/);
    assert.match(html, /i\.ytimg\.com\/vi\/69V__a49xtw\/maxresdefault\.jpg/);
    assert.match(html, /<iframe[^>]+loading="lazy"/);
    assert.doesNotMatch(html, /Loading video…/);
    assert.match(html, /<video[^>]+00000000-0000-4000-8000-000000000001.mp4/);
    assert.match(html, /<video[^>]+controls=""/);
    assert.doesNotMatch(html, /course-video-speed|course-video-actions|<select|role="combobox"/);
    assert.match(html, /<a[^>]+>Reference/);
    assert.doesNotMatch(html, /<div\b/);
  }
});

test("active course video loads its player and thumbnail immediately without autoplay", () => {
  const html = renderToStaticMarkup(createElement(CourseVideo, {
    url: youtube,
    title: "Opening video",
    eager: true,
  }));
  assert.match(html, /i\.ytimg\.com\/vi\/69V__a49xtw\/maxresdefault\.jpg/);
  assert.match(html, /<iframe[^>]+loading="eager"/);
  assert.match(html, /<iframe[^>]+aria-hidden="true"/);
  assert.doesNotMatch(html, /Loading video…/);
  assert.doesNotMatch(html, /autoplay=1/);
});
