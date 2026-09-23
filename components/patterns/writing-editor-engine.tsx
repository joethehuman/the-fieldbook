"use client";

import { writingVideoPlugin } from "./writing-video";
import { equivalentMarkdown } from "@/lib/markdown-compatibility";
import { useEffect, useRef, useState } from "react";
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
  insertTable$,
  insertCodeBlock$,
  useCodeBlockEditorContext,
  type CodeBlockEditorProps,
} from "@mdxeditor/editor";
import { useCellValue, usePublisher } from "@mdxeditor/gurx";
import {
  UNDO_COMMAND,
  REDO_COMMAND,
  CAN_UNDO_COMMAND,
  CAN_REDO_COMMAND,
  COMMAND_PRIORITY_EDITOR,
} from "lexical";
import {
  Bold,
  Italic,
  Code,
  List,
  ListOrdered,
  Link,
  Table,
  ImagePlus,
  Video,
  Undo,
  Redo,
  FileCode,
} from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip } from "../ui/tooltip";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { Alert } from "../ui/alert";
import type { WritingEditorProps } from "./writing-editor";
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
  upload,
  disabled,
  canUpload,
}: {
  canUpload: boolean;
  upload: (type: "image" | "video") => void;
  disabled: boolean;
}) {
  const editor = useCellValue(activeEditor$);
  const format = useCellValue(currentFormat$);
  const list = useCellValue(currentListType$);
  const applyFormat = usePublisher(applyFormat$);
  const applyList = usePublisher(applyListType$);
  const link = usePublisher(openLinkEditDialog$);
  const table = usePublisher(insertTable$);
  const code = usePublisher(insertCodeBlock$);
  const [canUndo, setCanUndo] = useState(false),
    [canRedo, setCanRedo] = useState(false);
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
      label: "Inline code",
      icon: Code,
      run: () => applyFormat("code"),
      pressed: !!(format & 16),
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
    { label: "Table", icon: Table, run: () => table({ rows: 3, columns: 2 }) },
    {
      label: "Code block",
      icon: FileCode,
      run: () => code({ code: "", language: "" }),
    },
    {
      label: "Upload image",
      icon: ImagePlus,
      run: () => upload("image"),
      unavailable: !canUpload,
    },
    {
      label: "Upload video",
      icon: Video,
      run: () => upload("video"),
      unavailable: !canUpload,
    },
  ];
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-1"
      role="group"
      aria-label="Formatting"
    >
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
            onMouseDown={(event) => event.preventDefault()}
            onClick={run}
          >
            <Icon />
          </Button>
        </Tooltip>
      ))}
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
  const [media, setMedia] = useState<"image" | "video">("image");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
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
  return (
    <div className="writing-editor rounded-lg border border-border bg-background">
      {error && (
        <Alert variant="destructive" role="alert">
          {error}
        </Alert>
      )}
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
            const alt = selected.name.replace(/[\[\]\\\n]/g, " ");
            editor.current?.insertMarkdown(
              `\n\n${selected.type.startsWith("video/") ? "" : "!"}[${alt}](${url})\n\n`,
            );
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
        placeholder="Start writing…"
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
        plugins={[
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
                canUpload={!!onUpload}
                disabled={disabled || busy}
                upload={(type) => {
                  if (!onUpload) {
                    setError("Uploads are unavailable in this view.");
                    return;
                  }
                  setMedia(type);
                  requestAnimationFrame(() => file.current?.click());
                }}
              />
            ),
          }),
        ]}
      />
    </div>
  );
}
