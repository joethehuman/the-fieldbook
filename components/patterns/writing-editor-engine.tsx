"use client";

import { WritingImageDialog, WritingImageToolbar } from "./writing-image";
import { WritingBlockActions, blockActions } from "./writing-block-actions";
import { writingTableControlsPlugin } from "./writing-table-controls";
import { writingVideoPlugin } from "./writing-video";
import { useScrollFade } from "./use-scroll-fade";
import { equivalentMarkdown } from "@/lib/markdown-compatibility";
import { createWritingBlock, writingBlockStyles, type WritingBlock, type WritingBlockStyle } from "./writing-commands";
import { WritingSelectionMenu } from "./writing-selection-menu";
import { usePhoneLayout } from "./use-phone-layout";
import { WritingLinkDialog } from "./writing-link-dialog";
import { WritingTitleContext, WritingTitleEnterContext } from "./writing-title";
import { WritingInteractionContext } from "./writing-interaction";
import { Fragment, useContext, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { UploadProgress } from "@/lib/upload-media";
import { MediaUploadStatus } from "./media-upload-status";
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
  realmPlugin,
  addEditorWrapper$,
  activeEditor$,
  rootEditor$,
  readOnly$,
  $createTableNode,
  insertCodeBlock$,
  insertThematicBreak$,
  useCodeBlockEditorContext,
  type CodeBlockEditorProps,
} from "@mdxeditor/editor";
import { useCellValue, usePublisher } from "@mdxeditor/gurx";
import { $setBlocksType } from "@lexical/selection";
import { $insertList } from "@lexical/list";
import {
  $getSelection,
  $createRangeSelection,
  $getNodeByKey,
  $getRoot,
  $createParagraphNode,
  $isParagraphNode,
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
  SKIP_DOM_SELECTION_TAG,
  SKIP_SCROLL_INTO_VIEW_TAG,
} from "lexical";
import {
  Link,
  Undo,
  Redo,
  Plus,
  Table,
  CodeXml,
  Minus,
  Image as ImageIcon,
  Video,
} from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip } from "../ui/tooltip";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Alert } from "../ui/alert";
import type { WritingEditorProps } from "./writing-editor";
import { videoSource } from "@/lib/video";
import "@mdxeditor/editor/style.css";

function WritingViewPanel({ children }: { children: ReactNode }) {
  const title = useContext(WritingTitleContext);
  const lexical = useCellValue(rootEditor$);
  useEffect(() => {
    if (!lexical) return;
    return lexical.registerUpdateListener(({ editorState }) => {
      const element = lexical.getRootElement();
      element?.querySelectorAll(".writing-active-line").forEach(line => line.classList.remove("writing-active-line"));
      editorState.read(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
        const block = selection.anchor.getNode().getTopLevelElement();
        if ($isParagraphNode(block)) lexical.getElementByKey(block.getKey())?.classList.add("writing-active-line");
      });
    });
  }, [lexical]);
  function enterBody() {
    lexical?.update(() => {
      const root = $getRoot();
      const first = root.getFirstChild();
      // An empty paragraph is an insertion point; a media paragraph is not empty.
      const paragraph = $isParagraphNode(first) && first.getChildrenSize() === 0
        ? first : $createParagraphNode();
      if (paragraph !== first) {
        if (first) first.insertBefore(paragraph); else root.append(paragraph);
      }
      paragraph.selectStart();
    });
  }
  const fade = useScrollFade<HTMLDivElement>();
  return <div ref={fade.ref} data-state="active" className="writing-viewport writing-scroll-area scroll-fade mt-0 focus-visible:ring-0"
    data-scroll-fade-before={fade.edges.before} data-scroll-fade-after={false} onScroll={fade.measure}><WritingTitleEnterContext.Provider value={enterBody}><div className="writing-document">{title && <div className="writing-document-heading">{title}</div>}{children}</div></WritingTitleEnterContext.Provider></div>;
}

const writingViewPanelPlugin = realmPlugin({
  init(realm) { realm.pub(addEditorWrapper$, WritingViewPanel); },
});

function PlainCodeEditor({
  code,
  language,
  focusEmitter,
}: CodeBlockEditorProps) {
  const { setCode, parentEditor, lexicalNode } = useCodeBlockEditorContext();
  const readOnly = useCellValue(readOnly$);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(
    () => focusEmitter.subscribe(() => input.current?.focus()),
    [focusEmitter],
  );
  return (
    <div className="writing-code-block" contentEditable={false}>
    <WritingBlockActions label="Code block" disabled={readOnly} {...blockActions(parentEditor, lexicalNode.getKey())} />
    <Textarea
      ref={input}
      aria-label={`${language || "Plain text"} code block`}
      value={code}
      readOnly={readOnly}
      onChange={(event) => setCode(event.target.value)}
      variant="embedded"
      className="writing-code font-mono"
      rows={Math.max(2, code.split("\n").length)}
    />
    </div>
  );
}

type WritingActions = {
  block: (kind: WritingBlock) => void;
  codeBlock: () => void;
  divider: () => void;
};

function WritingToolbar({
  onInsert,
  onEditorReady,
  onSelectionReady,
  disabled,
  viewControls,
}: {
  onInsert: (trigger: HTMLButtonElement, fromKeyboard: boolean) => void;
  onEditorReady: (editor: LexicalEditor | null, actions: WritingActions) => void;
  onSelectionReady: (controller: ((keyboard: boolean) => boolean) | null) => void;
  disabled: boolean;
  viewControls: ReactNode;
}) {
  const phone = usePhoneLayout();
  const editor = useCellValue(activeEditor$);
  const code = usePublisher(insertCodeBlock$);
  const divider = usePublisher(insertThematicBreak$);
  const [canUndo, setCanUndo] = useState(false),
    [canRedo, setCanRedo] = useState(false);
  useEffect(() => {
    const convert = (kind: WritingBlock) =>
      editor?.update(() => {
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        $setBlocksType(selection, () => createWritingBlock(kind));
      }, { discrete: true });
    onEditorReady(editor, {
      block: convert,
      codeBlock: () => code({ code: "", language: "" }),
      divider: () => divider(),
    });
  }, [editor, onEditorReady, code, divider]);
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
  const historyActions = [
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
  ];
  return (
    <div className="writing-toolbar">
      <div className="writing-toolbar-controls" role="group" aria-label="Writing actions">
        <div className="writing-toolbar-group">
          {historyActions.map(({ label, icon: Icon, run, unavailable }) => (
            <Tooltip key={label} content={label}>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                aria-label={label}
                disabled={disabled || unavailable}
                onMouseDown={(event) => event.preventDefault()}
                onClick={run}
              >
                <Icon />
              </Button>
            </Tooltip>
          ))}
        </div>
        <Button type="button" size={phone ? "icon" : "sm"} variant="outline" disabled={disabled}
          aria-label="Commands: insert blocks or format selected text"
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => onInsert(event.currentTarget, event.detail === 0)}>
          <Plus /><span className="writing-command-label">Commands</span>
        </Button>
      </div>
      <WritingSelectionMenu disabled={disabled} onReady={onSelectionReady} />
      {viewControls}
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
  viewControls,
}: WritingEditorProps & { onUnsupported: () => void; viewControls: ReactNode }) {
  const editor = useRef<MDXEditorMethods>(null);
  const initial = useRef(value);
  const current = useRef(value);
  const failed = useRef(false);
  const file = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const slashMenu = useRef<HTMLDivElement>(null);
  const mediaMenu = useRef<HTMLDivElement>(null);
  const lexicalEditor = useRef<LexicalEditor | null>(null);
  const writingActions = useRef<WritingActions | null>(null);
  const selectionTools = useRef<((keyboard: boolean) => boolean) | null>(null);
  const pendingList = useRef<"bullet" | "number" | null>(null);
  const mediaSelection = useRef<BaseSelection | null>(null);
  const slashSelection = useRef<BaseSelection | null>(null);
  const toolbarSelection = useRef<BaseSelection | null>(null);
  const activeLine = useRef<HTMLElement | null>(null);
  const [media, setMedia] = useState<"image" | "video">("image");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [slashOpen, setSlashOpen] = useState(false);
  const slashFade = useScrollFade<HTMLDivElement>(slashOpen);
  const [slashFromToolbar, setSlashFromToolbar] = useState(false);
  const insertTrigger = useRef<HTMLButtonElement | null>(null);
  const focusInsertItem = useRef(false);
  const [slashQuery, setSlashQuery] = useState("");
  const [slashIndex, setSlashIndex] = useState(0);
  const slashNavigation = useRef<"keyboard" | "pointer">("keyboard");
  const slashPointer = useRef<{ x: number; y: number } | null>(null);
  const interactions = useRef(new Set<string>());
  const [popupActive, setPopupActive] = useState(false);
  const reportInteraction = useCallback((owner: string, active: boolean) => {
    if (active) interactions.current.add(owner);
    else interactions.current.delete(owner);
    setPopupActive(interactions.current.size > 0);
  }, []);
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
    if (slashFromToolbar && focusInsertItem.current) slashMenu.current.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [slashOpen, slashPosition, slashFromToolbar]);
  useLayoutEffect(() => {
    if (!slashOpen || slashFromToolbar || slashNavigation.current !== "keyboard") return;
    const options = slashMenu.current?.querySelector<HTMLElement>(
      ".writing-slash-options",
    );
    const selected = options?.querySelector<HTMLElement>(
      '[aria-current="true"]',
    );
    if (!options || !selected) return;
    const container = options.getBoundingClientRect();
    const item = selected.getBoundingClientRect();
    // Only scroll the options, never the writing canvas or its parent panel.
    if (item.top < container.top) options.scrollTop -= container.top - item.top;
    else if (item.bottom > container.bottom)
      options.scrollTop += item.bottom - container.bottom;
  }, [slashOpen, slashFromToolbar, slashIndex, slashQuery]);
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
    const line = activeLine.current;
    if (!line) return;
    if (slashOpen && !slashFromToolbar) {
      line.dataset.slashQuery = slashQuery || "Type to search";
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
      return await onUpload(file, setUploadProgress);
    } catch (error) {
      setError((error as Error).message);
      throw error;
    } finally {
      setBusy(false);
      setUploadProgress(null);
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
  function chooseBlock(kind: WritingBlockStyle) {
    const lexical = lexicalEditor.current;
    let index = -1;
    let emptyBlock = false;
    lexical?.getEditorState().read(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        const block = selection.anchor.getNode().getTopLevelElementOrThrow();
        index = block.getIndexWithinParent();
        emptyBlock = selection.isCollapsed() && !block.getTextContent();
      }
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
    writingActions.current?.block(kind);
    // Commit the empty block and its caret before accepting the next keystroke.
    // A deferred selection reset can overwrite characters typed meanwhile.
    if (lexical && emptyBlock && index >= 0) lexical.update(() => {
      const block = $getRoot().getChildAtIndex(index);
      if ($isElementNode(block)) block.selectStart();
    }, { discrete: true });
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
  const keepSlashAsText = useCallback((query = slashQuery, restoreCaret = true) => {
    const lexical = lexicalEditor.current;
    const saved = slashSelection.current;
    slashSelection.current = null;
    setSlashOpen(false);
    if (!lexical || !$isRangeSelection(saved)) return;
    lexical.update(() => {
      if (!$getNodeByKey(saved.anchor.key)?.isAttached()
        || !$getNodeByKey(saved.focus.key)?.isAttached()) return;
      const destination = $getSelection()?.clone() || null;
      $setSelection(saved.clone());
      const selection = $getSelection();
      if ($isRangeSelection(selection)) selection.insertText(`/${query}`);
      if (!restoreCaret && destination && !destination.is(saved)) $setSelection(destination);
    }, {
      discrete: true,
      tag: !restoreCaret && !lexical.getRootElement()?.contains(document.activeElement)
        ? [SKIP_SCROLL_INTO_VIEW_TAG, SKIP_DOM_SELECTION_TAG] : SKIP_SCROLL_INTO_VIEW_TAG,
    });
  }, [slashQuery]);
  useEffect(() => {
    if (!slashOpen) return;
    function close(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node) && !slashMenu.current?.contains(event.target as Node)) {
        if (slashFromToolbar) setSlashOpen(false);
        else keepSlashAsText(slashQuery, false);
      }
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [slashOpen, slashFromToolbar, slashQuery, keepSlashAsText]);

  useEffect(() => {
    if (!slashOpen) return;
    const viewport = root.current?.closest<HTMLElement>(".main-content");
    const close = () => {
      if (slashFromToolbar) setSlashOpen(false);
      else keepSlashAsText(slashQuery, false);
    };
    viewport?.addEventListener("scroll", close, { passive: true });
    return () => viewport?.removeEventListener("scroll", close);
  }, [slashOpen, slashFromToolbar, slashQuery, keepSlashAsText]);

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
    const selectedLine = element?.closest(".writing-content > p, .writing-content > h1, .writing-content > h2, .writing-content > h3, .writing-content > h4, .writing-content > h5, .writing-content > h6, .writing-content > blockquote");
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
    ...writingBlockStyles.map(({ kind, ...command }) => ({ ...command, group: "Basic blocks", run: () => chooseBlock(kind) })),
    { name: "Table", group: "Basic blocks", icon: Table, terms: "table grid rows columns", run: insertTableAtCaret },
    { name: "Code block", group: "Basic blocks", icon: CodeXml, terms: "code block", run: () => { setSlashOpen(false); writingActions.current?.codeBlock(); } },
    { name: "Divider", group: "Basic blocks", icon: Minus, terms: "divider separator horizontal rule line", run: () => { setSlashOpen(false); writingActions.current?.divider(); } },
    { name: "Image", group: "Media", icon: ImageIcon, terms: "image photo", run: () => openMedia("image") },
    { name: "Upload video", group: "Media", icon: Video, terms: "video upload file", run: () => openMedia("video") },
    { name: "Embed video link", group: "Media", icon: Link, terms: "video embed link", run: () => openMedia("video", "link") },
  ];
  const commandsFor = (query: string) => slashCommands.filter(({ name, terms }) => `${name} ${terms}`.toLowerCase().includes(query.trim().toLowerCase()));
  const matchingCommands = commandsFor(slashQuery);
  const closeInsertMenu = useCallback(() => {
    if (slashFromToolbar) {
      setSlashOpen(false);
      insertTrigger.current?.focus({ preventScroll: true });
    } else {
      keepSlashAsText();
      editor.current?.focus(undefined, { preventScroll: true });
    }
  }, [slashFromToolbar, keepSlashAsText]);
  useEffect(() => {
    if (!slashOpen) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      const target = event.target;
      if (!(target instanceof Node)
        || (!root.current?.contains(target) && !slashMenu.current?.contains(target))) return;
      // The menu is portaled; handle Escape before either editor or popup handlers.
      event.preventDefault();
      event.stopPropagation();
      closeInsertMenu();
    };
    document.addEventListener("keydown", dismiss, true);
    return () => document.removeEventListener("keydown", dismiss, true);
  }, [slashOpen, closeInsertMenu]);
  function openSlash(trigger?: HTMLButtonElement, fromKeyboard = false) {
    if (trigger && slashMenu.current && insertTrigger.current === trigger) {
      setSlashOpen(false);
      return;
    }
    insertTrigger.current = trigger || null;
    focusInsertItem.current = fromKeyboard;
    setSlashFromToolbar(!!trigger);
    slashSelection.current = trigger && !fromKeyboard ? toolbarSelection.current?.clone() || null : null;
    const domSelection = window.getSelection();
    const lexical = lexicalEditor.current;
    // Capture the caret that opened the slash menu even when selectionchange
    // has not yet synchronized a fresh browser selection into Lexical.
    if (!trigger && domSelection?.isCollapsed && domSelection.rangeCount && lexical?.getRootElement()?.contains(domSelection.anchorNode)
      && lexical.getRootElement()?.contains(domSelection.focusNode)) {
      const range = domSelection.getRangeAt(0).cloneRange();
      lexical.update(() => {
        const currentSelection = $getSelection();
        const selection = $isRangeSelection(currentSelection) ? currentSelection.clone() : $createRangeSelection();
        selection.applyDOMRange(range);
        $setSelection(selection);
        slashSelection.current = selection.clone();
      }, { discrete: true, tag: SKIP_SCROLL_INTO_VIEW_TAG });
    }
    let savedLine: HTMLElement | null = null;
    lexicalEditor.current?.getEditorState().read(() => {
      const selection = $getSelection();
      if (!slashSelection.current) slashSelection.current = selection?.clone() || null;
      if ($isRangeSelection(slashSelection.current)) {
        const anchor = lexicalEditor.current?.getElementByKey(slashSelection.current.anchor.getNode().getKey());
        savedLine = anchor?.closest("p, h1, h2, h3, h4, h5, h6, li, blockquote") as HTMLElement | null;
      }
    });
    const selection = window.getSelection();
    const rangeRect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
    const anchorNode = selection?.anchorNode;
    const anchor = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement;
    const rootChild = anchorNode?.childNodes[selection?.anchorOffset ?? 0] || anchorNode?.childNodes[Math.max(0, (selection?.anchorOffset ?? 0) - 1)];
    const selectedLine = rootChild instanceof Element ? rootChild : rootChild?.parentElement;
    const line = anchor?.closest("p, h1, h2, h3, h4, h5, h6, li, blockquote") || selectedLine?.closest("p, h1, h2, h3, h4, h5, h6, li, blockquote") || root.current?.querySelector(".writing-content p:last-child");
    activeLine.current = savedLine || (line instanceof HTMLElement ? line : null);
    const rect = trigger?.getBoundingClientRect() || (rangeRect?.height ? rangeRect : line?.getBoundingClientRect());
    if (!rect) return;
    const viewport = root.current?.closest(".main-content")?.getBoundingClientRect();
    const spaceAbove = rect.top - (viewport?.top ?? 0);
    const spaceBelow = (viewport?.bottom ?? window.innerHeight) - rect.bottom;
    const above = spaceBelow < 220 && spaceAbove > spaceBelow;
    const width = Math.min(288, window.innerWidth - 16);
    setSlashPosition({
      top: above ? rect.top - 8 : rect.bottom + 8,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      above,
      maxHeight: Math.max(160, Math.min(360, (above ? spaceAbove : spaceBelow) - 16)),
    });
    slashNavigation.current = "keyboard";
    slashPointer.current = null;
    setSlashQuery(""); setSlashIndex(0); setSlashOpen(true);
  }
  function openCommands(trigger: HTMLButtonElement, fromKeyboard: boolean) {
    if (selectionTools.current?.(fromKeyboard)) {
      setSlashOpen(false);
      return;
    }
    openSlash(trigger, fromKeyboard);
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
    writingViewPanelPlugin(),
    writingVideoPlugin(),
    headingsPlugin(),
    listsPlugin(),
    quotePlugin(),
    thematicBreakPlugin(),
    linkPlugin(),
    linkDialogPlugin({ LinkDialog: WritingLinkDialog }),
    imagePlugin({
      disableImageResize: true,
      ImageDialog: WritingImageDialog,
      EditImageToolbar: WritingImageToolbar,
      imageUploadHandler: onUpload ? upload : undefined,
    }),
    tablePlugin(),
    writingTableControlsPlugin(),
    codeBlockPlugin({
      codeBlockEditorDescriptors: [
        { priority: 0, match: () => true, Editor: PlainCodeEditor },
      ],
    }),
    markdownShortcutPlugin(),
    toolbarPlugin({
      toolbarContents: () => (
        <WritingToolbar
          onInsert={openCommands}
          onSelectionReady={(controller) => { selectionTools.current = controller; }}
          onEditorReady={(active, actions) => { if (active) lexicalEditor.current = active; writingActions.current = actions; }}
          disabled={disabled || busy}
          viewControls={viewControls}
        />
      ),
    }),
  ], [onUpload, disabled, busy, viewControls]);
  return (
    <WritingInteractionContext.Provider value={reportInteraction}>
    <div ref={root} data-editor-interacting={popupActive || slashOpen || !!mediaChooser || undefined} className="writing-editor writing-surface rounded-lg border border-border bg-background" onPointerDownCapture={(event) => {
      if (event.target instanceof Element && event.target.closest(".writing-toolbar-controls")) {
        toolbarSelection.current = null;
        lexicalEditor.current?.getEditorState().read(() => {
          toolbarSelection.current = $getSelection()?.clone() || null;
        });
      }
      if (slashMenu.current?.contains(event.target as Node) || mediaMenu.current?.contains(event.target as Node)) return;
      if (pendingList.current && activeLine.current && !activeLine.current.contains(event.target as Node)) clearPendingList();
      if (slashOpen && activeLine.current && !activeLine.current.contains(event.target as Node)) {
        if (slashFromToolbar) setSlashOpen(false);
        else keepSlashAsText(slashQuery, false);
      }
    }} onScrollCapture={(event) => {
      const scroller = event.target;
      if (!(scroller instanceof HTMLElement)) return;
      if (scroller.matches(".writing-scroll-area") && slashOpen && !slashFromToolbar) keepSlashAsText(slashQuery, false);
      if (!scroller.matches('.writing-scroll-area, [data-lexical-decorator="true"]')) return;
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
        // Lexical's Enter/arrow handlers still run on a default-prevented event.
        // A command keystroke belongs to the menu, not the document underneath it.
        if (["ArrowDown", "ArrowUp", "Enter", "Backspace"].includes(event.key)
          || (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey)) event.stopPropagation();
        if (event.key === "Tab") {
          event.stopPropagation();
          keepSlashAsText(slashQuery, false);
          return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          slashNavigation.current = "keyboard";
          if (matchingCommands.length) setSlashIndex((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + matchingCommands.length) % matchingCommands.length);
          return;
        }
        if (event.key === "Enter") { event.preventDefault(); matchingCommands[slashIndex]?.run(); return; }
        if (event.key === "Backspace") { event.preventDefault(); slashNavigation.current = "keyboard"; if (slashQuery) setSlashQuery((query) => query.slice(0, -1)); else setSlashOpen(false); setSlashIndex(0); return; }
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          slashNavigation.current = "keyboard";
          const nextQuery = slashQuery + event.key;
          if (commandsFor(nextQuery).length) { setSlashQuery(nextQuery); setSlashIndex(0); }
          else keepSlashAsText(nextQuery);
          return;
        }
      }
      if (event.key === "/" && !disabled && !busy && event.target instanceof HTMLElement && event.target.closest("[contenteditable=true]")) {
        const selection = window.getSelection();
        const anchor = selection?.anchorNode;
        const element = anchor instanceof Element ? anchor : anchor?.parentElement;
        const paragraph = element?.closest(
          ".writing-content > p, .writing-content > h1, .writing-content > h2, .writing-content > h3, .writing-content > h4, .writing-content > h5, .writing-content > h6, .writing-content > blockquote, .writing-content li",
        );
        if (selection?.isCollapsed && selection.rangeCount && paragraph) {
          const before = selection.getRangeAt(0).cloneRange();
          before.selectNodeContents(paragraph);
          before.setEnd(selection.anchorNode!, selection.anchorOffset);
          if (!before.toString().trim()) {
            event.preventDefault();
            openSlash();
          }
        }
      }
      if (event.key === "Escape") closeMedia();
    }}>
      {error && (
        <Alert variant="destructive" role="alert">
          {error}
        </Alert>
      )}
      {slashOpen && createPortal(<div ref={slashMenu} role="menu" aria-label={slashFromToolbar ? "Insert content" : "Insert content. Type to search, use arrow keys to choose, then press Enter."} className="writing-slash-menu" onKeyDown={(event) => {
        if (!slashFromToolbar) return;
        if (event.key === "Tab") setSlashOpen(false);
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const items = Array.from(slashMenu.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') || []);
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
        }
      }}>
        <div ref={slashFade.ref} className="writing-slash-options scroll-fade" data-scroll-fade-before={slashFade.edges.before} data-scroll-fade-after={slashFade.edges.after} onScroll={slashFade.measure}>
          {matchingCommands.map(({ icon: Icon, ...command }, index) => <Fragment key={command.name}>
            {matchingCommands[index - 1]?.group !== command.group && <div className="writing-slash-group-label" role="presentation">{command.group}</div>}
            <Button type="button" size="sm" variant="ghost" role="menuitem" aria-current={index === slashIndex ? "true" : undefined}
              onMouseDown={(event) => event.preventDefault()}
              onFocus={() => { slashNavigation.current = "keyboard"; setSlashIndex(index); }}
              onPointerMove={(event) => {
                if (slashPointer.current?.x === event.clientX && slashPointer.current?.y === event.clientY) return;
                slashPointer.current = { x: event.clientX, y: event.clientY };
                slashNavigation.current = "pointer";
                setSlashIndex(index);
              }} onClick={() => runInsertCommand(command.run)}><Icon aria-hidden="true" />{command.name}</Button>
          </Fragment>)}
        </div>
        <div className="writing-slash-footer"><Button type="button" size="sm" variant="ghost" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={closeInsertMenu}><span>Close menu</span><kbd>esc</kbd></Button></div>
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
            const markdown = selected.type.startsWith("video/") ? `\n\n[Video](${url})\n\n` : `\n\n![${alt}](${url})\n\n`;
            insertAtMediaSelection(markdown);
            setImageAlt("");
          } catch {
            /* upload() retains the error and the document. */
          } finally {
            if (file.current) file.current.value = "";
          }
        }}
      />
      {uploadProgress && <div className="px-3 py-2"><MediaUploadStatus progress={uploadProgress} /></div>}
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
    </WritingInteractionContext.Provider>
  );
}
