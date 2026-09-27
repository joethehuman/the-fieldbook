"use client";
import { useEffect, useState, type ReactNode } from "react";
import { Checkbox } from "../ui/choice";
import { canBulkSelect, SelectRows } from "./bulk-selection";
import { Button } from "../ui/button";
import { Pagination } from "./pagination";
export function SelectableRows({
  rows,
  selected,
  onChange,
  label,
  scope = "",
}: {
  rows: {
    id: string;
    label: string;
    detail?: ReactNode;
    disabledReason?: string;
  }[];
  selected: string[];
  onChange: (ids: string[]) => void;
  label: string;
  scope?: string;
}) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [scope]);
  const current = Math.min(page, Math.max(1, Math.ceil(rows.length / 25)));
  const shown = rows.slice((current - 1) * 25, current * 25);
  const eligible = rows.filter((r) => !r.disabledReason);
  return (
    <div className="grid gap-3" role="group" aria-label={label}>
      {canBulkSelect(rows.length) && (
        <div className="flex flex-wrap items-center gap-3">
          <SelectRows
            label={`Select this page of ${label}`}
            ids={shown.filter((r) => !r.disabledReason).map((r) => r.id)}
            value={selected}
            onChange={onChange}
          />
          <span>Select this page</span>
          {eligible.length > 25 && (
            <Button
              type="button"
              variant="link"
              onClick={() => onChange(eligible.map((r) => r.id))}
            >
              Select all {eligible.length} matching items
            </Button>
          )}
        </div>
      )}
      <ul className="grid gap-2">
        {shown.map((r) => (
          <li
            key={r.id}
            className="flex items-start gap-3 rounded-md border border-border p-3"
          >
            {canBulkSelect(rows.length) && (
              <Checkbox
                aria-label={`Select ${r.label}`}
                disabled={!!r.disabledReason}
                checked={selected.includes(r.id)}
                onCheckedChange={(v) =>
                  onChange(
                    v === true
                      ? [...new Set([...selected, r.id])]
                      : selected.filter((id) => id !== r.id),
                  )
                }
              />
            )}
            <div className="min-w-0 [overflow-wrap:anywhere]">
              <strong>{r.label}</strong>
              {r.detail && (
                <div className="text-copy text-muted-foreground">
                  {r.detail}
                </div>
              )}
              {r.disabledReason && (
                <p className="text-copy text-muted-foreground">
                  {r.disabledReason}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      {!rows.length && <p>No items in this list.</p>}
      <Pagination
        label={label}
        page={current}
        pageSize={25}
        total={rows.length}
        onPageChange={setPage}
      />
    </div>
  );
}
