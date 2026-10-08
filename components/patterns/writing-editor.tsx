"use client";

import dynamic from "next/dynamic";
import { Component, createContext, useContext, useLayoutEffect, type ReactNode, useMemo, useState, useRef } from "react";
import { Textarea } from "../ui/textarea";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import type { UploadMedia } from "../MarkdownEditor";
import { MarkdownDownloadButton } from "./markdown-download";
import { WritingTitleContext, WritingIntroductionContext } from "./writing-title";
import { useScrollFade } from "./use-scroll-fade";
import { revealEditorTarget } from "./reveal-editor-target";
import { usePhoneWritingViewport } from "./use-phone-writing-viewport";
import "../../styles/writing-editor.css";

// Next's loading component does not receive the lazy editor's props.
const EditorViewContext = createContext<ReactNode>(null);
const MarkdownDownloadContext = createContext({ value: "", name: "Content" });

function StandaloneMarkdownDownload() {
  const { value, name } = useContext(MarkdownDownloadContext);
  return <MarkdownDownloadButton value={value} name={name} />;
}

function EditorViewHeader({ children }: { children: ReactNode }) {
  return <div className="writing-view-header flex min-w-0 flex-wrap items-center">{children}</div>;
}

function WritingToolsLoading() {
  const viewControls = useContext(EditorViewContext);
  return <div className="writing-surface min-w-0 rounded-lg border border-border bg-background" aria-busy="true">
    <EditorViewHeader>{viewControls}</EditorViewHeader>
    <div className="writing-viewport mt-0 focus-visible:ring-0">
      <div className="min-h-96 p-4" aria-hidden="true" />
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
  canvas?: boolean;
  title?: ReactNode;
  introduction?: ReactNode;
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
  canvas = false,
  title,
  introduction,
  downloadName = label,
  ...props
}: WritingEditorProps) {
  const root = useRef<HTMLElement>(null);
  usePhoneWritingViewport(root);
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    let toolbar: HTMLElement | null = null;
    const resize = new ResizeObserver(measure);
    function measure() {
      if (!element) return;
      const next = element.querySelector<HTMLElement>(".mdxeditor-toolbar, .writing-view-header");
      if (next !== toolbar) {
        if (toolbar) resize.unobserve(toolbar);
        toolbar = next;
        if (toolbar) resize.observe(toolbar);
      }
      element.style.setProperty("--writing-toolbar-height", `${toolbar?.getBoundingClientRect().height || 0}px`);
    }
    const mutations = new MutationObserver(measure);
    mutations.observe(element, { childList: true, subtree: true });
    measure();
    return () => { resize.disconnect(); mutations.disconnect(); };
  }, []);
  const [mode, setMode] = useState("write");
  const [issue, setIssue] = useState("");
  const [failureDetail, setFailureDetail] = useState("");
  const sourceFade = useScrollFade<HTMLTextAreaElement>(mode === "source");
  useLayoutEffect(() => { sourceFade.measure(); }, [mode, props.value, sourceFade.measure]);
  // Keep the toolbar slot stable while typing so the engine's plugins stay stable.
  const viewControls = useMemo(() => canvas ? null : <StandaloneMarkdownDownload />, [canvas]);
  return (
    <MarkdownDownloadContext.Provider value={{ value: props.value, name: downloadName }}>
    <WritingTitleContext.Provider value={title}>
    <WritingIntroductionContext.Provider value={introduction}>
    <EditorViewContext.Provider value={viewControls}>
        <section ref={root} className="writing-root flex min-w-0 flex-col gap-3" aria-label={`${label} editor`} onFocusCapture={(event) => {
          if (window.matchMedia("(max-width: 1279px)").matches) return;
          const target = event.target;
          if (!(target instanceof HTMLElement) || !target.matches('[contenteditable], textarea, [role="tabpanel"]')) return;
          const surface = target.closest<HTMLElement>(".writing-surface");
          const viewport = surface?.closest<HTMLElement>(".main-content");
          if (surface && viewport && !surface.closest('.editor[data-scroll-layout="workspace"]') && getComputedStyle(surface).maxHeight !== "none")
            revealEditorTarget(surface, { container: viewport, focus: false });
        }}>
          {issue && (
            <div className="writing-editor-notice grid gap-3">
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
                  {introduction && <div className="writing-course-heading">{introduction}</div>}
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
                canvas={canvas}
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
    </WritingIntroductionContext.Provider>
    </WritingTitleContext.Provider>
    </MarkdownDownloadContext.Provider>
  );
}
