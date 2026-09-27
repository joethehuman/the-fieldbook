"use client";

import { writingVideoPlugin } from "./writing-video";
import { equivalentMarkdown } from "@/lib/markdown-compatibility";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  MDXEditor,
  type MDXEditorMethods,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  linkPlugin,
  linkDialogPlugin,
  imagePlugin,
  tablePlugin,
  codeBlockPlugin,
  markdownShortcutPlugin,
  toolbarPlugin,
  BlockTypeSelect,
  activeEditor$,
  currentFormat$,
  readOnly$,
  applyFormat$,
  applyListType$,
  currentListType$,
  openLinkEditDialog$,
  $createTableNode,
  insertCodeBlock$,
  useCodeBlockEditorContext,
  type CodeBlockEditorProps,
} from "@mdxeditor/editor";
import { useCellValue, usePublisher } from "@mdxeditor/gurx";
import { $createHeadingNode, $createQuoteNode } from "@lexical/rich-text";
import { $setBlocksType } from "@lexical/selection";
import { $insertList } from "@lexical/list";
import {
  $getSelection,
  $getRoot,
  $insertNodes,
  $isElementNode,
  $isRangeSelection,
  $setSelection,
  type BaseSelection,
  type LexicalEditor,
  UNDO_COMMAND,
  REDO_COMMAND,
  CAN_UNDO_COMMAND,
  CAN_REDO_COMMAND,
  COMMAND_PRIORITY_EDITOR,
} from "lexical";
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Link,
  Undo,
  Redo,
  Plus,
} from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip } from "../ui/tooltip";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Alert } from "../ui/alert";
import type { WritingEditorProps } from "./writing-editor";
import { videoSource } from "@/lib/video";
import "@mdxeditor/editor/style.css";
import "../../styles/writing-editor.css";

function PlainCodeEditor({
  code,
  language,
  focusEmitter,
}: CodeBlockEditorProps) {
  const { setCode } = useCodeBlockEditorContext();
  const readOnly = useCellValue(readOnly$);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(
    () => focusEmitter.subscribe(() => input.current?.focus()),
    [focusEmitter],
  );
  return (
    <Textarea
      ref={input}
      aria-label={`${language || "Plain text"} code block`}
      value={code}
      readOnly={readOnly}
      onChange={(event) => setCode(event.target.value)}
      className="font-mono"
      rows={5}
    />
  );
}

function WritingToolbar({
  onInsert,
  onEditorReady,
  disabled,
}: {
  onInsert: (trigger: HTMLButtonElement) => void;
  onEditorReady: (editor: LexicalEditor | null, actions: { heading: () => void; quote: () => void; codeBlock: () => void; inlineCode: () => void }) => void;
  disabled: boolean;
}) {
  const editor = useCellValue(activeEditor$);
  const format = useCellValue(currentFormat$);
  const list = useCellValue(currentListType$);
  const applyFormat = usePublisher(applyFormat$);
  const applyList = usePublisher(applyListType$);
  const link = usePublisher(openLinkEditDialog$);
  const code = usePublisher(insertCodeBlock$);
  const pointerSelection = useRef<BaseSelection | null>(null);
  const [canUndo, setCanUndo] = useState(false),
    [canRedo, setCanRedo] = useState(false);
  useEffect(() => {
    const convert = (kind: "heading" | "quote") => editor?.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      $setBlocksType(selection, () => kind === "heading" ? $createHeadingNode("h2") : $createQuoteNode());
    });
    onEditorReady(editor, {
      heading: () => convert("heading"),
      quote: () => convert("quote"),
      codeBlock: () => code({ code: "", language: "" }),
      inlineCode: () => applyFormat("code"),
    });
  }, [editor, onEditorReady, code, applyFormat]);
  useEffect(() => {
    if (!editor) return;
    const undo = editor.registerCommand(
      CAN_UNDO_COMMAND,
      (value) => {
        setCanUndo(value);
        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    );
    const redo = editor.registerCommand(
      CAN_REDO_COMMAND,
      (value) => {
        setCanRedo(value);
        return false;
      },
      COMMAND_PRIORITY_EDITOR,
    );
    return () => {
      undo();
      redo();
    };
  }, [editor]);
  function preserveSelection(run: () => void, pointerClick: boolean) {
    const selection = pointerClick ? pointerSelection.current : null;
    pointerSelection.current = null;
    if (!selection || !editor) { run(); return; }
    editor.update(() => $setSelection(selection.clone()), { discrete: true });
    editor.focus();
    run();
  }
  const actions = [
    {
      label: "Undo",
      icon: Undo,
      run: () => editor?.dispatchCommand(UNDO_COMMAND, undefined),
      unavailable: !canUndo,
    },
    {
      label: "Redo",
      icon: Redo,
      run: () => editor?.dispatchCommand(REDO_COMMAND, undefined),
      unavailable: !canRedo,
    },
    {
      label: "Bold",
      icon: Bold,
      run: () => applyFormat("bold"),
      pressed: !!(format & 1),
    },
    {
      label: "Italic",
      icon: Italic,
      run: () => applyFormat("italic"),
      pressed: !!(format & 2),
    },
    {
      label: "Bulleted list",
      icon: List,
      run: () => applyList(list === "bullet" ? "" : "bullet"),
      pressed: list === "bullet",
    },
    {
      label: "Numbered list",
      icon: ListOrdered,
      run: () => applyList(list === "number" ? "" : "number"),
      pressed: list === "number",
    },
    { label: "Link", icon: Link, run: () => link() },
  ];
  return (
    <div className="writing-toolbar">
      <div className="writing-toolbar-controls" role="group" aria-label="Formatting">
        <BlockTypeSelect />
        {actions.map(({ label, icon: Icon, run, unavailable, pressed }) => (
          <Tooltip key={label} content={label}>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              aria-label={label}
              aria-pressed={pressed}
              className={pressed ? "bg-accent" : undefined}
              disabled={disabled || unavailable}
              onPointerDown={() => editor?.getEditorState().read(() => {
                pointerSelection.current = $getSelection()?.clone() || null;
              })}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => preserveSelection(run, event.detail > 0 && label !== "Undo" && label !== "Redo")}
            >
              <Icon />
            </Button>
          </Tooltip>
        ))}
        <Button type="button" size="sm" variant="outline" disabled={disabled}
          aria-haspopup="menu"
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => onInsert(event.currentTarget)}>
          <Plus /> Insert
        </Button>
      </div>
      <p className="writing-toolbar-help writing-toolbar-help-desktop">Type / at the start of a line to insert content.</p>
      <p className="writing-toolbar-help writing-toolbar-help-mobile">Tap Insert to add content.</p>
    </div>
  );
}

export default function WritingEditorEngine({
  value,
  onChange,
  onUpload,
  disabled = false,
  label = "Content",
  onUnsupported,
}: WritingEditorProps & { onUnsupported: () => void }) {
  const editor = useRef<MDXEditorMethods>(null);
  const initial = useRef(value);
  const current = useRef(value);
  const failed = useRef(false);
  const file = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const slashMenu = useRef<HTMLDivElement>(null);
  const mediaMenu = useRef<HTMLDivElement>(null);
  const lexicalEditor = useRef<LexicalEditor | null>(null);
  const blockActions = useRef<{ heading: () => void; quote: () => void; codeBlock: () => void; inlineCode: () => void } | null>(null);
  const pendingList = useRef<"bullet" | "number" | null>(null);
  const mediaSelection = useRef<BaseSelection | null>(null);
  const slashSelection = useRef<BaseSelection | null>(null);
  const toolbarSelection = useRef<BaseSelection | null>(null);
  const activeLine = useRef<HTMLElement | null>(null);
  const [media, setMedia] = useState<"image" | "video">("image");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashFromToolbar, setSlashFromToolbar] = useState(false);
  const insertTrigger = useRef<HTMLButtonElement | null>(null);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashPosition, setSlashPosition] = useState({ top: 0, left: 0, above: false, maxHeight: 360 });
  const [videoUrl, setVideoUrl] = useState("");
  const [mediaChooser, setMediaChooser] = useState<"image" | "video" | null>(null);
  const [mediaTab, setMediaTab] = useState<"upload" | "link">("upload");
  const [mediaPosition, setMediaPosition] = useState({ top: 0, left: 0 });
  const [imageAlt, setImageAlt] = useState("");
  useLayoutEffect(() => {
    if (!slashOpen || !slashMenu.current) return;
    slashMenu.current.style.top = `${slashPosition.top}px`;
    slashMenu.current.style.left = `${slashPosition.left}px`;
    slashMenu.current.style.transform = slashPosition.above ? "translateY(-100%)" : "";
    slashMenu.current.style.maxHeight = `${slashPosition.maxHeight}px`;
    if (slashFromToolbar) slashMenu.current.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [slashOpen, slashPosition, slashFromToolbar]);
  useLayoutEffect(() => {
    if (!mediaChooser || !mediaMenu.current) return;
    mediaMenu.current.style.top = `${mediaPosition.top}px`;
    mediaMenu.current.style.left = `${mediaPosition.left}px`;
    const initial = mediaTab === "link"
      ? mediaMenu.current.querySelector<HTMLInputElement>('input[type="url"]')
      : mediaMenu.current.querySelector<HTMLInputElement>('input[aria-label="Image alternative text"]') || mediaMenu.current.querySelector<HTMLButtonElement>(".writing-media-fields button");
    initial?.focus({ preventScroll: true });
  }, [mediaChooser, mediaPosition, mediaTab]);
  useEffect(() => {
    if (!slashOpen) return;
    function close(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node) && !slashMenu.current?.contains(event.target as Node)) setSlashOpen(false);
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [slashOpen]);
  useEffect(() => {
    const line = activeLine.current;
    if (!line) return;
    if (slashOpen && !slashFromToolbar) {
      line.dataset.slashQuery = slashQuery ? `/${slashQuery}` : "/Type to search";
      line.classList.add("writing-command-line");
    } else {
      line.classList.remove("writing-command-line");
      delete line.dataset.slashQuery;
    }
  }, [slashOpen, slashQuery, slashFromToolbar]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (pendingList.current && !root.current?.contains(event.target as Node)) clearPendingList();
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  useEffect(() => {
    if (current.current !== value) {
      current.current = value;
      editor.current?.setMarkdown(value);
    }
  }, [value]);
  async function upload(file: File) {
    if (!onUpload) throw new Error("Uploads are unavailable in this view.");
    setBusy(true);
    setError("");
    try {
      return await onUpload(file);
    } catch (error) {
      setError((error as Error).message);
      throw error;
    } finally {
      setBusy(false);
    }
  }
  function clearPendingList() {
    pendingList.current = null;
    activeLine.current?.classList.remove("writing-pending-list");
    activeLine.current?.removeAttribute("data-list-marker");
  }
  function insertPendingList(kind: "bullet" | "number", text?: string) {
    lexicalEditor.current?.update(() => {
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const insertionLine = selection.anchor.getNode().getTopLevelElementOrThrow();
      if (text) selection.insertText(text);
      $insertList(kind);
      const updated = $getSelection();
      const list = $isRangeSelection(updated) ? updated.anchor.getNode().getTopLevelElementOrThrow() : null;
      const beforeList = list?.getType() === "list" ? list.getPreviousSibling() : null;
      // MDXEditor may retain the selected blank line immediately before the list.
      if (beforeList?.getType() === "paragraph" && !beforeList.getTextContent()) beforeList.remove();
      if (insertionLine.isAttached() && insertionLine.getType() === "paragraph" && !insertionLine.getTextContent() && insertionLine.getParent() === $getRoot()) {
        insertionLine.remove();
      }
    });
  }
  function chooseBlock(kind: "heading" | "bullet" | "number" | "quote") {
    const lexical = lexicalEditor.current;
    let index = -1;
    lexical?.getEditorState().read(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) index = selection.anchor.getNode().getTopLevelElementOrThrow().getIndexWithinParent();
    });
    setSlashOpen(false);
    if (kind === "bullet" || kind === "number") {
      if (slashFromToolbar && activeLine.current?.textContent?.trim()) {
        lexical?.update(() => $insertList(kind));
        return;
      }
      // Lexical drops an empty list, so keep its marker visible until the first character arrives.
      pendingList.current = kind;
      requestAnimationFrame(() => {
        const anchor = window.getSelection()?.anchorNode;
        const element = anchor instanceof Element ? anchor : anchor?.parentElement;
        const line = element?.closest(".writing-content p");
        if (!(line instanceof HTMLElement) || !pendingList.current) return;
        activeLine.current = line;
        line.classList.add("writing-pending-list");
        line.dataset.listMarker = pendingList.current === "bullet" ? "•" : "1.";
      });
      return;
    }
    blockActions.current?.[kind]();
    // Select after MDXEditor's DOM commit, which otherwise parks an empty block's caret in its trailing paragraph.
    if (lexical && index >= 0) requestAnimationFrame(() => lexical.update(() => {
      const block = $getRoot().getChildAtIndex(index);
      if ($isElementNode(block)) block.selectStart();
    }));
  }
  function insertTableAtCaret() {
    const lexical = lexicalEditor.current;
    if (!lexical) return;
    const saved = slashSelection.current;
    setSlashOpen(false);
    lexical.update(() => {
      if (saved) $setSelection(saved.clone());
      const selection = $getSelection();
      if (!$isRangeSelection(selection)) return;
      const line = selection.anchor.getNode().getTopLevelElementOrThrow();
      const table = $createTableNode({
        type: "table",
        children: Array.from({ length: 3 }, () => ({
          type: "tableRow" as const,
          children: Array.from({ length: 3 }, () => ({ type: "tableCell" as const, children: [] })),
        })),
      });
      $insertNodes([table]);
      if (line.isAttached() && line.getType() === "paragraph" && !line.getTextContent()) line.remove();
    }, { discrete: true });
    lexical.focus();
  }
  function keepSlashAsText() {
    const text = `/${slashQuery}`;
    const lexical = lexicalEditor.current;
    let index = -1;
    lexical?.getEditorState().read(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) index = selection.anchor.getNode().getTopLevelElementOrThrow().getIndexWithinParent();
    });
    setSlashOpen(false);
    lexical?.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText(text);
    });
    if (lexical && index >= 0) requestAnimationFrame(() => lexical.update(() => {
      const block = $getRoot().getChildAtIndex(index);
      if ($isElementNode(block)) block.selectEnd();
    }));
  }
  function rememberSelection() {
    mediaSelection.current = null;
    lexicalEditor.current?.getEditorState().read(() => {
      mediaSelection.current = $getSelection()?.clone() || null;
    });
  }
  function insertAtMediaSelection(markdown: string) {
    const selection = mediaSelection.current;
    const lexical = lexicalEditor.current;
    if (selection && lexical) lexical.update(() => $setSelection(selection.clone()));
    editor.current?.focus(() => editor.current?.insertMarkdown(markdown), { preventScroll: true });
    closeMedia();
  }
  function closeMedia() {
    activeLine.current?.classList.remove("writing-media-line");
    activeLine.current?.removeAttribute("data-media-placeholder");
    setMediaChooser(null);
    setVideoUrl("");
  }
  function openMedia(type: "image" | "video", tab: "upload" | "link" = "upload") {
    rememberSelection();
    setSlashOpen(false);
    setMedia(type);
    setMediaTab(tab);
    setMediaChooser(type);
    const anchor = window.getSelection()?.anchorNode;
    const element = anchor instanceof Element ? anchor : anchor?.parentElement;
    const selectedLine = element?.closest(".writing-content > p, .writing-content > h1, .writing-content > h2, .writing-content > h3, .writing-content > blockquote");
    if (selectedLine instanceof HTMLElement) activeLine.current = selectedLine;
    const line = activeLine.current;
    if (line && !line.textContent?.trim()) {
      line.dataset.mediaPlaceholder = type === "image" ? "Add an image" : "Embed or upload a video";
      line.classList.add("writing-media-line");
    }
    const rect = line?.getBoundingClientRect() || root.current?.getBoundingClientRect();
    if (rect) setMediaPosition({
      top: rect.bottom + 260 < window.innerHeight ? rect.bottom + 8 : Math.max(8, rect.top - 252),
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 340)),
    });
  }
  const slashCommands = [
    { name: "Heading", terms: "title heading", run: () => chooseBlock("heading") },
    { name: "Bulleted list", terms: "bullets list", run: () => chooseBlock("bullet") },
    { name: "Numbered list", terms: "numbers list", run: () => chooseBlock("number") },
    { name: "Callout", terms: "quote callout", run: () => chooseBlock("quote") },
    { name: "Table", terms: "table grid rows columns", run: insertTableAtCaret },
    { name: "Code block", terms: "code block", run: () => { setSlashOpen(false); blockActions.current?.codeBlock(); } },
    { name: "Inline code", terms: "code inline text", run: () => { setSlashOpen(false); blockActions.current?.inlineCode(); } },
    { name: "Image", terms: "image photo", run: () => openMedia("image") },
    { name: "Upload video", terms: "video upload file", run: () => openMedia("video") },
    { name: "Embed video link", terms: "video embed link", run: () => openMedia("video", "link") },
  ];
  const matchingCommands = slashCommands.filter(({ name, terms }) => `${name} ${terms}`.toLowerCase().includes(slashQuery.trim().toLowerCase()));
  function openSlash(trigger?: HTMLButtonElement) {
    if (trigger && slashMenu.current && insertTrigger.current === trigger) {
      setSlashOpen(false);
      return;
    }
    insertTrigger.current = trigger || null;
    setSlashFromToolbar(!!trigger);
    slashSelection.current = trigger ? toolbarSelection.current?.clone() || null : null;
    let savedLine: HTMLElement | null = null;
    lexicalEditor.current?.getEditorState().read(() => {
      const selection = $getSelection();
      if (!slashSelection.current) slashSelection.current = selection?.clone() || null;
      if ($isRangeSelection(slashSelection.current)) {
        const anchor = lexicalEditor.current?.getElementByKey(slashSelection.current.anchor.getNode().getKey());
        savedLine = anchor?.closest("p, h1, h2, h3, li, blockquote") as HTMLElement | null;
      }
    });
    const selection = window.getSelection();
    const rangeRect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
    const anchorNode = selection?.anchorNode;
    const anchor = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement;
    const rootChild = anchorNode?.childNodes[selection?.anchorOffset ?? 0] || anchorNode?.childNodes[Math.max(0, (selection?.anchorOffset ?? 0) - 1)];
    const selectedLine = rootChild instanceof Element ? rootChild : rootChild?.parentElement;
    const line = anchor?.closest("p, h1, h2, h3, li, blockquote") || selectedLine?.closest("p, h1, h2, h3, li, blockquote") || root.current?.querySelector(".writing-content p:last-child");
    activeLine.current = savedLine || (line instanceof HTMLElement ? line : null);
    const rect = trigger?.getBoundingClientRect() || (rangeRect?.height ? rangeRect : line?.getBoundingClientRect());
    if (!rect) return;
    const viewport = root.current?.closest(".main-content")?.getBoundingClientRect();
    const spaceAbove = rect.top - (viewport?.top ?? 0);
    const spaceBelow = (viewport?.bottom ?? window.innerHeight) - rect.bottom;
    const above = spaceBelow < 220 && spaceAbove > spaceBelow;
    const width = Math.min(320, window.innerWidth - 16);
    setSlashPosition({
      top: above ? rect.top - 8 : rect.bottom + 8,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      above,
      maxHeight: Math.max(160, Math.min(360, (above ? spaceAbove : spaceBelow) - 16)),
    });
    setSlashQuery(""); setSlashIndex(0); setSlashOpen(true);
  }
  function runInsertCommand(run: () => void) {
    if (!slashFromToolbar) { run(); return; }
    const lexical = lexicalEditor.current;
    const selection = slashSelection.current;
    if (!lexical) { run(); return; }
    lexical.update(() => {
      if (selection) $setSelection(selection.clone());
    }, { discrete: true });
    lexical.focus();
    run();
  }
  function insertVideo() {
    if (!videoSource(videoUrl)) {
      setError("Use a supported HTTPS YouTube, Vimeo, Loom, MP4, or WebM URL.");
      return;
    }
    insertAtMediaSelection(`\n\n[Video](${videoUrl})\n\n`);
  }
  const plugins = useMemo(() => [
    writingVideoPlugin(),
    headingsPlugin(),
    listsPlugin(),
    quotePlugin(),
    thematicBreakPlugin(),
    linkPlugin(),
    linkDialogPlugin(),
    imagePlugin({
      disableImageResize: true,
      imageUploadHandler: onUpload ? upload : undefined,
    }),
    tablePlugin(),
    codeBlockPlugin({
      codeBlockEditorDescriptors: [
        { priority: 0, match: () => true, Editor: PlainCodeEditor },
      ],
    }),
    markdownShortcutPlugin(),
    toolbarPlugin({
      toolbarContents: () => (
        <WritingToolbar
          onInsert={openSlash}
          onEditorReady={(active, actions) => { if (active) lexicalEditor.current = active; blockActions.current = actions; }}
          disabled={disabled || busy}
        />
      ),
    }),
  ], [onUpload, disabled, busy]);
  return (
    <div ref={root} className="writing-editor rounded-lg border border-border bg-background" onPointerDownCapture={(event) => {
      if (event.target instanceof Element && event.target.closest(".writing-toolbar-controls")) {
        toolbarSelection.current = null;
        lexicalEditor.current?.getEditorState().read(() => {
          toolbarSelection.current = $getSelection()?.clone() || null;
        });
      }
      if (slashMenu.current?.contains(event.target as Node) || mediaMenu.current?.contains(event.target as Node)) return;
      if (pendingList.current && activeLine.current && !activeLine.current.contains(event.target as Node)) clearPendingList();
      if (slashOpen && activeLine.current && !activeLine.current.contains(event.target as Node)) setSlashOpen(false);
    }} onScrollCapture={(event) => {
      const scroller = event.target;
      if (!(scroller instanceof HTMLElement) || !scroller.matches('[data-lexical-decorator="true"]')) return;
      // MDXEditor's row/column menus are portaled outside the scrolling table.
      // Dismiss an open menu as its anchor moves, so it cannot drift across the page.
      scroller.querySelectorAll<HTMLButtonElement>('table button[data-state="open"]').forEach((trigger) => trigger.click());
    }} onCompositionEndCapture={() => {
      if (!pendingList.current) return;
      const kind = pendingList.current;
      clearPendingList();
      requestAnimationFrame(() => insertPendingList(kind));
    }} onPasteCapture={(event) => {
      if (!(event.target instanceof HTMLElement) || !event.target.closest("[contenteditable=true]")) return;
      const image = Array.from(event.clipboardData.items).find((item) => item.type.startsWith("image/"))?.getAsFile();
      if (!image && pendingList.current) {
        const pasted = event.clipboardData.getData("text/plain");
        if (!pasted) return;
        event.preventDefault();
        event.stopPropagation();
        const kind = pendingList.current;
        clearPendingList();
        insertPendingList(kind, pasted);
        return;
      }
      if (!image) return;
      event.preventDefault();
      event.stopPropagation();
      clearPendingList();
      if (!onUpload) { setError("Uploads are unavailable in this view."); return; }
      rememberSelection();
      void (async () => {
        try {
          const url = await upload(image);
          const alt = image.name.replace(/\.[^.]+$/, "").replace(/[\[\]\\\n]/g, " ") || "Image";
          insertAtMediaSelection(`\n\n![${alt}](${url})\n\n`);
        } catch { /* upload() keeps the document and shows the error. */ }
      })();
    }} onKeyDownCapture={(event) => {
      if (pendingList.current && event.target instanceof HTMLElement && event.target.closest("[contenteditable=true]")) {
        if (event.key === "Escape" || event.key === "Backspace") { clearPendingList(); if (event.key === "Escape") event.preventDefault(); return; }
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          const kind = pendingList.current;
          clearPendingList();
          insertPendingList(kind, event.key);
          return;
        }
      }
      if (slashOpen && event.target instanceof HTMLElement && event.target.closest("[contenteditable=true]")) {
        if (event.key === "Escape") { event.preventDefault(); setSlashOpen(false); return; }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          if (matchingCommands.length) setSlashIndex((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + matchingCommands.length) % matchingCommands.length);
          return;
        }
        if (event.key === "Enter") { event.preventDefault(); if (matchingCommands.length) matchingCommands[slashIndex]?.run(); else keepSlashAsText(); return; }
        if (event.key === "Backspace") { event.preventDefault(); if (slashQuery) setSlashQuery((query) => query.slice(0, -1)); else setSlashOpen(false); setSlashIndex(0); return; }
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); setSlashQuery((query) => query + event.key); setSlashIndex(0); return; }
      }
      if (event.key === "/" && !disabled && !busy && event.target instanceof HTMLElement && event.target.closest("[contenteditable=true]")) {
        const selection = window.getSelection();
        const before = selection?.anchorNode?.textContent?.slice(0, selection.anchorOffset) || "";
        if (!before.trim()) { event.preventDefault(); openSlash(); }
      }
      if (event.key === "Escape") { setSlashOpen(false); closeMedia(); }
    }}>
      {error && (
        <Alert variant="destructive" role="alert">
          {error}
        </Alert>
      )}
      {slashOpen && createPortal(<div ref={slashMenu} role="menu" aria-label={slashFromToolbar ? "Insert content" : "Insert content. Type to search, use arrow keys to choose, then press Enter."} className="writing-slash-menu" onKeyDown={(event) => {
        if (!slashFromToolbar) return;
        if (event.key === "Tab") setSlashOpen(false);
        if (event.key === "Escape") { event.preventDefault(); setSlashOpen(false); insertTrigger.current?.focus(); }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const items = Array.from(slashMenu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') || []);
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
        }
      }}>
        <div className="writing-slash-options">
          {matchingCommands.length ? matchingCommands.map((command, index) => <Button key={command.name} type="button" size="sm" variant="ghost" role="menuitem" aria-current={!slashFromToolbar && index === slashIndex ? "true" : undefined} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setSlashIndex(index)} onClick={() => runInsertCommand(command.run)}>{command.name}</Button>) : <><p className="muted">No matching blocks</p><Button type="button" size="sm" variant="ghost" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={keepSlashAsText}>Keep /{slashQuery} as text</Button></>}
        </div>
      </div>, document.body)}
      {mediaChooser && createPortal(<div ref={mediaMenu} className="writing-media-chooser" role="dialog" aria-label={`Insert ${mediaChooser}`} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeMedia(); editor.current?.focus(undefined, { preventScroll: true }); } }}>
        <div className="writing-media-tabs"><Button type="button" variant="ghost" aria-pressed={mediaTab === "upload"} onClick={() => setMediaTab("upload")}>Upload</Button><Button type="button" variant="ghost" aria-pressed={mediaTab === "link"} onClick={() => setMediaTab("link")}>Link</Button></div>
        {mediaTab === "upload" ? <div className="writing-media-fields">{mediaChooser === "image" && <Input aria-label="Image alternative text" value={imageAlt} onChange={(event) => setImageAlt(event.target.value)} placeholder="Describe the image" />}<Button type="button" disabled={!onUpload || (mediaChooser === "image" && !imageAlt.trim())} onClick={() => file.current?.click()}>Choose {mediaChooser}</Button></div> : <div className="writing-media-fields"><Input aria-label={mediaChooser === "video" ? "Video URL" : "Image URL"} type="url" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder={mediaChooser === "video" ? "YouTube, Vimeo or Loom URL" : "https://example.com/image.jpg"} /><Button type="button" onClick={mediaChooser === "video" ? insertVideo : () => { if (!/^https:\/\//i.test(videoUrl)) { setError("Use an HTTPS image URL."); return; } insertAtMediaSelection(`\n\n![${imageAlt.trim() || "Image"}](${videoUrl})\n\n`); }}>Insert {mediaChooser}</Button></div>}
        <Button type="button" variant="ghost" size="sm" onClick={closeMedia}>Cancel</Button>
      </div>, document.body)}
      <Input
        ref={file}
        type="file"
        className="hidden"
        aria-label="Upload inline media"
        accept={media === "image" ? "image/*" : "video/mp4,video/webm"}
        onChange={async (event) => {
          const selected = event.target.files?.[0];
          if (!selected) return;
          try {
            const url = await upload(selected);
            const alt = (imageAlt.trim() || selected.name).replace(/[\[\]\\\n]/g, " ");
            const markdown = `\n\n${selected.type.startsWith("video/") ? "" : "!"}[${alt}](${url})\n\n`;
            insertAtMediaSelection(markdown);
            setImageAlt("");
          } catch {
            /* upload() retains the error and the document. */
          } finally {
            if (file.current) file.current.value = "";
          }
        }}
      />
      <MDXEditor
        ref={editor}
        markdown={initial.current}
        trim={false}
        readOnly={disabled || busy}
        suppressHtmlProcessing
        contentEditableClassName="markdown writing-content"
        placeholder="Type / for commands…"
        translation={(key, fallback, values = {}) =>
          key === "contentArea.editableMarkdown"
            ? label
            : Object.entries(values).reduce(
                (text, [name, value]) =>
                  text.replaceAll(`{{${name}}}`, String(value)),
                fallback,
              )
        }
        onError={() => {
          failed.current = true;
          onUnsupported();
        }}
        onChange={(markdown, normalized) => {
          if (failed.current) return;
          if (normalized) {
            if (!equivalentMarkdown(current.current, markdown)) {
              failed.current = true;
              onUnsupported();
            }
            return;
          }
          current.current = markdown;
          onChange(markdown);
        }}
        plugins={plugins}
      />
    </div>
  );
}
