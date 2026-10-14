"use client";

import { createContext, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ListTree, SlidersHorizontal, X } from "lucide-react";
import { MarkdownDownloadButton } from "./markdown-download";
import { Button } from "../ui/button";
import { FieldDescription } from "../ui/field";
import { ScrollRegion } from "./scroll-region";
import { revealEditorTarget } from "./reveal-editor-target";
import { blurWritingInput, captureWritingCursor, type WritingCursor } from "./writing-cursor";
import { useEditorCardsLayout } from "./use-editor-cards-layout";

export const EditorMobileOverlayContext = createContext<HTMLElement | null>(null);
export const EditorWritingActionsContext = createContext<HTMLElement | null>(null);
export const EditorCompactControlsContext = createContext<{ panelsOpen: boolean; dismissPanels: () => void } | null>(null);

export type DetailsReveal = { request: number; field?: string };

/** Keep closing content until its slide finishes; closed panels occupy no space. */
function usePanelPresence(open: boolean) {
  const [present, setPresent] = useState(open);
  useEffect(() => {
    if (open) { setPresent(true); return; }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setPresent(false); return; }
    const timer = window.setTimeout(() => setPresent(false), 220);
    return () => window.clearTimeout(timer);
  }, [open]);
  return open || present;
}

/** One writing canvas with optional in-page navigation and content details. */
export function EditorFrame({
  navigation,
  outline,
  outlineContext,
  details,
  download,
  recovery,
  deleteAction,
  requirementsCount = 0,
  revealDetails,
  revealCanvas,
  revealOutline,
  disabled = false,
  children,
}: {
  navigation?: ReactNode;
  outline?: ReactNode;
  outlineContext?: string;
  details: ReactNode;
  download?: { value: string; name: string };
  recovery?: ReactNode;
  deleteAction?: ReactNode;
  requirementsCount?: number;
  revealDetails?: DetailsReveal;
  revealCanvas?: number;
  revealOutline?: number;
  disabled?: boolean;
  children: ReactNode;
}) {
  const phone = useEditorCardsLayout();
  const frame = useRef<HTMLElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const [writingActionsHost, setWritingActionsHost] = useState<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [overlayHost, setOverlayHost] = useState<HTMLDivElement | null>(null);
  const hasNavigation = !!navigation;
  const [panels, setPanels] = useState({ outline: false, details: false });
  const panelState = useRef(panels);
  panelState.current = panels;
  const lastWritingCursor = useRef<WritingCursor | null>(null);
  const panelReturn = useRef<WritingCursor | null>(null);
  const preparedPanel = useRef<"outline" | "details" | null>(null);
  function preparePanel(side: "outline" | "details") {
    if (!phone) return;
    if (!panelState.current.outline && !panelState.current.details) {
      const active = document.activeElement;
      const chooser = active instanceof Element && !!active.closest(".writing-slash-menu, .writing-media-chooser, .editor-frame-controls");
      // The popup's capture-phase dismissal can remove its focused input
      // before this button receives pointerdown, returning focus to body.
      panelReturn.current = captureWritingCursor(canvas.current) || (chooser || active === document.body ? lastWritingCursor.current : null);
    }
    preparedPanel.current = side;
  }
  function returnToToggle(toggle: HTMLButtonElement | null) {
    panelReturn.current = null;
    // Closing a panel returns to its button. A later writing tap chooses
    // the caret and opens the keyboard through the browser's normal path.
    toggle?.focus({ preventScroll: true });
  }
  function togglePanel(side: "outline" | "details") {
    defaultsApplied.current = true;
    const closing = panelState.current[side];
    if (!closing && preparedPanel.current !== side) preparePanel(side);
    preparedPanel.current = null;
    if (!closing && phone) {
      const cursor = panelReturn.current;
      if (cursor?.kind === "prose" && cursor.surface.isConnected && cursor.surface.textContent === cursor.value
        && cursor.start.isConnected && cursor.end.isConnected) {
        try {
          const range = document.createRange();
          range.setStart(cursor.start, cursor.startOffset); range.setEnd(cursor.end, cursor.endOffset);
          cursor.surface.dispatchEvent(new CustomEvent("fieldbook:writing-handoff", { bubbles: true, detail: range }));
        } catch { /* A completed gesture no longer owns its captured writing target. */ }
      }
      blurWritingInput();
      window.getSelection()?.removeAllRanges();
    }
    setPanels((current) => side === "outline"
      ? { outline: !current.outline, details: wide.current ? current.details : false }
      : { outline: wide.current ? current.outline : false, details: !current.details });
    if (closing && phone) returnToToggle(side === "outline" ? outlineToggle.current : detailsToggle.current);
  }
  useLayoutEffect(() => {
    if (phone) {
      frame.current?.style.setProperty("--editor-navigation-height", "0px");
      return;
    }
    const element = canvas.current?.querySelector<HTMLElement>(".editor-canvas-navigation");
    const owner = frame.current?.closest<HTMLElement>(".main-content");
    if (!element) return;
    const measure = () => {
      frame.current?.style.setProperty("--editor-navigation-height", `${element.getBoundingClientRect().height}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    owner?.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      owner?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [hasNavigation, phone]);

  useEffect(() => {
    const element = controls.current;
    const writing = canvas.current;
    if (!phone || !element || !writing) return;
    // Save only the insertion bookmark before a toolbar takes focus. No
    // caret measurements or scrolling run on focus/selection/viewport events.
    const remember = () => {
      const cursor = captureWritingCursor(writing);
      if (cursor) lastWritingCursor.current = cursor;
    };
    element.addEventListener("pointerdown", remember, true);
    writing.addEventListener("fieldbook:writing-handoff", remember);
    return () => {
      element.removeEventListener("pointerdown", remember, true);
      writing.removeEventListener("fieldbook:writing-handoff", remember);
    };
  }, [phone]);
  useEffect(() => {
    if (!phone || !panels.outline && !panels.details) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || target.closest('.editor-mobile-toolbar, [data-radix-popper-content-wrapper], [data-slot="dialog-content"]')) return;
      setPanels({ outline: false, details: false });
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [phone, panels.outline, panels.details]);
  useEffect(() => {
    if (!phone || !panels.outline && !panels.details) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing || event.defaultPrevented) return;
      event.preventDefault(); event.stopPropagation();
      setPanels({ outline: false, details: false });
      returnToToggle(panels.outline ? outlineToggle.current : detailsToggle.current);
    };
    // Let fields and portaled pickers consume Escape before closing the panel.
    document.addEventListener("keydown", cancel);
    return () => document.removeEventListener("keydown", cancel);
  }, [phone, panels.outline, panels.details]);
  const wide = useRef(false);
  const narrow = useRef(false);
  const outlineToggle = useRef<HTMLButtonElement>(null);
  const detailsToggle = useRef<HTMLButtonElement>(null);
  const outlineId = useId();
  const detailsId = useId();
  const dismissPanels = useCallback(() => setPanels({ outline: false, details: false }), []);
  const compactControls = useMemo(() => phone ? { panelsOpen: panels.outline || panels.details, dismissPanels } : null, [phone, panels.outline, panels.details, dismissPanels]);
  const defaultsApplied = useRef(false);
  const previousClearance = useRef({ outline: false, details: false });
  const hasOutline = !!outline;
  const outlinePresent = usePanelPresence(panels.outline && hasOutline);
  const detailsPresent = usePanelPresence(panels.details);
  useLayoutEffect(() => {
    const target = frame.current;
    const surface = canvas.current;
    if (!target || !surface) return;
    if (phone) {
      wide.current = false;
      narrow.current = true;
      setPanels({ outline: false, details: false });
      return;
    }
    let active = true;
    let request = 0;
    let waitingForLayout = false;
    const schedule = () => {
      cancelAnimationFrame(request);
      request = requestAnimationFrame(measure);
    };
    const measure = () => {
      const text = surface.querySelector<HTMLElement>(".document-title");
      if (!text) return; // A lazy writing surface has not mounted yet.
      const bounds = target.getBoundingClientRect();
      const column = text.getBoundingClientRect();
      const panelWidth = parseFloat(getComputedStyle(target).getPropertyValue("--editor-panel-width")) || 320;
      const gap = 12;
      const clearance = {
        outline: column.left - bounds.left >= panelWidth + gap,
        details: bounds.right - column.right >= panelWidth + gap,
      };
      wide.current = !phone && bounds.width >= 2 * panelWidth + 16;
      narrow.current = phone || !clearance.outline || !clearance.details;
      if (!defaultsApplied.current) {
        const app = target.closest(".app");
        if (!phone && target.closest(".editor") && app?.querySelector(".sidebar") && !app.classList.contains("sidebar-collapsed")) return;
        const animations = target.closest(".main-shell")?.getAnimations().filter((animation) => animation.playState === "running") || [];
        if (animations.length) {
          if (!waitingForLayout) {
            waitingForLayout = true;
            void Promise.all(animations.map((animation) => animation.finished.catch(() => {}))).then(() => {
              waitingForLayout = false;
              if (active) schedule();
            });
          }
          return;
        }
        defaultsApplied.current = true;
        setPanels({ outline: hasOutline && clearance.outline, details: !hasOutline && clearance.details });
      } else {
        const lostOutline = previousClearance.current.outline && !clearance.outline;
        const lostDetails = previousClearance.current.details && !clearance.details;
        setPanels((current) => {
          const outline = current.outline && !lostOutline;
          const details = current.details && !lostDetails && (wide.current || !outline);
          return outline === current.outline && details === current.details ? current : { outline, details };
        });
      }
      previousClearance.current = clearance;
    };
    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(target);
    observer.observe(surface);
    // Mounting a lazy editor or switching to Quiz can change the writing surface.
    const mutations = new MutationObserver((records) => {
      if (records.some(({ target }) => !(target instanceof Element) || !target.closest(".writing-content"))) schedule();
    });
    mutations.observe(surface, { childList: true, subtree: true });
    return () => { active = false; cancelAnimationFrame(request); observer.disconnect(); mutations.disconnect(); };
  }, [phone, hasOutline]);

  useEffect(() => {
    if (!revealDetails) return;
    defaultsApplied.current = true;
    const introduction = revealDetails.field === "editor-title" || revealDetails.field === "editor-body";
    const body = revealDetails.field === "editor-body";
    setPanels((current) => ({ outline: !introduction && wide.current && current.outline, details: !introduction }));
    let cancelReveal: (() => void) | undefined;
    const request = requestAnimationFrame(() => {
      const section = body ? canvas.current?.querySelector<HTMLElement>('[contenteditable="true"], textarea.writing-source') : revealDetails.field
        ? document.getElementById(revealDetails.field)
        : document.getElementById(detailsId);
      const target = section?.matches('input, button, textarea, [tabindex="0"], [contenteditable="true"]') ? section
        : section?.querySelector<HTMLElement>('input, button, textarea, [tabindex="0"]');
      const control = target || section;
      if (control) cancelReveal = revealEditorTarget(control, {
        highlight: revealDetails.field === "editor-title",
        container: introduction ? undefined : document.getElementById(detailsId)?.closest<HTMLElement>('[data-slot="scroll-region"]') || document.getElementById(detailsId),
        context: section && section !== control ? section
          : control.closest<HTMLElement>('[data-slot="field"]') || control,
      });
    });
    return () => { cancelAnimationFrame(request); cancelReveal?.(); };
  }, [revealDetails, detailsId, phone]);

  useLayoutEffect(() => {
    if (!revealCanvas) return;
    defaultsApplied.current = true;
    setPanels((current) => ({
      outline: narrow.current ? false : current.outline,
      details: narrow.current ? false : current.details,
    }));
  }, [revealCanvas]);

  useEffect(() => {
    if (!revealOutline) return;
    defaultsApplied.current = true;
    setPanels((current) => ({ outline: true, details: wide.current && current.details }));
    let cancelReveal: (() => void) | undefined;
    const request = requestAnimationFrame(() => {
      const section = document.getElementById(outlineId);
      const target = section?.querySelector<HTMLElement>('button:not(:disabled)');
      if (target && section) cancelReveal = revealEditorTarget(target, { container: section.closest<HTMLElement>('[data-slot="scroll-region"]') || section });
    });
    return () => { cancelAnimationFrame(request); cancelReveal?.(); };
  }, [revealOutline, outlineId]);

  useEffect(() => {
    if (!panels.outline) return;
    let cancelReveal: (() => void) | undefined;
    const request = requestAnimationFrame(() => {
      const section = document.getElementById(outlineId);
      const selected = section?.querySelector<HTMLElement>('[aria-current="step"]');
      if (selected && section) cancelReveal = revealEditorTarget(selected, {
        container: section.closest<HTMLElement>('[data-slot="scroll-region"]') || section,
        context: selected.closest<HTMLElement>(".course-builder-steps > div") || selected,
        focus: false,
      });
    });
    return () => { cancelAnimationFrame(request); cancelReveal?.(); };
  }, [panels.outline, outlineContext, outlineId, revealCanvas]);

  const open = panels.outline ? panels.details ? "both" : "outline" : panels.details ? "details" : "none";
  const recoverySection = (download || recovery) && <EditorDetailsGroup id="writing-recovery" title="Recovery">
    <div className="editor-details-actions">
      {download && <MarkdownDownloadButton value={download.value} name={download.name} disabled={disabled} />}
      {recovery}
    </div>
  </EditorDetailsGroup>;
  const panelControls = (
      <div ref={controls} className="editor-frame-controls" data-cards={phone || undefined} role={phone ? "group" : undefined} aria-label={phone ? "Editor controls" : undefined}>
      <div className="editor-controls-surface">
        {outline && (
          <Button ref={outlineToggle} type="button" variant={phone ? "ghost" : "outline"} size="icon" className={`editor-panel-toggle ${phone ? "relative p-0 appearance-none rounded-xl border-transparent bg-transparent shadow-none hover:bg-accent disabled:bg-transparent disabled:border-transparent" : "absolute size-11 rounded-full"}`} data-side="outline"
            disabled={disabled} aria-label="Outline" title={panels.outline ? "Close outline" : "Open outline"}
            aria-controls={outlineId} aria-expanded={panels.outline}
            onPointerDown={() => { if (phone) preparePanel("outline"); }}
            onPointerCancel={() => { preparedPanel.current = null; }}
            onMouseDown={(event) => { if (phone) event.preventDefault(); }}
            onClick={() => togglePanel("outline")}>
            {panels.outline ? <X aria-hidden="true" /> : <ListTree aria-hidden="true" />}
          </Button>
        )}
        {phone && <div className="editor-writing-actions-host" ref={setWritingActionsHost} />}
        <Button ref={detailsToggle} type="button" variant={phone ? "ghost" : "outline"} size="icon" className={`editor-panel-toggle ${phone ? "relative p-0 appearance-none rounded-xl border-transparent bg-transparent shadow-none hover:bg-accent disabled:bg-transparent disabled:border-transparent" : "absolute size-11 rounded-full"}`} data-side="details"
          disabled={disabled} aria-label="Details" title={panels.details ? "Close details" : "Open details"}
          aria-description={requirementsCount > 0 ? `${requirementsCount} required before publishing` : "Content and publishing details"}
          aria-controls={detailsId} aria-expanded={panels.details}
          onPointerDown={() => { if (phone) preparePanel("details"); }}
          onPointerCancel={() => { preparedPanel.current = null; }}
          onMouseDown={(event) => { if (phone) event.preventDefault(); }}
          onClick={() => togglePanel("details")}>
          {panels.details ? <X aria-hidden="true" /> : <SlidersHorizontal aria-hidden="true" />}
          {requirementsCount > 0 && <span className="editor-requirements-badge" aria-hidden="true">{requirementsCount}</span>}
        </Button>
      </div>
      </div>
  );
  const panelSurfaces = <>
        {outlinePresent && outline && (
          <div className="editor-frame-panel" data-side="outline" data-open={panels.outline} inert={!panels.outline} aria-hidden={!panels.outline}>
          <aside className="editor-frame-outline" aria-label="Course outline"
            onKeyDown={(event) => {
              if (disabled || event.key !== "Escape" || event.defaultPrevented) return;
              event.preventDefault();
              setPanels((current) => ({ ...current, outline: false }));
              returnToToggle(outlineToggle.current);
            }}>
            <h2 className="editor-floating-heading">Outline</h2>
            <ScrollRegion id={outlineId} className="editor-floating-body">{outline}</ScrollRegion>
          </aside>
          </div>
        )}
        {detailsPresent && <div className="editor-frame-panel" data-side="details" data-open={panels.details} inert={!panels.details} aria-hidden={!panels.details}>
          <aside className="editor-frame-details" aria-label="Content details" tabIndex={-1}
            onKeyDown={(event) => {
              if (disabled || event.key !== "Escape" || event.defaultPrevented) return;
              event.preventDefault();
              setPanels((current) => ({ ...current, details: false }));
              returnToToggle(detailsToggle.current);
            }}>
            <h2 className="editor-floating-heading">Details</h2>
            <ScrollRegion id={detailsId} className="editor-floating-body">{details}{recoverySection}{deleteAction}</ScrollRegion>
          </aside>
        </div>}
  </>;
  return (
    <EditorCompactControlsContext.Provider value={compactControls}>
    <EditorWritingActionsContext.Provider value={writingActionsHost}>
    <EditorMobileOverlayContext.Provider value={overlayHost}>
    <section ref={frame} className="editor-frame" data-panels={open} data-cards={phone || undefined} data-mobile={phone || undefined} data-outline={!!outline || undefined} aria-label="Writing workspace">
      {!phone && panelControls}
      {phone && <div className="editor-mobile-toolbar">
        {navigation && <div className="editor-mobile-navigation">{navigation}</div>}
        {panelControls}
        <div ref={setOverlayHost} className="editor-mobile-overlays">
          <div className="editor-mobile-panels">{panelSurfaces}</div>
        </div>
      </div>}
      <div className="editor-frame-body">
        {!phone && panelSurfaces}
        <div key="canvas" ref={canvas} className="editor-frame-canvas" onScroll={(event) => { event.currentTarget.dataset.navigationScrolled = event.currentTarget.scrollTop > 0 ? "true" : "false"; }}>{!phone && navigation && <div className="editor-canvas-navigation">{navigation}</div>}{children}</div>
      </div>
    </section>
    </EditorMobileOverlayContext.Provider>
    </EditorWritingActionsContext.Provider>
    </EditorCompactControlsContext.Provider>
  );
}

/** Compact metadata groups share one panel, without nested settings cards. */
export function EditorDetailsGroup({ id, title, description, children }: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="editor-details-group" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className="text-sm font-semibold">{title}</h3>
      {children}
      {description && <FieldDescription>{description}</FieldDescription>}
    </section>
  );
}
