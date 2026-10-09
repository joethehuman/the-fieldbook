"use client";

import { createContext, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ListTree, SlidersHorizontal, X } from "lucide-react";
import { MarkdownDownloadButton } from "./markdown-download";
import { Button } from "../ui/button";
import { FieldDescription } from "../ui/field";
import { ScrollRegion } from "./scroll-region";
import { revealEditorTarget } from "./reveal-editor-target";
import { blurWritingInput, captureWritingCursor, restoreWritingCursor, type WritingCursor } from "./writing-cursor";
import { useEditorCardsLayout, useMobileWritingDock } from "./use-editor-cards-layout";

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
  const dock = useMobileWritingDock();
  const frame = useRef<HTMLElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const [writingActionsHost, setWritingActionsHost] = useState<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const overlayLayer = useRef<HTMLDivElement>(null);
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setOverlayHost(frame.current?.closest<HTMLElement>(".app") || null); }, []);
  const hasNavigation = !!navigation;
  const [panels, setPanels] = useState({ outline: false, details: false });
  const panelState = useRef(panels);
  panelState.current = panels;
  const measureDock = useRef<(() => void) | null>(null);
  const lastWritingCursor = useRef<WritingCursor | null>(null);
  const panelReturn = useRef<WritingCursor | null>(null);
  const preparedPanel = useRef<"outline" | "details" | null>(null);
  function preparePanel(side: "outline" | "details") {
    if (!dock) return;
    if (!panelState.current.outline && !panelState.current.details) {
      const active = document.activeElement;
      const chooser = active instanceof Element && !!active.closest(".writing-slash-menu, .writing-media-chooser, .editor-frame-controls");
      // The popup's capture-phase dismissal can remove its focused input
      // before this button receives pointerdown, returning focus to body.
      panelReturn.current = captureWritingCursor(canvas.current) || (chooser || active === document.body ? lastWritingCursor.current : null);
    }
    preparedPanel.current = side;
  }
  function returnToWriting(toggle: HTMLButtonElement | null) {
    const cursor = panelReturn.current;
    panelReturn.current = null;
    if (!dock) toggle?.focus();
    else if (!restoreWritingCursor(cursor)) toggle?.focus({ preventScroll: true });
  }
  function togglePanel(side: "outline" | "details") {
    defaultsApplied.current = true;
    const closing = panelState.current[side];
    if (!closing && preparedPanel.current !== side) preparePanel(side);
    preparedPanel.current = null;
    if (!closing && dock) blurWritingInput();
    setPanels((current) => side === "outline"
      ? { outline: !current.outline, details: wide.current ? current.details : false }
      : { outline: wide.current ? current.outline : false, details: !current.details });
    if (closing && dock) returnToWriting(side === "outline" ? outlineToggle.current : detailsToggle.current);
  }
  useLayoutEffect(() => {
    const element = dock ? controls.current : canvas.current?.querySelector<HTMLElement>(".editor-canvas-navigation");
    if (!element) return;
    const owner = frame.current?.closest<HTMLElement>(".main-content");
    const header = frame.current?.closest(".app")?.querySelector<HTMLElement>(".topbar");
    let request = 0;
    let releaseRequest = 0;
    let layoutWidth = document.documentElement.clientWidth;
    let layoutHeight = document.documentElement.clientHeight;
    let keyboard = false;
    let lastDockTop: number | null = null;
    let lastDockBottom: number | null = null;
    let lastAppTop: number | null = null;
    const setStyle = (target: HTMLElement | null | undefined, name: string, value: string) => {
      if (target && target.style.getPropertyValue(name) !== value) target.style.setProperty(name, value);
    };
    // Apple can overlay an address pill and an input accessory row above the
    // keyboard without subtracting both from the reported visual viewport.
    const appleTouch = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
    const measure = () => {
      const viewport = window.visualViewport;
      const appBounds = overlayHost?.getBoundingClientRect();
      const rawTop = viewport?.offsetTop || 0;
      const height = viewport?.height || (dock ? document.documentElement.clientHeight : window.innerHeight);
      const bottom = dock && appBounds ? Math.min(rawTop + height, appBounds.bottom) : rawTop + height;
      const visibleTop = dock ? Math.max(0, bottom - height) : rawTop;
      let safeBottom = bottom;
      if (dock) {
        const width = document.documentElement.clientWidth;
        if (width !== layoutWidth) { layoutWidth = width; layoutHeight = document.documentElement.clientHeight; }
        const active = document.activeElement;
        const editing = active instanceof HTMLElement && (active.isContentEditable || active.matches("input:not([type=button]):not([type=checkbox]), textarea"));
        const occluded = layoutHeight - height;
        keyboard = (viewport?.scale || 1) === 1 && (keyboard ? occluded > 80 : editing && occluded > 120);
        if (!keyboard && !editing) layoutHeight = Math.max(document.documentElement.clientHeight, height);
        // Work directly in visible coordinates, relative to the positioned app.
        // This also compensates for native viewport panning of the app itself.
        setStyle(element, "--editor-dock-bottom", `${bottom - (appBounds?.top || 0)}px`);
        const centered = !viewport?.offsetLeft && Math.abs((viewport?.width || window.innerWidth) - (appBounds?.width || window.innerWidth)) < 1;
        const center = centered ? "50%" : `${(viewport?.offsetLeft || 0) + (viewport?.width || window.innerWidth) / 2 - (appBounds?.left || 0)}px`;
        setStyle(element, "--editor-dock-center", center);
        setStyle(overlayLayer.current, "--editor-panel-center", center);
        setStyle(element, "--editor-dock-gap", keyboard ? `max(${appleTouch ? 8 : 3}rem, env(safe-area-inset-bottom))` : "max(var(--space-3), env(safe-area-inset-bottom))");
        // Keep one stable bottom lane for controls, menus and scroll clearance.
        setStyle(element, "--editor-dock-anchor", "calc(var(--editor-dock-bottom) - var(--editor-dock-gap))");
        const lane = element.getBoundingClientRect();
        safeBottom = lane.bottom;
        setStyle(element, "--editor-usable-bottom", `${safeBottom}px`);
      }
      const rect = element.getBoundingClientRect();
      // Follow native viewport movement directly. Restarting a second animation
      // on every keyboard/pan frame makes the surface chase its actual anchor.
      const bounds = dock ? frame.current?.getBoundingClientRect() || rect : rect;
      const panelTop = dock ? Math.max(visibleTop, header?.getBoundingClientRect().bottom || 0, bounds.top - 8) + 8 : rect.bottom + 8;
      const panelBottom = dock ? rect.top - 8 : bottom - 16;
      if (dock) setStyle(owner, "--editor-dock-clearance", `${Math.max(80, bottom - safeBottom + rect.height + 12)}px`);
      setStyle(frame.current, "--editor-navigation-height", `${dock ? 0 : rect.height}px`);
      setStyle(overlayLayer.current, "--editor-panel-top", `${panelTop - (dock ? appBounds?.top || 0 : 0)}px`);
      setStyle(overlayLayer.current, "--editor-panel-left", `${bounds.left - (dock ? appBounds?.left || 0 : 0)}px`);
      setStyle(overlayLayer.current, "--editor-panel-right", `${dock && appBounds ? appBounds.right - bounds.right : window.innerWidth - bounds.right}px`);
      setStyle(overlayLayer.current, "--editor-panel-max-width", `${bounds.width}px`);
      setStyle(overlayLayer.current, "--editor-panel-available-height", `${Math.max(dock ? 0 : 80, panelBottom - panelTop)}px`);
      // Native panning can move the writing area while the dock returns to
      // the same screen position. Notify after that compensation as well.
      const appTop = appBounds?.top || 0;
      if (dock && (lastDockTop !== rect.top || lastDockBottom !== rect.bottom || lastAppTop !== appTop)) {
        lastDockTop = rect.top;
        lastDockBottom = rect.bottom;
        lastAppTop = appTop;
        owner?.dispatchEvent(new Event("fieldbook:editor-dock-change"));
      }
    };
    const tick = () => {
      request = 0;
      measure();
    };
    const schedule = () => {
      if (!dock) { measure(); return; }
      if (!request) request = requestAnimationFrame(tick);
    };
    const remember = () => {
      const cursor = captureWritingCursor(canvas.current);
      const active = document.activeElement;
      if (cursor) lastWritingCursor.current = cursor;
      else if (active instanceof HTMLElement && (active.isContentEditable || active.matches("input, textarea")) && !active.closest(".writing-media-chooser, .writing-slash-menu")) lastWritingCursor.current = null;
    };
    // Snapshot the document only at a control handoff, not on every typed
    // character. Tab can move into the dock without a pointer gesture.
    const rememberKeyboard = (event: KeyboardEvent) => { if (event.key === "Tab") remember(); };
    const released = () => {
      cancelAnimationFrame(releaseRequest);
      releaseRequest = requestAnimationFrame(() => { preparedPanel.current = null; schedule(); });
    };
    measureDock.current = measure;
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    const editor = frame.current?.closest(".editor");
    if (editor) observer.observe(editor);
    if (phone && header) observer.observe(header);
    owner?.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("resize", schedule);
    window.visualViewport?.addEventListener("scroll", schedule);
    if (dock) {
      window.addEventListener("scroll", schedule, { passive: true });
      document.addEventListener("focusin", schedule);
      document.addEventListener("focusout", schedule);
      element.addEventListener("pointerdown", remember, true);
      canvas.current?.addEventListener("fieldbook:writing-handoff", remember);
      document.addEventListener("keydown", rememberKeyboard, true);
      document.addEventListener("focusin", remember);
      document.addEventListener("pointerup", released);
    }
    return () => {
      cancelAnimationFrame(request);
      cancelAnimationFrame(releaseRequest);
      if (measureDock.current === measure) measureDock.current = null;
      observer.disconnect();
      if (dock) owner?.style.removeProperty("--editor-dock-clearance");
      owner?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      if (dock) {
        window.removeEventListener("scroll", schedule);
        document.removeEventListener("focusin", schedule);
        document.removeEventListener("focusout", schedule);
        element.removeEventListener("pointerdown", remember, true);
        canvas.current?.removeEventListener("fieldbook:writing-handoff", remember);
        document.removeEventListener("keydown", rememberKeyboard, true);
        document.removeEventListener("focusin", remember);
        document.removeEventListener("pointerup", released);
      }
    };
  }, [hasNavigation, phone, dock, overlayHost]);
  useLayoutEffect(() => { measureDock.current?.(); }, [panels.outline, panels.details]);
  const wide = useRef(false);
  const narrow = useRef(false);
  const outlineToggle = useRef<HTMLButtonElement>(null);
  const detailsToggle = useRef<HTMLButtonElement>(null);
  const outlineId = useId();
  const detailsId = useId();
  const dismissPanels = useCallback(() => setPanels({ outline: false, details: false }), []);
  const compactControls = useMemo(() => dock ? { panelsOpen: panels.outline || panels.details, dismissPanels } : null, [dock, panels.outline, panels.details, dismissPanels]);
  const defaultsApplied = useRef(false);
  const previousClearance = useRef({ outline: false, details: false });
  const hasOutline = !!outline;
  const outlinePresent = usePanelPresence(panels.outline && hasOutline);
  const detailsPresent = usePanelPresence(panels.details);
  useLayoutEffect(() => {
    const target = frame.current;
    const surface = canvas.current;
    if (!target || !surface) return;
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
      <div ref={controls} className="editor-frame-controls" data-cards={phone || undefined} data-dock={dock || undefined} role={dock ? "group" : undefined} aria-label={dock ? "Editor controls" : undefined}>
      <div className="editor-controls-surface">
        {outline && (
          <Button ref={outlineToggle} type="button" variant={dock ? "ghost" : "outline"} size="icon" className={`editor-panel-toggle size-11 ${dock ? "relative appearance-none rounded-xl border-transparent bg-transparent shadow-none hover:bg-accent disabled:bg-transparent disabled:border-transparent" : phone ? "relative rounded-full" : "absolute rounded-full"}`} data-side="outline"
            disabled={disabled} aria-label="Outline" title={panels.outline ? "Close outline" : "Open outline"}
            aria-controls={outlineId} aria-expanded={panels.outline}
            onPointerDown={() => { if (dock) preparePanel("outline"); }}
            onPointerCancel={() => { preparedPanel.current = null; measureDock.current?.(); }}
            onMouseDown={(event) => { if (dock) event.preventDefault(); }}
            onClick={() => togglePanel("outline")}>
            {panels.outline ? <X aria-hidden="true" /> : <ListTree aria-hidden="true" />}
          </Button>
        )}
        {phone && <div className="editor-writing-actions-host" ref={setWritingActionsHost} />}
        <Button ref={detailsToggle} type="button" variant={dock ? "ghost" : "outline"} size="icon" className={`editor-panel-toggle size-11 ${dock ? "relative appearance-none rounded-xl border-transparent bg-transparent shadow-none hover:bg-accent disabled:bg-transparent disabled:border-transparent" : phone ? "relative rounded-full" : "absolute rounded-full"}`} data-side="details"
          disabled={disabled} aria-label="Details" title={panels.details ? "Close details" : "Open details"}
          aria-description={requirementsCount > 0 ? `${requirementsCount} required before publishing` : "Content and publishing details"}
          aria-controls={detailsId} aria-expanded={panels.details}
          onPointerDown={() => { if (dock) preparePanel("details"); }}
          onPointerCancel={() => { preparedPanel.current = null; measureDock.current?.(); }}
          onMouseDown={(event) => { if (dock) event.preventDefault(); }}
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
              returnToWriting(outlineToggle.current);
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
              returnToWriting(detailsToggle.current);
            }}>
            <h2 className="editor-floating-heading">Details</h2>
            <ScrollRegion id={detailsId} className="editor-floating-body">{details}{recoverySection}{deleteAction}</ScrollRegion>
          </aside>
        </div>}
  </>;
  return (
    <EditorCompactControlsContext.Provider value={compactControls}>
    <EditorWritingActionsContext.Provider value={writingActionsHost}>
    <section ref={frame} className="editor-frame" data-panels={open} data-cards={phone || undefined} data-dock={dock || undefined} data-outline={!!outline || undefined} aria-label="Writing workspace">
      {!phone && panelControls}
      {dock && overlayHost && createPortal(panelControls, overlayHost)}
      <div className="editor-frame-body">
        {!phone && panelSurfaces}
        <div key="canvas" ref={canvas} className="editor-frame-canvas" onScroll={(event) => { event.currentTarget.dataset.navigationScrolled = event.currentTarget.scrollTop > 0 ? "true" : "false"; }}>{!dock && (navigation || phone) && <div className="editor-canvas-navigation">{!phone && navigation}{phone && panelControls}</div>}{children}</div>
      </div>
      {phone && overlayHost && createPortal(<div ref={overlayLayer} className="editor-mobile-panels" data-dock={dock || undefined}>{panelSurfaces}</div>, overlayHost)}
    </section>
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
