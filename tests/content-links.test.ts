import assert from "node:assert/strict";
import { test } from "node:test";
import { contentLinkTarget, normalizeContentLink } from "../lib/content-links";

test("bare web domains receive HTTPS without changing paths, fragments, files or schemes", () => {
  for (const value of ["google.com", "www.example.com/guide", "docs.example.co.uk:8443/help?q=next#section", "example.com?next=yes"]) {
    assert.equal(normalizeContentLink(` ${value} `), `https://${value}`);
    assert.equal(contentLinkTarget(value, "article"), "_blank");
  }
  for (const value of ["/docs/start", "../guide", "docs/start", "guide.md", "notes.pdf#part", "#next", "mailto:help@example.com", "tel:+12345", "https://example.com", "//example.com", "not a website", "javascript:alert(1)"]) {
    assert.equal(normalizeContentLink(value), value);
  }
});

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
