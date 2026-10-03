"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { activeEditor$, applyFormat$, applyListType$, convertSelectionToNode$, currentBlockType$, currentFormat$, currentListType$, openLinkEditDialog$ } from "@mdxeditor/editor";
import { useCellValue, usePublisher } from "@mdxeditor/gurx";
import { $addUpdateTag, $createRangeSelection, $getSelection, $isRangeSelection, $setSelection, SKIP_SCROLL_INTO_VIEW_TAG, type LexicalEditor, type RangeSelection } from "lexical";
import { Bold, Check, ChevronRight, Code, Italic, Link } from "lucide-react";
import { Button } from "../ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "../ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { createWritingBlock, writingBlockStyles, type WritingBlockStyle } from "./writing-commands";
import { useWritingInteraction } from "./writing-interaction";

type SelectionMenuController = (keyboard: boolean) => boolean;

/** Non-modal formatting tools keep the real editor selection as their target. */
export function WritingSelectionMenu({ disabled, onReady }: {
  disabled: boolean;
  onReady: (controller: SelectionMenuController | null) => void;
}) {
  const editor = useCellValue(activeEditor$);
  const format = useCellValue(currentFormat$);
  const blockType = useCellValue(currentBlockType$);
  const listType = useCellValue(currentListType$);
  const applyFormat = usePublisher(applyFormat$);
  const applyList = usePublisher(applyListType$);
  const convert = usePublisher(convertSelectionToNode$);
  const openLink = usePublisher(openLinkEditDialog$);
  const saved = useRef<RangeSelection | null>(null);
  const savedEditor = useRef<LexicalEditor | null>(null);
  const range = useRef<Range | null>(null);
  const virtualAnchor = useRef<{ getBoundingClientRect: () => DOMRect; contextElement?: Element } | null>(null);
  const firstControl = useRef<HTMLButtonElement>(null);
  const keyboardOpen = useRef(false);
  const dismissed = useRef("");
  const [open, setOpen] = useState(false);
  useWritingInteraction(open && !disabled);

  const snapshot = useCallback(() => {
    if (!editor || disabled) return false;
    const domSelection = window.getSelection();
    const surface = editor.getRootElement();
    if (!domSelection?.rangeCount || domSelection.isCollapsed || !surface) return false;
    const selected = domSelection.getRangeAt(0).cloneRange();
    // Native paragraph selection may place its trailing endpoint just outside
    // contenteditable. Clip that endpoint to the document before taking a snapshot.
    if (!surface.contains(selected.startContainer) || !selected.intersectsNode(surface)) return false;
    const contents = document.createRange();
    contents.selectNodeContents(surface);
    if (selected.compareBoundaryPoints(Range.END_TO_END, contents) > 0) selected.setEnd(contents.endContainer, contents.endOffset);
    if (!selected.toString().trim()) return false;
    let selection: RangeSelection | null = null;
    editor.read(() => {
      const existing = $getSelection();
      const current = $isRangeSelection(existing) ? existing.clone() : $createRangeSelection();
      current.applyDOMRange(selected);
      if (!current.isCollapsed() && current.getTextContent().trim()) selection = current;
    });
    if (!selection) return false;
    range.current = selected;
    saved.current = selection;
    savedEditor.current = editor;
    virtualAnchor.current = { getBoundingClientRect: () => range.current?.getBoundingClientRect() || new DOMRect(), contextElement: surface };
    return true;
  }, [editor, disabled]);

  const stamp = () => {
    const selection = saved.current;
    return selection ? `${selection.anchor.key}:${selection.anchor.offset}-${selection.focus.key}:${selection.focus.offset}` : "";
  };
  const show = useCallback((keyboard: boolean) => {
    if (!snapshot()) return false;
    dismissed.current = "";
    keyboardOpen.current = keyboard;
    setOpen(true);
    if (keyboard) firstControl.current?.focus({ preventScroll: true });
    return true;
  }, [snapshot]);

  useEffect(() => {
    onReady(show);
    return () => onReady(null);
  }, [onReady, show]);
  useEffect(() => {
    let pending = 0;
    const update = () => {
      cancelAnimationFrame(pending);
      pending = requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active instanceof Element && active.closest("[data-writing-selection-menu]")) return;
        const domSelection = window.getSelection();
        const surface = editor?.getRootElement();
        if (!domSelection || domSelection.isCollapsed || !surface?.contains(domSelection.anchorNode)) {
          dismissed.current = "";
          saved.current = null;
          savedEditor.current = null;
          range.current = null;
          setOpen(false);
          return;
        }
        if (!snapshot()) {
          saved.current = null;
          savedEditor.current = null;
          range.current = null;
          setOpen(false);
        } else if (stamp() !== dismissed.current) {
          keyboardOpen.current = false;
          setOpen(true);
        }
      });
    };
    document.addEventListener("selectionchange", update);
    document.addEventListener("pointerup", update);
    const unregister = editor?.registerUpdateListener(update);
    return () => {
      cancelAnimationFrame(pending);
      document.removeEventListener("selectionchange", update);
      document.removeEventListener("pointerup", update);
      unregister?.();
    };
  }, [editor, snapshot]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  function restore() {
    if (!editor || !saved.current || savedEditor.current !== editor) return false;
    const selection = saved.current.clone();
    let valid = false;
    editor.update(() => {
      try {
        valid = selection.anchor.getNode().isAttached() && selection.focus.getNode().isAttached();
      } catch { /* Deleted selection nodes cannot receive an action. */ }
      if (valid) $setSelection(selection);
    }, { discrete: true });
    if (!valid) {
      saved.current = null;
      savedEditor.current = null;
      range.current = null;
      setOpen(false);
    }
    return valid;
  }
  function style(kind: WritingBlockStyle) {
    if (!restore()) return;
    if (kind === "bullet" || kind === "number") applyList(kind);
    else convert(() => createWritingBlock(kind));
    focusEditor();
  }
  function formatText(kind: "bold" | "italic" | "code") {
    if (!restore()) return;
    applyFormat(kind);
    focusEditor();
  }
  function focusEditor() {
    editor?.update(() => {
      $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
      editor.focus();
    });
  }
  function dismiss() {
    dismissed.current = stamp();
    setOpen(false);
  }
  const currentStyle = writingBlockStyles.find(({ kind }) => kind === (listType || blockType)) || writingBlockStyles[0];

  return <Popover open={open && !disabled} onOpenChange={(next) => { if (!next) dismiss(); }}>
    <PopoverAnchor virtualRef={virtualAnchor} />
    <PopoverContent data-writing-selection-menu="true" className="w-auto min-w-50 overflow-visible p-1" side="top" align="start" updatePositionStrategy="always"
      aria-label="Format selected text"
      onOpenAutoFocus={(event) => { event.preventDefault(); if (keyboardOpen.current) firstControl.current?.focus({ preventScroll: true }); }}
      onCloseAutoFocus={(event) => event.preventDefault()}
      onEscapeKeyDown={() => { if (restore()) focusEditor(); }}
      onInteractOutside={(event) => {
        const target = event.target;
        if (target instanceof Element && (editor?.getRootElement()?.contains(target) || target.closest("[data-writing-selection-menu]"))) event.preventDefault();
      }}>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button ref={firstControl} type="button" variant="ghost" size="sm" className="w-full justify-between" onMouseDown={(event) => event.preventDefault()}>
            <currentStyle.icon aria-hidden="true" />{currentStyle.name}<ChevronRight aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent data-writing-selection-menu="true" side="right" align="start" onCloseAutoFocus={(event) => event.preventDefault()}
          onEscapeKeyDown={() => firstControl.current?.focus({ preventScroll: true })}>
          {writingBlockStyles.map(({ kind, name, icon: Icon }) => <DropdownMenuItem key={kind} onSelect={() => style(kind)}>
            <Icon className="size-4" aria-hidden="true" />{name}{kind === currentStyle.kind && <Check className="ml-auto size-4" aria-hidden="true" />}
          </DropdownMenuItem>)}
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="flex items-center gap-1" role="group" aria-label="Text formatting">
        {[
          { name: "Bold", icon: Bold, kind: "bold" as const, bit: 1 },
          { name: "Italic", icon: Italic, kind: "italic" as const, bit: 2 },
          { name: "Inline code", icon: Code, kind: "code" as const, bit: 16 },
        ].map(({ name, icon: Icon, kind, bit }) => <Button key={kind} type="button" size="icon" variant="ghost" aria-label={name} aria-pressed={!!(format & bit)} className={format & bit ? "bg-accent" : undefined}
            onMouseDown={(event) => event.preventDefault()} onClick={() => formatText(kind)}><Icon aria-hidden="true" /></Button>
        )}
        <Button type="button" size="icon" variant="ghost" aria-label="Link" onMouseDown={(event) => event.preventDefault()} onClick={() => {
            if (!restore()) return;
            dismiss();
            openLink();
          }}><Link aria-hidden="true" /></Button>
      </div>
    </PopoverContent>
  </Popover>;
}
