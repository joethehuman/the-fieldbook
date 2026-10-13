"use client";

import { useLayoutEffect, type RefObject } from "react";
import { compactLayoutQuery } from "./use-compact-layout";
import { touchWritingQuery } from "./use-editor-cards-layout";

/** Quiz fields can prepare room before the keyboard opens. Geometry never re-reveals them. */
export function useMobileQuizFocus(active: boolean, rootRef: RefObject<HTMLDivElement | null>, spaceRef: RefObject<HTMLDivElement | null>) {
  useLayoutEffect(() => {
    const root = rootRef.current;
    const space = spaceRef.current;
    const owner = root?.closest<HTMLElement>(".main-content");
    if (!active || !root || !space || !owner) return;
    const compact = matchMedia(compactLayoutQuery);
    const touch = matchMedia(touchWritingQuery);
    type Field = HTMLInputElement | HTMLTextAreaElement;
    let lastField: Field | null = null;
    let handoff: Field | null = null;
    let gesture: { field: Field; x: number; y: number; handled: boolean } | null = null;
    let keyboardNavigation = false;
    let leased = false;
    let height = 0;
    let request = 0;

    function fieldAt(target: EventTarget | null): Field | null {
      if (!(target instanceof Element)) return null;
      const candidate = target instanceof HTMLLabelElement ? target.control
        : target.closest("label")?.control || target;
      return ((candidate instanceof HTMLInputElement && candidate.type === "text") || candidate instanceof HTMLTextAreaElement)
        && root!.contains(candidate) && candidate.closest(".course-quiz-content")
        && !candidate.disabled && !candidate.readOnly ? candidate : null;
    }
    function eligible() {
      return compact.matches && touch.matches && (window.visualViewport?.scale ?? 1) === 1
        && root!.closest('.editor[data-scroll-layout="page"]')
        && root!.closest(".app[data-mobile-editor-boundary]");
    }
    function setSpace(next: number) {
      next = Math.ceil(Math.max(0, next));
      if (next === height) return;
      height = next;
      space!.style.height = `${next}px`;
    }
    function intrinsicEnd() {
      // The spacer's flow anchor excludes its own height and viewport minimums.
      // Include the trailing boxes up to the actual scroll owner, never scrollHeight.
      let end = space!.getBoundingClientRect().top - owner!.getBoundingClientRect().top - owner!.clientTop + owner!.scrollTop;
      for (let element: HTMLElement | null = space!.parentElement; element; element = element.parentElement) {
        const style = getComputedStyle(element);
        end += parseFloat(style.paddingBottom) || 0;
        if (element === owner) break;
        end += (parseFloat(style.borderBottomWidth) || 0) + (parseFloat(style.marginBottom) || 0);
      }
      return end;
    }
    function support(position: number) {
      setSpace(position + owner!.clientHeight - intrinsicEnd());
    }
    function measure() {
      if (!leased) return;
      // Retain only the room needed by the current native/manual position. Removing
      // it on blur or keyboard dismissal can clamp the canvas and cause a jump.
      support(owner!.scrollTop);
      if (lastField && !root!.contains(lastField)) lastField = null;
    }
    function schedule() {
      if (!request) request = requestAnimationFrame(() => { request = 0; measure(); });
    }
    function position(field: Field) {
      if (!eligible() || document.activeElement !== field) return;
      lastField = field;
      leased = true;
      const top = owner!.getBoundingClientRect().top + owner!.clientTop;
      const fieldTop = field.getBoundingClientRect().top;
      const gap = 1.5 * parseFloat(getComputedStyle(document.documentElement).fontSize);
      const delta = fieldTop - top - gap;
      if (delta > 1 || fieldTop < top) {
        const destination = Math.max(0, owner!.scrollTop + delta);
        support(Math.max(owner!.scrollTop, destination));
        owner!.scrollTo({ top: destination, behavior: "instant" });
      }
      measure();
    }
    function onFocus(event: FocusEvent) {
      const field = fieldAt(event.target);
      if (!field) return;
      if (handoff === field) {
        handoff = null;
        lastField = field;
        if (gesture?.field === field) gesture.handled = true;
        return;
      }
      // Pointer focus waits for click so moving the field cannot change the native
      // caret placement at the tapped point. Tab/keyboard Next reveal immediately.
      if (gesture?.field === field || field === lastField) return;
      position(field);
    }
    function onPointer(event: PointerEvent) {
      const field = fieldAt(event.target);
      gesture = field && event.isPrimary && event.button === 0
        ? { field, x: event.clientX, y: event.clientY, handled: false } : null;
    }
    function onMove(event: PointerEvent) {
      if (gesture && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8) gesture = null;
    }
    function cancelGesture() { gesture = null; }
    function onKey(event: KeyboardEvent) {
      keyboardNavigation = event.key === "Tab";
    }
    function onDocumentFocus(event: FocusEvent) {
      // Consume Tab on the next focus transition, including one inside a popup.
      // Escape returning from that popup must not reuse its navigation intent.
      if (keyboardNavigation && fieldAt(event.target)) lastField = null;
      keyboardNavigation = false;
    }
    function onClick() {
      const intent = gesture;
      gesture = null;
      if (intent && !intent.handled) position(intent.field);
    }
    function onHandoff(event: Event) {
      const field = fieldAt(event.target);
      if (!field) return;
      handoff = field;
      // Handoffs dispatch just before synchronous protected focus; an already
      // focused target produces no focusin event, so don't leave a stale marker.
      queueMicrotask(() => { if (handoff === field) handoff = null; });
    }
    const resize = new ResizeObserver(schedule);
    resize.observe(owner);
    resize.observe(root);
    const mutations = new MutationObserver(schedule);
    mutations.observe(root, { childList: true, subtree: true, characterData: true });
    root.addEventListener("focusin", onFocus);
    root.addEventListener("focusout", schedule);
    root.addEventListener("fieldbook:writing-handoff", onHandoff);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onDocumentFocus, true);
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointercancel", cancelGesture, true);
    document.addEventListener("touchmove", cancelGesture, { passive: true, capture: true });
    document.addEventListener("wheel", cancelGesture, { passive: true, capture: true });
    document.addEventListener("click", onClick);
    owner.addEventListener("scroll", schedule, { passive: true });
    return () => {
      cancelAnimationFrame(request);
      resize.disconnect();
      mutations.disconnect();
      root.removeEventListener("focusin", onFocus);
      root.removeEventListener("focusout", schedule);
      root.removeEventListener("fieldbook:writing-handoff", onHandoff);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onDocumentFocus, true);
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointercancel", cancelGesture, true);
      document.removeEventListener("touchmove", cancelGesture, true);
      document.removeEventListener("wheel", cancelGesture, true);
      document.removeEventListener("click", onClick);
      owner.removeEventListener("scroll", schedule);
      space.style.removeProperty("height");
    };
  }, [active, rootRef, spaceRef]);
}
