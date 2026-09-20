"use client";
import { Alert } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { SectionHeader, Toolbar } from "@/components/patterns/layout";
import { SelectField } from "./ui/select";
import { useId, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Quote,
  List,
  Link as LinkIcon,
  ImagePlus,
  Video,
  Table,
  Code,
  Eye,
  Pencil,
} from "lucide-react";
import Markdown from "./Markdown";

export type UploadMedia = (file: File) => Promise<string>;
export default function MarkdownEditor({
  label,
  value,
  onChange,
  onUpload,
  rows = 14,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onUpload?: UploadMedia;
  rows?: number;
}) {
  const id = useId(),
    input = useRef<HTMLTextAreaElement>(null),
    file = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const range = useRef({ start: 0, end: 0 });
  function insert(before: string, after = "", placeholder = "text") {
    const el = input.current;
    const start = el?.selectionStart ?? range.current.start,
      end = el?.selectionEnd ?? range.current.end;
    const selected = value.slice(start, end) || placeholder;
    onChange(
      value.slice(0, start) + before + selected + after + value.slice(end),
    );
    requestAnimationFrame(() => {
      input.current?.focus();
      input.current?.setSelectionRange(
        start + before.length,
        start + before.length + selected.length,
      );
    });
  }
  async function upload(f: File) {
    if (!onUpload) return;
    const start = range.current.start,
      end = range.current.end;
    setBusy(true);
    setError("");
    try {
      const url = await onUpload(f);
      const alt = f.name.replace(/[\[\]\\\n]/g, " ");
      const snippet = f.type.startsWith("video/")
        ? `\n\n[${alt}](${url})\n\n`
        : `\n\n![${alt}](${url})\n\n`;
      onChange(value.slice(0, start) + snippet + value.slice(end));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  }
  return (
    <div className="markdown-editor">
      <SectionHeader title={<Field htmlFor={id}>{label}</Field>}>
        <Button
          variant="link"
          type="button"

          onClick={() => setPreview(!preview)}
          disabled={busy}
        >
          {preview ? <Pencil size={15} /> : <Eye size={15} />}{" "}
          {preview ? "Write" : "Preview"}
        </Button>
      </SectionHeader>
      <Toolbar
        className="rounded-t-lg border border-border bg-muted/40 p-2"

        role="toolbar"
        aria-label={`${label} formatting`}
      >
        <SelectField
          aria-label="Heading level"
          value=""
          disabled={preview || busy}
          onValueChange={(value) => {
            if (value) insert(`\n${value} `, "\n", "Heading");
          }}
        >
          <option value="">Heading</option>
          <option value="#">Heading 1</option>
          <option value="##">Heading 2</option>
          <option value="###">Heading 3</option>
        </SelectField>
        {(
          [
            ["Bold", Bold, "**", "**", "bold text"],
            ["Italic", Italic, "*", "*", "italic text"],
            ["Quote", Quote, "\n> ", "\n", "Quote"],
            ["List", List, "\n- ", "\n", "List item"],
            ["Code", Code, "`", "`", "code"],
            ["Link", LinkIcon, "[", "](https://example.com)", "Link text"],
            [
              "Table",
              Table,
              "\n\n",
              "\n\n",
              "| Column 1 | Column 2 |\n| --- | --- |\n| Value | Value |",
            ],
          ] as const
        ).map(([name, Icon, before, after, placeholder]) => (
          <Button
            variant="ghost"
            key={name}
            type="button"
            title={name}
            aria-label={name}
            disabled={preview || busy}
            onClick={() => insert(before, after, placeholder)}
          >
            <Icon size={17} />
          </Button>
        ))}
        {(["image", "video"] as const).map((kind) => (
          <Button
            variant="ghost"
            key={kind}
            type="button"
            title={
              onUpload
                ? `Upload ${kind}`
                : "File uploads are available in a connected production installation"
            }
            aria-label={`Upload ${kind}`}
            disabled={!onUpload || preview || busy}
            onClick={() => {
              range.current = {
                start: input.current?.selectionStart || 0,
                end: input.current?.selectionEnd || 0,
              };
              if (file.current) {
                file.current.accept =
                  kind === "image"
                    ? "image/png,image/jpeg,image/webp,image/gif"
                    : "video/mp4,video/webm";
                file.current.click();
              }
            }}
          >
            {kind === "image" ? <ImagePlus size={17} /> : <Video size={17} />}
          </Button>
        ))}
        <Input
          ref={file}
          type="file"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
      </Toolbar>
      {preview ? (
        <div className="markdown markdown-preview">
          <Markdown>{value || "Nothing to preview yet."}</Markdown>
        </div>
      ) : (
        <Textarea
          id={id}
          ref={input}
          className="body-editor"
          rows={rows}
          value={value}
          disabled={busy}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Start with what matters…"
        />
      )}
      <small className="editor-help">
        {busy
          ? "Uploading media…"
          : "Markdown with formatting shortcuts. Preview before publishing."}
      </small>
      {error && (
        <Alert variant="destructive" role="alert">
          {error}
        </Alert>
      )}
    </div>
  );
}
