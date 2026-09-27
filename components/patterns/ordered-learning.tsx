"use client";
import { Checkbox } from "../ui/choice";
import { canBulkSelect, SelectRows } from "./bulk-selection";
import { ReorderRow } from "./reorder-row";
import type { ReactNode } from "react";
import { useRowReorder } from "./use-row-reorder";
import { ArrowDown, ArrowUp, GripVertical, Trash2 } from "lucide-react";
import { Button } from "../ui/button";
export function OrderedLearning({
  items,
  onReorder,
  onRemove,
  disabled = false,
  selected,
  onSelectionChange,
}: {
  items: { id: string; label: string; detail?: ReactNode }[];
  onReorder: (ids: string[]) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
  selected?: string[];
  onSelectionChange?: (ids: string[]) => void;
}) {
  const drag = useRowReorder(items, (id, target) => move(id, target), disabled);
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
    <>
      {canBulkSelect(items.length) && selected && onSelectionChange && (
        <div className="flex items-center gap-3">
          <SelectRows
            ids={items.map((i) => i.id)}
            value={selected}
            onChange={onSelectionChange}
          />
          Select all listed items
        </div>
      )}
      <ol className="learning-order">
        {drag.ordered.map((item, index) => (
          <ReorderRow
            key={item.id}
            data-sortable-preview
            data-dragging={drag.active === item.id}
            onDragOver={(e) => {
              drag.over(e, item.id);
            }}
            onDrop={drag.drop}
            handle={
              <Button
                variant="ghost"
                type="button"
                className="order-handle"
                draggable={!disabled}
                disabled={disabled}
                aria-label={`Reorder ${item.label}; use up or down arrow`}
                onDragStart={(e) => drag.start(e, item.id)}
                onDragEnd={drag.cancel}
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
                {canBulkSelect(items.length) &&
                  selected &&
                  onSelectionChange && (
                    <Checkbox
                      aria-label={`Select ${item.label}`}
                      checked={selected.includes(item.id)}
                      onCheckedChange={(v) =>
                        onSelectionChange(
                          v === true
                            ? [...selected, item.id]
                            : selected.filter((id) => id !== item.id),
                        )
                      }
                    />
                  )}
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
    </>
  );
}
