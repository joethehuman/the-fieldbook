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
  reorderDisabled = false,
  selected,
  onSelectionChange,
}: {
  items: { id: string; label: string; detail?: ReactNode }[];
  onReorder: (ids: string[]) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
  /** Filtering may pause ordering while retaining removal and selection. */
  reorderDisabled?: boolean;
  selected?: string[];
  onSelectionChange?: (ids: string[]) => void;
}) {
  const drag = useRowReorder(
    items,
    (id, target) => move(id, target),
    disabled || reorderDisabled,
    (item) => item.label,
  );
  function move(id: string, position: number) {
    const ids = items.map((i) => i.id),
      from = ids.indexOf(id);
    if (
      from < 0 ||
      position < 0 ||
      position >= ids.length ||
      from === position ||
      disabled ||
      reorderDisabled
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
          Select all {items.length} listed items
        </div>
      )}
      <ol className="learning-order">
        {drag.ordered.map((item, index) => (
          <ReorderRow
            key={item.id}
            data-sortable-preview
            data-dragging={drag.active === item.id}
            data-drop={
              drag.destination?.id === item.id
                ? drag.destination.side
                : undefined
            }
            data-moved={drag.recentlyMoved === item.id}
            data-selected={selected?.includes(item.id)}
            onDragOver={(e) => {
              drag.over(e, item.id);
            }}
            onDrop={drag.drop}
            handle={
              <Button
                variant="ghost"
                type="button"
                className="order-handle"
                draggable={!disabled && !reorderDisabled}
                disabled={disabled || reorderDisabled}
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
            selection={
              canBulkSelect(items.length) && selected && onSelectionChange ? (
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
              ) : undefined
            }
            title={
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className="w-6 shrink-0 text-right text-xs tabular-nums text-muted-foreground"
                    aria-label={`Position ${index + 1}`}
                  >
                    {index + 1}.
                  </span>
                  <strong className="min-w-0 [overflow-wrap:anywhere]">
                    {item.label}
                  </strong>
                </div>
              </div>
            }
            detail={item.detail}
            actions={
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Move ${item.label} up`}
                  disabled={disabled || reorderDisabled || index === 0}
                  onClick={() => move(item.id, index - 1)}
                >
                  <ArrowUp size={16} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Move ${item.label} down`}
                  disabled={
                    disabled || reorderDisabled || index === items.length - 1
                  }
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
