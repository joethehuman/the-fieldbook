"use client";

import dynamic from "next/dynamic";
import { Component, type ReactNode, useState } from "react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Alert } from "../ui/alert";
import { Field } from "../ui/field";
import { ActionGroup } from "../ui/action-group";
import { SectionHeader } from "./layout";
import type { UploadMedia } from "../MarkdownEditor";
import Markdown from "../Markdown";

const VisualEditor = dynamic(() => import("./writing-editor-engine"), {
  ssr: false,
  loading: () => <p role="status">Loading writing tools…</p>,
});

class EditorBoundary extends Component<
  { children: ReactNode; onFailure: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onFailure();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export type WritingEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onUpload?: UploadMedia;
  disabled?: boolean;
  label?: string;
};

/** Visual authoring and an explicit, lossless source escape hatch share one value. */
export function WritingEditor({
  label = "Content",
  ...props
}: WritingEditorProps) {
  const [mode, setMode] = useState("write");
  const [issue, setIssue] = useState("");
  return (
    <section className="grid min-w-0 gap-3" aria-label={`${label} editor`}>
      <SectionHeader title={<Field>{label}</Field>}>
        <ActionGroup aria-label="Editor view">
          {[
            ["write", "Write"],
            ["source", "Markdown"],
            ["preview", "Preview draft"],
          ].map(([key, text]) => (
            <Button
              key={key}
              type="button"
              size="sm"
              variant={mode === key ? "outline" : "ghost"}
              aria-pressed={mode === key}
              disabled={props.disabled}
              onClick={() => {
                setIssue("");
                setMode(key);
              }}
            >
              {text}
            </Button>
          ))}
        </ActionGroup>
      </SectionHeader>
      {issue && (
        <Alert role="alert">
          {issue} Your original text is preserved below.
        </Alert>
      )}
      {mode === "source" ? (
        <Textarea
          aria-label={`${label} Markdown`}
          rows={18}
          value={props.value}
          disabled={props.disabled}
          onChange={(event) => props.onChange(event.target.value)}
          className="min-h-96 font-mono leading-relaxed"
        />
      ) : mode === "preview" ? (
        <div
          className="markdown min-h-96 rounded-lg border border-border bg-background p-4 sm:p-6 [&>:first-child]:mt-0"
          aria-label="Draft preview"
        >
          {props.value ? (
            <Markdown>{props.value}</Markdown>
          ) : (
            <p>Nothing to preview yet.</p>
          )}
        </div>
      ) : (
        <EditorBoundary
          onFailure={() => {
            setIssue("The visual editor could not open this content.");
            setMode("source");
          }}
        >
          <VisualEditor
            {...props}
            label={label}
            onUnsupported={() => {
              setIssue(
                "This content needs Markdown mode to keep all its formatting.",
              );
              setMode("source");
            }}
          />
        </EditorBoundary>
      )}
    </section>
  );
}
