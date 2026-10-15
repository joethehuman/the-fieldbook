"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useVirtualKeyboard } from "@blocknote/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { MarkdownDownloadButton } from "./markdown-download";
import { revealEditorTarget } from "./reveal-editor-target";
import type { EditorFrameProps } from "./editor-frame";

type View = "write" | "outline" | "details";

/** One page at a time, all inside BlockNote's single app scroll container. */
export function MobileEditorFrame({
  outline, outlineContext, details, download, recovery, deleteAction,
  requirementsCount = 0, revealDetails, revealCanvas, revealOutline,
  disabled = false, children,
}: EditorFrameProps) {
  // Keep BlockNote's viewport publisher alive for quiz/source-recovery views
  // too, when there may be no mounted rich-text toolbar controller.
  useVirtualKeyboard();
  const frame = useRef<HTMLElement>(null);
  const [view, setView] = useState<View>("write");
  const hasOutline = !!outline;
  const positions = useRef<Record<View, number>>({ write: 0, outline: 0, details: 0 });
  const viewport = () => frame.current?.closest<HTMLElement>(".bn-scroll-container");

  function changeView(next: View) {
    if (next === view) return;
    positions.current[view] = viewport()?.scrollTop || 0;
    // Safari doesn't always focus buttons on tap. End text editing explicitly
    // at this navigation boundary; never restore an old caret or keyboard.
    const active = document.activeElement;
    if (active instanceof HTMLElement && frame.current?.contains(active)
      && active.matches('input, textarea, [contenteditable="true"]')) active.blur();
    setView(next);
  }

  useLayoutEffect(() => {
    const owner = viewport();
    if (owner) owner.scrollTop = positions.current[view];
  }, [view]);

  useLayoutEffect(() => {
    if (!revealCanvas) return;
    positions.current.write = 0;
    setView("write");
    const owner = viewport();
    if (owner) owner.scrollTop = 0;
  }, [revealCanvas]);

  useLayoutEffect(() => {
    if (revealOutline && hasOutline) setView("outline");
  }, [revealOutline, hasOutline]);

  useEffect(() => {
    if (view !== "outline") return;
    frame.current?.querySelector<HTMLElement>('[aria-current="step"]')
      ?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [view, outlineContext]);

  useLayoutEffect(() => {
    if (!revealDetails) return;
    const writing = revealDetails.field === "editor-title" || revealDetails.field === "editor-body";
    setView(writing ? "write" : "details");
    // Publication validation is explicit navigation. Ordinary focus, typing,
    // keyboard resize and scroll never schedule a Fieldbook correction.
    let cancel: (() => void) | undefined;
    const request = requestAnimationFrame(() => {
      const section = revealDetails.field === "editor-body"
        ? frame.current?.querySelector<HTMLElement>('[contenteditable="true"], textarea.writing-source')
        : revealDetails.field ? document.getElementById(revealDetails.field) : undefined;
      const target = section?.matches('input, button, textarea, [tabindex="0"], [contenteditable="true"]')
        ? section : section?.querySelector<HTMLElement>('input, button, textarea, [tabindex="0"]');
      if (target) cancel = revealEditorTarget(target, { highlight: revealDetails.field === "editor-title" });
    });
    return () => { cancelAnimationFrame(request); cancel?.(); };
  }, [revealDetails]);

  return (
    <section ref={frame} className="editor-frame mobile-editor" data-mobile data-view={view} aria-label="Writing workspace">
      <Tabs value={view} onValueChange={(value) => changeView(value as View)}>
        <TabsList className="mobile-editor-navigation" aria-label="Editor views" loop={false}>
          <TabsTrigger value="write" disabled={disabled}>Write</TabsTrigger>
          {outline && <TabsTrigger value="outline" disabled={disabled}>Outline</TabsTrigger>}
          <TabsTrigger value="details" disabled={disabled} aria-description={requirementsCount ? `${requirementsCount} required before publishing` : undefined}>
            Details{requirementsCount > 0 && <span className="mobile-editor-requirements" aria-hidden="true">{requirementsCount}</span>}
          </TabsTrigger>
        </TabsList>
        {/* Keep the editor and fields mounted so view changes preserve draft
            state and undo. Hidden views take no space and cannot receive taps. */}
        <TabsContent value="write" forceMount hidden={view !== "write"} className="mobile-editor-writing mt-0">
          {children}
        </TabsContent>
        {outline && <TabsContent value="outline" forceMount hidden={view !== "outline"} className="mobile-editor-page mt-0" aria-label="Course outline">
          <h2 className="text-lg font-semibold">Course outline</h2>
          {outline}
        </TabsContent>}
        <TabsContent value="details" forceMount hidden={view !== "details"} className="mobile-editor-page mt-0" aria-label="Content details">
          <h2 className="text-lg font-semibold">Details</h2>
          {details}
          {(download || recovery) && <section className="editor-details-group" aria-labelledby="mobile-recovery-title">
            <h3 id="mobile-recovery-title" className="text-sm font-semibold">Recovery</h3>
            <div className="editor-details-actions">
              {download && <MarkdownDownloadButton value={download.value} name={download.name} disabled={disabled} />}
              {recovery}
            </div>
          </section>}
          {deleteAction}
        </TabsContent>
      </Tabs>
    </section>
  );
}
