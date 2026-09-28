"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Checkbox } from "../ui/choice";
import { Button } from "../ui/button";
import { useToast } from "../ui/toast";
import { ActionGroup } from "../ui/action-group";
import { Alert } from "../ui/alert";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import {
  SearchableSelectionList,
  type SelectionOption,
} from "./searchable-selection-list";

/** Count the full matching collection, never just the current page or selection. */
export const canBulkSelect = (count: number) => count > 1;
export function useBulkSelection(
  scope: string,
  ids: string[],
  eligibleIds = ids,
) {
  const [selected, setSelected] = useState<string[]>([]);
  const [notice, setNotice] = useState("");
  const previous = useRef(scope);
  const notify = useToast();
  useEffect(() => {
    if (previous.current !== scope) {
      previous.current = scope;
      if (selected.length) {
        setNotice("Selection cleared because the view changed.");
        notify("Selection cleared because the view changed.");
      } else setNotice("");
      setSelected([]);
    }
  }, [scope, selected.length, notify]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    if (!canBulkSelect(ids.length) && selected.length) setSelected([]);
  }, [ids.length, selected.length]);
  return {
    selected: selected.filter((id) => eligibleIds.includes(id)),
    actionIds:
      ids.length === 1
        ? eligibleIds
        : selected.filter((id) => eligibleIds.includes(id)),
    collectionSize: ids.length,
    canSelect: canBulkSelect(ids.length),
    setSelected,
    notice,
    toggle: (id: string, checked: boolean) => {
      setNotice("");
      setSelected((ids) =>
        checked ? [...new Set([...ids, id])] : ids.filter((i) => i !== id),
      );
    },
  };
}
export function SelectRows({
  ids,
  value,
  onChange,
  label = "Select all matching rows",
}: {
  ids: string[];
  value: string[];
  onChange: (ids: string[]) => void;
  label?: string;
}) {
  const count = ids.filter((id) => value.includes(id)).length;
  return (
    <Checkbox
      aria-label={label}
      disabled={!ids.length}
      checked={
        count === ids.length && !!count ? true : count ? "indeterminate" : false
      }
      onCheckedChange={(checked) =>
        onChange(
          checked === true
            ? [...new Set([...value, ...ids])]
            : value.filter((id) => !ids.includes(id)),
        )
      }
    />
  );
}
export function BulkSelectionBar({
  count,
  total,
  noun,
  range,
  onClear,
  children,
}: {
  count: number;
  total: number;
  noun: string;
  range?: string;
  onClear: () => void;
  children: ReactNode;
}) {
  return (
    <div
      className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-border py-2"
      role="region"
      aria-label="Selected items"
    >
      <span role="status" className="text-copy text-muted-foreground">
        {count ? `${count} selected` : range || `${total} ${noun}`}
        {count && range ? ` · ${range}` : ""}
      </span>
      <ActionGroup>
        {children}
        {count > 0 && (
          <Button variant="ghost" onClick={onClear}>
            Clear selection
          </Button>
        )}
      </ActionGroup>
    </div>
  );
}

/** Add relationships dialog. Checkbox state is selection, never membership. */
export function BulkPicker({
  title,
  description,
  options,
  onApply,
  disabled = false,
  actionLabel = "Apply",
  destructive = false,
  selectionMode = "multiple",
}: {
  title: string;
  description: string;
  options: SelectionOption[];
  onApply: (ids: string[]) => void | Promise<void>;
  disabled?: boolean;
  actionLabel?: string;
  destructive?: boolean;
  selectionMode?: "single" | "multiple";
}) {
  const [open, setOpen] = useState(false),
    [chosen, setChosen] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const running = useRef(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled || !options.length}
        onClick={() => {
          setChosen([]);
          setError("");
          setOpen(true);
        }}
      >
        {title}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!running.current) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
          {error && <Alert variant="destructive">{error}</Alert>}
          <SearchableSelectionList
            selectionMode={selectionMode}
            options={options}
            value={chosen}
            onChange={setChosen}
            label="Choose items"
            placeholder="Search"
            emptyMessage="No matching items."
            disabled={busy}
          />
          {!!chosen.length && (
            <p className="text-copy text-muted-foreground">
              Selected ({chosen.length}):{" "}
              {options
                .filter((o) => chosen.includes(o.id))
                .slice(0, 5)
                .map((o) => o.label)
                .join(", ")}
              {chosen.length > 5 ? ` and ${chosen.length - 5} more` : ""}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant={destructive ? "destructive" : "default"}
              loading={busy}
              disabled={!chosen.length || !!error}
              onClick={async () => {
                if (running.current) return;
                running.current = true;
                setBusy(true);
                setError("");
                try {
                  await onApply(
                    options
                      .filter((o) => chosen.includes(o.id))
                      .map((o) => o.id),
                  );
                  setOpen(false);
                } catch (e) {
                  setError(
                    (e as Error).message +
                      " Close this dialog and review the current list before trying again.",
                  );
                } finally {
                  running.current = false;
                  setBusy(false);
                }
              }}
            >
              {actionLabel} {chosen.length || ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
