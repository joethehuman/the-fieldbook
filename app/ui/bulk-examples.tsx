"use client";
import { useState } from "react";
import {
  BulkPicker,
  useBulkSelection,
} from "@/components/patterns/bulk-selection";
import { BulkActions } from "@/components/patterns/bulk-actions";
import { SelectableRows } from "@/components/patterns/selectable-rows";
const candidates = Array.from({ length: 22 }, (_, i) => ({
  id: String(i),
  label: `Example course ${i + 1}`,
}));
export function BulkExamples() {
  const [rows, setRows] = useState(candidates.slice(0, 3));
  const selection = useBulkSelection(
    "example",
    rows.map((r) => r.id),
  );
  return (
    <section className="grid gap-4" aria-label="Bulk selection example">
      <h2>Bulk actions: existing rows and Add picker</h2>
      <p>
        Select existing rows, then use one Bulk actions menu. Use Add for
        relationships that are not in this list yet. Remove rows to see the
        single-item Actions menu and empty state; bulk controls appear only with
        two or more items.
      </p>
      <BulkPicker
        title="Add example courses"
        description="Search and select multiple courses. Apply adds them in the listed order; Cancel saves nothing."
        options={candidates.filter((c) => !rows.some((r) => r.id === c.id))}
        actionLabel="Add courses"
        onApply={(ids) =>
          setRows([...rows, ...candidates.filter((c) => ids.includes(c.id))])
        }
      />
      <BulkActions
        collectionSize={selection.collectionSize}
        selected={selection.actionIds}
        onSelectionChange={selection.setSelected}
        commands={[
          {
            id: "remove",
            label: "Remove from example",
            description:
              "Remove the selected relationships; keep the original courses.",
            apply: () =>
              setRows(rows.filter((r) => !selection.actionIds.includes(r.id))),
          },
          {
            id: "delete",
            label: "Delete selected",
            description:
              "Catalog demonstration only. Content enters Recently deleted for 30 days before permanent deletion, including its learning history.",
            destructive: true,
            acknowledgment:
              "I understand that the selected records will be deleted.",
            apply: () =>
              setRows(rows.filter((r) => !selection.actionIds.includes(r.id))),
          },
        ]}
      />
      <SelectableRows
        label="Example courses"
        rows={rows}
        selected={selection.selected}
        onChange={selection.setSelected}
      />
    </section>
  );
}
