"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download } from "lucide-react";
import { Button } from "../components/ui/button";

type Capture = { read: () => object; dispose: () => void };

/** Opt-in demo diagnostics. Never collect text, saved records, URLs or credentials. */
function captureGeometry(): Capture {
  const rows: object[] = [];
  const started = performance.now();
  let frame = 0;
  let revision: string | null = null;
  let disposed = false;
  void fetch("/fieldbook-build.json").then(response => response.json())
    .then(marker => { if (!disposed && typeof marker.revision === "string") revision = marker.revision; }).catch(() => {});
  const probe = document.createElement("span");
  probe.setAttribute("aria-hidden", "true");
  probe.style.cssText = "position:fixed;top:0;left:0;width:1px;height:1px;visibility:hidden;pointer-events:none";
  document.body.append(probe);
  const box = (element: Element | null) => {
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, left: rect.left, width: rect.width, height: rect.height };
  };
  const kind = (element: Element | null) => element?.closest(".cm-content") ? "code"
    : element?.closest("td, th") ? "table-cell"
    : element?.matches(".writing-content") ? "prose"
    : element?.matches("input, textarea") ? "field" : "controls";
  function record(reason: string) {
    if (disposed) return;
    const toolbar = document.querySelector<HTMLElement>(".editor-mobile-toolbar");
    const viewport = window.visualViewport;
    const active = document.activeElement;
    const selection = window.getSelection();
    rows.push({ time: Math.round(performance.now() - started), reason,
      window: { scrollY, innerHeight, rootScroll: document.documentElement.scrollTop,
        bodyScroll: document.body.scrollTop, clientHeight: document.documentElement.clientHeight },
      viewport: viewport && { height: viewport.height, width: viewport.width, offsetTop: viewport.offsetTop,
        offsetLeft: viewport.offsetLeft, pageTop: viewport.pageTop, scale: viewport.scale },
      fixedOrigin: box(probe), body: box(document.body), slot: box(document.querySelector(".editor-mobile-toolbar-slot")),
      toolbar: toolbar && { ...box(toolbar), position: getComputedStyle(toolbar).position,
        top: getComputedStyle(toolbar).top, offset: toolbar.style.getPropertyValue("--editor-toolbar-top"),
        pinned: toolbar.hasAttribute("data-pinned") },
      frame: box(document.querySelector(".editor-frame")),
      focus: kind(active), caret: selection?.rangeCount ? boxRange(selection.getRangeAt(0)) : null,
      blocks: Array.from(document.querySelectorAll(".writing-code-block, .writing-table-block"))
        .slice(-6).map(block => ({ kind: block.matches(".writing-code-block") ? "code" : "table", ...box(block) })),
    });
    if (rows.length > 6000) rows.shift();
  }
  function boxRange(range: Range) {
    const rect = range.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, height: rect.height, collapsed: range.collapsed };
  }
  function sample(reason: string) {
    if (disposed) return;
    rows.push({ time: Math.round(performance.now() - started), reason });
    if (rows.length > 6000) rows.shift();
    // Read geometry once per frame, rather than forcing layout for each event.
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; record("frame"); });
  }
  const off: (() => void)[] = [];
  function listen(target: EventTarget, name: string, prefix = "") {
    const handler = () => sample(prefix + name);
    target.addEventListener(name, handler, { capture: true, passive: true });
    off.push(() => target.removeEventListener(name, handler, true));
  }
  ["scroll", "resize", "pageshow"].forEach(name => listen(window, name, "window:"));
  ["focusin", "focusout", "selectionchange", "touchstart", "touchmove", "touchend", "beforeinput"]
    .forEach(name => listen(document, name, "document:"));
  if (window.visualViewport) ["scroll", "resize", "scrollend"].forEach(name => listen(window.visualViewport!, name, "viewport:"));
  const styles = new MutationObserver(records => {
    if (records.some(({ target }) => target instanceof Element && target.matches(".editor-mobile-toolbar, .editor-mobile-toolbar-slot"))) sample("toolbar:style");
  });
  styles.observe(document.body, { attributes: true, subtree: true, attributeFilter: ["style", "data-pinned"] });
  // Record script scroll requests without changing their arguments or native behavior.
  for (const name of ["scrollBy", "scrollTo"] as const) {
    const original = window[name];
    const wrapped = function (this: Window, ...args: Parameters<typeof original>) {
      sample(`script:window.${name}`);
      return Reflect.apply(original, this, args);
    } as typeof original;
    window[name] = wrapped;
    off.push(() => { if (window[name] === wrapped) window[name] = original; });
  }
  const original = Element.prototype.scrollIntoView;
  const wrapped = function (this: Element, ...args: Parameters<typeof original>) {
    sample(`script:scrollIntoView:${kind(this)}`);
    return Reflect.apply(original, this, args);
  };
  Element.prototype.scrollIntoView = wrapped;
  off.push(() => { if (Element.prototype.scrollIntoView === wrapped) Element.prototype.scrollIntoView = original; });
  record("start");
  return {
    read: () => ({ version: 1, revision, userAgent: navigator.userAgent, rows: [...rows] }),
    dispose: () => { disposed = true; cancelAnimationFrame(frame); styles.disconnect(); off.forEach(remove => remove()); probe.remove(); },
  };
}

/** The diagnostic control mounts once; geometry events never render React state. */
export default function EditorGeometryCapture() {
  const capture = useRef<Capture | null>(null);
  const mountedHost = useRef<Element | null>(null);
  const [host, setHost] = useState<Element | null>(null);
  useEffect(() => {
    if (new URLSearchParams(location.search).get("editorGeometry") !== "1") return;
    capture.current = captureGeometry();
    const findHost = () => {
      const next = document.querySelector(".editor-mobile-toolbar .editor-frame-controls");
      if (mountedHost.current !== next) { mountedHost.current = next; setHost(next); }
    };
    const mounts = new MutationObserver(findHost);
    mounts.observe(document.body, { childList: true, subtree: true });
    findHost();
    return () => { mounts.disconnect(); capture.current?.dispose(); capture.current = null; };
  }, []);
  async function share() {
    const data = capture.current?.read();
    if (!data) return;
    const file = new File([JSON.stringify(data)], "editor-geometry.json", { type: "application/json" });
    if (navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "Editor geometry" }); return; }
      catch (error) { if (error instanceof Error && error.name === "AbortError") return; }
    }
    const url = URL.createObjectURL(file);
    const link = document.createElement("a"); link.href = url; link.download = file.name;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  }
  return host ? createPortal(<Button type="button" variant="ghost" size="icon" aria-label="Share editor geometry trace" title="Share editor geometry trace" onClick={() => { void share(); }}>
    <Download aria-hidden="true" />
  </Button>, host) : null;
}
