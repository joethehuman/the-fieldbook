"use client";

import { useLayoutEffect } from "react";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  addNestedEditorChild$,
  addTableCellEditorChild$,
  createRootEditorSubscription$,
  realmPlugin,
} from "@mdxeditor/editor";
import {
  $addUpdateTag,
  $getRoot,
  COMMAND_PRIORITY_HIGH,
  FOCUS_COMMAND,
  RootNode,
  SELECTION_CHANGE_COMMAND,
  SKIP_SCROLL_INTO_VIEW_TAG,
  type LexicalEditor,
} from "lexical";
import { compactLayoutQuery } from "./use-compact-layout";
import { touchWritingQuery } from "./use-editor-cards-layout";

function registerMobileScrollPolicy(editor: LexicalEditor) {
  const compact = window.matchMedia(compactLayoutQuery);
  const touch = window.matchMedia(touchWritingQuery);
  const tag = () => {
    const surface = editor.getRootElement();
    if (compact.matches && touch.matches && window.visualViewport?.scale === 1
      && surface?.closest(".writing-root[data-mobile-caret-owner]")
      && !surface.closest(".writing-code-block")) {
      $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
    }
  };
  const onSelection = () => { tag(); return false; };
  const cleanups = [
    editor.registerNodeTransform(RootNode, tag),
    editor.registerCommand(SELECTION_CHANGE_COMMAND, onSelection, COMMAND_PRIORITY_HIGH),
    editor.registerCommand(FOCUS_COMMAND, onSelection, COMMAND_PRIORITY_HIGH),
  ];
  return () => cleanups.forEach(cleanup => cleanup());
}

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
        || !compact.matches || !touch.matches || window.visualViewport?.scale !== 1
        || !writing.hasAttribute("data-mobile-caret-owner")
        || owner.querySelectorAll(".writing-root[data-mobile-caret-owner]").length !== 1
        || !(event.target instanceof Element) || !wrappers.has(event.target)
        || event.clientY < surface.getBoundingClientRect().bottom) return;
      event.preventDefault();
      editor.update(() => { $getRoot().selectEnd(); }, { discrete: true, tag: SKIP_SCROLL_INTO_VIEW_TAG });
      if (surface.ownerDocument.activeElement !== surface) surface.focus({ preventScroll: true });
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

function NestedMobileScrollPolicy() {
  const [editor] = useLexicalComposerContext();
  // Install before the containing cell's passive focus effect, not after the
  // toolbar learns that this nested editor became active.
  useLayoutEffect(() => registerMobileScrollPolicy(editor), [editor]);
  return null;
}

export const writingMobileScrollPolicyPlugin = realmPlugin({
  init(realm) {
    realm.pub(createRootEditorSubscription$, (editor) => {
      const removePolicy = registerMobileScrollPolicy(editor);
      const removeBlankCanvasTap = registerBlankCanvasTap(editor);
      return () => { removePolicy(); removeBlankCanvasTap(); };
    });
    realm.pub(addTableCellEditorChild$, NestedMobileScrollPolicy);
    realm.pub(addNestedEditorChild$, NestedMobileScrollPolicy);
  },
});
