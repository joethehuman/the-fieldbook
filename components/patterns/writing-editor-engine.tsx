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
  upload,
  embedVideo,
  disabled,
  canUpload,
}: {
  canUpload: boolean;
  upload: (type: "image" | "video") => void;
  embedVideo: () => void;
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
    { label: "Embed video", icon: Video, run: embedVideo },
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
  const slashMenu = useRef<HTMLDivElement>(null);
  const [media, setMedia] = useState<"image" | "video">("image");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [slashOpen, setSlashOpen] = useState(false);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoLinkOpen, setVideoLinkOpen] = useState(false);
  const [imageAltOpen, setImageAltOpen] = useState(false);
  const [imageAlt, setImageAlt] = useState("");
  useEffect(() => {
    if (slashOpen) requestAnimationFrame(() => slashMenu.current?.querySelector<HTMLButtonElement>("button")?.focus());
  }, [slashOpen]);
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
  function insert(markdown: string) {
    editor.current?.insertMarkdown(markdown);
    setSlashOpen(false);
  }
  function insertVideo() {
    if (!videoSource(videoUrl)) {
      setError("Use a supported HTTPS YouTube, Vimeo, Loom, MP4, or WebM URL.");
      return;
    }
    insert(`\n\n[Video](${videoUrl})\n\n`);
    setVideoUrl("");
    setVideoLinkOpen(false);
  }
  return (
    <div className="writing-editor rounded-lg border border-border bg-background" onKeyDownCapture={(event) => {
      if (event.key === "/" && !disabled && !busy && event.target instanceof HTMLElement && event.target.closest("[contenteditable=true]")) {
        const selection = window.getSelection();
        const before = selection?.anchorNode?.textContent?.slice(0, selection.anchorOffset) || "";
        if (!before.trim()) { event.preventDefault(); setSlashOpen(true); }
      }
      if (event.key === "Escape") { setSlashOpen(false); setVideoLinkOpen(false); setImageAltOpen(false); }
    }}>
      {error && (
        <Alert variant="destructive" role="alert">
          {error}
        </Alert>
      )}
      {slashOpen && <div ref={slashMenu} role="menu" aria-label="Insert content" className="writing-slash-menu" onKeyDown={(event) => {
        if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
        event.preventDefault();
        const items = Array.from(slashMenu.current?.querySelectorAll<HTMLButtonElement>("button") || []);
        const next = (items.indexOf(document.activeElement as HTMLButtonElement) + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
        items[next]?.focus();
      }}>
        {[
          ["Heading", "\n\n## "], ["Bulleted list", "\n\n- "],
          ["Numbered list", "\n\n1. "], ["Callout", "\n\n> "],
        ].map(([name, markdown]) => <Button key={name} type="button" variant="ghost" role="menuitem" onClick={() => insert(markdown)}>{name}</Button>)}
        <Button type="button" variant="ghost" role="menuitem" onClick={() => { setMedia("image"); setSlashOpen(false); setImageAltOpen(true); }}>Image</Button>
        <Button type="button" variant="ghost" role="menuitem" onClick={() => { setMedia("video"); setSlashOpen(false); requestAnimationFrame(() => file.current?.click()); }}>Upload video</Button>
        <Button type="button" variant="ghost" role="menuitem" onClick={() => { setSlashOpen(false); setVideoLinkOpen(true); }}>Embed video link</Button>
      </div>}
      {videoLinkOpen && <div className="writing-video-link"><Input aria-label="Video URL" type="url" value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="YouTube, Vimeo or Loom URL" /><Button type="button" onClick={insertVideo}>Insert video</Button><Button type="button" variant="ghost" onClick={() => setVideoLinkOpen(false)}>Cancel</Button></div>}
      {imageAltOpen && <div className="writing-video-link"><Input aria-label="Image alternative text" value={imageAlt} onChange={(event) => setImageAlt(event.target.value)} placeholder="Describe the image" /><Button type="button" disabled={!imageAlt.trim()} onClick={() => { setImageAltOpen(false); requestAnimationFrame(() => file.current?.click()); }}>Choose image</Button><Button type="button" variant="ghost" onClick={() => setImageAltOpen(false)}>Cancel</Button></div>}
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
            const next = `${current.current}\n\n${selected.type.startsWith("video/") ? "" : "!"}[${alt}](${url})\n\n`;
            current.current = next;
            editor.current?.setMarkdown(next);
            onChange(next);
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
                embedVideo={() => setVideoLinkOpen(true)}
                upload={(type) => {
                  if (!onUpload) {
                    setError("Uploads are unavailable in this view.");
                    return;
                  }
                  setMedia(type);
                  if (type === "image") setImageAltOpen(true);
                  else requestAnimationFrame(() => file.current?.click());
                }}
              />
            ),
          }),
        ]}
      />
    </div>
  );
}
