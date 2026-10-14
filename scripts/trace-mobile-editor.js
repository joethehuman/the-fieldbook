/*
 * Optional browser-console diagnostic; never imported by the application.
 * Paste this file into Safari's Web Inspector console for the connected phone.
 * Run fieldbookEditorTrace.start(), reproduce one short interaction, then run
 * fieldbookEditorTrace.stop() and copy(fieldbookEditorTrace.export()). If the
 * console has no copy(), evaluate fieldbookEditorTrace.export() and save the
 * returned JSON string. Re-pasting or calling fieldbookEditorTrace.dispose()
 * restores every patched browser API.
 *
 * Records geometry and native/model selection ownership only: no text, values,
 * editor node keys, keyboard keys, labels,
 * element IDs, attributes containing content, page URLs, or source URLs.
 * Instrumentation can affect timing; compare with an uninstrumented recording.
 */
(() => {
  "use strict";
  window.fieldbookEditorTrace?.dispose();

  const surfaces = [
    ["code", ".cm-content"],
    ["source", "textarea.writing-source"],
    ["title", "textarea.document-title"],
    ["table-cell", "td [contenteditable], th [contenteditable]"],
    ["prose", ".writing-content[contenteditable]"],
    ["quiz", ".course-quiz-canvas input, .course-quiz-canvas textarea"],
    ["toolbar", ".editor-mobile-toolbar"],
    ["save", ".editor-save-status"],
    ["header", ".topbar"],
    ["canvas", ".main-content"],
    ["shell", ".main-shell"],
    ["app", ".app"],
  ];
  let records = [];
  let dropped = 0;
  let sequence = 0;
  let running = false;
  let started = 0;
  let frame = 0;
  let stopTimer = 0;
  let activeUntil = 0;
  let limit = 6000;
  let tail = 700;
  let restorers = [];

  const number = value => Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  const rect = box => box ? ({ x: number(box.x), y: number(box.y), top: number(box.top), right: number(box.right), bottom: number(box.bottom), left: number(box.left), width: number(box.width), height: number(box.height) }) : null;
  const element = node => node instanceof Element ? node : node?.parentElement || null;
  function describe(node) {
    if (node === window) return { kind: "window" };
    if (node === document) return { kind: "document" };
    if (node === window.visualViewport) return { kind: "visual-viewport" };
    const target = element(node);
    if (!target) return null;
    const kind = surfaces.find(([, selector]) => target.closest(selector))?.[0] || target.localName;
    const path = [];
    for (let current = target; current && path.length < 9; current = current.parentElement) {
      let index = 0;
      for (let sibling = current.previousElementSibling; sibling; sibling = sibling.previousElementSibling) index++;
      path.push(`${current.localName}:${index}`);
      if (current === document.body) break;
    }
    return { kind, path: path.reverse().join("/"), nodeType: node.nodeType };
  }
  function stack() {
    // Preserve function and line/column, but remove every source path/URL.
    return String(new Error().stack || "").split("\n").slice(2, 12).map(line => {
      const position = line.match(/:(\d+):(\d+)\)?$/);
      const name = line.trim().replace(/^at\s+/, "").split(/[@(\s]/)[0];
      return { function: /^[\w.$<>]+$/.test(name) ? name : "anonymous", line: position ? +position[1] : null, column: position ? +position[2] : null };
    });
  }
  function record(type, data) {
    if (!running) return;
    if (records.length >= limit) { records.shift(); dropped++; }
    records.push({ sequence: sequence++, ms: number(performance.now() - started), type, ...data });
  }
  function wake() {
    if (!running) return;
    activeUntil = performance.now() + tail;
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function viewport() {
    const view = window.visualViewport;
    return { width: number(view?.width ?? innerWidth), height: number(view?.height ?? innerHeight), offsetTop: number(view?.offsetTop ?? 0), offsetLeft: number(view?.offsetLeft ?? 0), pageTop: number(view?.pageTop ?? scrollY), pageLeft: number(view?.pageLeft ?? scrollX), scale: number(view?.scale ?? 1), innerWidth, innerHeight, scrollX: number(scrollX), scrollY: number(scrollY), devicePixelRatio: number(devicePixelRatio) };
  }
  function box(target) {
    if (!target) return null;
    const style = getComputedStyle(target);
    return { ...describe(target), bounds: rect(target.getBoundingClientRect()), scrollTop: number(target.scrollTop), scrollLeft: number(target.scrollLeft), maxScrollTop: number(Math.max(0, target.scrollHeight - target.clientHeight)), maxScrollLeft: number(Math.max(0, target.scrollWidth - target.clientWidth)), clientHeight: target.clientHeight, clientWidth: target.clientWidth, offsetParent: describe(target.offsetParent), css: { position: style.position, top: style.top, left: style.left, width: style.width, height: style.height, overflowX: style.overflowX, overflowY: style.overflowY, transform: style.transform, contain: style.contain, willChange: style.willChange, perspective: style.perspective, filter: style.filter === "none" ? "none" : "present", display: style.display, visibility: style.visibility, opacity: style.opacity, zIndex: style.zIndex, scrollBehavior: style.scrollBehavior, overflowAnchor: style.overflowAnchor } };
  }
  function hit(target, view) {
    const bounds = target.getBoundingClientRect();
    const x = bounds.left + bounds.width / 2;
    const y = bounds.top + bounds.height / 2;
    // WebKit client coordinates differ for some visual-viewport/fixed cases.
    // Record both conventions and actual hit agreement; never silently apply
    // an offset twice or infer painted placement solely from DOM scroll zero.
    const candidates = [{ basis: "raw-client", x, y }];
    if (view.offsetTop || view.offsetLeft) candidates.push({ basis: "minus-visual-origin", x: x - view.offsetLeft, y: y - view.offsetTop });
    return { target: describe(target), bounds: rect(bounds), probes: candidates.map(point => {
      const found = document.elementFromPoint(point.x, point.y);
      return { basis: point.basis, x: number(point.x), y: number(point.y), withinVisualSize: point.x >= 0 && point.y >= 0 && point.x < view.width && point.y < view.height, matches: !!found && (found === target || target.contains(found)), hit: describe(found) };
    }) };
  }
  function models(active, native) {
    const output = [];
    const seen = new Set();
    const seeds = [active, native?.anchorNode, native?.focusNode];
    for (const seed of seeds) {
      const code = element(seed)?.closest(".cm-content");
      if (code && !seen.has(code)) {
        seen.add(code);
        try {
          // Installed CodeMirror attaches a tile to contentDOM. The root getter
          // only walks its parents; domAtPos only reads the rendered tile tree.
          const view = code.cmTile?.root?.view;
          if (!view?.state?.selection?.main || typeof view.domAtPos !== "function") throw new Error();
          const range = view.state.selection.main;
          const point = (position, nativeNode, nativeOffset) => {
            if (view.state.doc.length && !view.visibleRanges?.some(value => position >= value.from && position <= value.to)) return { available: false };
            const mapped = view.domAtPos(position);
            return { available: true, node: describe(mapped.node), offset: number(mapped.offset), matchesNative: mapped.node === nativeNode && mapped.offset === nativeOffset };
          };
          output.push({ family: "codemirror", available: true, root: describe(code), focused: active === code, kind: range.anchor === range.head ? "cursor" : "range", anchor: number(range.anchor), head: number(range.head), rangeCount: view.state.selection.ranges.length, anchorDOM: point(range.anchor, native?.anchorNode, native?.anchorOffset), focusDOM: point(range.head, native?.focusNode, native?.focusOffset) });
        } catch { output.push({ family: "codemirror", available: false, root: describe(code) }); }
      }
      for (let root = element(seed); root; root = root.parentElement) {
        const editor = root.__lexicalEditor;
        if (!editor || seen.has(editor)) continue;
        seen.add(editor);
        try {
          // Read the already committed selection/map directly. Calling read(),
          // update(), or serialization is unnecessary and could flush work.
          if (!editor._editorState || !editor._keyToDOMMap?.get) throw new Error();
          const current = editor._editorState._selection;
          const point = (value, nativeNode) => {
            const mapped = editor._keyToDOMMap.get(value.key);
            return { type: value.type === "text" || value.type === "element" ? value.type : "unknown", offset: number(value.offset), node: describe(mapped), containsNative: !!mapped && !!nativeNode && (mapped === nativeNode || mapped.contains(nativeNode)) };
          };
          const details = current === null ? { kind: "none" }
            : current?.anchor && current?.focus ? { kind: "range", collapsed: current.anchor.key === current.focus.key && current.anchor.offset === current.focus.offset, anchor: point(current.anchor, native?.anchorNode), focus: point(current.focus, native?.focusNode) }
              : current?._nodes instanceof Set ? { kind: "node", count: current._nodes.size, nodes: Array.from(current._nodes).slice(0, 16).map(key => describe(editor._keyToDOMMap.get(key))) }
                : { kind: "unknown" };
          output.push({ family: "lexical", available: true, root: describe(root), focused: active === root, ...details });
        } catch { output.push({ family: "lexical", available: false, root: describe(root) }); }
      }
    }
    for (const family of ["codemirror", "lexical"]) if (!output.some(value => value.family === family)) output.push({ family, available: false });
    return output;
  }
  function selection() {
    const native = window.getSelection();
    const active = document.activeElement;
    const editable = node => element(node)?.closest('[contenteditable="true"]') || null;
    const field = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
    let fieldSelection = null;
    if (field) {
      try { fieldSelection = { start: active.selectionStart, end: active.selectionEnd, direction: active.selectionDirection }; } catch { /* Unsupported input type. */ }
    }
    let focusBounds = null;
    if (native?.rangeCount && native.focusNode) {
      try {
        const range = document.createRange();
        range.setStart(native.focusNode, native.focusOffset);
        range.collapse(true);
        focusBounds = Array.from(range.getClientRects()).filter(value => value.height > 0).slice(0, 2).map(rect);
      } catch { /* Selection changed between reads. */ }
    }
    return { active: describe(active), activeEditable: describe(editable(active)), fieldSelection, rangeCount: native?.rangeCount ?? 0, collapsed: native?.isCollapsed ?? null, anchor: describe(native?.anchorNode), anchorOffset: native?.anchorOffset ?? null, focus: describe(native?.focusNode), focusOffset: native?.focusOffset ?? null, anchorEditable: describe(editable(native?.anchorNode)), focusEditable: describe(editable(native?.focusNode)), focusBelongsToActiveEditable: !!native?.focusNode && editable(native.focusNode) === active, focusBounds, models: models(active, native) };
  }
  function snapshot(reason) {
    const view = viewport();
    const header = document.querySelector(".topbar");
    const toolbar = document.querySelector(".editor-mobile-toolbar");
    const save = document.querySelector(".editor-save-status");
    const active = element(document.activeElement);
    const ancestors = [];
    for (let current = active; current && ancestors.length < 18; current = current.parentElement) ancestors.push(box(current));
    const hitTargets = [...new Set([header, toolbar, save, ...(toolbar?.querySelectorAll("button") || []), ...(header?.querySelectorAll("button") || [])])].filter(Boolean).slice(0, 18);
    record("frame", { reason, viewport: view, owners: { root: box(document.documentElement), body: box(document.body), app: box(document.querySelector(".app")), shell: box(document.querySelector(".main-shell")), canvas: box(document.querySelector(".main-content")), header: box(header), toolbar: box(toolbar), save: box(save) }, hitTargets: hitTargets.map(target => hit(target, view)), selection: selection(), activeAncestors: ancestors });
  }
  function tick() {
    frame = 0;
    if (!running) return;
    snapshot("activity");
    if (performance.now() < activeUntil) frame = requestAnimationFrame(tick);
  }
  function watch(target, type) {
    const listener = event => {
      record("event", { event: type, target: describe(event.target), trusted: event.isTrusted });
      wake();
    };
    target.addEventListener(type, listener, { capture: true, passive: true });
    restorers.push(() => target.removeEventListener(type, listener, true));
  }
  function patchMethod(target, name) {
    const original = target[name];
    if (typeof original !== "function") return;
    const own = Object.getOwnPropertyDescriptor(target, name);
    function wrapped(...args) {
      const requested = {};
      if (typeof args[0] === "number") {
        requested.x = number(args[0]); requested.y = number(args[1]);
      } else if (args[0] && typeof args[0] === "object") {
        // Read data properties only: invoking option getters a second time
        // would alter browser feature detection and the action being traced.
        for (const key of ["top", "left", "behavior", "block", "inline", "preventScroll"]) {
          const value = Object.getOwnPropertyDescriptor(args[0], key)?.value;
          if (["top", "left"].includes(key) && typeof value === "number") requested[key] = number(value);
          else if (key === "preventScroll" && typeof value === "boolean") requested[key] = value;
          else if (["auto", "instant", "smooth", "start", "end", "center", "nearest"].includes(value)) requested[key] = value;
        }
      }
      record("call", { method: name, target: describe(this), requested, stack: stack() });
      wake();
      return Reflect.apply(original, this, args);
    }
    try {
      Object.defineProperty(target, name, { configurable: true, writable: true, value: wrapped });
      restorers.push(() => {
        if (target[name] !== wrapped) return;
        if (own) Object.defineProperty(target, name, own);
        else delete target[name];
      });
    } catch { record("instrumentation", { method: name, available: false }); }
  }
  function patchScrollTop() {
    let prototype = Element.prototype;
    while (prototype && !Object.getOwnPropertyDescriptor(prototype, "scrollTop")) prototype = Object.getPrototypeOf(prototype);
    const original = prototype && Object.getOwnPropertyDescriptor(prototype, "scrollTop");
    if (!original?.set || !original.configurable) { record("instrumentation", { method: "scrollTop", available: false }); return; }
    const setter = function(value) {
      record("call", { method: "scrollTop=", target: describe(this), requested: typeof value === "number" ? number(value) : null, before: number(original.get.call(this)), stack: stack() });
      wake();
      return original.set.call(this, value);
    };
    Object.defineProperty(prototype, "scrollTop", { ...original, set: setter });
    restorers.push(() => { if (Object.getOwnPropertyDescriptor(prototype, "scrollTop")?.set === setter) Object.defineProperty(prototype, "scrollTop", original); });
  }
  function stop() {
    if (!running) return { records: records.length, dropped };
    snapshot("stop");
    running = false;
    cancelAnimationFrame(frame); frame = 0;
    clearTimeout(stopTimer); stopTimer = 0;
    for (const restore of restorers.reverse()) restore();
    restorers = [];
    return { records: records.length, dropped };
  }
  window.fieldbookEditorTrace = {
    start(options = {}) {
      stop(); records = []; dropped = 0; sequence = 0;
      limit = Math.max(100, Math.min(12000, Number(options.maxRecords) || 6000));
      tail = Math.max(100, Math.min(2000, Number(options.tailMs) || 700));
      const duration = Math.max(1000, Math.min(120000, Number(options.durationMs) || 30000));
      started = performance.now(); running = true;
      for (const name of ["scrollTo", "scrollBy", "scrollIntoView"]) patchMethod(Element.prototype, name);
      for (const name of ["scrollTo", "scrollBy"]) patchMethod(window, name);
      patchMethod(HTMLElement.prototype, "focus");
      patchScrollTop();
      for (const type of ["focusin", "focusout", "pointerdown", "pointerup", "pointercancel", "touchstart", "touchmove", "touchend", "click", "beforeinput", "input", "selectionchange", "scroll", "scrollend", "visibilitychange"]) watch(document, type);
      for (const type of ["resize", "scroll", "pageshow", "orientationchange"]) watch(window, type);
      if (window.visualViewport) for (const type of ["resize", "scroll", "scrollend"]) watch(window.visualViewport, type);
      snapshot("start"); wake();
      stopTimer = setTimeout(stop, duration);
      return { recording: true, durationMs: duration, maxRecords: limit };
    },
    stop,
    export() { return JSON.stringify({ version: 1, running, dropped, records }, null, 2); },
    dispose() { stop(); delete window.fieldbookEditorTrace; },
  };
})();
