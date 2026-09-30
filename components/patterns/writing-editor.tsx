"use client";

import dynamic from "next/dynamic";
import { Component, createContext, useContext, type ReactNode, useMemo, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { Alert } from "../ui/alert";
import { ActionGroup } from "../ui/action-group";
import type { UploadMedia } from "../MarkdownEditor";
import Markdown from "../Markdown";

// Next's loading component does not receive the lazy editor's props.
const EditorViewContext = createContext<ReactNode>(null);

function EditorViewHeader({ children }: { children: ReactNode }) {
  return <div className="flex min-w-0 flex-wrap items-center rounded-t-lg border border-b-0 border-border bg-muted p-2">{children}</div>;
}

function WritingToolsLoading() {
  const viewControls = useContext(EditorViewContext);
  return <div className="grid min-w-0">
    <EditorViewHeader>{viewControls}</EditorViewHeader>
    <p className="rounded-b-lg border border-border p-4" role="status">Loading writing tools…</p>
  </div>;
}

const VisualEditor = dynamic(() => import("./writing-editor-engine"), {
  ssr: false,
  loading: WritingToolsLoading,
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
  const pendingViewFocus = useRef<string | null>(null);
  // Keep the toolbar slot stable while typing so the engine's plugins stay stable.
  const viewControls = useMemo(() => (
    <ActionGroup className="ml-auto max-w-full shrink-0" role="group" aria-label="Editor view">
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
          ref={(button) => {
            if (!button) return;
            if (pendingViewFocus.current === key) {
              pendingViewFocus.current = null;
              button.focus({ preventScroll: true });
            }
            return () => {
              if (document.activeElement === button) pendingViewFocus.current = key;
            };
          }}
          onClick={() => {
            if (mode !== key) pendingViewFocus.current = key;
            setIssue("");
            setMode(key);
          }}
        >
          {text}
        </Button>
      ))}
    </ActionGroup>
  ), [mode, props.disabled]);
  return (
    <EditorViewContext.Provider value={viewControls}>
      <section className="grid min-w-0 gap-3" aria-label={`${label} editor`}>
        {issue && (
          <Alert role="alert">
            {issue} Your original text is preserved below.
          </Alert>
        )}
        {mode !== "write" ? (
          <div className="grid min-w-0">
            <EditorViewHeader>{viewControls}</EditorViewHeader>
            {mode === "source" ? (
              <Textarea
                aria-label={`${label} Markdown`}
                rows={18}
                value={props.value}
                disabled={props.disabled}
                onChange={(event) => props.onChange(event.target.value)}
                className="min-h-96 rounded-t-none font-mono leading-relaxed"
              />
            ) : (
              <div
                className="markdown min-h-96 rounded-b-lg border border-border bg-background p-4 sm:p-6 [&>:first-child]:mt-0"
                aria-label="Draft preview"
              >
                {props.value ? <Markdown>{props.value}</Markdown> : <p>Nothing to preview yet.</p>}
              </div>
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
              viewControls={viewControls}
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
    </EditorViewContext.Provider>
  );
}
