"use client";

import { WritingImageDialog, WritingImageToolbar } from "./writing-image";
import { WritingCodeEditor } from "./writing-code";
import { writingTableControlsPlugin } from "./writing-table-controls";
import { $createWritingVideoNode, writingVideoPlugin } from "./writing-video";
import { WritingMediaLoading, WritingUploadNode, writingUploadPlugin } from "./writing-upload";
import { useScrollFade } from "./use-scroll-fade";
import { equivalentMarkdown } from "@/lib/markdown-compatibility";
import { readTableWidths, setTableColumnWidths, tableColumnWidths, writeTableWidths } from "@/lib/writing-table";
import { $applyWritingBlockStyle, $isMediaParagraph, writingBlockStyles, type WritingBlock, type WritingBlockStyle } from "./writing-commands";
import { WritingSelectionMenu, type SelectionMenuController } from "./writing-selection-menu";
import { normalizeWritingSelection, writingSelectionBoundariesPlugin } from "./writing-selection-boundaries";
import { EditorCompactControlsContext, EditorWritingActionsContext } from "./editor-frame";
import { useWritingControlsLayout, useMobileWritingDock } from "./use-editor-cards-layout";
import { blurWritingInput } from "./writing-cursor";
import { hasWritingTarget, useWritingTarget } from "./use-writing-target";
import { useSavedWritingHighlight } from "./use-saved-writing-highlight";
import { WritingLinkDialog } from "./writing-link-dialog";
import { writingLinkPastePlugin } from "./writing-link-paste";
import { WritingTitleContext, WritingIntroductionContext, WritingTitleEnterContext } from "./writing-title";
import { WritingInteractionContext } from "./writing-interaction";
import { Fragment, useContext, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  realmPlugin,
  addEditorWrapper$,
  createRootEditorSubscription$,
  activeEditor$,
  rootEditor$,
  $createTableNode,
  $createCodeBlockNode,
  $createImageNode,
  $isTableNode,
  insertThematicBreak$,
} from "@mdxeditor/editor";
import { useCellValue, usePublisher } from "@mdxeditor/gurx";
import { $insertList, $isListItemNode } from "@lexical/list";
import {
  $addUpdateTag,
  $getSelection,
  $createRangeSelection,
  $getNodeByKey,
  $getRoot,
  $createParagraphNode,
  $isParagraphNode,
  $isDecoratorNode,
  $isLineBreakNode,
  $isTextNode,
  RootNode,
  $isRootOrShadowRoot,
  $insertNodes,
  $caretFromPoint,
  $insertNodeToNearestRootAtCaret,
  $isElementNode,
  $isRangeSelection,
  $setSelection,
  type BaseSelection,
  type LexicalEditor,
  type LexicalNode,
  type ElementNode,
  type RangeSelection,
  UNDO_COMMAND,
  REDO_COMMAND,
  CAN_UNDO_COMMAND,
  CAN_REDO_COMMAND,
  COMMAND_PRIORITY_EDITOR,
  COMMAND_PRIORITY_HIGH,
  SELECTION_CHANGE_COMMAND,
  HISTORY_MERGE_TAG,
  HISTORY_PUSH_TAG,
  SKIP_DOM_SELECTION_TAG,
  SKIP_SELECTION_FOCUS_TAG,
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
import { Alert } from "../ui/alert";
import type { WritingEditorProps } from "./writing-editor";
import { videoSource } from "@/lib/video";
import "@mdxeditor/editor/style.css";

function WritingViewPanel({ children }: { children: ReactNode }) {
  const title = useContext(WritingTitleContext);
  const introduction = useContext(WritingIntroductionContext);
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
    data-scroll-fade-before={fade.edges.before} data-scroll-fade-after={false} onScroll={fade.measure}><WritingTitleEnterContext.Provider value={enterBody}><div className="writing-document">{introduction && <div className="writing-course-heading">{introduction}</div>}{title && <div className="writing-document-heading">{title}</div>}{children}</div></WritingTitleEnterContext.Provider></div>;
}

const writingViewPanelPlugin = realmPlugin({
  init(realm) { realm.pub(addEditorWrapper$, WritingViewPanel); },
});

/** A media paragraph has no prose, but it is not an empty writing line. */
function $prepareWritingLine() {
  const selection = $getSelection();
  if (!$isRangeSelection(selection) || !selection.isCollapsed()) return;
  const block = selection.anchor.getNode().getTopLevelElement();
  if (!$isParagraphNode(block) || !$isMediaParagraph(block)) return;
  const before = selection.anchor.type === "element" && selection.anchor.key === block.getKey() && selection.anchor.offset === 0;
  const neighbor = before ? block.getPreviousSibling() : block.getNextSibling();
  const line = $isParagraphNode(neighbor) && neighbor.getChildrenSize() === 0
    ? neighbor : $createParagraphNode();
  if (line !== neighbor) {
    if (before) block.insertBefore(line); else block.insertAfter(line);
  }
  line.selectStart();
}

function $emptyWritingLine(node: LexicalNode | null | undefined): node is ElementNode {
  return $isElementNode(node) && ["paragraph", "heading", "listitem", "quote"].includes(node.getType())
    && node.getTextContentSize() === 0 && node.getChildren().every(child =>
      $isLineBreakNode(child) || $isTextNode(child) && child.getTextContentSize() === 0);
}

function $writingInsertionSource(selection: RangeSelection) {
  const point = selection.focus.getNode();
  let line = $isElementNode(point) ? point : point.getParent();
  while (line?.isInline()) line = line.getParent();
  if (!line || !["paragraph", "heading", "listitem", "quote"].includes(line.getType())) return null;
  return { line, container: line.getTopLevelElement(), next: line.getNextSibling(),
    parents: line.getParents().filter(parent => !$isRootOrShadowRoot(parent)) };
}

/** Consume only a prefix emptied by this insertion, never neighboring authored blanks or media. */
function $finishWritingInsertion(source: ReturnType<typeof $writingInsertionSource>, block: LexicalNode | null) {
  if (!source || !block || !$emptyWritingLine(source.line) || !source.line.isAttached()
    || !source.container?.getNextSibling()?.is(block)) return;
  const { line, next, parents } = source;
  line.remove();
  for (const parent of parents) {
    if (parent.isAttached() && parent.getChildrenSize() === 0) parent.remove();
  }
  if (!next?.isAttached()) return;
  const trailing = next.getPreviousSibling();
  if ($isElementNode(next) && !$isMediaParagraph(next) && $emptyWritingLine(trailing)
    && trailing.getTopLevelElement()?.is(block.getNextSibling())) {
    trailing.remove();
    next.selectStart();
  }
}

function $finishMediaInsertion(anchor: LexicalNode, block: LexicalNode) {
  anchor.replace(block);
  const next = block.getNextSibling();
  if (!$isElementNode(next) || $isMediaParagraph(next)) block.insertAfter($createParagraphNode());
  block.selectNext();
  return block.getNextSibling()!.getKey();
}

const writingTrailingLinePlugin = realmPlugin({
  init(realm) {
    realm.pub(createRootEditorSubscription$, (editor) =>
      editor.registerNodeTransform(RootNode, (root) => {
        // Media can end a paragraph, list or callout. Inspect the final leaf,
        // without changing the authored container or creating another history entry.
        let end = root.getLastChild();
        while ($isElementNode(end)) {
          end = end.getChildren().filter(node => !$isLineBreakNode(node) && !($isTextNode(node) && node.getTextContentSize() === 0)).at(-1) ?? null;
        }
        if ($isDecoratorNode(end)) root.append($createParagraphNode());
      }),
    );
  },
});

type WritingActions = {
  block: (kind: WritingBlock) => void;
  codeBlock: () => void;
  divider: () => void;
};

/** A DOM Range is ordered; native anchor/focus also carry selection direction. */
function applyNativeWritingRange(selection: RangeSelection, native: Selection) {
  const range = native.getRangeAt(0);
  const backward = !native.isCollapsed && native.anchorNode === range.endContainer && native.anchorOffset === range.endOffset;
  selection.applyDOMRange(range);
  if (backward) {
    const { key, offset, type } = selection.anchor;
    selection.anchor.set(selection.focus.key, selection.focus.offset, selection.focus.type);
    selection.focus.set(key, offset, type);
  }
}

function WritingToolbar({
  onInsert,
  onEditorReady,
  ownsMenuFocus,
  onSelectionReady,
  disabled,
  viewControls,
  canvas,
}: {
  canvas: boolean;
  onInsert: (trigger: HTMLButtonElement, fromKeyboard: boolean, fromTouch?: boolean) => void;
  onEditorReady: (editor: LexicalEditor | null, actions: WritingActions) => void;
  ownsMenuFocus: () => boolean;
  onSelectionReady: (controller: SelectionMenuController | null) => void;
  disabled: boolean;
  viewControls: ReactNode;
}) {
  const compact = useWritingControlsLayout();
  const phone = useMobileWritingDock();
  const actionsHost = useContext(EditorWritingActionsContext);
  const editor = useCellValue(activeEditor$);
  const tableCell = !!editor?.getRootElement()?.closest("td, th");
  const compactControls = useContext(EditorCompactControlsContext);
  const writingTarget = useWritingTarget(editor, canvas && phone);
  const divider = usePublisher(insertThematicBreak$);
  const [canUndo, setCanUndo] = useState(false),
    [canRedo, setCanRedo] = useState(false);
  useEffect(() => {
    const convert = (kind: WritingBlock) =>
      editor?.update(() => {
        $prepareWritingLine();
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        normalizeWritingSelection(selection);
        $applyWritingBlockStyle(selection, kind);
      }, { discrete: true });
    onEditorReady(editor, {
      block: convert,
      codeBlock: () => editor?.update(() => {
        $prepareWritingLine();
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        const node = $createCodeBlockNode({ code: "", language: "" });
        const source = $writingInsertionSource(selection);
        const point = selection.focus.getNode();
        const item = $isListItemNode(point) ? point : point.getParents().find($isListItemNode);
        if (selection.isCollapsed() && $emptyWritingLine(item)) {
          // The standard insertion path safely consumes an empty list item.
          // Removing it during a caret split can prune its parent prematurely.
          $insertNodes([node]);
        } else $insertNodeToNearestRootAtCaret(node, $caretFromPoint(selection.focus, "next"), { removeEmptyDestination: !item });
        $finishWritingInsertion(source, node);
        // Focus the code editor after its decorator has mounted.
        setTimeout(() => { if (editor?.getElementByKey(node.getKey())) node.select(); });
      }, { discrete: true }),
      divider: () => editor?.update(() => {
        $prepareWritingLine();
        const selection = $getSelection();
        const source = $isRangeSelection(selection) ? $writingInsertionSource(selection) : null;
        divider();
        // Consume only the empty command line replaced by this divider.
        // Intentional neighboring blank lines and the writable trailing line stay.
        const block = source?.container?.getNextSibling();
        if (block?.getType() === "horizontalrule") $finishWritingInsertion(source, block);
      }, { discrete: true }),
    });
  }, [editor, onEditorReady, divider]);
  useEffect(() => {
    if (!editor) return;
    // Native selectionchange can arrive after a keyboard menu takes focus.
    // Keep the canvas selection synchronized without stealing menu focus.
    return editor.registerCommand(SELECTION_CHANGE_COMMAND, () => {
      if (ownsMenuFocus()) $addUpdateTag(SKIP_SELECTION_FOCUS_TAG);
      return false;
    }, COMMAND_PRIORITY_HIGH);
  }, [editor, ownsMenuFocus]);
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
  const controls = (
      <div className="writing-toolbar-controls" data-canvas={canvas || undefined} data-mobile={compact || undefined} role="group" aria-label="Writing actions">
        <div className="writing-toolbar-group">
          {historyActions.map(({ label, icon: Icon, run, unavailable }) => (
            <Tooltip key={label} content={label}>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className={canvas && phone ? "w-[30px] h-11 p-0 appearance-none rounded-xl border-transparent bg-transparent shadow-none disabled:bg-transparent disabled:border-transparent" : undefined}
                aria-label={label}
                disabled={disabled || unavailable || !!compactControls?.panelsOpen}
                onMouseDown={(event) => event.preventDefault()}
                onClick={run}
              >
                <Icon />
              </Button>
            </Tooltip>
          ))}
        </div>
        <Button type="button" size={phone ? "icon" : "sm"} variant={canvas && phone ? "ghost" : "outline"} disabled={disabled || tableCell || canvas && phone && (!writingTarget || !!compactControls?.panelsOpen)}
          className={canvas && phone ? "w-[30px] h-11 p-0 appearance-none rounded-xl border-transparent bg-transparent shadow-none hover:bg-accent disabled:bg-transparent disabled:border-transparent" : undefined}
          aria-label={phone ? "Commands: insert blocks" : "Commands: insert blocks or format selected text"}
          onPointerDown={(event) => {
            if (!canvas || !phone || event.button !== 0 || !event.isPrimary) return;
            event.preventDefault();
          }}
          onPointerUp={(event) => {
            if (canvas && phone && event.pointerType === "touch" && event.isPrimary) onInsert(event.currentTarget, false, true);
          }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={(event) => onInsert(event.currentTarget, event.detail === 0)}>
          <Plus /><span className="writing-command-label">Commands</span>
        </Button>
      </div>
  );
  return (
    <div className="writing-toolbar">
      {canvas && compact && actionsHost ? createPortal(controls, actionsHost) : controls}
      <WritingSelectionMenu showPhoneTrigger={!canvas} disabled={disabled || !!compactControls?.panelsOpen} onReady={onSelectionReady} />
      {viewControls}
    </div>
  );
}

export default function WritingEditorEngine({
  canvas = false,
  value,
  onChange,
  onUpload,
  disabled = false,
  label = "Content",
  onUnsupported,
  viewControls,
}: WritingEditorProps & { onUnsupported: () => void; viewControls: ReactNode }) {
  const editor = useRef<MDXEditorMethods>(null);
  const initial = useRef(readTableWidths(value));
  const current = useRef(value);
  const loadingWidths = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const failed = useRef(false);
  const file = useRef<HTMLInputElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const compactControls = useContext(EditorCompactControlsContext);
  const compactRef = useRef(compactControls);
  compactRef.current = compactControls;
  const wasCompact = useRef(!!compactControls);
  const slashMenu = useRef<HTMLDivElement>(null);
  const mediaMenu = useRef<HTMLDivElement>(null);
  const ownsMenuFocus = useCallback(() => !!(slashMenu.current?.contains(document.activeElement)
    || mediaMenu.current?.contains(document.activeElement)), []);
  const paletteSession = useRef<{
    menu: HTMLDivElement;
    ready: boolean;
    mode: "above" | "below" | null;
    deadline: number;
    fallbackElapsed: boolean;
    cancel?: () => void;
  } | null>(null);
  const lexicalEditor = useRef<LexicalEditor | null>(null);
  const tableEditor = useRef<LexicalEditor | null>(null);
  const writingActions = useRef<WritingActions | null>(null);
  const selectionTools = useRef<SelectionMenuController | null>(null);
  const mediaSelection = useRef<BaseSelection | null>(null);
  const pendingMedia = useRef(false);
  const slashSelection = useRef<BaseSelection | null>(null);
  const toolbarSelection = useRef<BaseSelection | null>(null);
  const openingTouchClick = useRef(false);
  const activeLine = useRef<HTMLElement | null>(null);
  const [media, setMedia] = useState<"image" | "video">("image");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [uploadCaret, setUploadCaret] = useState<string | null>(null);
  useEffect(() => {
    if (!uploadCaret || busy || disabled) return;
    const lexical = lexicalEditor.current;
    if (!lexical) return;
    const restore = () => {
      if (!lexical.isEditable()) return;
      lexical.update(() => {
        const line = $getNodeByKey(uploadCaret);
        if ($isElementNode(line) && line.isAttached()) {
          lexical.getRootElement()?.focus({ preventScroll: true });
          line.selectStart();
        }
      }, { discrete: true, tag: [HISTORY_MERGE_TAG, SKIP_SCROLL_INTO_VIEW_TAG] });
      resumeWriting();
      setUploadCaret(null);
    };
    const unregister = lexical.registerEditableListener((editable) => { if (editable) restore(); });
    restore();
    return unregister;
  }, [uploadCaret, busy, disabled]);
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
  useEffect(() => {
    if (wasCompact.current && !compactControls) {
      if (slashOpen && !slashFromToolbar) keepSlashAsText(slashQuery, false);
      else setSlashOpen(false);
      closeMedia();
      selectionTools.current?.dismiss();
    }
    wasCompact.current = !!compactControls;
  }, [compactControls, slashOpen, slashFromToolbar, slashQuery]);
  useEffect(() => {
    if (!canvas || !compactControls?.panelsOpen) return;
    if (slashOpen && !slashFromToolbar) keepSlashAsText(slashQuery, false);
    else setSlashOpen(false);
    closeMedia();
    selectionTools.current?.dismiss();
  }, [canvas, compactControls?.panelsOpen, slashOpen, slashFromToolbar, slashQuery]);
  const [videoUrl, setVideoUrl] = useState("");
  const [mediaChooser, setMediaChooser] = useState<"image" | "video" | null>(null);
  const [mediaTab, setMediaTab] = useState<"upload" | "link">("upload");
  const [mediaPosition, setMediaPosition] = useState({ top: 0, left: 0 });
  const [imageAlt, setImageAlt] = useState("");
  const writingHighlight = useSavedWritingHighlight(root, canvas && !!compactControls,
    canvas && !!compactControls && (slashOpen || !!mediaChooser || compactControls.panelsOpen));
  useLayoutEffect(() => {
    if (!slashOpen || !slashMenu.current) return;
    if (canvas && compactRef.current) return;
    slashMenu.current.style.top = `${slashPosition.top}px`;
    slashMenu.current.style.left = `${slashPosition.left}px`;
    slashMenu.current.style.transform = slashPosition.above ? "translateY(-100%)" : "";
    slashMenu.current.style.maxHeight = `${slashPosition.maxHeight}px`;
    if (slashFromToolbar && focusInsertItem.current) {
      focusInsertItem.current = false;
      slashMenu.current.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    }
  }, [canvas, slashOpen, slashPosition, slashFromToolbar]);
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
    if (canvas && compactRef.current) return;
    mediaMenu.current.style.top = `${mediaPosition.top}px`;
    mediaMenu.current.style.left = `${mediaPosition.left}px`;
    const initial = mediaTab === "link"
        ? mediaMenu.current.querySelector<HTMLInputElement>('input[type="url"]')
        : mediaMenu.current.querySelector<HTMLInputElement>('input[aria-label="Alt text (optional)"]') || mediaMenu.current.querySelector<HTMLButtonElement>(".writing-media-fields button");
    initial?.focus({ preventScroll: true });
  }, [canvas, mediaChooser, mediaPosition, mediaTab]);

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
    if (current.current !== value) {
      current.current = value;
      const parsed = readTableWidths(value);
      loadingWidths.current = true;
      editor.current?.setMarkdown(parsed.markdown);
      const frame = requestAnimationFrame(() => {
        tableEditor.current?.update(() => {
          $getRoot().getChildren().filter($isTableNode).forEach((node, index) => {
            const widths = parsed.widths[index];
            setTableColumnWidths(
              node.getWritable().getMdastNode(),
              widths?.length === node.getColCount() ? widths : undefined,
            );
          });
        }, { tag: HISTORY_MERGE_TAG });
        loadingWidths.current = false;
      });
      return () => { cancelAnimationFrame(frame); loadingWidths.current = false; };
    }
  }, [value]);
  useLayoutEffect(() => {
    if (!canvas || !compactControls || !(slashOpen || mediaChooser)) return;
    const dock = root.current?.closest(".app")?.querySelector<HTMLElement>('.editor-frame-controls[data-dock="true"]');
    const menu = mediaChooser ? mediaMenu.current : slashMenu.current;
    if (!dock || !menu) return;
    if (paletteSession.current?.menu !== menu) paletteSession.current = {
      menu, ready: false, mode: null, deadline: performance.now() + 350, fallbackElapsed: false,
    };
    const session = paletteSession.current;
    const waitsForKeyboard = !!mediaChooser || slashFromToolbar;
    let request = 0;
    let fallback = 0;
    const setStyle = (name: string, value: string) => {
      if (menu.style.getPropertyValue(name) !== value) menu.style.setProperty(name, value);
    };
    const place = () => {
      request = 0;
      if (!menu.isConnected || paletteSession.current !== session) return;
      const anchor = dock.getBoundingClientRect();
      const viewport = window.visualViewport;
      const app = root.current?.closest(".app");
      const bounds = app?.getBoundingClientRect();
      const visibleBottom = Math.min((viewport?.offsetTop || 0) + (viewport?.height || window.innerHeight), bounds?.bottom || window.innerHeight);
      const visibleTop = Math.max(0, visibleBottom - (viewport?.height || window.innerHeight), app?.querySelector(".topbar")?.getBoundingClientRect().bottom || 0);
      const dockPosition = dock.dataset.dockPosition === "top" ? "top" : "bottom";
      const usableTop = parseFloat(dock.style.getPropertyValue("--editor-usable-top"));
      const usableBottom = parseFloat(dock.style.getPropertyValue("--editor-usable-bottom"));
      // The frame owns the permitted popup band. Even a constrained chooser
      // stays in that band, with the dock visible and its own list scrolling.
      const top = Number.isFinite(usableTop) ? usableTop
        : dockPosition === "top" ? Math.max(visibleTop + 8, anchor.bottom + 8) : visibleTop + 8;
      const bottom = Number.isFinite(usableBottom) ? usableBottom
        : dockPosition === "bottom" ? Math.min(visibleBottom - 8, anchor.top - 8) : visibleBottom - 8;
      const left = viewport?.offsetLeft || 0;
      const visibleWidth = viewport?.width || window.innerWidth;
      const width = Math.min(mediaChooser ? 324 : 288, visibleWidth - 16);
      setStyle("width", `${width}px`);
      const available = Math.max(0, bottom - top);
      const style = getComputedStyle(menu);
      const chrome = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom)
        + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
      const preferred = Math.min(360, mediaChooser ? menu.scrollHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
        : (menu.querySelector<HTMLElement>(".writing-slash-options")?.scrollHeight || 0)
          + (menu.querySelector<HTMLElement>(".writing-slash-footer")?.offsetHeight || 0) + chrome);
      const candidate = dockPosition === "top" ? "below" : "above";
      const mode = session.mode || candidate;
      const wasReady = session.ready;
      session.ready ||= !waitsForKeyboard || dock.dataset.keyboardVisible !== "true" && dock.dataset.dockSettled !== "false" && available >= preferred
        || session.fallbackElapsed || performance.now() >= session.deadline;
      // Choose a lane once the opening is ready. Native keyboard dismissal
      // may grow its room, but cannot flip the visible menu to another lane.
      if (session.ready && !session.mode) session.mode = mode;
      setStyle("top", `${mode === "above" ? bottom : top}px`);
      setStyle("left", `${Math.max(left + 8, Math.min(anchor.x + anchor.width / 2 - width / 2, left + visibleWidth - width - 8))}px`);
      setStyle("transform", mode === "above" ? "translateY(-100%)" : "none");
      setStyle("max-height", `${Math.min(360, available)}px`);
      if (mediaChooser) setStyle("overflow-y", "auto");
      menu.dataset.paletteReady = String(session.ready);
      if (session.ready && !wasReady) {
        clearTimeout(fallback);
        if (mediaChooser) menu.querySelector<HTMLButtonElement>(".writing-media-tabs button, .writing-media-fields button:not(:disabled)")?.focus({ preventScroll: true });
        else if (slashFromToolbar && focusInsertItem.current) {
          focusInsertItem.current = false;
          menu.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
          window.getSelection()?.removeAllRanges();
        }
        if (!mediaChooser) {
          const options = menu.querySelector<HTMLElement>(".writing-slash-options");
          const selected = options?.querySelector<HTMLElement>('[aria-current="true"]')
            || options?.querySelector<HTMLElement>('[role="menuitem"]');
          if (options && selected) {
            const bounds = options.getBoundingClientRect();
            const item = selected.getBoundingClientRect();
            const gap = Math.min(4, Math.max(0, (bounds.height - item.height) / 2));
            // Initial focus never scrolls the canvas. Reveal the actual row
            // inside this list, including immediately opened typed suggestions.
            if (item.top < bounds.top + gap) options.scrollTop -= bounds.top + gap - item.top;
            else if (item.bottom > bounds.bottom - gap) options.scrollTop += item.bottom - bounds.bottom + gap;
          }
        }
      }
    };
    const schedule = () => { if (!request) request = requestAnimationFrame(place); };
    const afterDock = () => { cancelAnimationFrame(request); place(); };
    place();
    // Hardware keyboards and static viewport simulations may never emit a
    // dismissal resize. Keep their constrained chooser reachable as well.
    if (!session.ready) fallback = window.setTimeout(() => {
      // Fractional timer delays can fire just before the clock deadline.
      // The fallback itself ends the wait even without another viewport event.
      session.fallbackElapsed = true;
      afterDock();
    }, Math.max(0, session.deadline - performance.now()));
    const cancelOpening = () => {
      cancelAnimationFrame(request);
      clearTimeout(fallback);
      if (paletteSession.current === session) paletteSession.current = null;
    };
    session.cancel = cancelOpening;
    const observer = new ResizeObserver(schedule);
    observer.observe(dock);
    observer.observe(menu);
    // The dock's position can change without its dimensions changing.
    const movement = new MutationObserver(schedule);
    movement.observe(dock, { attributes: true, attributeFilter: ["style", "data-keyboard-visible", "data-dock-position", "data-dock-settled"] });
    const owner = root.current?.closest(".main-content");
    owner?.addEventListener("fieldbook:editor-dock-change", afterDock);
    owner?.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("scroll", schedule, { passive: true });
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    return () => {
      cancelAnimationFrame(request);
      clearTimeout(fallback);
      observer.disconnect();
      movement.disconnect();
      if (session.cancel === cancelOpening) session.cancel = undefined;
      if (!menu.isConnected && paletteSession.current?.menu === menu) paletteSession.current = null;
      owner?.removeEventListener("fieldbook:editor-dock-change", afterDock);
      owner?.removeEventListener("scroll", schedule);
      window.removeEventListener("scroll", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
    };
  }, [canvas, !!compactControls, slashOpen, slashFromToolbar, mediaChooser, mediaTab]);

  useEffect(() => {
    if (!canvas || !compactControls || !(slashOpen || mediaChooser || popupActive)) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.editor-frame-controls[data-dock="true"], .writing-toolbar-controls, .writing-slash-menu, .writing-media-chooser, [data-writing-selection-menu]')) return;
      writingHighlight.clear();
      if (slashOpen && !slashFromToolbar) keepSlashAsText(slashQuery, false);
      else setSlashOpen(false);
      closeMedia();
      selectionTools.current?.dismiss();
    };
    document.addEventListener("pointerdown", dismiss, true);
    return () => document.removeEventListener("pointerdown", dismiss, true);
  }, [canvas, compactControls, slashOpen, slashFromToolbar, slashQuery, mediaChooser, popupActive, writingHighlight.clear]);

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
      if (!pendingMedia.current) setBusy(false);
    }
  }
  async function insertUploadedMedia(items: { file: File; alt: string }[]) {
    const lexical = lexicalEditor.current;
    if (!lexical || pendingMedia.current) return;
    if (canvas && compactRef.current) writingHighlight.clear();
    const beforeUpload = lexical.getEditorState();
    let keys: string[] = [];
    const selection = mediaSelection.current;
    pendingMedia.current = true;
    lexical.update(() => {
      if (selection) $setSelection(selection.clone());
      const caret = $getSelection();
      if ($isRangeSelection(caret) && caret.isCollapsed() && caret.anchor.type === "element") {
        const parent = caret.anchor.getNode();
        if ($isRootOrShadowRoot(parent)) {
          const line = parent.getChildAtIndex(caret.anchor.offset);
          if ($isParagraphNode(line) && line.isEmpty()) line.selectStart();
        }
      }
      const loading = items.map(() => new WritingUploadNode());
      $insertNodes(loading);
      keys = loading.map(node => node.getKey());
    }, { discrete: true, tag: HISTORY_PUSH_TAG });
    closeMedia();
    try {
      const urls: string[] = [];
      for (const { file } of items) urls.push(await upload(file));
      pendingMedia.current = false;
      lexical.update(() => {
        const loading = keys.map(key => $getNodeByKey(key));
        if (loading.some(node => !node?.isAttached())) return;
        items.forEach(({ file, alt }, index) => {
          const block = file.type.startsWith("image/")
            ? $createParagraphNode().append($createImageNode({ src: urls[index], altText: alt }))
            : $createWritingVideoNode(urls[index]);
          if (index === items.length - 1) setUploadCaret($finishMediaInsertion(loading[index]!, block));
          else loading[index]!.replace(block);
        });
      }, { discrete: true, tag: HISTORY_MERGE_TAG });
    } catch {
      pendingMedia.current = false;
      // A rejected upload must also restore any text selected before pasting.
      lexical.setEditorState(beforeUpload, { tag: HISTORY_MERGE_TAG });
    } finally {
      setBusy(false);
    }
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
        emptyBlock = selection.isCollapsed() && $isParagraphNode(block) && block.getChildrenSize() === 0;
      }
    });
    setSlashOpen(false);
    if (kind === "bullet" || kind === "number") {
      lexical?.update(() => { $prepareWritingLine(); $insertList(kind); }, { discrete: true });
      lexical?.focus();
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
      $prepareWritingLine();
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
      if (line.getType() === "quote") {
        // A table is a block: split the callout at the caret rather than
        // flattening the decorator into its paragraph and losing the table.
        $insertNodeToNearestRootAtCaret(table, $caretFromPoint(selection.focus, "next"), { removeEmptyDestination: true });
        if (!$isElementNode(table.getNextSibling())) table.insertAfter($createParagraphNode());
        table.selectNext();
      } else $insertNodes([table]);
      if (line.isAttached() && $isParagraphNode(line) && line.getChildrenSize() === 0) line.remove();
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
      if (canvas && compactRef.current && event.target instanceof Element && event.target.closest('.writing-toolbar-controls, .editor-frame-controls[data-dock="true"]')) return;
      if (!root.current?.contains(event.target as Node) && !slashMenu.current?.contains(event.target as Node)) {
        if (canvas && compactRef.current) writingHighlight.clear();
        if (slashFromToolbar) setSlashOpen(false);
        else keepSlashAsText(slashQuery, false);
      }
    }
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [canvas, slashOpen, slashFromToolbar, slashQuery, keepSlashAsText, writingHighlight.clear]);

  useEffect(() => {
    if (!slashOpen) return;
    const viewport = root.current?.closest<HTMLElement>(".main-content");
    const close = () => {
      // Keyboard dismissal can shrink spare scroll space and pan the owner.
      // A compact tap-opened palette must survive that transition.
      if (canvas && compactRef.current && slashFromToolbar) return;
      if (slashFromToolbar) setSlashOpen(false);
      else keepSlashAsText(slashQuery, false);
    };
    viewport?.addEventListener("scroll", close, { passive: true });
    return () => viewport?.removeEventListener("scroll", close);
  }, [canvas, slashOpen, slashFromToolbar, slashQuery, keepSlashAsText]);

  function rememberSelection() {
    mediaSelection.current = null;
    const lexical = lexicalEditor.current;
    lexical?.read(() => {
      let selection = $getSelection()?.clone() || null;
      const dom = window.getSelection();
      const surface = lexical.getRootElement();
      if (dom?.rangeCount && surface) {
        const range = dom.getRangeAt(0);
        if (surface.contains(range.startContainer) && surface.contains(range.endContainer)) {
          const current = $isRangeSelection(selection) ? selection : $createRangeSelection();
          if (canvas && compactRef.current) applyNativeWritingRange(current, dom);
          else current.applyDOMRange(range);
          selection = current;
        }
      }
      if ($isRangeSelection(selection)) normalizeWritingSelection(selection);
      mediaSelection.current = selection;
    });
  }
  function insertAtMediaSelection(createBlock: () => LexicalNode) {
    const selection = mediaSelection.current;
    const lexical = lexicalEditor.current;
    if (!lexical) return;
    if (canvas && compactRef.current) writingHighlight.clear();
    lexical.update(() => {
      if (selection) $setSelection(selection.clone());
      // A block decorator splits the current line without inheriting or
      // flattening its heading/list style. Replace it before any DOM commit.
      const anchor = new WritingUploadNode();
      $insertNodes([anchor]);
      $finishMediaInsertion(anchor, createBlock());
      if (canvas && compactRef.current) lexical.focus();
    }, { discrete: true, tag: canvas && compactRef.current ? [HISTORY_PUSH_TAG, SKIP_SCROLL_INTO_VIEW_TAG] : HISTORY_PUSH_TAG });
    closeMedia();
    if (canvas && compactRef.current) resumeWriting();
    else editor.current?.focus(undefined, { preventScroll: true });
  }
  function closeMedia(returnFocus = false) {
    paletteSession.current?.cancel?.();
    if (returnFocus) writingHighlight.clear();
    const selection = mediaSelection.current;
    activeLine.current?.classList.remove("writing-media-line");
    activeLine.current?.removeAttribute("data-media-placeholder");
    setMediaChooser(null);
    setVideoUrl("");
    if (returnFocus && canvas && compactRef.current && restoreInsertTarget(selection)) resumeWriting();
  }
  function openMedia(type: "image" | "video", tab: "upload" | "link" = "upload") {
    rememberSelection();
    if (canvas && compactRef.current) {
      root.current?.dispatchEvent(new Event("fieldbook:writing-handoff", { bubbles: true }));
      blurWritingInput();
      window.getSelection()?.removeAllRanges();
    }
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
  function resumeWriting() {
    if (canvas && compactRef.current) {
      writingHighlight.clear();
      root.current?.dispatchEvent(new Event("fieldbook:writing-resume", { bubbles: true }));
    }
  }
  function hasAttachedInsertTarget(selection: BaseSelection | null) {
    const lexical = lexicalEditor.current;
    if (!lexical || !selection) return false;
    let attached = false;
    lexical.read(() => {
      try {
        attached = $isRangeSelection(selection)
          ? !!$getNodeByKey(selection.anchor.key)?.isAttached() && !!$getNodeByKey(selection.focus.key)?.isAttached()
          : selection.getNodes().length > 0 && selection.getNodes().every((node) => node.isAttached());
      } catch { /* The writing target changed while the chooser was open. */ }
    });
    return attached;
  }
  function restoreInsertTarget(selection: BaseSelection | null) {
    const lexical = lexicalEditor.current;
    if (!lexical || !selection || !hasAttachedInsertTarget(selection)) return false;
    lexical.getRootElement()?.focus({ preventScroll: true });
    lexical.update(() => {
      $setSelection(selection.clone());
      lexical.focus();
    }, { discrete: true, tag: SKIP_SCROLL_INTO_VIEW_TAG });
    return true;
  }
  const closeInsertMenu = useCallback(() => {
    paletteSession.current?.cancel?.();
    writingHighlight.clear();
    if (slashFromToolbar) {
      setSlashOpen(false);
      if (canvas && compactRef.current) {
        if (restoreInsertTarget(slashSelection.current)) resumeWriting();
      } else insertTrigger.current?.focus({ preventScroll: true });
    } else {
      keepSlashAsText();
      if (canvas && compactRef.current) {
        const lexical = lexicalEditor.current;
        lexical?.update(() => lexical.focus(), { discrete: true, tag: SKIP_SCROLL_INTO_VIEW_TAG });
        resumeWriting();
      } else editor.current?.focus(undefined, { preventScroll: true });
    }
  }, [canvas, slashFromToolbar, keepSlashAsText, writingHighlight.clear]);
  useEffect(() => {
    if (!slashOpen && !(mediaChooser && canvas && compactRef.current)) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      const target = event.target;
      const menu = mediaChooser ? mediaMenu.current : slashMenu.current;
      const pendingCompact = canvas && compactRef.current && menu?.dataset.paletteReady === "false";
      if (!(target instanceof Node)
        || (!pendingCompact && !root.current?.contains(target) && !menu?.contains(target))) return;
      // The menu is portaled; handle Escape before either editor or popup handlers.
      event.preventDefault();
      event.stopPropagation();
      if (mediaChooser && canvas && compactRef.current) closeMedia(true);
      else closeInsertMenu();
    };
    document.addEventListener("keydown", dismiss, true);
    return () => document.removeEventListener("keydown", dismiss, true);
  }, [canvas, slashOpen, mediaChooser, closeInsertMenu]);
  function openSlash(trigger?: HTMLButtonElement, fromKeyboard = false) {
    if (trigger && slashMenu.current && insertTrigger.current === trigger) {
      closeInsertMenu();
      return;
    }
    if (canvas && compactRef.current) {
      writingHighlight.clear();
      root.current?.dispatchEvent(new Event("fieldbook:writing-handoff", { bubbles: true }));
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
  function openCommands(trigger: HTMLButtonElement, fromKeyboard: boolean, fromTouch = false) {
    if (canvas && compactRef.current && slashMenu.current && insertTrigger.current === trigger) {
      openingTouchClick.current = fromTouch;
      closeInsertMenu();
      return;
    }
    if (canvas && compactRef.current && (compactRef.current.panelsOpen || !hasWritingTarget(lexicalEditor.current, true))) return;
    if (selectionTools.current?.show(fromKeyboard, trigger)) {
      setSlashOpen(false);
      return;
    }
    openSlash(trigger, fromKeyboard);
    if (canvas && compactRef.current) {
      openingTouchClick.current = fromTouch;
      focusInsertItem.current = true;
      blurWritingInput();
      window.getSelection()?.removeAllRanges();
    }
  }
  function runInsertCommand(run: () => void, mediaCommand = false) {
    if (canvas && compactRef.current) {
      const lexical = lexicalEditor.current;
      const selection = slashSelection.current;
      const dismissInvalidTarget = () => {
        paletteSession.current?.cancel?.();
        writingHighlight.clear();
        slashSelection.current = null;
        focusInsertItem.current = false;
        setSlashOpen(false);
      };
      if (!lexical) { dismissInvalidTarget(); return; }
      if (mediaCommand) {
        if (!hasAttachedInsertTarget(selection)) { dismissInvalidTarget(); return; }
        // A chooser handoff restores the editor target without touching its
        // DOM focus or selection, so it cannot briefly reopen the keyboard.
        lexical.update(() => { if (selection) $setSelection(selection.clone()); }, {
          discrete: true, tag: [SKIP_DOM_SELECTION_TAG, SKIP_SCROLL_INTO_VIEW_TAG],
        });
        run();
      } else {
        if (!restoreInsertTarget(selection)) { dismissInvalidTarget(); return; }
        writingHighlight.clear();
        lexical.update(run, { discrete: true, tag: SKIP_SCROLL_INTO_VIEW_TAG });
        resumeWriting();
      }
      return;
    }
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
    insertAtMediaSelection(() => $createWritingVideoNode(videoUrl));
  }
  const plugins = useMemo(() => [
    writingViewPanelPlugin(),
    writingTrailingLinePlugin(),
    writingVideoPlugin(),
    writingUploadPlugin(),
    writingSelectionBoundariesPlugin(),
    headingsPlugin(),
    listsPlugin(),
    quotePlugin(),
    thematicBreakPlugin(),
    linkPlugin(),
    writingLinkPastePlugin(),
    linkDialogPlugin({ LinkDialog: WritingLinkDialog }),
    imagePlugin({
      disableImageResize: true,
      ImageDialog: WritingImageDialog,
      EditImageToolbar: WritingImageToolbar,
      imagePlaceholder: WritingMediaLoading,
      imageUploadHandler: onUpload ? upload : undefined,
    }),
    tablePlugin(),
    writingTableControlsPlugin(
      initial.current.widths,
      (root) => { tableEditor.current = root; },
      (widths) => {
        if (loadingWidths.current) return;
        const saved = readTableWidths(current.current).widths;
        const previous = saved.some(Boolean) ? saved : [];
        const nextWidths = widths.some(Boolean) ? widths : [];
        if (JSON.stringify(previous) === JSON.stringify(nextWidths)) return;
        const markdown = editor.current?.getMarkdown() || readTableWidths(current.current).markdown;
        const next = writeTableWidths(markdown, widths);
        if (next !== current.current) {
          current.current = next;
          onChangeRef.current(next);
        }
      },
    )(),
    codeBlockPlugin({
      codeBlockEditorDescriptors: [
        { priority: 0, match: () => true, Editor: WritingCodeEditor },
      ],
    }),
    markdownShortcutPlugin(),
    toolbarPlugin({
      toolbarContents: () => (
        <WritingToolbar
          canvas={canvas}
          onInsert={openCommands}
          onSelectionReady={(controller) => { selectionTools.current = controller; }}
          onEditorReady={(active, actions) => { if (active) lexicalEditor.current = active; writingActions.current = actions; }}
          ownsMenuFocus={ownsMenuFocus}
          disabled={disabled || busy}
          viewControls={viewControls}
        />
      ),
    }),
  ], [onUpload, disabled, busy, viewControls, canvas]);
  return (
    <WritingInteractionContext.Provider value={reportInteraction}>
    <div ref={root} data-editor-interacting={popupActive || slashOpen || !!mediaChooser || undefined} className="writing-editor writing-surface rounded-lg border border-border bg-background" onClickCapture={(event) => {
      const opening = openingTouchClick.current;
      openingTouchClick.current = false;
      // Some engines synthesize a click after touch release, others suppress it
      // when pointerdown preserves the caret. Consume only that opening click.
      if (opening && event.detail > 0) { event.preventDefault(); event.stopPropagation(); }
    }} onPointerDownCapture={(event) => {
      openingTouchClick.current = false;
      if (event.target instanceof Element && event.target.closest(".writing-toolbar-controls")) {
        toolbarSelection.current = null;
        lexicalEditor.current?.read(() => {
          const current = $getSelection();
          const range = window.getSelection();
          if (canvas && compactRef.current && hasWritingTarget(lexicalEditor.current, true) && range?.rangeCount) {
            const selection = $isRangeSelection(current) ? current.clone() : $createRangeSelection();
            applyNativeWritingRange(selection, range);
            normalizeWritingSelection(selection);
            toolbarSelection.current = selection.clone();
          } else toolbarSelection.current = current?.clone() || null;
        });
      }
      if (slashMenu.current?.contains(event.target as Node) || mediaMenu.current?.contains(event.target as Node)) return;
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
    }} onFocusCapture={(event) => {
      if (canvas && compactRef.current && event.target instanceof HTMLElement && event.target.isContentEditable && !event.target.closest(".writing-code-block")) compactRef.current.dismissPanels();
    }} onPasteCapture={(event) => {
      if (event.target instanceof Element && event.target.closest(".writing-code-block")) return;
      if (!(event.target instanceof HTMLElement) || !event.target.closest("[contenteditable=true]")) return;
      const images = Array.from(event.clipboardData.items).filter(item => item.type.startsWith("image/"))
        .map(item => item.getAsFile()).filter((file): file is File => !!file);
      if (!images.length) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.target instanceof Element && event.target.closest("td, th")) {
        setError("Add images outside table cells.");
        return;
      }
      if (!onUpload) { setError("Uploads are unavailable in this view."); return; }
      rememberSelection();
      void insertUploadedMedia(images.map(file => ({ file,
        alt: file.name.replace(/\.[^.]+$/, "").replace(/[\[\]\\\n]/g, " ") || "Image" })));
    }} onKeyDownCapture={(event) => {
      if (event.target instanceof Element && event.target.closest(".writing-code-block")) return;
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
        if (event.key === "Enter") {
          event.preventDefault();
          const command = matchingCommands[slashIndex];
          if (command) runInsertCommand(command.run, command.group === "Media");
          return;
        }
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
      if (event.key === "/" && !disabled && !busy && event.target instanceof HTMLElement && event.target.closest("[contenteditable=true]") && !event.target.closest("td, th")) {
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
        <Alert variant="destructive" role="alert" onDismiss={() => setError("")}>
          {error}
        </Alert>
      )}
      {slashOpen && createPortal(<div ref={slashMenu} role="menu" aria-label={slashFromToolbar ? "Insert content" : "Insert content. Type to search, use arrow keys to choose, then press Enter."} className="writing-slash-menu" data-touch-motion={canvas && !!compactControls && slashFromToolbar || undefined} data-palette-ready={canvas && compactControls ? String(!slashFromToolbar) : undefined} onKeyDown={(event) => {
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
              }} onClick={() => runInsertCommand(command.run, command.group === "Media")}><Icon aria-hidden="true" />{command.name}</Button>
          </Fragment>)}
        </div>
        <div className="writing-slash-footer"><Button type="button" size="sm" variant="ghost" role="menuitem" onMouseDown={(event) => event.preventDefault()} onClick={closeInsertMenu}><span>Close menu</span><kbd>esc</kbd></Button></div>
      </div>, document.body)}
      {mediaChooser && createPortal(<div ref={mediaMenu} className="writing-media-chooser" data-touch-motion={canvas && !!compactControls || undefined} data-palette-ready={canvas && compactControls ? "false" : undefined} role="dialog" aria-label={`Insert ${mediaChooser}`} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeMedia(true); if (!canvas || !compactRef.current) editor.current?.focus(undefined, { preventScroll: true }); } }}>
        <div className="writing-media-tabs"><Button type="button" variant="ghost" aria-pressed={mediaTab === "upload"} onClick={() => setMediaTab("upload")}>Upload</Button><Button type="button" variant="ghost" aria-pressed={mediaTab === "link"} onClick={() => setMediaTab("link")}>Link</Button></div>
        {mediaTab === "upload" ? <div className="writing-media-fields">{mediaChooser === "image" && <Input aria-label="Alt text (optional)" value={imageAlt} onChange={(event) => setImageAlt(event.target.value)} placeholder="Alt text (optional)" />}<Button type="button" disabled={!onUpload} onClick={() => file.current?.click()}>Choose {mediaChooser}</Button></div> : <div className="writing-media-fields"><Input aria-label={mediaChooser === "video" ? "Video URL" : "Image URL"} type="url" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder={mediaChooser === "video" ? "YouTube, Vimeo or Loom URL" : "https://example.com/image.jpg"} /><Button type="button" onClick={mediaChooser === "video" ? insertVideo : () => { if (!/^https:\/\//i.test(videoUrl)) { setError("Use an HTTPS image URL."); return; } insertAtMediaSelection(() => $createParagraphNode().append($createImageNode({ src: videoUrl, altText: imageAlt.trim() || "Image" }))); }}>Insert {mediaChooser}</Button></div>}
        <Button type="button" variant="ghost" size="sm" onClick={() => closeMedia(true)}>Cancel</Button>
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
            const alt = (imageAlt.trim() || selected.name).replace(/[\[\]\\\n]/g, " ");
            await insertUploadedMedia([{ file: selected, alt }]);
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
        markdown={initial.current.markdown}
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
          if (failed.current || pendingMedia.current) return;
          if (normalized) {
            if (!equivalentMarkdown(readTableWidths(current.current).markdown, markdown)) {
              failed.current = true;
              onUnsupported();
            }
            return;
          }
          const widths: (number[] | null)[] = [];
          tableEditor.current?.getEditorState().read(() => {
            $getRoot().getChildren().filter($isTableNode).forEach((node) => {
              widths.push(tableColumnWidths(node.getMdastNode())?.slice() || null);
            });
          });
          const next = writeTableWidths(markdown, widths);
          current.current = next;
          onChange(next);
        }}
        plugins={plugins}
      />
    </div>
    </WritingInteractionContext.Provider>
  );
}
