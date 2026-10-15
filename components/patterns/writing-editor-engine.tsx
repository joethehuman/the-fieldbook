"use client";

import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { BlockNoteView } from "@blocknote/shadcn";
import {
  useCreateBlockNote,
  SuggestionMenuController,
  FormattingToolbarController,
  FormattingToolbar,
  getFormattingToolbarItems,
  BlockTypeSelect,
  BasicTextStyleButton,
  CreateLinkButton,
  ColorStyleButton,
  FileCaptionButton,
  FileReplaceButton,
  NestBlockButton,
  UnnestBlockButton,
  TextAlignButton,
  SideMenuController,
  SideMenu,
  DragHandleMenu,
  RemoveBlockItem,
  BlockColorsItem,
  TableRowHeaderItem,
  TableColumnHeaderItem,
  TableHandlesController,
  FilePanelController,
  type SideMenuProps,
  type FloatingUIOptions,
  useBlockNoteEditor,
  useComponentsContext,
} from "@blocknote/react";
import {
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
} from "@blocknote/core";
import {
  FilePanelExtension,
  getDefaultSlashMenuItems,
  SideMenuExtension,
  SuggestionMenu,
} from "@blocknote/core/extensions";
import { syntaxHighlighter } from "@blocknote/code-block";
import {
  Plus,
  Link as LinkIcon,
  Type,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  List,
  ListOrdered,
  ListTodo,
  ChevronRight,
  Quote,
  Table,
  Code2,
  Minus,
  Image,
  Video,
  type LucideIcon,
} from "lucide-react";
import { Alert } from "../ui/alert";
import { createWritingSchema, writingDictionary } from "./blocknote-schema";
import { WritingTableHandle } from "./blocknote-table-handle";
import { WritingFilePanel } from "./blocknote-file-panel";
import { WritingCodeHeaders } from "./blocknote-code-header";
import {
  blockDocumentSchema,
  exportBlockMarkdown,
  importMarkdownDocument,
  type BlockDocument,
} from "@/lib/block-document";
import {
  WritingTitleContext,
  WritingIntroductionContext,
  WritingTitleEnterContext,
} from "./writing-title";
import { useEditorCardsLayout } from "./use-editor-cards-layout";
import { useScrollFade } from "./use-scroll-fade";
import type { WritingEditorProps } from "./writing-editor";

type EditorProps = WritingEditorProps & {
  initialDocument: BlockDocument;
  viewControls?: ReactNode;
};
const commandOrder = [
  "heading",
  "heading_2",
  "heading_3",
  "heading_4",
  "paragraph",
  "quote",
  "bullet_list",
  "numbered_list",
  "check_list",
  "toggle_list",
  "divider",
  "table",
  "code_block",
  "image",
  "video",
  "videoEmbed",
  "toggle_heading",
  "toggle_heading_2",
  "toggle_heading_3",
];
const commandGroups: Record<string, string> = {
  heading: "Headings",
  heading_2: "Headings",
  heading_3: "Headings",
  heading_4: "Headings",
  paragraph: "Basic blocks",
  quote: "Basic blocks",
  bullet_list: "Basic blocks",
  numbered_list: "Basic blocks",
  check_list: "Basic blocks",
  toggle_list: "Basic blocks",
  divider: "Basic blocks",
  table: "Advanced",
  code_block: "Advanced",
  image: "Media",
  video: "Media",
  videoEmbed: "Media",
  toggle_heading: "Collapsible headings",
  toggle_heading_2: "Collapsible headings",
  toggle_heading_3: "Collapsible headings",
};
const commandIcons: Record<string, LucideIcon> = {
  paragraph: Type,
  heading: Heading1,
  heading_2: Heading2,
  heading_3: Heading3,
  heading_4: Heading4,
  bullet_list: List,
  numbered_list: ListOrdered,
  check_list: ListTodo,
  toggle_list: ChevronRight,
  toggle_heading: Heading1,
  toggle_heading_2: Heading2,
  toggle_heading_3: Heading3,
  quote: Quote,
  table: Table,
  code_block: Code2,
  divider: Minus,
  image: Image,
  video: Video,
};
const renamed: Record<string, string> = {
  code_block: "Code block",
  paragraph: "Normal Text",
  quote: "Callout",
  numbered_list: "Numbered list",
  bullet_list: "Bulleted list",
  check_list: "Checklist",
  toggle_list: "Collapsible list",
  toggle_heading: "Collapsible heading 1",
  toggle_heading_2: "Collapsible heading 2",
  toggle_heading_3: "Collapsible heading 3",
  video: "Upload video",
};
function WritingDragHandleMenu() {
  return (
    <DragHandleMenu>
      <RemoveBlockItem>Delete</RemoveBlockItem>
      <BlockColorsItem>Colors</BlockColorsItem>
      <TableRowHeaderItem>Header row</TableRowHeaderItem>
      <TableColumnHeaderItem>Header column</TableColumnHeaderItem>
    </DragHandleMenu>
  );
}
function WritingSideMenu(props: SideMenuProps) {
  return <SideMenu {...props} dragHandleMenu={WritingDragHandleMenu} />;
}
function WritingSideMenuController() {
  const editor = useBlockNoteEditor();
  const floatingUIOptions = useMemo<FloatingUIOptions>(
    () => ({
      // Keep native block controls beneath the pinned title (12) and Back
      // navigation (13), so hidden block tops cannot paint over those surfaces.
      elementProps: { style: { zIndex: 11 } },
      useFloatingOptions: {
        middleware: [
          {
            name: "fieldbookTypography",
            fn: ({ elements, rects, y }) => {
              const block =
                editor.getExtension(SideMenuExtension)?.store.state?.block;
              const reference =
                elements.reference instanceof HTMLElement
                  ? elements.reference
                  : "contextElement" in elements.reference
                    ? elements.reference.contextElement
                    : undefined;
              if (
                block?.type === "heading" &&
                reference instanceof HTMLElement
              ) {
                const inline =
                  reference.querySelector<HTMLElement>(".bn-inline-content");
                if (inline) {
                  // The public floating options let the native controller follow
                  // our heading typography without changing block/toggle spacing.
                  const lineHeight = parseFloat(
                    getComputedStyle(inline).lineHeight,
                  );
                  return {
                    y:
                      rects.reference.y +
                      inline.getBoundingClientRect().top -
                      reference.getBoundingClientRect().top +
                      lineHeight / 2 -
                      rects.floating.height / 2,
                  };
                }
              }
              // Preserve BlockNote 0.56's offsets for non-heading blocks. Its
              // exposed middleware option replaces (rather than appends to) them.
              const emptyFile =
                block &&
                editor.schema.blockSpecs[
                  block.type as keyof typeof editor.schema.blockSpecs
                ]?.implementation.meta?.fileBlockAccept &&
                !block.props.url;
              const nativeOffset = emptyFile
                ? 12
                : block?.type === "file"
                  ? 4
                  : block?.type === "audio" || block?.type === "table"
                    ? 15
                    : 0;
              return { y: y + nativeOffset };
            },
          },
        ],
      },
    }),
    [editor],
  );
  return (
    <SideMenuController
      sideMenu={WritingSideMenu}
      floatingUIOptions={floatingUIOptions}
    />
  );
}
function WritingFormattingToolbar() {
  return (
    <FormattingToolbar>
      <BlockTypeSelect />
      <BasicTextStyleButton basicTextStyle="bold" />
      <BasicTextStyleButton basicTextStyle="italic" />
      <BasicTextStyleButton basicTextStyle="underline" />
      <BasicTextStyleButton basicTextStyle="strike" />
      <BasicTextStyleButton basicTextStyle="code" />
      <CreateLinkButton />
      <ColorStyleButton />
      <TextAlignButton textAlignment="left" />
      <TextAlignButton textAlignment="center" />
      <TextAlignButton textAlignment="right" />
      <NestBlockButton />
      <UnnestBlockButton />
      <FileCaptionButton />
      <FileReplaceButton />
    </FormattingToolbar>
  );
}

/** Native toolbar and command menu, without hover controls on the canvas. */
function MobileWritingFormattingToolbar() {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext()!;
  return (
    <FormattingToolbar>
      <Components.FormattingToolbar.Button
        mainTooltip="Insert block"
        label="Insert block"
        icon={<Plus size={18} />}
        onClick={() => editor.getExtension(SuggestionMenu)?.openSuggestionMenu("/", { ignoreQueryLength: true })}
      />
      {getFormattingToolbarItems()}
    </FormattingToolbar>
  );
}
export default function WritingEditorEngine({
  initialDocument,
  value,
  bodyDocument,
  onChange,
  disabled,
  onUpload,
  viewControls,
  label = "Content",
}: EditorProps) {
  const title = useContext(WritingTitleContext);
  const introduction = useContext(WritingIntroductionContext);
  const mobile = useEditorCardsLayout();
  const latest = useRef({ onChange, onUpload });
  latest.current = { onChange, onUpload };
  const [error, setError] = useState("");
  const applying = useRef(false);
  const interacted = useRef(false);
  const {
    schema: writingSchema,
    registerLanguages,
    languages,
  } = useMemo(() => createWritingSchema(initialDocument), []);
  const editor = useCreateBlockNote({
    dictionary: writingDictionary,
    schema: writingSchema,
    initialContent:
      initialDocument.blocks as unknown as (typeof writingSchema.PartialBlock)[],
    extensions: [syntaxHighlighter],
    domAttributes: {
      editor: {
        class: "writing-content",
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
      },
    },
    tables: { headers: true },
    pasteHandler: ({ event, editor, defaultPasteHandler }) => {
      // A file-only clipboard is not code. Keep native text/VS Code paste,
      // but do not insert a media block from an image copied into code.
      const inCode = editor.getTextCursorPosition().block.type === "codeBlock";
      if (
        inCode &&
        event.clipboardData?.files.length &&
        !event.clipboardData.getData("text/plain")
      )
        return true;
      if (
        !latest.current.onUpload &&
        event.clipboardData?.files.length &&
        !inCode
      ) {
        setError("Uploads are unavailable in this view.");
        return true;
      }
      return defaultPasteHandler();
    },
    uploadFile: onUpload
      ? async (file) => {
          if (!latest.current.onUpload)
            throw new Error("Uploads are unavailable.");
          try {
            return await latest.current.onUpload(file);
          } catch (reason) {
            setError((reason as Error).message || "Upload failed. Try again.");
            throw reason;
          }
        }
      : undefined,
  });
  const lastValue = useRef(value);
  const lastDoc = useRef(JSON.stringify(bodyDocument));
  const lastSaved = useRef(JSON.stringify(editor.document));
  const pendingEchoes = useRef<{ value: string; document: string }[]>([]);
  const fade = useScrollFade<HTMLDivElement>();
  useEffect(() => {
    const document = JSON.stringify(bodyDocument);
    // React may acknowledge one keystroke after the next transaction arrives.
    // Consume our own pending edits without replacing live selection or marks.
    const echo = pendingEchoes.current.findIndex(
      (entry) =>
        entry.value === value &&
        (bodyDocument === undefined || entry.document === document),
    );
    if (echo >= 0) {
      pendingEchoes.current.splice(0, echo + 1);
      return;
    }
    if (
      value === lastValue.current &&
      (bodyDocument === undefined || document === lastDoc.current)
    )
      return;
    try {
      pendingEchoes.current = [];
      const doc = bodyDocument
        ? blockDocumentSchema.parse(bodyDocument)
        : importMarkdownDocument(value);
      registerLanguages(doc);
      applying.current = true;
      editor.replaceBlocks(
        editor.document,
        doc.blocks as unknown as (typeof writingSchema.PartialBlock)[],
      );
      lastValue.current = value;
      lastDoc.current = JSON.stringify(bodyDocument);
      lastSaved.current = JSON.stringify(editor.document);
    } catch {
      setError(
        "This external update could not be opened. Your current content is retained; reload to recover the saved source.",
      );
    } finally {
      applying.current = false;
    }
  }, [value, bodyDocument, editor, writingSchema, registerLanguages]);
  function changed() {
    if (applying.current || !interacted.current) return;
    try {
      const doc = blockDocumentSchema.parse({
        format: "fieldbook-blocks",
        version: 1,
        blocks: editor.document,
      });
      const serialized = JSON.stringify(doc.blocks);
      if (serialized === lastSaved.current) return;
      const markdown = exportBlockMarkdown(doc);
      lastSaved.current = serialized;
      lastValue.current = markdown;
      lastDoc.current = JSON.stringify(doc);
      pendingEchoes.current.push({
        value: markdown,
        document: lastDoc.current,
      });
      if (pendingEchoes.current.length > 32) pendingEchoes.current.shift();
      latest.current.onChange(markdown, doc);
    } catch (reason) {
      setError(`Couldn’t save this edit: ${(reason as Error).message}`);
    }
  }
  const enterBody = () => {
    const first = editor.document[0];
    const target = Array.isArray(first.content)
      ? first.id
      : editor.insertBlocks([{ type: "paragraph" }], first, "before")[0].id;
    editor.setTextCursorPosition(target, "start");
    editor.focus();
  };
  return (
    <div
      className="writing-surface writing-editor"
      data-editor-engine="blocknote"
      onPointerDownCapture={() => {
        interacted.current = true;
      }}
      onKeyDownCapture={() => {
        interacted.current = true;
      }}
      onBeforeInputCapture={() => {
        interacted.current = true;
      }}
      onPasteCapture={() => {
        interacted.current = true;
      }}
      onCompositionStartCapture={() => {
        interacted.current = true;
      }}
    >
      {error && (
        <Alert
          variant="destructive"
          role="alert"
          onDismiss={() => setError("")}
        >
          {error}
        </Alert>
      )}
      {viewControls && (
        <div className="writing-view-header">{viewControls}</div>
      )}
      <div
        ref={fade.ref}
        className="writing-viewport writing-scroll-area scroll-fade"
        onScroll={fade.measure}
        data-scroll-fade-before={fade.edges.before}
        data-scroll-fade-after={false}
      >
        <WritingTitleEnterContext.Provider value={enterBody}>
          <div className="writing-document">
            {introduction && (
              <div className="writing-course-heading">{introduction}</div>
            )}
            {title && <div className="writing-document-heading">{title}</div>}
            <BlockNoteView
              editor={editor}
              theme="light"
              editable={!disabled}
              onChange={changed}
              slashMenu={false}
              formattingToolbar={false}
              sideMenu={false}
              tableHandles={false}
              filePanel={false}
              className="fieldbook-blocknote"
            >
              <SuggestionMenuController
                triggerCharacter="/"
                getItems={async (query) => {
                  const items = getDefaultSlashMenuItems(editor)
                    .filter((item) => commandOrder.includes(item.key))
                    .map((item) => {
                      const Icon = commandIcons[item.key] || Plus;
                      return {
                        ...item,
                        icon: <Icon size={18} />,
                        group: commandGroups[item.key],
                        title: renamed[item.key] || item.title,
                      };
                    });
                  const sorted = [
                    ...items,
                    {
                      key: "videoEmbed",
                      title: "Embed video link",
                      subtext: "YouTube, Vimeo or Loom video",
                      group: "Media",
                      icon: <LinkIcon size={18} />,
                      aliases: ["youtube", "vimeo", "loom"],
                      onItemClick: () => {
                        const block = insertOrUpdateBlockForSlashMenu(editor, {
                          type: "videoEmbed",
                        });
                        editor
                          .getExtension(FilePanelExtension)
                          ?.showMenu(block.id);
                      },
                    },
                  ].sort(
                    (a, b) =>
                      commandOrder.indexOf(a.key) - commandOrder.indexOf(b.key),
                  );
                  return filterSuggestionItems(sorted, query);
                }}
              />
              <FormattingToolbarController
                formattingToolbar={
                  mobile ? MobileWritingFormattingToolbar : WritingFormattingToolbar
                }
              />
              {!mobile && <WritingSideMenuController />}
              <TableHandlesController tableHandle={WritingTableHandle} />
              <FilePanelController filePanel={WritingFilePanel} />
              <WritingCodeHeaders languages={languages} disabled={disabled} />
            </BlockNoteView>
          </div>
        </WritingTitleEnterContext.Provider>
      </div>
    </div>
  );
}
