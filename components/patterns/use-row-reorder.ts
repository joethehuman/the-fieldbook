"use client";

import { useState, type DragEvent } from "react";

/** Keep the handle as the grab target while moving a full-row preview. */
export function useRowReorder<T extends { id: string }>(
  items: T[],
  onMove: (id: string, targetIndex: number) => void,
  disabled = false,
) {
  const [drag, setDrag] = useState<{ active: string; order: string[] } | null>(null);
  const sourceIds = items.map((item) => item.id);
  const order = drag && drag.order.length === sourceIds.length &&
    drag.order.every((id) => sourceIds.includes(id))
      ? drag.order
      : sourceIds;
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered = order.map((id) => byId.get(id)!).filter(Boolean);

  function start(event: DragEvent<HTMLElement>, id: string) {
    if (disabled) return event.preventDefault();
    const block = event.currentTarget.closest<HTMLElement>("[data-sortable-preview]");
    if (block) {
      const rect = block.getBoundingClientRect();
      event.dataTransfer.setDragImage(
        block,
        Math.max(0, event.clientX - rect.left),
        Math.max(0, event.clientY - rect.top),
      );
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", id);
    setDrag({ active: id, order: sourceIds });
  }
  function over(event: DragEvent<HTMLElement>, id: string) {
    if (!drag || disabled) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (drag.active === id) return;
    setDrag((current) => {
      if (!current) return current;
      const from = current.order.indexOf(current.active);
      const to = current.order.indexOf(id);
      if (from < 0 || to < 0 || from === to) return current;
      const next = [...current.order];
      next.splice(from, 1);
      next.splice(to, 0, current.active);
      return { ...current, order: next };
    });
  }
  function drop(event: DragEvent<HTMLElement>) {
    if (!drag) return;
    event.preventDefault();
    const target = order.indexOf(drag.active);
    if (target >= 0 && target !== sourceIds.indexOf(drag.active))
      onMove(drag.active, target);
    setDrag(null);
  }
  return { ordered, active: drag?.active, start, over, drop, cancel: () => setDrag(null) };
}
