"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";

/** Keep the handle as the grab target while moving a full-row preview. */
export function useRowReorder<T extends { id: string }>(
  items: T[],
  onMove: (id: string, targetIndex: number) => void,
  disabled = false,
  previewLabel?: (item: T) => string,
  onDropTarget?: (
    id: string,
    destination: { id: string; side: "before" | "after" | "inside" },
  ) => void,
) {
  const [drag, setDrag] = useState<{
    active: string;
    destination?: { id: string; side: "before" | "after" | "inside" };
  } | null>(null);
  const [recentlyMoved, setRecentlyMoved] = useState("");
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );
  const sourceIds = items.map((item) => item.id);

  function start(event: DragEvent<HTMLElement>, id: string) {
    if (disabled) return event.preventDefault();
    event.stopPropagation();
    const item = items.find((candidate) => candidate.id === id);
    if (item) {
      const preview = document.createElement("div");
      preview.className = "reorder-drag-preview";
      preview.textContent = previewLabel?.(item) || `Moving ${id}`;
      document.body.appendChild(preview);
      event.dataTransfer.setDragImage(preview, 16, 16);
      window.setTimeout(() => preview.remove(), 0);
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    setRecentlyMoved("");
    setDrag({ active: id });
  }
  function over(event: DragEvent<HTMLElement>, id: string) {
    if (!drag || disabled) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = "move";
    if (drag.active === id)
      return setDrag((current) =>
        current?.destination ? { active: current.active } : current,
      );
    const rect = event.currentTarget.getBoundingClientRect();
    const side =
      event.clientY < rect.top + rect.height / 2 ? "before" : "after";
    setDrag((current) => {
      if (!current) return current;
      if (current.destination?.id === id && current.destination.side === side)
        return current;
      return { ...current, destination: { id, side } };
    });
  }
  function drop(event: DragEvent<HTMLElement>) {
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    if (onDropTarget) {
      if (drag.destination) {
        onDropTarget(drag.active, drag.destination);
        setRecentlyMoved(drag.active);
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setRecentlyMoved(""), 1000);
      }
      setDrag(null);
      return;
    }
    const from = sourceIds.indexOf(drag.active);
    const to = drag.destination ? sourceIds.indexOf(drag.destination.id) : -1;
    const insertion =
      to < 0 ? -1 : to + (drag.destination?.side === "after" ? 1 : 0);
    const target = insertion > from ? insertion - 1 : insertion;
    if (target >= 0 && target !== from) {
      onMove(drag.active, target);
      setRecentlyMoved(drag.active);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setRecentlyMoved(""), 1000);
    }
    setDrag(null);
  }
  return {
    ordered: items,
    active: drag?.active,
    destination: drag?.destination,
    recentlyMoved,
    start,
    over,
    overInside: (event: DragEvent<HTMLElement>, id: string) => {
      if (!drag || disabled) return;
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setDrag(
        (current) =>
          current &&
          (current.destination?.id === id &&
          current.destination.side === "inside"
            ? current
            : { ...current, destination: { id, side: "inside" } }),
      );
    },
    clearDestination: () =>
      setDrag((current) => (current ? { active: current.active } : null)),
    drop,
    cancel: () => setDrag(null),
  };
}
