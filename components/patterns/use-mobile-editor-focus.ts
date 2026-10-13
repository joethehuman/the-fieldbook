"use client";

import { useLayoutEffect, type RefObject } from "react";
import { compactLayoutQuery } from "./use-compact-layout";
import { touchWritingQuery } from "./use-editor-cards-layout";
import { editableAt, readEditingFocus } from "./editing-focus-geometry";

// These bound one focus transaction, not keyboard state. Browsers do not expose
// a portable keyboard-animation completion event. Geometry quiet is a heuristic.
const geometryQuietMs = 120;
const focusLifetimeMs = 2000;

/** Bounded focus coordination. Geometry can invalidate a read, never create an intent. */
export function useMobileEditorFocus(ref: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const canvas = ref.current;
    const owner = canvas?.closest<HTMLElement>(".main-content");
    if (!canvas || !owner) return;
    const compact = matchMedia(compactLayoutQuery);
    const touch = matchMedia(touchWritingQuery);
    const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
    const viewport = window.visualViewport;
    type Intent = { surface: HTMLElement; deadline: number; height: number; baselineHeight: number; width: number; opening: boolean; selectionReturn: boolean; needsReveal: boolean };
    let intent: Intent | null = null;
    let gesture: { surface: HTMLElement | null; id: number; x: number; y: number } | null = null;
    let handoff = false;
    let timer = 0;
    let frame = 0;
    let quietUntil = 0;
    let smoothDestination: number | null = null;

    function eligible() {
      return compact.matches && touch.matches && (viewport?.scale ?? 1) === 1
        && canvas!.closest('.editor[data-scroll-layout="page"]')
        && canvas!.closest(".app[data-mobile-editor-boundary]");
    }
    function surfaceAt(target: EventTarget | null): HTMLElement | null {
      if (!(target instanceof Element)) return null;
      const surface = target.closest("label")?.control || target.closest<HTMLElement>('input, textarea, [contenteditable="true"]');
      if (!(surface instanceof HTMLElement) || !canvas!.contains(surface)
        || surface.closest(".writing-media-chooser, .writing-slash-menu")) return null;
      if (surface instanceof HTMLInputElement || surface instanceof HTMLTextAreaElement) {
        if (surface.disabled || surface.readOnly || surface instanceof HTMLInputElement && !["text", "search", "email", "url", "tel", "password"].includes(surface.type)) return null;
      } else if (!surface.isContentEditable) return null;
      return surface;
    }
    function stopMotion() {
      if (smoothDestination === null) return;
      smoothDestination = null;
      // Abort our native smooth scroll at its current position when the author
      // takes control or navigates away. This is not a corrective scroll.
      owner!.scrollTo({ top: owner!.scrollTop, behavior: "instant" });
    }
    function release() {
      clearTimeout(timer); timer = 0;
      cancelAnimationFrame(frame); frame = 0;
      intent = null;
    }
    function cancel() {
      release();
      stopMotion();
    }
    function queue(delay: number) {
      clearTimeout(timer);
      cancelAnimationFrame(frame); frame = 0;
      timer = window.setTimeout(() => { timer = 0; frame = requestAnimationFrame(check); }, Math.max(0, delay));
    }
    function quiet() {
      if (!intent?.needsReveal) return;
      quietUntil = performance.now() + geometryQuietMs;
      queue(Math.min(geometryQuietMs, intent.deadline - performance.now()));
    }
    function check() {
      frame = 0;
      const pending = intent;
      const now = performance.now();
      // Expiry removes permission for another reveal, but lets an already
      // authorized native animation finish. Explicit cancellation stops it.
      if (!pending || now >= pending.deadline) { release(); return; }
      if (!eligible() || document.activeElement !== pending.surface || !pending.surface.isConnected) { cancel(); return; }
      if (now < quietUntil) { queue(Math.min(quietUntil - now, pending.deadline - now)); return; }
      // Preserve native selection gestures. Explicit menu returns may restore a range.
      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      if (!pending.selectionReturn && pending.surface.isContentEditable && selection && !selection.isCollapsed && range
        && editableAt(range.startContainer) === pending.surface && editableAt(range.endContainer) === pending.surface) { cancel(); return; }
      if (!pending.needsReveal) { queue(pending.deadline - now); return; }
      const bounds = owner!.getBoundingClientRect();
      const top = bounds.top + owner!.clientTop + 8;
      const bottom = bounds.top + owner!.clientTop + owner!.clientHeight - 8;
      const box = readEditingFocus(pending.surface, bottom - top);
      if (!box) { queue(pending.deadline - now); return; }
      // Fulfil this geometry version before writing. Only another actual height
      // change can invalidate it, within the original absolute focus deadline.
      pending.needsReveal = false;
      queue(pending.deadline - now);
      let delta = box.bottom > bottom ? box.bottom - bottom : box.top < top ? box.top - top : 0;
      // Label context enriches a necessary reveal; a clipped label alone never moves a visible field.
      if (Math.abs(delta) >= 1) {
        const label = pending.surface.closest('[data-slot="field"]')?.querySelector("label")?.getBoundingClientRect();
        if (label && box.bottom - label.top <= bottom - top && label.top < top) delta = label.top - top;
        const destination = Math.max(0, Math.min(owner!.scrollHeight - owner!.clientHeight, owner!.scrollTop + delta));
        if (Math.abs(destination - owner!.scrollTop) >= 1) {
          smoothDestination = reducedMotion.matches ? null : destination;
          owner!.scrollTo({ top: destination, behavior: reducedMotion.matches ? "instant" : "smooth" });
        }
        return;
      }
    }
    function arm(surface: HTMLElement | null, selectionReturn = false) {
      cancel();
      if (!surface || !eligible() || document.activeElement !== surface) return;
      intent = { surface, deadline: performance.now() + focusLifetimeMs, height: owner!.clientHeight, baselineHeight: owner!.clientHeight, width: owner!.clientWidth, opening: false, selectionReturn, needsReveal: true };
      quiet();
    }
    function geometry() {
      if (!intent) return;
      if (!eligible() || owner!.clientWidth !== intent.width || intent.opening && owner!.clientHeight >= intent.baselineHeight - 1) { cancel(); return; }
      if (Math.abs(owner!.clientHeight - intent.height) >= 1) {
        intent.height = owner!.clientHeight;
        intent.needsReveal = true;
        if (intent.height < intent.baselineHeight) intent.opening = true;
        quiet();
      }
    }
    function onFocus(event: FocusEvent) {
      const surface = surfaceAt(event.target);
      if (!surface) { cancel(); return; }
      if (handoff || gesture?.surface === surface) return;
      arm(surface);
    }
    function onPointer(event: PointerEvent) {
      cancel();
      handoff = false;
      gesture = event.isPrimary && event.button === 0
        ? { surface: surfaceAt(event.target), id: event.pointerId, x: event.clientX, y: event.clientY } : null;
    }
    function onMove(event: PointerEvent) {
      if (gesture?.id === event.pointerId && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8) {
        gesture = null; cancel();
      }
    }
    function onClick() {
      const surface = gesture?.surface;
      gesture = null;
      if (surface && !handoff) arm(surface);
      handoff = false;
    }
    function manual() { gesture = null; cancel(); }
    function onResume() { handoff = false; arm(surfaceAt(document.activeElement), true); }
    function onHandoff() {
      manual();
      handoff = true;
      queueMicrotask(() => { handoff = false; });
    }
    function onBlur(event: FocusEvent) { if (surfaceAt(event.target)) cancel(); }
    function onKey(event: KeyboardEvent) {
      // Initial typing is part of a pending opening; geometry reads its live caret.
      if (["Tab", "Escape", "PageUp", "PageDown"].includes(event.key)
        || event.shiftKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) manual();
    }
    function selectionChanged() {
      if (!intent) return;
      const selection = window.getSelection();
      const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
      if (!intent.selectionReturn && intent.surface.isContentEditable && selection && !selection.isCollapsed && range
        && editableAt(range.startContainer) === intent.surface && editableAt(range.endContainer) === intent.surface) { cancel(); return; }
      if (!intent.needsReveal) return;
      // A valid native selection can commit after focus. Wake the existing
      // transaction without extending its quiet period or absolute deadline.
      clearTimeout(timer); timer = 0;
      if (!frame) frame = requestAnimationFrame(check);
    }
    function onScroll() {
      if (smoothDestination !== null) {
        if (Math.abs(owner!.scrollTop - smoothDestination) < 1) smoothDestination = null;
        return;
      }
      quiet();
    }
    function scrollEnd() { smoothDestination = null; }
    function hidden() { if (document.visibilityState !== "visible") manual(); }
    const resize = new ResizeObserver(geometry);
    resize.observe(owner);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointercancel", manual, true);
    document.addEventListener("click", onClick);
    document.addEventListener("touchmove", manual, { passive: true, capture: true });
    document.addEventListener("wheel", manual, { passive: true, capture: true });
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("selectionchange", selectionChanged);
    document.addEventListener("visibilitychange", hidden);
    canvas.addEventListener("fieldbook:writing-resume", onResume, true);
    canvas.addEventListener("fieldbook:writing-handoff", onHandoff, true);
    viewport?.addEventListener("resize", geometry);
    viewport?.addEventListener("scroll", quiet);
    owner.addEventListener("scroll", onScroll, { passive: true });
    owner.addEventListener("scrollend", scrollEnd);
    compact.addEventListener("change", manual);
    touch.addEventListener("change", manual);
    window.addEventListener("pageshow", manual);
    return () => {
      manual(); resize.disconnect();
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onBlur);
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointercancel", manual, true);
      document.removeEventListener("click", onClick);
      document.removeEventListener("touchmove", manual, true);
      document.removeEventListener("wheel", manual, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("selectionchange", selectionChanged);
      document.removeEventListener("visibilitychange", hidden);
      canvas.removeEventListener("fieldbook:writing-resume", onResume, true);
      canvas.removeEventListener("fieldbook:writing-handoff", onHandoff, true);
      viewport?.removeEventListener("resize", geometry);
      viewport?.removeEventListener("scroll", quiet);
      owner.removeEventListener("scroll", onScroll);
      owner.removeEventListener("scrollend", scrollEnd);
      compact.removeEventListener("change", manual);
      touch.removeEventListener("change", manual);
      window.removeEventListener("pageshow", manual);
    };
  }, [ref]);
}
