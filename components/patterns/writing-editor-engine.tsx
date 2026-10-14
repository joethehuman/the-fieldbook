"use client";

import {
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { BlockNoteView } from "@blocknote/shadcn";
import {
  useCreateBlockNote,
  SuggestionMenuController,
  FormattingToolbarController,
  FormattingToolbar,
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
  type SideMenuProps,
} from "@blocknote/react";
import {
  filterSuggestionItems,
  insertOrUpdateBlockForSlashMenu,
} from "@blocknote/core";
import {
  SuggestionMenu,
  getDefaultSlashMenuItems,
} from "@blocknote/core/extensions";
import { syntaxHighlighter } from "@blocknote/code-block";
import {
  Plus,
  Undo,
  Redo,
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
import { Button } from "../ui/button";
import { Alert } from "../ui/alert";
import { createWritingSchema } from "./blocknote-schema";
import { writingShadCNComponents } from "./blocknote-ui";
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
import { EditorWritingActionsContext } from "./editor-frame";
import { useScrollFade } from "./use-scroll-fade";
import type { WritingEditorProps } from "./writing-editor";

import "@blocknote/shadcn/style.css";

type EditorProps = WritingEditorProps & {
  initialDocument: BlockDocument;
  onUnsupported: (message: string) => void;
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
export default function WritingEditorEngine({
  initialDocument,
  value,
  bodyDocument,
  onChange,
  disabled,
  onUpload,
  viewControls,
  label = "Content",
  canvas,
}: EditorProps) {
  const title = useContext(WritingTitleContext);
  const introduction = useContext(WritingIntroductionContext);
  const actionsHost = useContext(EditorWritingActionsContext);
  const latest = useRef({ onChange, onUpload });
  latest.current = { onChange, onUpload };
  const [error, setError] = useState("");
  const applying = useRef(false);
  const interacted = useRef(false);
  const { schema: writingSchema, registerLanguages } = useMemo(
    () => createWritingSchema(initialDocument),
    [],
  );
  const editor = useCreateBlockNote({
    schema: writingSchema,
    initialContent:
      initialDocument.blocks as unknown as (typeof writingSchema.PartialBlock)[],
    extensions: [syntaxHighlighter],
    domAttributes: {
      editor: {
        class: "markdown writing-content",
        role: "textbox",
        "aria-label": label,
        "aria-multiline": "true",
      },
    },
    tables: { headers: true },
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
  const lastSaved = useRef(JSON.stringify(initialDocument.blocks));
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
  function command(action: () => void) {
    interacted.current = true;
    editor.focus();
    action();
    changed();
  }
  const controls = (
    <div className="writing-toolbar-controls">
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() =>
          command(() =>
            editor.getExtension(SuggestionMenu)?.openSuggestionMenu("/"),
          )
        }
        aria-label="Commands"
      >
        <Plus aria-hidden="true" />
        <span className="writing-command-label">Insert</span>
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={disabled}
        aria-label="Undo"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() =>
          command(() => {
            editor.undo();
          })
        }
      >
        <Undo aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        disabled={disabled}
        aria-label="Redo"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() =>
          command(() => {
            editor.redo();
          })
        }
      >
        <Redo aria-hidden="true" />
      </Button>
    </div>
  );
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
      {canvas && actionsHost ? (
        createPortal(controls, actionsHost)
      ) : (
        <div className="writing-view-header">
          {controls}
          {viewControls}
        </div>
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
              shadCNComponents={writingShadCNComponents}
              theme="light"
              editable={!disabled}
              onChange={changed}
              slashMenu={false}
              formattingToolbar={false}
              sideMenu={false}
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
                      onItemClick: () =>
                        insertOrUpdateBlockForSlashMenu(editor, {
                          type: "videoEmbed",
                        }),
                    },
                  ].sort(
                    (a, b) =>
                      commandOrder.indexOf(a.key) - commandOrder.indexOf(b.key),
                  );
                  return filterSuggestionItems(sorted, query);
                }}
              />
              <FormattingToolbarController
                formattingToolbar={WritingFormattingToolbar}
              />
              <SideMenuController sideMenu={WritingSideMenu} />
            </BlockNoteView>
          </div>
        </WritingTitleEnterContext.Provider>
      </div>
    </div>
  );
}
