import assert from "node:assert/strict";
import { test } from "node:test";
import { contentLinkTarget } from "../lib/content-links";

test("course lesson hyperlinks open separately from course navigation", () => {
  assert.equal(contentLinkTarget("/docs/reference", "course"), "_blank");
  assert.equal(contentLinkTarget("https://example.com", "course"), "_blank");
});

test("docs and updates keep installation links in place and open outside links separately", () => {
  const sameSiteOrigins = ["https://thefieldbook.org"];
  assert.equal(contentLinkTarget("/docs/reference", "article", sameSiteOrigins), undefined);
  assert.equal(contentLinkTarget("#next", "article", sameSiteOrigins), undefined);
  assert.equal(contentLinkTarget("https://thefieldbook.org/updates/release", "article", sameSiteOrigins), undefined);
  assert.equal(contentLinkTarget("https://example.com/guide", "article", sameSiteOrigins), "_blank");
  assert.equal(contentLinkTarget("//example.com/guide", "article", sameSiteOrigins), "_blank");
  assert.equal(contentLinkTarget("mailto:help@example.com", "article", sameSiteOrigins), undefined);
});
