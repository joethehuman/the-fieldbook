"use client";
import { ReorderRow } from "./reorder-row";
import { useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
export function OrderedLearning({
  items,
  onReorder,
  onRemove,
  disabled = false,
}: {
  items: { id: string; label: string; detail?: ReactNode }[];
  onReorder: (ids: string[]) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}) {
  const [dragged, setDragged] = useState<string | null>(null);
  function move(id: string, position: number) {
    const ids = items.map((i) => i.id),
      from = ids.indexOf(id);
    if (
      from < 0 ||
      position < 0 ||
      position >= ids.length ||
      from === position ||
      disabled
    )
      return;
    ids.splice(from, 1);
    ids.splice(position, 0, id);
    onReorder(ids);
  }
  return (
    <ol className="learning-order">
      {items.map((item, index) => (
        <ReorderRow
          key={item.id}
          onDragOver={(e) => {
            if (dragged) e.preventDefault();
          }}
          onDrop={(e) => {
            e.preventDefault();
            if (dragged) move(dragged, index);
            setDragged(null);
          }}
          handle={
            <Button
              variant="ghost"
              type="button"
              className="order-handle"
              draggable={!disabled}
              disabled={disabled}
              aria-label={`Reorder ${item.label}; use up or down arrow`}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", item.id);
                setDragged(item.id);
              }}
              onDragEnd={() => setDragged(null)}
              onKeyDown={(e) => {
                if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                  e.preventDefault();
                  move(item.id, index + (e.key === "ArrowUp" ? -1 : 1));
                }
              }}
            >
              <GripVertical size={17} />
            </Button>
          }
          title={
            <>
              <span className="mr-2 text-xs text-muted-foreground">
                {index + 1}
              </span>
              <strong>{item.label}</strong>
            </>
          }
          detail={item.detail}
          actions={
            <>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Move ${item.label} up`}
                disabled={disabled || index === 0}
                onClick={() => move(item.id, index - 1)}
              >
                <ArrowUp size={16} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Move ${item.label} down`}
                disabled={disabled || index === items.length - 1}
                onClick={() => move(item.id, index + 1)}
              >
                <ArrowDown size={16} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={disabled}
                aria-label={`Remove ${item.label}`}
                onClick={() => onRemove(item.id)}
              >
                <Trash2 size={16} />
              </Button>
            </>
          }
        />
      ))}
    </ol>
  );
}
