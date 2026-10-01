"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen } from "lucide-react";
import { Button } from "../ui/button";
import { FieldDescription } from "../ui/field";
import { useScrollFade } from "./use-scroll-fade";
import { revealEditorTarget } from "./reveal-editor-target";

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
  outline,
  outlineContext,
  heading,
  details,
  requirementsCount = 0,
  revealDetails,
  revealCanvas,
  revealOutline,
  disabled = false,
  children,
}: {
  outline?: ReactNode;
  outlineContext?: string;
  heading?: ReactNode;
  details: ReactNode;
  requirementsCount?: number;
  revealDetails?: DetailsReveal;
  revealCanvas?: number;
  revealOutline?: number;
  disabled?: boolean;
  children: ReactNode;
}) {
  const frame = useRef<HTMLElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const wide = useRef(false);
  const narrow = useRef(false);
  const outlineToggle = useRef<HTMLButtonElement>(null);
  const detailsToggle = useRef<HTMLButtonElement>(null);
  const outlineId = useId();
  const detailsId = useId();
  const [panels, setPanels] = useState({ outline: !!outline, details: false });
  const outlinePresent = usePanelPresence(panels.outline && !!outline);
  const detailsPresent = usePanelPresence(panels.details);
  const outlineFade = useScrollFade<HTMLElement>(panels.outline && !!outline);
  const detailsFade = useScrollFade<HTMLElement>(panels.details);
  const [canvasScrolled, setCanvasScrolled] = useState(false);
  const measureCanvasFade = useCallback(() => {
    const surface = canvas.current;
    const boundary = controls.current;
    setCanvasScrolled(!!surface && !!boundary && surface.getBoundingClientRect().top < boundary.getBoundingClientRect().bottom - 2);
    const target = frame.current;
    const viewport = target?.closest<HTMLElement>(".main-content");
    if (target && viewport && surface && boundary) {
      const style = getComputedStyle(target);
      const stop = viewport.getBoundingClientRect().top + viewport.clientTop
        + (parseFloat(style.getPropertyValue("--editor-header-height")) || 0)
        + boundary.getBoundingClientRect().height + (parseFloat(style.rowGap) || 0);
      target.dataset.writingPinned = String(surface.getBoundingClientRect().top <= stop + 1);
    }
  }, []);

  useEffect(() => {
    const target = frame.current;
    if (!target) return;
    const viewport = target.closest<HTMLElement>(".main-content");
    const measure = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const width = target.getBoundingClientRect().width;
      const controlsHeight = controls.current?.getBoundingClientRect().height || 48;
      const headerHeight = parseFloat(getComputedStyle(target).getPropertyValue("--editor-header-height")) || 0;
      const bottomInset = viewport ? parseFloat(getComputedStyle(viewport).paddingBottom) || 0 : 0;
      const available = (viewport?.clientHeight || window.innerHeight) - headerHeight - controlsHeight - rem * 0.75 - bottomInset;
      target.style.setProperty("--editor-controls-height", `${controlsHeight}px`);
      if (viewport) target.style.setProperty("--editor-viewport-height", `${viewport.clientHeight}px`);
      target.dataset.writingScroll = available >= 12 * rem ? "contained" : "page";
      wide.current = width >= 78 * rem;
      narrow.current = width < 48 * rem;
      measureCanvasFade();
      if (!wide.current)
        setPanels((current) => current.outline && current.details
          ? { outline: true, details: false } : current);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(target);
    if (controls.current) observer.observe(controls.current);
    if (canvas.current) observer.observe(canvas.current);
    if (viewport) observer.observe(viewport);
    viewport?.addEventListener("scroll", measureCanvasFade, { passive: true });
    return () => {
      observer.disconnect();
      viewport?.removeEventListener("scroll", measureCanvasFade);
    };
  }, [measureCanvasFade]);

  useEffect(() => {
    if (!revealDetails) return;
    setPanels((current) => ({ outline: wide.current && current.outline, details: true }));
    let cancelReveal: (() => void) | undefined;
    const request = requestAnimationFrame(() => {
      const section = revealDetails.field
        ? document.getElementById(revealDetails.field)
        : document.getElementById(detailsId);
      const target = section?.matches('input, button, textarea, [tabindex="0"]') ? section
        : section?.querySelector<HTMLElement>('input, button, textarea, [tabindex="0"]');
      const control = target || section;
      if (control) cancelReveal = revealEditorTarget(control, {
        container: document.getElementById(detailsId),
        context: section && section !== control ? section
          : control.closest<HTMLElement>('[data-slot="field"]') || control,
      });
    });
    return () => { cancelAnimationFrame(request); cancelReveal?.(); };
  }, [revealDetails, detailsId]);

  useLayoutEffect(() => {
    if (!revealCanvas) return;
    setPanels((current) => ({
      outline: narrow.current ? false : current.outline,
      details: narrow.current ? false : current.details,
    }));
  }, [revealCanvas]);

  useEffect(() => {
    if (!revealOutline) return;
    setPanels((current) => ({ outline: true, details: wide.current && current.details }));
    let cancelReveal: (() => void) | undefined;
    const request = requestAnimationFrame(() => {
      const section = document.getElementById(outlineId);
      const target = section?.querySelector<HTMLElement>('button:not(:disabled)');
      if (target && section) cancelReveal = revealEditorTarget(target, { container: section });
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
        container: section,
        context: selected.closest<HTMLElement>(".course-builder-steps > div") || selected,
        focus: false,
      });
    });
    return () => { cancelAnimationFrame(request); cancelReveal?.(); };
  }, [panels.outline, outlineContext, outlineId, revealCanvas]);

  const open = panels.outline ? panels.details ? "both" : "outline" : panels.details ? "details" : "none";
  return (
    <section ref={frame} className="editor-frame" data-panels={open} aria-label="Writing workspace">
      <div ref={controls} className="editor-frame-controls" data-heading={heading ? "true" : undefined} data-canvas-scrolled={canvasScrolled}>
        {outline && (
          <Button ref={outlineToggle} type="button" variant="ghost" size="sm"
            disabled={disabled}
            aria-controls={outlineId} aria-expanded={panels.outline}
            onClick={() => setPanels((current) => ({
              outline: !current.outline,
              details: wide.current ? current.details : false,
            }))}>
            {panels.outline ? <PanelLeftClose aria-hidden="true" /> : <PanelLeftOpen aria-hidden="true" />}
            Outline{outlineContext && <span className="text-muted-foreground">· {outlineContext}</span>}
          </Button>
        )}
        {heading && <div className="editor-frame-heading">{heading}</div>}
        <Button ref={detailsToggle} type="button" variant="ghost" size="sm" className="ml-auto"
          disabled={disabled}
          aria-controls={detailsId} aria-expanded={panels.details}
          onClick={() => setPanels((current) => ({
            outline: wide.current ? current.outline : false,
            details: !current.details,
          }))}>
          Details{requirementsCount > 0 && <span className="text-muted-foreground" role="status">· {requirementsCount} required</span>}
          {panels.details ? <PanelRightClose aria-hidden="true" /> : <PanelRightOpen aria-hidden="true" />}
        </Button>
      </div>
      <div className="editor-frame-body">
        {outlinePresent && outline && (
          <div className="editor-frame-panel" data-side="outline" data-open={panels.outline} inert={!panels.outline} aria-hidden={!panels.outline}>
          <aside ref={outlineFade.ref} id={outlineId} className="editor-frame-outline scroll-fade" aria-label="Course outline"
            data-scroll-fade-before={outlineFade.edges.before} data-scroll-fade-after={outlineFade.edges.after}
            onScroll={outlineFade.measure}
            onKeyDown={(event) => {
              if (disabled || event.key !== "Escape" || event.defaultPrevented) return;
              event.preventDefault();
              setPanels((current) => ({ ...current, outline: false }));
              outlineToggle.current?.focus();
            }}>
            {outline}
          </aside>
          </div>
        )}
        {detailsPresent && <div className="editor-frame-panel" data-side="details" data-open={panels.details} inert={!panels.details} aria-hidden={!panels.details}>
          <aside ref={detailsFade.ref} id={detailsId} className="editor-frame-details scroll-fade" aria-label="Content details" tabIndex={-1}
            data-scroll-fade-before={detailsFade.edges.before} data-scroll-fade-after={detailsFade.edges.after}
            onScroll={detailsFade.measure}
            onKeyDown={(event) => {
              if (disabled || event.key !== "Escape" || event.defaultPrevented) return;
              event.preventDefault();
              setPanels((current) => ({ ...current, details: false }));
              detailsToggle.current?.focus();
            }}>
            {details}
          </aside>
        </div>}
        <div key="canvas" ref={canvas} className="editor-frame-canvas">{children}</div>
      </div>
    </section>
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
