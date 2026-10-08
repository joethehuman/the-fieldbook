"use client";

import { useLayoutEffect, useRef, type RefObject } from "react";

type Property = "width" | "marginLeft" | "transform" | "opacity";
type Motion = { element: HTMLElement; property: Property; animation: Animation };

/** Animate a changed collapse choice, never a responsive CSS layout change. */
export function useSidebarMotion(ref: RefObject<HTMLDivElement | null>, collapsed: boolean, compact: boolean) {
  const previous = useRef(collapsed);
  const interrupted = useRef(new Map<HTMLElement, Partial<Record<Property, string>>>());
  useLayoutEffect(() => {
    const root = ref.current;
    const sidebar = root?.querySelector<HTMLElement>(".sidebar");
    const shell = root?.querySelector<HTMLElement>(".main-shell");
    const changed = previous.current !== collapsed;
    previous.current = collapsed;
    if (!root || !sidebar || !shell) return;
    const motions: Motion[] = [];
    const stop = () => motions.forEach(({ animation }) => animation.cancel());
    const resize = () => { interrupted.current.clear(); stop(); };
    if (changed && !compact && !matchMedia("(prefers-reduced-motion: reduce)").matches && typeof sidebar.animate === "function") {
      const style = getComputedStyle(root);
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const pixels = (value: string) => parseFloat(value) * (value.trim().endsWith("rem") ? rem : 1);
      const full = pixels(style.getPropertyValue("--sidebar-width"));
      const rail = pixels(style.getPropertyValue("--sidebar-rail-width"));
      const animate = (element: HTMLElement, property: Property, from: string, to: string, visible = false) => {
        const animation = element.animate({
          [property]: [interrupted.current.get(element)?.[property] || from, to],
          ...(visible ? { visibility: ["visible", "visible"] } : {}),
        }, { duration: property === "opacity" ? 160 : 180, easing: "ease" });
        motions.push({ element, property, animation });
      };
      const from = `${collapsed ? full : rail}px`, to = `${collapsed ? rail : full}px`;
      animate(sidebar, "width", from, to);
      animate(shell, "marginLeft", from, to);
      const inset = parseFloat(getComputedStyle(sidebar).paddingLeft) + parseFloat(getComputedStyle(sidebar).paddingRight);
      sidebar.querySelectorAll<HTMLElement>(".sidebar-primary-link").forEach((element) => {
        animate(element, "width", `${collapsed ? full - inset - 1 : rail - inset}px`, `${collapsed ? rail - inset : full - inset - 1}px`);
      });
      for (const [selector, inset] of [[".sidebar-toggle", 1], [".sidebar-account-trigger", 9]] as const) {
        const element = sidebar.querySelector<HTMLElement>(selector);
        const shift = `translateX(${rail - full + inset}px)`;
        if (element) animate(element, "transform", collapsed ? "none" : shift, collapsed ? shift : "none");
      }
      sidebar.querySelectorAll<HTMLElement>(".logo, .sidebar-nav-text, .nav-count, .document-tree, .sidebar-account-avatar, .sidebar-account-identity, .sidebar-account-secondary").forEach((element) => {
        animate(element, "opacity", collapsed ? "1" : "0", collapsed ? "0" : "1", true);
      });
    }
    interrupted.current.clear();
    window.addEventListener("resize", resize);
    return () => {
      // Rapidly reversing a toggle continues from the displayed position.
      for (const { element, property, animation } of motions) if (animation.playState === "running") {
        interrupted.current.set(element, { ...interrupted.current.get(element), [property]: getComputedStyle(element)[property] });
      }
      stop();
      window.removeEventListener("resize", resize);
    };
  }, [collapsed, compact, ref]);
}
