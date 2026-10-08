"use client";

import dynamic from "next/dynamic";
import { Component, createContext, useContext, useLayoutEffect, type ReactNode, useMemo, useState, useRef } from "react";
import { Textarea } from "../ui/textarea";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../ui/dropdown-menu";
import { Download, MoreHorizontal } from "lucide-react";
import type { UploadMedia } from "../MarkdownEditor";
import { EditorFocusControls } from "./editor-focus";
import { WritingTitleContext } from "./writing-title";
import { useScrollFade } from "./use-scroll-fade";
import { revealEditorTarget } from "./reveal-editor-target";
import { usePhoneWritingViewport } from "./use-phone-writing-viewport";
import "../../styles/writing-editor.css";

// Next's loading component does not receive the lazy editor's props.
const EditorViewContext = createContext<ReactNode>(null);
const MarkdownDownloadContext = createContext({ value: "", name: "Content" });

function MarkdownDownloadMenu() {
  const { value, name } = useContext(MarkdownDownloadContext);
  function download() {
    const url = URL.createObjectURL(new Blob([value], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${name.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").slice(0, 120) || "Content"}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    // Allow the browser to consume the URL before releasing the download.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" size="icon" variant="ghost" aria-label="More editor actions"><MoreHorizontal /></Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuItem onSelect={download}><Download aria-hidden="true" />Download Markdown</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}

function EditorViewHeader({ children }: { children: ReactNode }) {
  return <div className="writing-view-header flex min-w-0 flex-wrap items-center">{children}</div>;
}

function WritingToolsLoading() {
  const viewControls = useContext(EditorViewContext);
  return <div className="writing-surface min-w-0 rounded-lg border border-border bg-background">
    <EditorViewHeader>{viewControls}</EditorViewHeader>
    <div className="writing-viewport mt-0 focus-visible:ring-0">
      <div className="min-h-96 p-4"><p role="status">Loading writing tools…</p></div>
    </div>
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
  title?: ReactNode;
  downloadName?: string;
  value: string;
  onChange: (value: string) => void;
  onUpload?: UploadMedia;
  disabled?: boolean;
  label?: string;
};

/** Visual authoring with a Markdown download and lossless recovery for unsupported content. */
export function WritingEditor({
  label = "Content",
  title,
  downloadName = label,
  ...props
}: WritingEditorProps) {
  const root = useRef<HTMLElement>(null);
  usePhoneWritingViewport(root);
  const [mode, setMode] = useState("write");
  const [issue, setIssue] = useState("");
  const [failureDetail, setFailureDetail] = useState("");
  const sourceFade = useScrollFade<HTMLTextAreaElement>(mode === "source");
  useLayoutEffect(() => { sourceFade.measure(); }, [mode, props.value, sourceFade.measure]);
  // Keep the toolbar slot stable while typing so the engine's plugins stay stable.
  const viewControls = useMemo(() => (
    <div className="writing-view-controls ml-auto flex min-w-0 flex-wrap items-center gap-2">
      <EditorFocusControls /><MarkdownDownloadMenu />
    </div>
  ), []);
  return (
    <MarkdownDownloadContext.Provider value={{ value: props.value, name: downloadName }}>
    <WritingTitleContext.Provider value={title}>
    <EditorViewContext.Provider value={viewControls}>
        <section ref={root} className="writing-root flex min-w-0 flex-col gap-3" aria-label={`${label} editor`} onFocusCapture={(event) => {
          if (window.matchMedia("(max-width: 767px)").matches) return;
          const target = event.target;
          if (!(target instanceof HTMLElement) || !target.matches('[contenteditable], textarea, [role="tabpanel"]')) return;
          const surface = target.closest<HTMLElement>(".writing-surface");
          const viewport = surface?.closest<HTMLElement>(".main-content");
          if (surface && viewport && !surface.closest('.editor[data-scroll-layout="workspace"]') && getComputedStyle(surface).maxHeight !== "none")
            revealEditorTarget(surface, { container: viewport, focus: false });
        }}>
          {issue && (
            <div className="grid gap-3">
              <Alert role="alert">
                {issue}
                {process.env.NODE_ENV === "development" && failureDetail && <details className="mt-2">
                  <summary>Editor error details</summary>
                  <p className="mt-2 font-mono text-sm">{failureDetail}</p>
                </details>}
              </Alert>
              <Button type="button" variant="outline" size="sm" disabled={props.disabled}
                onClick={() => { setIssue(""); setFailureDetail(""); setMode("write"); }}>Retry visual editor</Button>
            </div>
          )}
          {mode !== "write" ? (
            <div className="writing-surface min-w-0 rounded-lg border border-border bg-background">
              <EditorViewHeader>{viewControls}</EditorViewHeader>
                <div className="writing-viewport writing-source-panel mt-0 focus-visible:ring-0">
                  {title && <div className="writing-document-heading">{title}</div>}
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
                </div>
            </div>
          ) : (
            <EditorBoundary
              onFailure={(error) => {
                setIssue("The visual editor couldn’t open this content. Continue editing in Markdown below.");
                setFailureDetail(`${error.name}: ${error.message}`);
                setMode("source");
              }}
            >
              <VisualEditor
                {...props}
                label={label}
                viewControls={viewControls}
                onUnsupported={() => {
                  setIssue(
                    "This formatting isn’t supported by the visual editor. Continue editing in Markdown below.",
                  );
                  setMode("source");
                }}
              />
            </EditorBoundary>
          )}
        </section>
    </EditorViewContext.Provider>
    </WritingTitleContext.Provider>
    </MarkdownDownloadContext.Provider>
  );
}
