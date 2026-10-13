"use client";

import { createRootEditorSubscription$, realmPlugin } from "@mdxeditor/editor";
import { $createRangeSelection, $getRoot, $setSelection, getNearestEditorFromDOMNode, SKIP_SCROLL_INTO_VIEW_TAG, type LexicalEditor } from "lexical";
import { compactLayoutQuery } from "./use-compact-layout";
import { touchWritingQuery } from "./use-editor-cards-layout";

/** Blank canvas is a tap target without enlarging the native editable bounds. */
function registerBlankCanvasTap(editor: LexicalEditor) {
  const compact = window.matchMedia(compactLayoutQuery);
  const touch = window.matchMedia(touchWritingQuery);
  let removeListeners = () => {};
  const removeRootListener = editor.registerRootListener((surface) => {
    removeListeners();
    removeListeners = () => {};
    const owner = surface?.closest<HTMLElement>(".main-content");
    const writing = surface?.closest<HTMLElement>(".writing-root");
    if (!surface || !owner || !writing) return;
    const wrappers = new Set<Element>([owner]);
    for (let ancestor = surface.parentElement; ancestor && ancestor !== owner; ancestor = ancestor.parentElement) {
      if (ancestor.matches(".mdxeditor-contenteditable-wrapper, .writing-document, .writing-viewport, .editor-frame-canvas")) wrappers.add(ancestor);
    }
    let tap: { id: number; x: number; y: number } | null = null;
    const start = (event: PointerEvent) => {
      tap = event.isPrimary && event.button === 0 && event.target instanceof Element
        && wrappers.has(event.target) && event.clientY >= surface.getBoundingClientRect().bottom
        ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null;
    };
    const move = (event: PointerEvent) => {
      if (tap && event.pointerId === tap.id && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 8) tap = null;
    };
    const cancel = () => { tap = null; };
    const click = (event: MouseEvent) => {
      const completedTap = tap;
      tap = null;
      if (!completedTap || event.defaultPrevented || !editor.isEditable()
        || !compact.matches || !touch.matches
        || !writing.hasAttribute("data-mobile-canvas")
        || owner.querySelectorAll(".writing-root[data-mobile-canvas]").length !== 1
        || !(event.target instanceof Element) || !wrappers.has(event.target)
        || event.clientY < surface.getBoundingClientRect().bottom) return;
      event.preventDefault();
      if (surface.ownerDocument.activeElement !== surface) surface.focus({ preventScroll: true });
      // This explicit return already has a bounded canvas reveal. Native
      // selection must not initiate focus or a second Lexical scroll walk.
      editor.update(() => { $getRoot().selectEnd(); }, { discrete: true, tag: SKIP_SCROLL_INTO_VIEW_TAG });
      writing.dispatchEvent(new Event("fieldbook:writing-resume"));
    };
    owner.addEventListener("pointerdown", start, { passive: true });
    owner.addEventListener("pointermove", move, { passive: true });
    owner.addEventListener("pointercancel", cancel);
    owner.addEventListener("click", click);
    removeListeners = () => {
      owner.removeEventListener("pointerdown", start);
      owner.removeEventListener("pointermove", move);
      owner.removeEventListener("pointercancel", cancel);
      owner.removeEventListener("click", click);
      tap = null;
    };
  });
  return () => { removeRootListener(); removeListeners(); };
}

export const writingMobileCanvasPlugin = realmPlugin({
  init(realm) {
    realm.pub(createRootEditorSubscription$, editor => {
      const removeBlankTap = registerBlankCanvasTap(editor);
      let removeReveal = () => {};
      const removeRoot = editor.registerRootListener(surface => {
        removeReveal();
        removeReveal = () => {};
        if (!surface) return;
        const reveal = (event: Event) => {
          if (!(event instanceof CustomEvent) || !(event.detail instanceof Range)
            || !surface.closest(".writing-root[data-mobile-canvas]") || !editor.isEditable()
            || getNearestEditorFromDOMNode(event.detail.startContainer) !== editor
            || getNearestEditorFromDOMNode(event.detail.endContainer) !== editor) return;
          // Guided navigation already owns its bounded scroll animation.
          // Set its caret as one tagged editor transaction, rather than let
          // selection reconciliation start another reveal of the empty line.
          if (surface.ownerDocument.activeElement !== surface) surface.focus({ preventScroll: true });
          editor.update(() => {
            const selection = $createRangeSelection();
            selection.applyDOMRange(event.detail);
            $setSelection(selection);
          }, { discrete: true, tag: SKIP_SCROLL_INTO_VIEW_TAG });
          event.preventDefault();
        };
        surface.addEventListener("fieldbook:writing-reveal", reveal);
        removeReveal = () => surface.removeEventListener("fieldbook:writing-reveal", reveal);
      });
      return () => { removeBlankTap(); removeRoot(); removeReveal(); };
    });
  },
});
