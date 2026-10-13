import { test } from "node:test";
import assert from "node:assert/strict";
import { createMobileEditorLayout } from "../components/patterns/mobile-editor-layout";

test("mobile geometry bursts share a paint and late invalidations cannot repeat a scroll phase", (context) => {
  const frames = new Map<number, FrameRequestCallback>();
  let next = 0;
  const originalRequest = Object.getOwnPropertyDescriptor(globalThis, "requestAnimationFrame");
  const originalCancel = Object.getOwnPropertyDescriptor(globalThis, "cancelAnimationFrame");
  globalThis.requestAnimationFrame = callback => { frames.set(++next, callback); return next; };
  globalThis.cancelAnimationFrame = id => { frames.delete(id); };
  context.after(() => {
    if (originalRequest) Object.defineProperty(globalThis, "requestAnimationFrame", originalRequest);
    else Reflect.deleteProperty(globalThis, "requestAnimationFrame");
    if (originalCancel) Object.defineProperty(globalThis, "cancelAnimationFrame", originalCancel);
    else Reflect.deleteProperty(globalThis, "cancelAnimationFrame");
  });
  const paint = () => {
    const current = [...frames.values()];
    frames.clear();
    current.forEach(callback => callback(0));
  };
  const layout = createMobileEditorLayout();
  const calls: string[] = [];
  let recheck = true;
  const cleanup = [
    layout.subscribe("caret", () => {
      calls.push("caret");
      if (recheck) { recheck = false; layout.schedule("caret"); }
    }),
    layout.subscribe("overlay", () => calls.push("overlay")),
    layout.subscribe("viewport", () => calls.push("viewport")),
    layout.subscribe("dock", () => { calls.push("dock"); layout.schedule("overlay"); }),
  ];
  layout.schedule("caret"); layout.schedule("viewport"); layout.schedule("dock");
  assert.equal(frames.size, 1);
  paint();
  assert.deepEqual(calls, ["viewport", "dock", "caret", "overlay"]);
  calls.length = 0;
  paint();
  assert.deepEqual(calls, ["caret", "overlay"]);
  assert.equal(frames.size, 0);
  layout.schedule("viewport");
  cleanup.forEach(unsubscribe => unsubscribe());
  assert.equal(frames.size, 0);
});
