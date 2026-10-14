"use client";

import { useLayoutEffect, type RefObject } from "react";
import { compactLayoutQuery } from "./use-compact-layout";
import { touchWritingQuery } from "./use-editor-cards-layout";
import { editableAt, readEditingFocus } from "./editing-focus-geometry";

/** Repair clipping introduced by a canvas contraction, not ordinary native editing. */
export function useMobileEditorFocus(ref: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const canvas = ref.current;
    const owner = canvas?.closest<HTMLElement>(".main-content");
    if (!canvas || !owner) return;
    const compact = matchMedia(compactLayoutQuery);
    const touch = matchMedia(touchWritingQuery);
    const viewport = window.visualViewport;
    type SelectionEdge = readonly [Node | null, number, Node | null, number];
    type Target = { surface: HTMLElement; baseline: number; contracted: boolean; returned: SelectionEdge | null; pending: boolean };
    let target: Target | null = null;
    let gesture: { surface: HTMLElement | null; id: number; x: number; y: number; height: number } | null = null;
    let handoff = false;
    let frame = 0;
    let height = owner.clientHeight;
    let width = owner.clientWidth;

    function eligible() {
      return compact.matches && touch.matches && (viewport?.scale ?? 1) === 1
        && canvas!.closest('.editor[data-scroll-layout="page"]')
        && canvas!.closest(".app[data-mobile-editor-boundary]");
    }
    function surfaceAt(node: EventTarget | null): HTMLElement | null {
      if (!(node instanceof Element)) return null;
      const surface = node.closest("label")?.control || node.closest<HTMLElement>('input, textarea, [contenteditable="true"]');
      if (!(surface instanceof HTMLElement) || !canvas!.contains(surface)
        || surface.closest(".writing-media-chooser, .writing-slash-menu")) return null;
      if (surface instanceof HTMLInputElement || surface instanceof HTMLTextAreaElement) {
        if (surface.disabled || surface.readOnly || surface instanceof HTMLInputElement && !["text", "search", "email", "url", "tel", "password"].includes(surface.type)) return null;
      } else if (!surface.isContentEditable) return null;
      return surface;
    }
    function cancel() {
      cancelAnimationFrame(frame);
      frame = 0;
      target = null;
    }
    function schedule() {
      if (target?.pending && !gesture && !frame) frame = requestAnimationFrame(reveal);
    }
    function manual() { gesture = null; cancel(); }
    // Pointerdown normally starts the same touch gesture first. A standalone
    // touchstart still yields ownership (including native selection handles).
    function onTouchStart() { if (!gesture) cancel(); }
    function selectionEdge(surface: HTMLElement): SelectionEdge | null {
      if (surface instanceof HTMLInputElement || surface instanceof HTMLTextAreaElement)
        return [surface, surface.selectionStart ?? 0, surface, surface.selectionEnd ?? 0];
      const selection = window.getSelection();
      return selection && editableAt(selection.anchorNode) === surface && editableAt(selection.focusNode) === surface
        ? [selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset] : null;
    }
    function selecting() {
      if (!target) return false;
      const edge = selectionEdge(target.surface);
      if (!edge) return false;
      const collapsed = edge[0] === edge[2] && edge[1] === edge[3];
      return !collapsed && !edge.every((value, index) => value === target!.returned?.[index]);
    }
    function reveal() {
      frame = 0;
      const pending = target;
      if (!pending || !pending.pending) return;
      if (!eligible() || document.activeElement !== pending.surface || !pending.surface.isConnected || selecting()) { cancel(); return; }
      // ResizeObserver sees the actual canvas after the viewport adapter commits.
      // Read in the next frame so native/library focus and selection can finish.
      // No scroll/viewport-origin listener can restart this correction.
      const bounds = owner!.getBoundingClientRect();
      const top = bounds.top + owner!.clientTop + 8;
      const bottom = bounds.top + owner!.clientTop + owner!.clientHeight - 8;
      const box = readEditingFocus(pending.surface, bottom - top);
      // Selection can arrive after native focus. Only that pending contraction
      // may consume a later selectionchange; it grants no new scroll intent.
      if (!box) return;
      pending.pending = false;
      if (bottom - top < box.bottom - box.top) return;
      const delta = box.bottom > bottom ? box.bottom - bottom : box.top < top ? box.top - top : 0;
      const destination = Math.max(0, Math.min(owner!.scrollHeight - owner!.clientHeight, owner!.scrollTop + delta));
      // A synchronous residual correction cannot leave an animation competing
      // with native panning, CodeMirror measurement or the next viewport report.
      if (Math.abs(destination - owner!.scrollTop) >= 1) owner!.scrollTo({ top: destination, behavior: "instant" });
    }
    function arm(surface: HTMLElement | null, selectionReturn = false) {
      cancel();
      if (!surface || !eligible() || document.activeElement !== surface) return;
      target = { surface, baseline: height, contracted: false, returned: selectionReturn ? selectionEdge(surface) : null, pending: selectionReturn };
      schedule();
    }
    function geometry() {
      const nextHeight = owner!.clientHeight;
      const nextWidth = owner!.clientWidth;
      if (width !== nextWidth) manual();
      if (target) {
        if (!eligible() || target.contracted && nextHeight >= target.baseline) cancel();
        else if (nextHeight < height) {
          target.contracted = true;
          target.pending = true;
          schedule();
        } else if (nextHeight > height) {
          // Dismissal/growth must not run a reveal queued for a smaller canvas.
          target.pending = false;
          cancelAnimationFrame(frame); frame = 0;
        }
      }
      height = nextHeight;
      width = nextWidth;
    }
    function onFocus(event: FocusEvent) {
      if (handoff) return;
      arm(surfaceAt(event.target));
    }
    function onPointer(event: PointerEvent) {
      cancel();
      handoff = false;
      gesture = event.isPrimary && event.button === 0
        ? { surface: surfaceAt(event.target), id: event.pointerId, x: event.clientX, y: event.clientY, height: owner!.clientHeight } : null;
    }
    function onMove(event: PointerEvent) {
      if (gesture?.id === event.pointerId && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8) manual();
    }
    function onClick() {
      const tap = gesture;
      gesture = null;
      if (tap?.surface && !handoff) {
        if (target?.surface !== tap.surface) arm(tap.surface);
        // Reopening a keyboard on an already focused field has no focusin.
        // Preserve a contraction reported between pointerdown and native click.
        if (target && owner!.clientHeight < tap.height) {
          target.baseline = tap.height;
          target.contracted = true;
          target.pending = true;
        }
        schedule();
      }
      handoff = false;
    }
    function onResume() { gesture = null; handoff = false; arm(surfaceAt(document.activeElement), true); }
    function onHandoff() {
      manual(); handoff = true;
      queueMicrotask(() => { handoff = false; });
    }
    function onBlur(event: FocusEvent) { if (surfaceAt(event.target)) cancel(); }
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a"
        || ["Tab", "Escape", "PageUp", "PageDown"].includes(event.key)
        || event.shiftKey && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) manual();
    }
    function selectionChanged() {
      if (selecting()) { cancel(); return; }
      schedule();
    }
    function viewportChanged() { if (!eligible()) manual(); }
    function hidden() { if (document.visibilityState !== "visible") manual(); }
    const resize = new ResizeObserver(geometry);
    resize.observe(owner);
    document.addEventListener("focusin", onFocus);
    document.addEventListener("focusout", onBlur);
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointercancel", manual, true);
    document.addEventListener("click", onClick);
    document.addEventListener("touchstart", onTouchStart, { passive: true, capture: true });
    document.addEventListener("touchmove", manual, { passive: true, capture: true });
    document.addEventListener("wheel", manual, { passive: true, capture: true });
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("selectionchange", selectionChanged);
    document.addEventListener("visibilitychange", hidden);
    canvas.addEventListener("fieldbook:writing-resume", onResume, true);
    canvas.addEventListener("fieldbook:writing-handoff", onHandoff, true);
    viewport?.addEventListener("resize", viewportChanged);
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
      document.removeEventListener("touchstart", onTouchStart, true);
      document.removeEventListener("touchmove", manual, true);
      document.removeEventListener("wheel", manual, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("selectionchange", selectionChanged);
      document.removeEventListener("visibilitychange", hidden);
      canvas.removeEventListener("fieldbook:writing-resume", onResume, true);
      canvas.removeEventListener("fieldbook:writing-handoff", onHandoff, true);
      viewport?.removeEventListener("resize", viewportChanged);
      compact.removeEventListener("change", manual);
      touch.removeEventListener("change", manual);
      window.removeEventListener("pageshow", manual);
    };
  }, [ref]);
}
