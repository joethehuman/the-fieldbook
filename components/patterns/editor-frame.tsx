"use client";

import { createContext, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ListTree, SlidersHorizontal, X } from "lucide-react";
import { MarkdownDownloadButton } from "./markdown-download";
import { Button } from "../ui/button";
import { FieldDescription } from "../ui/field";
import { ScrollRegion } from "./scroll-region";
import { revealEditorTarget } from "./reveal-editor-target";
import { useEditorCardsLayout } from "./use-editor-cards-layout";

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
  const overlayLayer = useRef<HTMLDivElement>(null);
  const [overlayHost, setOverlayHost] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => { setOverlayHost(frame.current?.closest<HTMLElement>(".app") || null); }, []);
  const hasNavigation = !!navigation;
  useLayoutEffect(() => {
    const element = phone ? controls.current : canvas.current?.querySelector<HTMLElement>(".editor-canvas-navigation");
    if (!element) return;
    const owner = frame.current?.closest<HTMLElement>(".main-content");
    const header = frame.current?.closest(".app")?.querySelector<HTMLElement>(".topbar");
    let request = 0;
    let followUntil = 0;
    let layoutWidth = document.documentElement.clientWidth;
    let layoutHeight = document.documentElement.clientHeight;
    let keyboard = false;
    const measure = () => {
      const viewport = window.visualViewport;
      const appBounds = overlayHost?.getBoundingClientRect();
      const rawTop = viewport?.offsetTop || 0;
      const height = viewport?.height || (phone ? document.documentElement.clientHeight : window.innerHeight);
      const bottom = phone && appBounds ? Math.min(rawTop + height, appBounds.bottom) : rawTop + height;
      const visibleTop = phone ? Math.max(0, bottom - height) : rawTop;
      if (phone) {
        const width = document.documentElement.clientWidth;
        if (width !== layoutWidth) { layoutWidth = width; layoutHeight = document.documentElement.clientHeight; }
        const active = document.activeElement;
        const editing = active instanceof HTMLElement && (active.isContentEditable || active.matches("input:not([type=button]):not([type=checkbox]), textarea"));
        const occluded = layoutHeight - height;
        keyboard = (viewport?.scale || 1) === 1 && (keyboard ? occluded > 80 : editing && occluded > 120);
        if (!keyboard && !editing) layoutHeight = Math.max(document.documentElement.clientHeight, height);
        // Work directly in visible coordinates, relative to the positioned app.
        // This also compensates for native viewport panning of the app itself.
        element.style.setProperty("--editor-dock-bottom", `${bottom - (appBounds?.top || 0)}px`);
        const centered = !viewport?.offsetLeft && Math.abs((viewport?.width || window.innerWidth) - (appBounds?.width || window.innerWidth)) < 1;
        element.style.setProperty("--editor-dock-center", centered ? "50%" : `${(viewport?.offsetLeft || 0) + (viewport?.width || window.innerWidth) / 2 - (appBounds?.left || 0)}px`);
        element.style.setProperty("--editor-dock-gap", keyboard ? "max(3rem, env(safe-area-inset-bottom))" : "max(var(--space-3), env(safe-area-inset-bottom))");
      }
      const rect = element.getBoundingClientRect();
      const bounds = phone ? frame.current?.getBoundingClientRect() || rect : rect;
      const panelTop = phone ? Math.max(visibleTop, header?.getBoundingClientRect().bottom || 0, bounds.top - 8) + 8 : rect.bottom + 8;
      const panelBottom = phone ? rect.top - 8 : bottom - 16;
      if (phone) owner?.style.setProperty("--editor-dock-clearance", `${Math.max(80, bottom - rect.top + 12)}px`);
      frame.current?.style.setProperty("--editor-navigation-height", `${phone ? 0 : rect.height}px`);
      overlayLayer.current?.style.setProperty("--editor-panel-top", `${panelTop - (phone ? appBounds?.top || 0 : 0)}px`);
      overlayLayer.current?.style.setProperty("--editor-panel-left", `${bounds.left - (phone ? appBounds?.left || 0 : 0)}px`);
      overlayLayer.current?.style.setProperty("--editor-panel-right", `${phone && appBounds ? appBounds.right - bounds.right : window.innerWidth - bounds.right}px`);
      overlayLayer.current?.style.setProperty("--editor-panel-max-width", `${bounds.width}px`);
      overlayLayer.current?.style.setProperty("--editor-panel-available-height", `${Math.max(80, panelBottom - panelTop)}px`);
    };
    const tick = () => {
      request = 0;
      measure();
      if (performance.now() < followUntil) request = requestAnimationFrame(tick);
    };
    const schedule = () => {
      if (!phone) { measure(); return; }
      if (!request) request = requestAnimationFrame(tick);
    };
    const settle = () => { followUntil = performance.now() + 700; schedule(); };
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
    if (phone) {
      window.addEventListener("scroll", settle, { passive: true });
      document.addEventListener("focusin", settle);
      document.addEventListener("focusout", settle);
      document.addEventListener("touchend", settle, { passive: true });
    }
    return () => {
      cancelAnimationFrame(request);
      observer.disconnect();
      if (phone) owner?.style.removeProperty("--editor-dock-clearance");
      owner?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("scroll", schedule);
      if (phone) {
        window.removeEventListener("scroll", settle);
        document.removeEventListener("focusin", settle);
        document.removeEventListener("focusout", settle);
        document.removeEventListener("touchend", settle);
      }
    };
  }, [hasNavigation, phone, overlayHost]);
  const wide = useRef(false);
  const narrow = useRef(false);
  const outlineToggle = useRef<HTMLButtonElement>(null);
  const detailsToggle = useRef<HTMLButtonElement>(null);
  const outlineId = useId();
  const detailsId = useId();
  const [panels, setPanels] = useState({ outline: false, details: false });
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
      wide.current = bounds.width >= 2 * panelWidth + 16;
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
        {outline && (
          <Button ref={outlineToggle} type="button" variant={phone ? "ghost" : "outline"} size="icon" className={`editor-panel-toggle size-11 ${phone ? "relative appearance-none rounded-xl border-transparent bg-transparent shadow-none hover:bg-accent disabled:bg-transparent disabled:border-transparent" : "absolute rounded-full"}`} data-side="outline"
            disabled={disabled} aria-label="Outline" title={panels.outline ? "Close outline" : "Open outline"}
            aria-controls={outlineId} aria-expanded={panels.outline}
            onClick={() => { defaultsApplied.current = true; setPanels((current) => ({ outline: !current.outline, details: wide.current ? current.details : false })); }}>
            {panels.outline ? <X aria-hidden="true" /> : <ListTree aria-hidden="true" />}
          </Button>
        )}
        {phone && <div className="editor-writing-actions-host" ref={setWritingActionsHost} />}
        <Button ref={detailsToggle} type="button" variant={phone ? "ghost" : "outline"} size="icon" className={`editor-panel-toggle size-11 ${phone ? "relative appearance-none rounded-xl border-transparent bg-transparent shadow-none hover:bg-accent disabled:bg-transparent disabled:border-transparent" : "absolute rounded-full"}`} data-side="details"
          disabled={disabled} aria-label="Details" title={panels.details ? "Close details" : "Open details"}
          aria-description={requirementsCount > 0 ? `${requirementsCount} required before publishing` : "Content and publishing details"}
          aria-controls={detailsId} aria-expanded={panels.details}
          onClick={() => {
            defaultsApplied.current = true;
            setPanels((current) => ({ outline: wide.current ? current.outline : false, details: !current.details }));
          }}>
          {panels.details ? <X aria-hidden="true" /> : <SlidersHorizontal aria-hidden="true" />}
          {requirementsCount > 0 && <span className="editor-requirements-badge" aria-hidden="true">{requirementsCount}</span>}
        </Button>
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
              outlineToggle.current?.focus();
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
              detailsToggle.current?.focus();
            }}>
            <h2 className="editor-floating-heading">Details</h2>
            <ScrollRegion id={detailsId} className="editor-floating-body">{details}{recoverySection}{deleteAction}</ScrollRegion>
          </aside>
        </div>}
  </>;
  return (
    <EditorCompactControlsContext.Provider value={compactControls}>
    <EditorWritingActionsContext.Provider value={writingActionsHost}>
    <section ref={frame} className="editor-frame" data-panels={open} data-cards={phone || undefined} data-outline={!!outline || undefined} aria-label="Writing workspace">
      {!phone && panelControls}
      {phone && overlayHost && createPortal(panelControls, overlayHost)}
      <div className="editor-frame-body">
        {!phone && panelSurfaces}
        <div key="canvas" ref={canvas} className="editor-frame-canvas" onScroll={(event) => { event.currentTarget.dataset.navigationScrolled = event.currentTarget.scrollTop > 0 ? "true" : "false"; }}>{!phone && navigation && <div className="editor-canvas-navigation">{navigation}</div>}{children}</div>
      </div>
      {phone && overlayHost && createPortal(<div ref={overlayLayer} className="editor-mobile-panels">{panelSurfaces}</div>, overlayHost)}
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
