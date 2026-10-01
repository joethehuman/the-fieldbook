"use client";

import dynamic from "next/dynamic";
import { Component, createContext, useContext, useLayoutEffect, type ReactNode, useMemo, useRef, useState } from "react";
import { Textarea } from "../ui/textarea";
import { Alert } from "../ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../ui/tabs";
import type { UploadMedia } from "../MarkdownEditor";
import Markdown from "../Markdown";
import { useScrollFade } from "./use-scroll-fade";
import { revealEditorTarget } from "./reveal-editor-target";
import "../../styles/writing-editor.css";

// Next's loading component does not receive the lazy editor's props.
const EditorViewContext = createContext<ReactNode>(null);

function EditorViewHeader({ children }: { children: ReactNode }) {
  return <div className="writing-view-header flex min-w-0 flex-wrap items-center">{children}</div>;
}

function WritingToolsLoading() {
  const viewControls = useContext(EditorViewContext);
  return <div className="writing-surface min-w-0 rounded-lg border border-border bg-background">
    <EditorViewHeader>{viewControls}</EditorViewHeader>
    <TabsContent value="write" className="writing-viewport mt-0 focus-visible:ring-0">
      <div className="min-h-96 p-4"><p role="status">Loading writing tools…</p></div>
    </TabsContent>
  </div>;
}

const VisualEditor = dynamic(() => import("./writing-editor-engine"), {
  ssr: false,
  loading: WritingToolsLoading,
});

class EditorBoundary extends Component<
  { children: ReactNode; onFailure: (error: Error) => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    this.props.onFailure(error);
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
  const [failureDetail, setFailureDetail] = useState("");
  const pendingViewFocus = useRef<string | null>(null);
  const sourceFade = useScrollFade<HTMLTextAreaElement>(mode === "source");
  const previewFade = useScrollFade<HTMLDivElement>(mode === "preview");
  useLayoutEffect(() => { sourceFade.measure(); }, [mode, props.value, sourceFade.measure]);
  // Keep the toolbar slot stable while typing so the engine's plugins stay stable.
  const viewControls = useMemo(() => (
    <TabsList className="ml-auto shrink-0" aria-label="Editor view">
      {[
        ["write", "Write"],
        ["source", "Markdown"],
        ["preview", "Preview draft"],
      ].map(([key, text]) => (
        <TabsTrigger
          key={key}
          value={key}
          disabled={props.disabled}
          ref={(button) => {
            if (!button) return;
            if (pendingViewFocus.current === key) {
              pendingViewFocus.current = null;
              button.focus({ preventScroll: true });
            }
            return () => {
              if (document.activeElement === button && pendingViewFocus.current === null) pendingViewFocus.current = key;
            };
          }}
        >
          {text}
        </TabsTrigger>
      ))}
    </TabsList>
  ), [props.disabled]);
  return (
    <EditorViewContext.Provider value={viewControls}>
      <Tabs value={mode} onValueChange={(key) => {
        if (mode !== key) pendingViewFocus.current = key;
        setIssue("");
        setFailureDetail("");
        setMode(key);
      }} asChild>
        <section className="grid min-w-0 gap-3" aria-label={`${label} editor`} onFocusCapture={(event) => {
          const target = event.target;
          if (!(target instanceof HTMLElement) || !target.matches('[contenteditable], textarea, [role="tabpanel"]')) return;
          const surface = target.closest<HTMLElement>(".writing-surface");
          const viewport = surface?.closest<HTMLElement>(".admin-panel, .main-content");
          if (surface && viewport && getComputedStyle(surface).maxHeight !== "none")
            revealEditorTarget(surface, { container: viewport, focus: false });
        }}>
          {issue && (
            <Alert role="alert">
              {issue} Your original text is preserved below.
              {process.env.NODE_ENV === "development" && failureDetail && <details className="mt-2">
                <summary>Editor error details</summary>
                <p className="mt-2 font-mono text-sm">{failureDetail}</p>
              </details>}
            </Alert>
          )}
          {mode !== "write" ? (
            <div className="writing-surface min-w-0 rounded-lg border border-border bg-background">
              <EditorViewHeader>{viewControls}</EditorViewHeader>
              {mode === "source" ? (
                <TabsContent value="source" className="writing-viewport writing-source-panel mt-0 focus-visible:ring-0">
                  <Textarea
                    ref={sourceFade.ref}
                    aria-label={`${label} Markdown`}
                    rows={18}
                    value={props.value}
                    disabled={props.disabled}
                    onChange={(event) => props.onChange(event.target.value)}
                    onScroll={sourceFade.measure}
                    data-scroll-fade-before={sourceFade.edges.before}
                    data-scroll-fade-after={false}
                    className="writing-source writing-scroll-area scroll-fade rounded-none border-0 px-[var(--editor-content-padding,var(--space-3))] font-mono leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </TabsContent>
              ) : (
                <TabsContent ref={previewFade.ref} value="preview" className="writing-viewport writing-scroll-area scroll-fade mt-0 focus-visible:ring-0"
                  data-scroll-fade-before={previewFade.edges.before} data-scroll-fade-after={false} onScroll={previewFade.measure}>
                  <div
                    className="markdown min-h-96 py-4 px-[var(--editor-content-padding,var(--space-4))] sm:py-6 sm:px-[var(--editor-content-padding,var(--space-6))] [&>:first-child]:mt-0"
                    aria-label="Draft preview"
                  >
                    {props.value ? <Markdown>{props.value}</Markdown> : <p>Nothing to preview yet.</p>}
                  </div>
                </TabsContent>
              )}
            </div>
          ) : (
            <EditorBoundary
              onFailure={(error) => {
                pendingViewFocus.current = "source";
                setIssue("The visual editor could not open this content.");
                setFailureDetail(`${error.name}: ${error.message}`);
                setMode("source");
              }}
            >
              <VisualEditor
                {...props}
                label={label}
                viewControls={viewControls}
                onUnsupported={() => {
                  pendingViewFocus.current = "source";
                  setIssue(
                    "This content needs Markdown mode to keep all its formatting.",
                  );
                  setMode("source");
                }}
              />
            </EditorBoundary>
          )}
        </section>
      </Tabs>
    </EditorViewContext.Provider>
  );
}
