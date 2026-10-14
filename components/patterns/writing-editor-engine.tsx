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
import { EditorCompactControlsContext, EditorWritingActionsContext, EditorMobileOverlayContext } from "./editor-frame";
import { useWritingControlsLayout, useMobileEditorLayout } from "./use-editor-cards-layout";
import { blurWritingInput } from "./writing-cursor";
import { hasWritingTarget, useWritingTarget } from "./use-writing-target";
import { useSavedWritingHighlight } from "./use-saved-writing-highlight";
import { WritingLinkDialog } from "./writing-link-dialog";
import { writingLinkPastePlugin } from "./writing-link-paste";
import { WritingTitleContext, WritingIntroductionContext, WritingTitleEnterContext } from "./writing-title";
import { WritingInteractionContext } from "./writing-interaction";
import { Fragment, createContext, useContext, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  currentSelection$,
  rootEditor$,
  $createTableNode,
  $createCodeBlockNode,
  $createImageNode,
  $isTableNode,
  insertThematicBreak$,
  openLinkEditDialog$,
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
  getNearestEditorFromDOMNode,
  type BaseSelection,
  type LexicalEditor,
  type LexicalNode,
  type ElementNode,
  type RangeSelection,
  UNDO_COMMAND,
  REDO_COMMAND,
  FORMAT_TEXT_COMMAND,
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
  Bold,
  Italic,
  Strikethrough,
  Code,
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
    const surface = lexical?.getRootElement();
    // DOM selection can implicitly focus WebKit's contenteditable. Protect the
    // handoff before reconciliation, while it is still the title's user gesture.
    if (surface && document.activeElement !== surface) surface.focus({ preventScroll: true });
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
    }, { discrete: true });
  }
  const fade = useScrollFade<HTMLDivElement>();
  return <div ref={fade.ref} data-state="active" className="writing-viewport writing-scroll-area scroll-fade mt-0 focus-visible:ring-0"
    data-scroll-fade-before={fade.edges.before} data-scroll-fade-after={false} onScroll={fade.measure}><WritingTitleEnterContext.Provider value={enterBody}><div className="writing-document">{introduction && <div className="writing-course-heading">{introduction}</div>}{title && <div className="writing-document-heading">{title}</div>}{children}</div></WritingTitleEnterContext.Provider></div>;
}

const writingViewPanelPlugin = realmPlugin({
  init(realm) {
    realm.pub(addEditorWrapper$, WritingViewPanel);
    realm.pub(createRootEditorSubscription$, editor => {
      const reveal = (event: Event) => {
        if (!(event instanceof CustomEvent) || !(event.detail instanceof Range)
          || !editor.isEditable()
          || getNearestEditorFromDOMNode(event.detail.startContainer) !== editor
          || getNearestEditorFromDOMNode(event.detail.endContainer) !== editor) return;
        // Guided navigation is an editing action. Keep the model and native
        // caret together and let Lexical perform its ordinary selection reveal.
        editor.update(() => {
          const selection = $createRangeSelection();
          selection.applyDOMRange(event.detail);
          $setSelection(selection);
        }, { discrete: true });
        event.preventDefault();
      };
      return editor.registerRootListener((surface, previous) => {
        previous?.removeEventListener("fieldbook:writing-reveal", reveal);
        surface?.addEventListener("fieldbook:writing-reveal", reveal);
      });
    });
  },
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
  block: (editor: LexicalEditor, kind: WritingBlock) => void;
  codeBlock: (editor: LexicalEditor) => void;
  divider: (editor: LexicalEditor) => void;
  link: (editor: LexicalEditor) => void;
};

type WritingBookmark = { editor: LexicalEditor; selection: BaseSelection };

/** Nested cells and outer prose have separate models, even inside one canvas. */
function nativeWritingEditor(scope: HTMLElement | null) {
  const selection = window.getSelection();
  if (!scope || !selection?.rangeCount || !selection.anchorNode || !selection.focusNode) return null;
  const anchor = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode.parentElement;
  if (anchor?.closest(".writing-code-block")) return null;
  const editor = getNearestEditorFromDOMNode(selection.anchorNode);
  const surface = editor?.getRootElement();
  return editor && surface && scope.contains(surface) && editor.isEditable()
    && getNearestEditorFromDOMNode(selection.focusNode) === editor ? editor : null;
}

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

const WritingCommandsOpenContext = createContext(false);

function WritingToolbar({
  onInsert,
  hasPreparedSelection,
  onEditorReady,
  ownsMenuFocus,
  onSelectionReady,
  disabled,
  viewControls,
  canvas,
}: {
  canvas: boolean;
  onInsert: (trigger: HTMLButtonElement, fromKeyboard: boolean) => void;
  hasPreparedSelection: (trigger: HTMLButtonElement) => boolean;
  onEditorReady: (editor: LexicalEditor | null, actions: WritingActions) => void;
  ownsMenuFocus: () => boolean;
  onSelectionReady: (controller: SelectionMenuController | null) => void;
  disabled: boolean;
  viewControls: ReactNode;
}) {
  const compact = useWritingControlsLayout();
  const phone = useMobileEditorLayout();
  const actionsHost = useContext(EditorWritingActionsContext);
  const editor = useCellValue(activeEditor$);
  const tableCell = !!editor?.getRootElement()?.closest("td, th");
  const compactControls = useContext(EditorCompactControlsContext);
  const writingTarget = useWritingTarget(editor, canvas && phone);
  const commandsOpen = useContext(WritingCommandsOpenContext);
  const commandsButton = useRef<HTMLButtonElement>(null);
  const [commandGesture, setCommandGesture] = useState(false);
  useEffect(() => {
    if (!commandGesture) return;
    const cancel = () => setCommandGesture(false);
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !commandsButton.current?.contains(event.target)) cancel();
    };
    // Native focus may move to the toolbar's focusable ancestor before click.
    // Retain the captured target for that gesture, never a later interaction.
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("pointerup", outside, true);
    document.addEventListener("pointercancel", cancel, true);
    document.addEventListener("click", cancel);
    document.addEventListener("keydown", cancel, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("pointerup", outside, true);
      document.removeEventListener("pointercancel", cancel, true);
      document.removeEventListener("click", cancel);
      document.removeEventListener("keydown", cancel, true);
    };
  }, [commandGesture]);
  const divider = usePublisher(insertThematicBreak$);
  const openLink = usePublisher(openLinkEditDialog$);
  const activate = usePublisher(activeEditor$);
  const publishSelection = usePublisher(currentSelection$);
  const [canUndo, setCanUndo] = useState(false),
    [canRedo, setCanRedo] = useState(false);
  useEffect(() => {
    const synchronize = (owner: LexicalEditor) => owner.read(() => {
      activate(owner);
      const selection = $getSelection();
      publishSelection($isRangeSelection(selection) ? selection : null);
    });
    const convert = (owner: LexicalEditor, kind: WritingBlock) =>
      owner.update(() => {
        $prepareWritingLine();
        const selection = $getSelection();
        if (!$isRangeSelection(selection)) return;
        normalizeWritingSelection(selection);
        $applyWritingBlockStyle(selection, kind);
      }, { discrete: true });
    onEditorReady(editor, {
      block: convert,
      link: (owner) => { synchronize(owner); openLink(); },
      codeBlock: (editor) => editor.update(() => {
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
      divider: (editor) => {
        synchronize(editor);
        editor.update(() => {
          $prepareWritingLine();
          const selection = $getSelection();
          const source = $isRangeSelection(selection) ? $writingInsertionSource(selection) : null;
          divider();
          // Consume only the empty command line replaced by this divider.
          // Intentional neighboring blank lines and the writable trailing line stay.
          const block = source?.container?.getNextSibling();
          if (block?.getType() === "horizontalrule") $finishWritingInsertion(source, block);
        }, { discrete: true });
      },
    });
  }, [editor, onEditorReady, divider, openLink, activate, publishSelection]);
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
                className={canvas && phone ? "p-0 appearance-none rounded-xl border-transparent bg-transparent shadow-none disabled:bg-transparent disabled:border-transparent" : undefined}
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
        <Button ref={commandsButton} type="button" size={phone ? "icon" : "sm"} variant={canvas && phone ? "ghost" : "outline"} disabled={disabled || tableCell && !(canvas && phone) || canvas && phone && ((!writingTarget && !commandGesture && !commandsOpen) || !!compactControls?.panelsOpen)}
          className={canvas && phone ? "p-0 appearance-none rounded-xl border-transparent bg-transparent shadow-none hover:bg-accent disabled:bg-transparent disabled:border-transparent" : undefined}
          aria-label="Commands: insert blocks or format selected text"
          aria-haspopup="menu"
          aria-expanded={commandsOpen}
          onPointerDown={(event) => {
            if (canvas && phone && event.isPrimary && event.button === 0)
              setCommandGesture(commandsOpen || hasPreparedSelection(event.currentTarget));
          }}
          onMouseDown={(event) => { if (!canvas || !phone) event.preventDefault(); }}
          onClick={(event) => {
            onInsert(event.currentTarget, event.detail === 0);
            setCommandGesture(false);
          }}>
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
  const overlayHost = useContext(EditorMobileOverlayContext);
  const compactRef = useRef(compactControls);
  compactRef.current = compactControls;
  const wasCompact = useRef(!!compactControls);
  const slashMenu = useRef<HTMLDivElement>(null);
  const mediaMenu = useRef<HTMLDivElement>(null);
  const ownsMenuFocus = useCallback(() => !!(slashMenu.current?.contains(document.activeElement)
    || mediaMenu.current?.contains(document.activeElement)), []);
  const lexicalEditor = useRef<LexicalEditor | null>(null);
  const tableEditor = useRef<LexicalEditor | null>(null);
  const writingActions = useRef<WritingActions | null>(null);
  const selectionTools = useRef<SelectionMenuController | null>(null);
  const mediaSelection = useRef<WritingBookmark | null>(null);
  const pendingMedia = useRef(false);
  const slashSelection = useRef<WritingBookmark | null>(null);
  const toolbarSelection = useRef<{
    editor: LexicalEditor;
    trigger: HTMLButtonElement;
    selection: BaseSelection;
    range?: Range;
  } | null>(null);
  const commandsAction = useRef(openCommands);
  commandsAction.current = openCommands;
  const activeLine = useRef<HTMLElement | null>(null);
  const [media, setMedia] = useState<"image" | "video">("image");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [uploadCaret, setUploadCaret] = useState<{ editor: LexicalEditor; key: string } | null>(null);
  useEffect(() => {
    if (!uploadCaret || busy || disabled) return;
    const lexical = uploadCaret.editor;
    const restore = () => {
      if (!lexical.isEditable()) return;
      lexical.update(() => {
        const line = $getNodeByKey(uploadCaret.key);
        if ($isElementNode(line) && line.isAttached()) {
          lexical.getRootElement()?.focus({ preventScroll: true });
          line.selectStart();
        }
      }, { discrete: true, tag: canvas && compactRef.current ? HISTORY_MERGE_TAG : [HISTORY_MERGE_TAG, SKIP_SCROLL_INTO_VIEW_TAG] });
      writingHighlight.clear();
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
    if (!canvas || !compactControls || !overlayHost) return;
    // The mobile menus are anchored to the toolbar by CSS. Move focus only
    // when the author opens a menu, never as a side effect of page geometry.
    if (mediaChooser) mediaMenu.current?.querySelector<HTMLButtonElement>(".writing-media-tabs button")?.focus({ preventScroll: true });
    else if (slashOpen && slashFromToolbar && focusInsertItem.current) {
      focusInsertItem.current = false;
      slashMenu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
      window.getSelection()?.removeAllRanges();
    }
  }, [canvas, !!compactControls, overlayHost, slashOpen, slashFromToolbar, mediaChooser]);

  useEffect(() => {
    if (!canvas || !compactControls || !(slashOpen || mediaChooser || popupActive)) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('.editor-mobile-toolbar, .writing-toolbar-controls, .writing-slash-menu, .writing-media-chooser, [data-writing-selection-menu]')) return;
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
    const target = mediaSelection.current;
    if (!target || !hasAttachedInsertTarget(target) || pendingMedia.current) return;
    const { editor: lexical, selection } = target;
    if (canvas && compactRef.current) writingHighlight.clear();
    const beforeUpload = lexical.getEditorState();
    let keys: string[] = [];
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
          if (index === items.length - 1) setUploadCaret({ editor: lexical, key: $finishMediaInsertion(loading[index]!, block) });
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
    const lexical = slashSelection.current?.editor;
    if (!lexical) return;
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
    writingActions.current?.block(lexical, kind);
    // Commit the empty block and its caret before accepting the next keystroke.
    // A deferred selection reset can overwrite characters typed meanwhile.
    if (lexical && emptyBlock && index >= 0) lexical.update(() => {
      const block = $getRoot().getChildAtIndex(index);
      if ($isElementNode(block)) block.selectStart();
    }, { discrete: true });
  }
  function insertTableAtCaret() {
    const target = slashSelection.current;
    if (!target || !hasAttachedInsertTarget(target)) return;
    const { editor: lexical, selection: saved } = target;
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
      } else $insertNodes([table]);
      if (line.isAttached() && $isParagraphNode(line) && line.getChildrenSize() === 0) line.remove();
      // The nested cell editor owns the next caret. Its mount subscription
      // receives this request without briefly focusing the paragraph below.
      $setSelection(null);
      table.select([0, 0]);
    }, { discrete: true, tag: SKIP_DOM_SELECTION_TAG });
  }
  const keepSlashAsText = useCallback((query = slashQuery, restoreCaret = true) => {
    const target = slashSelection.current;
    slashSelection.current = null;
    setSlashOpen(false);
    if (!target || !hasAttachedInsertTarget(target)) return;
    const { editor: lexical, selection: saved } = target;
    if (!$isRangeSelection(saved)) return;
    if (restoreCaret && canvas && compactRef.current) {
      lexical.getRootElement()?.focus({ preventScroll: true });
    }
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
      tag: !restoreCaret
        ? getNearestEditorFromDOMNode(document.activeElement!) !== lexical
          ? [SKIP_SCROLL_INTO_VIEW_TAG, SKIP_DOM_SELECTION_TAG] : SKIP_SCROLL_INTO_VIEW_TAG
        : canvas && compactRef.current ? undefined : SKIP_SCROLL_INTO_VIEW_TAG,
    });
  }, [slashQuery, canvas]);
  useEffect(() => {
    if (!slashOpen) return;
    function close(event: PointerEvent) {
      if (canvas && compactRef.current && event.target instanceof Element && event.target.closest('.writing-toolbar-controls, .editor-mobile-toolbar')) return;
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
    // Native focus and keyboard opening can scroll the page. Only an author's
    // scroll gesture dismisses mobile suggestions; desktop dismissal is unchanged.
    const compact = canvas && !!compactRef.current;
    if (compact) {
      viewport?.addEventListener("touchmove", close, { passive: true });
      viewport?.addEventListener("wheel", close, { passive: true });
    } else viewport?.addEventListener("scroll", close, { passive: true });
    return () => {
      viewport?.removeEventListener("touchmove", close);
      viewport?.removeEventListener("wheel", close);
      viewport?.removeEventListener("scroll", close);
    };
  }, [canvas, !!compactControls, slashOpen, slashFromToolbar, slashQuery, keepSlashAsText]);

  function rememberSelection(target?: WritingBookmark | null) {
    mediaSelection.current = null;
    if (target) {
      if (hasAttachedInsertTarget(target)) mediaSelection.current = { editor: target.editor, selection: target.selection.clone() };
      return;
    }
    const native = nativeWritingEditor(root.current);
    const lexical = native || lexicalEditor.current;
    lexical?.read(() => {
      let selection = $getSelection()?.clone() || null;
      const dom = window.getSelection();
      const surface = lexical.getRootElement();
      if (native === lexical && dom?.rangeCount && surface) {
        const range = dom.getRangeAt(0);
        if (surface.contains(range.startContainer) && surface.contains(range.endContainer)) {
          const current = $isRangeSelection(selection) ? selection : $createRangeSelection();
          if (canvas && compactRef.current) applyNativeWritingRange(current, dom);
          else current.applyDOMRange(range);
          selection = current;
        }
      }
      if ($isRangeSelection(selection)) normalizeWritingSelection(selection);
      mediaSelection.current = selection ? { editor: lexical, selection } : null;
    });
  }
  function insertAtMediaSelection(createBlock: () => LexicalNode) {
    const target = mediaSelection.current;
    if (!target || !hasAttachedInsertTarget(target)) return;
    const { editor: lexical, selection } = target;
    if (canvas && compactRef.current) {
      writingHighlight.clear();
      lexical.getRootElement()?.focus({ preventScroll: true });
    }
    lexical.update(() => {
      if (selection) $setSelection(selection.clone());
      // A block decorator splits the current line without inheriting or
      // flattening its heading/list style. Replace it before any DOM commit.
      const anchor = new WritingUploadNode();
      $insertNodes([anchor]);
      $finishMediaInsertion(anchor, createBlock());
      if (canvas && compactRef.current) lexical.focus();
    }, { discrete: true, tag: HISTORY_PUSH_TAG });
    closeMedia();
    if (!canvas || !compactRef.current) editor.current?.focus(undefined, { preventScroll: true });
  }
  function closeMedia(returnFocus = false) {
    if (returnFocus) writingHighlight.clear();
    const selection = mediaSelection.current;
    activeLine.current?.classList.remove("writing-media-line");
    activeLine.current?.removeAttribute("data-media-placeholder");
    setMediaChooser(null);
    setVideoUrl("");
    if (returnFocus && canvas && compactRef.current) restoreInsertTarget(selection);
  }
  function openMedia(type: "image" | "video", tab: "upload" | "link" = "upload") {
    rememberSelection(slashSelection.current);
    if (canvas && compactRef.current) {
      writingHighlight.capture();
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
    if (!canvas || !compactRef.current) {
      const rect = line?.getBoundingClientRect() || root.current?.getBoundingClientRect();
      if (rect) setMediaPosition({
        top: rect.bottom + 260 < window.innerHeight ? rect.bottom + 8 : Math.max(8, rect.top - 252),
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 340)),
      });
    }
  }
  const blockCommands = [
    ...writingBlockStyles.map(({ kind, ...command }) => ({ ...command, group: "Basic blocks", run: () => chooseBlock(kind) })),
    { name: "Table", group: "Basic blocks", icon: Table, terms: "table grid rows columns", run: insertTableAtCaret },
    { name: "Code block", group: "Basic blocks", icon: CodeXml, terms: "code block", run: () => { setSlashOpen(false); if (slashSelection.current) writingActions.current?.codeBlock(slashSelection.current.editor); } },
    { name: "Divider", group: "Basic blocks", icon: Minus, terms: "divider separator horizontal rule line", run: () => { setSlashOpen(false); if (slashSelection.current) writingActions.current?.divider(slashSelection.current.editor); } },
    { name: "Image", group: "Media", icon: ImageIcon, terms: "image photo", run: () => openMedia("image") },
    { name: "Upload video", group: "Media", icon: Video, terms: "video upload file", run: () => openMedia("video") },
    { name: "Embed video link", group: "Media", icon: Link, terms: "video embed link", run: () => openMedia("video", "link") },
  ];
  const formatCommands = [
    { name: "Bold", icon: Bold, format: "bold" as const },
    { name: "Italic", icon: Italic, format: "italic" as const },
    { name: "Strikethrough", icon: Strikethrough, format: "strikethrough" as const },
    { name: "Inline code", icon: Code, format: "code" as const },
  ].map(({ name, icon, format }) => ({ name, icon, group: "Format text", terms: name.toLowerCase(), run: () => {
    setSlashOpen(false);
    slashSelection.current?.editor.dispatchCommand(FORMAT_TEXT_COMMAND, format);
  } }));
  const mobileCommands = canvas && !!compactControls && slashFromToolbar;
  const tableCellTarget = !!slashSelection.current?.editor.getRootElement()?.closest("td, th");
  const slashCommands = mobileCommands
    ? [...formatCommands, { name: "Link", icon: Link, group: "Format text", terms: "link url", run: () => {
      setSlashOpen(false);
      if (slashSelection.current) writingActions.current?.link(slashSelection.current.editor);
    } }, ...(tableCellTarget ? [] : blockCommands)]
    : blockCommands;
  const commandsFor = (query: string) => slashCommands.filter(({ name, terms }) => `${name} ${terms}`.toLowerCase().includes(query.trim().toLowerCase()));
  const matchingCommands = commandsFor(slashQuery);
  function hasAttachedInsertTarget(target: WritingBookmark | null) {
    if (!target || !root.current?.contains(target.editor.getRootElement())) return false;
    const { editor: lexical, selection } = target;
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
  function restoreInsertTarget(target: WritingBookmark | null) {
    if (!target || !hasAttachedInsertTarget(target)) return false;
    const { editor: lexical, selection } = target;
    lexical.getRootElement()?.focus({ preventScroll: true });
    lexical.update(() => {
      $setSelection(selection.clone());
      lexical.focus();
    }, { discrete: true });
    return true;
  }
  const closeInsertMenu = useCallback(() => {
    writingHighlight.clear();
    if (slashFromToolbar) {
      setSlashOpen(false);
      if (canvas && compactRef.current) {
        restoreInsertTarget(slashSelection.current);
      } else insertTrigger.current?.focus({ preventScroll: true });
    } else {
      const lexical = slashSelection.current?.editor;
      keepSlashAsText();
      if (canvas && compactRef.current) {
        lexical?.update(() => lexical.focus(), { discrete: true });
      } else editor.current?.focus(undefined, { preventScroll: true });
    }
  }, [canvas, slashFromToolbar, keepSlashAsText, writingHighlight.clear]);
  useEffect(() => {
    if (!slashOpen && !(mediaChooser && canvas && compactRef.current)) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return;
      const target = event.target;
      const menu = mediaChooser ? mediaMenu.current : slashMenu.current;
      if (!(target instanceof Node)
        || (!root.current?.contains(target) && !menu?.contains(target))) return;
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
      return true;
    }
    const prepared = toolbarSelection.current;
    const savedToolbar = trigger && !fromKeyboard && prepared?.trigger === trigger
      && hasAttachedInsertTarget(prepared) ? prepared : null;
    const native = nativeWritingEditor(root.current);
    const lexical = savedToolbar?.editor || native || (trigger ? lexicalEditor.current : null);
    if (!lexical) return false;
    // Resolve the native owner now, before React's active-editor effect catches
    // up with a cell-to-prose handoff. Keep that owner with the saved selection.
    slashSelection.current = savedToolbar ? { editor: lexical, selection: savedToolbar.selection.clone() } : null;
    const domSelection = window.getSelection();
    if (!savedToolbar && native === lexical && domSelection?.rangeCount) {
      lexical.update(() => {
        const current = $getSelection();
        const selection = $isRangeSelection(current) ? current.clone() : $createRangeSelection();
        applyNativeWritingRange(selection, domSelection);
        $setSelection(selection);
        slashSelection.current = { editor: lexical, selection: selection.clone() };
      }, { discrete: true, tag: SKIP_SCROLL_INTO_VIEW_TAG });
    } else if (trigger && !savedToolbar) {
      lexical.read(() => {
        const selection = $getSelection();
        if (selection) slashSelection.current = { editor: lexical, selection: selection.clone() };
      });
    }
    if (!hasAttachedInsertTarget(slashSelection.current)) return false;
    if (canvas && compactRef.current) {
      writingHighlight.clear();
      writingHighlight.capture(savedToolbar?.range);
    }
    insertTrigger.current = trigger || null;
    focusInsertItem.current = fromKeyboard;
    setSlashFromToolbar(!!trigger);
    let savedLine: HTMLElement | null = null;
    lexical.getEditorState().read(() => {
      const selection = slashSelection.current?.selection;
      if ($isRangeSelection(selection)) {
        const anchor = lexical.getElementByKey(selection.anchor.getNode().getKey());
        savedLine = anchor?.closest("p, h1, h2, h3, h4, h5, h6, li, blockquote") as HTMLElement | null;
      }
    });
    const selection = window.getSelection();
    const anchorNode = selection?.anchorNode;
    const anchor = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement;
    const rootChild = anchorNode?.childNodes[selection?.anchorOffset ?? 0] || anchorNode?.childNodes[Math.max(0, (selection?.anchorOffset ?? 0) - 1)];
    const selectedLine = rootChild instanceof Element ? rootChild : rootChild?.parentElement;
    const line = anchor?.closest("p, h1, h2, h3, h4, h5, h6, li, blockquote") || selectedLine?.closest("p, h1, h2, h3, h4, h5, h6, li, blockquote") || root.current?.querySelector(".writing-content p:last-child");
    activeLine.current = savedLine || (line instanceof HTMLElement ? line : null);
    if (!canvas || !compactRef.current) {
      const rangeRect = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : null;
      const rect = trigger?.getBoundingClientRect() || (rangeRect?.height ? rangeRect : line?.getBoundingClientRect());
      if (!rect) return false;
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
    }
    slashNavigation.current = "keyboard";
    slashPointer.current = null;
    setSlashQuery(""); setSlashIndex(0); setSlashOpen(true);
    return true;
  }
  function openCommands(trigger: HTMLButtonElement, fromKeyboard: boolean) {
    if (canvas && compactRef.current && slashMenu.current && insertTrigger.current === trigger) {
      closeInsertMenu();
      return;
    }
    if (canvas && compactRef.current) {
      // A normal button click may blur the editor before it fires. The target
      // belongs to this gesture, captured before the browser moves focus.
      const savedTarget = !fromKeyboard && hasPreparedSelection(trigger);
      if (compactRef.current.panelsOpen || !savedTarget && !hasWritingTarget(nativeWritingEditor(root.current) || lexicalEditor.current, true)) return;
    }
    if (!(canvas && compactRef.current) && selectionTools.current?.show(fromKeyboard, trigger)) {
      setSlashOpen(false);
      return;
    }
    const opened = openSlash(trigger, fromKeyboard);
    toolbarSelection.current = null;
    if (opened && canvas && compactRef.current) {
      focusInsertItem.current = true;
      blurWritingInput();
      window.getSelection()?.removeAllRanges();
    }
  }
  function hasPreparedSelection(trigger: HTMLButtonElement) {
    const prepared = toolbarSelection.current;
    return !!prepared && prepared.trigger === trigger && hasAttachedInsertTarget(prepared);
  }
  function runInsertCommand(run: () => void, mediaCommand = false) {
    const target = slashSelection.current;
    if (!target || !hasAttachedInsertTarget(target)) {
      writingHighlight.clear();
      slashSelection.current = null;
      focusInsertItem.current = false;
      setSlashOpen(false);
      return;
    }
    const { editor: lexical, selection } = target;
    if (canvas && compactRef.current) {
      if (mediaCommand || run === insertTableAtCaret) {
        // A chooser or nested-cell handoff restores only the insertion target.
        // Its destination owns focus; the outer prose must not take it first.
        lexical.update(() => { if (selection) $setSelection(selection.clone()); }, {
          discrete: true, tag: [SKIP_DOM_SELECTION_TAG, SKIP_SCROLL_INTO_VIEW_TAG],
        });
        run();
      } else {
        if (!restoreInsertTarget(target)) return;
        writingHighlight.clear();
        lexical.update(run, { discrete: true });
      }
      return;
    }
    if (run === insertTableAtCaret) { run(); return; }
    lexical.update(() => {
      $setSelection(selection.clone());
    }, { discrete: true, tag: [SKIP_DOM_SELECTION_TAG, SKIP_SCROLL_INTO_VIEW_TAG] });
    if (slashFromToolbar) lexical.focus();
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
          onInsert={(trigger, fromKeyboard) => commandsAction.current(trigger, fromKeyboard)}
          hasPreparedSelection={hasPreparedSelection}
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
    <WritingCommandsOpenContext.Provider value={slashOpen && slashFromToolbar}>
    <WritingInteractionContext.Provider value={reportInteraction}>
    <div ref={root} data-editor-interacting={popupActive || slashOpen || !!mediaChooser || undefined} className="writing-editor writing-surface rounded-lg border border-border bg-background" onPointerDownCapture={(event) => {
      toolbarSelection.current = null;
      const trigger = event.target instanceof Element ? event.target.closest<HTMLButtonElement>(".writing-toolbar-controls button") : null;
      const native = nativeWritingEditor(root.current);
      const lexical = native || lexicalEditor.current;
      if (trigger && lexical) {
        lexical.read(() => {
          const current = $getSelection();
          const range = window.getSelection();
          if (canvas && compactRef.current) {
            if (!hasWritingTarget(lexical, true) || !range?.rangeCount) return;
            const selection = $isRangeSelection(current) ? current.clone() : $createRangeSelection();
            applyNativeWritingRange(selection, range);
            normalizeWritingSelection(selection);
            toolbarSelection.current = { editor: lexical, trigger, selection: selection.clone(), range: range.getRangeAt(0).cloneRange() };
          } else if (native && range?.rangeCount) {
            const selection = $isRangeSelection(current) ? current.clone() : $createRangeSelection();
            applyNativeWritingRange(selection, range);
            toolbarSelection.current = { editor: lexical, trigger, selection };
          } else if (current) toolbarSelection.current = { editor: lexical, trigger, selection: current.clone() };
        });
      }
      if (trigger && slashOpen && slashFromToolbar && trigger === insertTrigger.current) return;
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
        if (event.key === "Backspace") {
          event.preventDefault();
          slashNavigation.current = "keyboard";
          if (slashQuery) setSlashQuery((query) => query.slice(0, -1));
          else { setSlashOpen(false); writingHighlight.clear(); }
          setSlashIndex(0);
          return;
        }
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          event.preventDefault();
          slashNavigation.current = "keyboard";
          const nextQuery = slashQuery + event.key;
          if (commandsFor(nextQuery).length) { setSlashQuery(nextQuery); setSlashIndex(0); }
          else { keepSlashAsText(nextQuery); writingHighlight.clear(); }
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
            // Failed capture leaves the slash to native input instead of
            // swallowing text against a stale or unrelated editor selection.
            if (openSlash()) event.preventDefault();
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
      {slashOpen && createPortal(<div ref={slashMenu} role="menu" aria-label={slashFromToolbar ? "Insert content" : "Insert content. Type to search, use arrow keys to choose, then press Enter."} className="writing-slash-menu" data-touch-motion={canvas && !!compactControls && slashFromToolbar || undefined} data-mobile-palette={canvas && compactControls && overlayHost ? "true" : undefined} onKeyDown={(event) => {
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
      </div>, canvas && compactControls && overlayHost ? overlayHost : document.body)}
      {mediaChooser && createPortal(<div ref={mediaMenu} className="writing-media-chooser" data-touch-motion={canvas && !!compactControls || undefined} data-mobile-palette={canvas && compactControls && overlayHost ? "true" : undefined} role="dialog" aria-label={`Insert ${mediaChooser}`} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); closeMedia(true); if (!canvas || !compactRef.current) editor.current?.focus(undefined, { preventScroll: true }); } }}>
        <div className="writing-media-tabs"><Button type="button" variant="ghost" aria-pressed={mediaTab === "upload"} onClick={() => setMediaTab("upload")}>Upload</Button><Button type="button" variant="ghost" aria-pressed={mediaTab === "link"} onClick={() => setMediaTab("link")}>Link</Button></div>
        {mediaTab === "upload" ? <div className="writing-media-fields">{mediaChooser === "image" && <Input aria-label="Alt text (optional)" value={imageAlt} onChange={(event) => setImageAlt(event.target.value)} placeholder="Alt text (optional)" />}<Button type="button" disabled={!onUpload} onClick={() => file.current?.click()}>Choose {mediaChooser}</Button></div> : <div className="writing-media-fields"><Input aria-label={mediaChooser === "video" ? "Video URL" : "Image URL"} type="url" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder={mediaChooser === "video" ? "YouTube, Vimeo or Loom URL" : "https://example.com/image.jpg"} /><Button type="button" onClick={mediaChooser === "video" ? insertVideo : () => { if (!/^https:\/\//i.test(videoUrl)) { setError("Use an HTTPS image URL."); return; } insertAtMediaSelection(() => $createParagraphNode().append($createImageNode({ src: videoUrl, altText: imageAlt.trim() || "Image" }))); }}>Insert {mediaChooser}</Button></div>}
        <Button type="button" variant="ghost" size="sm" onClick={() => closeMedia(true)}>Cancel</Button>
      </div>, canvas && compactControls && overlayHost ? overlayHost : document.body)}
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
    </WritingCommandsOpenContext.Provider>
  );
}
