import { test } from "node:test";
import assert from "node:assert/strict";
import { createMobileEditorLayout, createMobileEditorOpening, mobileEditorOpeningReady } from "../components/patterns/mobile-editor-layout";

test("a menu stays hidden through continuous keyboard dismissal beyond its fallback", () => {
  const opening = createMobileEditorOpening(0);
  for (let now = 0; now <= 900; now += 20) {
    const height = 490 + 322 * now / 900;
    const offset = 24 * Math.sin(Math.PI * now / 900);
    const keyboard = 812 - height > 80;
    const result = mobileEditorOpeningReady(opening,
      { top: offset + 68, bottom: offset + height - (keyboard ? 136 : 80), keyboard },
      360, [height, offset, 375, 0, 1], now);
    assert.equal(result.ready, false, `The menu became visible during dismissal at ${now}ms`);
  }
  const closed = { top: 68, bottom: 732, keyboard: false };
  assert.equal(mobileEditorOpeningReady(opening, closed, 360, [812, 0, 375, 0, 1], 995).ready, false);
  assert.equal(mobileEditorOpeningReady(opening, closed, 360, [812, 0, 375, 0, 1], 996).ready, true);
});

test("unchanged layout notifications do not postpone a settled opening", () => {
  const opening = createMobileEditorOpening(0);
  const band = { top: 68, bottom: 732, keyboard: false };
  for (const now of [0, 20, 40, 60, 80]) {
    assert.equal(mobileEditorOpeningReady(opening, band, 360, [812, 0, 375, 0, 1], now).ready, false);
  }
  assert.equal(mobileEditorOpeningReady(opening, band, 360, [812, 0, 375, 0, 1], 96).ready, true);
});

test("a static keyboard retains its fallback without letting late movement bypass it", () => {
  const opening = createMobileEditorOpening(0);
  const band = { top: 68, bottom: 354, keyboard: true };
  assert.equal(mobileEditorOpeningReady(opening, band, 360, [490, 0, 375, 0, 1], 0).ready, false);
  assert.equal(mobileEditorOpeningReady(opening, band, 360, [490, 0, 375, 0, 1], 349).ready, false);
  assert.equal(mobileEditorOpeningReady(opening, band, 360, [490, 0, 375, 0, 1], 350).ready, true);

  const moving = createMobileEditorOpening(0);
  mobileEditorOpeningReady(moving, band, 360, [490, 0, 375, 0, 1], 0);
  const changed = { ...band, bottom: 414 };
  assert.equal(mobileEditorOpeningReady(moving, changed, 360, [550, 0, 375, 0, 1], 340).ready, false);
  assert.equal(mobileEditorOpeningReady(moving, changed, 360, [550, 0, 375, 0, 1], 350).ready, false);
  assert.equal(mobileEditorOpeningReady(moving, changed, 360, [550, 0, 375, 0, 1], 436).ready, false);
  const closed = { top: 68, bottom: 732, keyboard: false };
  assert.equal(mobileEditorOpeningReady(moving, closed, 360, [812, 0, 375, 0, 1], 500).ready, false);
  assert.equal(mobileEditorOpeningReady(moving, closed, 360, [812, 0, 375, 0, 1], 596).ready, true);
});

test("an already quiet closed viewport opens immediately and unchanged samples keep its age", () => {
  const layout = createMobileEditorLayout();
  assert.equal(layout.recordViewport([812, 0, 375, 0, 1], 0, 812), true);
  assert.equal(layout.recordViewport([812, 0, 375, 0, 1], 180, 812), false);
  assert.equal(layout.viewport!.changedAt, 0);
  const opening = createMobileEditorOpening(200, layout.viewport);
  assert.equal(mobileEditorOpeningReady(opening, { top: 68, bottom: 732, keyboard: false },
    360, [812, 0, 375, 0, 1], 200, layout.viewport).ready, true);
});

test("a keyboard that moves then stays open reveals controls after a quiet fallback", () => {
  const layout = createMobileEditorLayout();
  layout.recordViewport([490, 0, 375, 0, 1], 0, 812);
  const opening = createMobileEditorOpening(0, layout.viewport);
  const band = { top: 68, bottom: 354, keyboard: true };
  mobileEditorOpeningReady(opening, band, 360, [490, 0, 375, 0, 1], 0, layout.viewport);
  for (const now of [160, 320, 480]) {
    const height = 490 + now / 8;
    layout.recordViewport([height, 0, 375, 0, 1], now, 812);
    assert.equal(mobileEditorOpeningReady(opening, { ...band, bottom: height - 136 },
      360, [height, 0, 375, 0, 1], now, layout.viewport).ready, false);
  }
  const finalBand = { ...band, bottom: 414 };
  // Unchanged notifications do not restart the fallback. It is measured from
  // the final movement, even when the keyboard never dismisses completely.
  layout.recordViewport([550, 0, 375, 0, 1], 700, 812);
  assert.equal(mobileEditorOpeningReady(opening, finalBand, 360,
    [550, 0, 375, 0, 1], 829, layout.viewport).ready, false);
  assert.equal(mobileEditorOpeningReady(opening, finalBand, 360,
    [550, 0, 375, 0, 1], 830, layout.viewport).ready, true);
});

test("the keyboard threshold does not mark a partially restored viewport as finished", () => {
  const layout = createMobileEditorLayout();
  layout.recordViewport([490, 0, 375, 0, 1], 0, 812);
  const opening = createMobileEditorOpening(200, layout.viewport);
  mobileEditorOpeningReady(opening, { top: 68, bottom: 354, keyboard: true },
    360, [490, 0, 375, 0, 1], 200, layout.viewport);
  layout.recordViewport([750, 0, 375, 0, 1], 240, 812);
  const partial = { top: 68, bottom: 670, keyboard: false };
  assert.equal(mobileEditorOpeningReady(opening, partial, 360,
    [750, 0, 375, 0, 1], 240, layout.viewport).ready, false);
  assert.equal(mobileEditorOpeningReady(opening, partial, 360,
    [750, 0, 375, 0, 1], 400, layout.viewport).ready, false);
  layout.recordViewport([812, 0, 375, 0, 1], 460, 812);
  const final = { top: 68, bottom: 732, keyboard: false };
  assert.equal(mobileEditorOpeningReady(opening, final, 360,
    [812, 0, 375, 0, 1], 460, layout.viewport).ready, false);
  assert.equal(mobileEditorOpeningReady(opening, final, 360,
    [812, 0, 375, 0, 1], 556, layout.viewport).ready, true);
});
