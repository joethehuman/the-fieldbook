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
  const shownEligible = shown.filter((r) => !r.disabledReason);
  const shownSelected = shownEligible.filter((r) =>
    selected.includes(r.id),
  ).length;
  return (
    <div className="grid gap-3" role="group" aria-label={label}>
      {canBulkSelect(rows.length) && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border pb-3">
          <SelectRows
            label={
              rows.length > shown.length
                ? `Select page (${shownEligible.length}) of ${label}`
                : `Select all ${shownEligible.length} ${label}`
            }
            ids={shownEligible.map((r) => r.id)}
            value={selected}
            onChange={onChange}
          />
          <span>
            {rows.length > shown.length
              ? `Select page (${shownEligible.length})`
              : `Select all ${shownEligible.length}`}
          </span>
          {eligible.length > shownEligible.length &&
            shownSelected === shownEligible.length &&
            selected.length < eligible.length && (
              <Button
                type="button"
                variant="link"
                onClick={() => onChange(eligible.map((r) => r.id))}
              >
                Select all {eligible.length} matching
              </Button>
            )}
          {(rows.length > 25 || selected.length > 0) && (
            <span className="ms-auto text-copy text-muted-foreground" role="status">
              {selected.length
                ? `${selected.length} selected${rows.length > 25 ? " · " : ""}`
                : ""}
              {rows.length > 25
                ? `${(current - 1) * 25 + 1}–${Math.min(current * 25, rows.length)} of ${rows.length} shown`
                : ""}
            </span>
          )}
        </div>
      )}
      <ul className="grid gap-2">
        {shown.map((r) => (
          <li
            key={r.id}
            data-selected={selected.includes(r.id)}
            className="flex min-h-16 items-center gap-3 rounded-md border border-border p-3 hover:bg-muted/40 data-[selected=true]:bg-selected/40"
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
      {rows.length > 25 && (
        <Pagination
          label={label}
          page={current}
          pageSize={25}
          total={rows.length}
          onPageChange={setPage}
          showCount={rows.length <= 1}
        />
      )}
    </div>
  );
}
