"use client";
import { useState } from "react";
import {
  BulkPicker,
  useBulkSelection,
} from "@/components/patterns/bulk-selection";
import {
  BulkActions,
  ItemActions,
  type BulkCommand,
} from "@/components/patterns/bulk-actions";
import { SelectableRows } from "@/components/patterns/selectable-rows";
const candidates = Array.from({ length: 22 }, (_, i) => ({
  id: String(i),
  label: `Example course ${i + 1}`,
}));
export function BulkExamples() {
  const [rows, setRows] = useState(candidates.slice(0, 3));
  const [moveNotice, setMoveNotice] = useState("");
  const selection = useBulkSelection(
    "example",
    rows.map((r) => r.id),
  );
  const commands: BulkCommand[] = [
    {
      id: "assign",
      label: "Assign to teams or groups",
      description:
        "One picker uses typed labels and retains selections while searching.",
      options: [
        { id: "team:sales", label: "Team: Sales" },
        { id: "group:sales", label: "Group: Sales" },
      ],
      apply: (ids) => setMoveNotice(`Assignment audiences: ${ids.join(", ")}`),
    },
    {
      id: "move",
      label: "Move to example section",
      description:
        "Move the selected rows to one destination. Existing IDs and order stay intact.",
      options: [
        { id: "guides", label: "Guides" },
        { id: "reference", label: "Reference" },
      ],
      selectionMode: "single",
      review: (values, ids) => (
        <p>
          {ids.length} selected rows →{" "}
          {values[0] === "guides" ? "Guides" : "Reference"}. The selection is
          reviewed before applying.
        </p>
      ),
      apply: (values, ids) =>
        setMoveNotice(
          `${ids?.length || 0} rows moved to ${values[0] === "guides" ? "Guides" : "Reference"}.`,
        ),
    },
    {
      id: "remove",
      label: "Remove from example",
      description:
        "Remove the selected relationships; keep the original courses.",
      apply: (_, ids = []) => setRows(rows.filter((r) => !ids.includes(r.id))),
    },
    {
      id: "delete",
      label: "Delete selected",
      description:
        "Catalog demonstration only. Content enters Recently deleted for 30 days before permanent deletion, including its learning history.",
      destructive: true,
      acknowledgment: "I understand that the selected records will be deleted.",
      apply: (_, ids = []) => setRows(rows.filter((r) => !ids.includes(r.id))),
    },
  ];
  return (
    <section className="grid gap-4" aria-label="Bulk selection example">
      <h2>Bulk actions: existing rows and Add picker</h2>
      <p>
        The Bulk actions menu stays in place and becomes available when
        two or more rows are selected. Use Add for relationships that are not
        listed yet. Every row has the same applicable commands in its ellipsis
        menu; selection controls appear when at least two items match.
      </p>
      {moveNotice && <p role="status">{moveNotice}</p>}
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
        commands={commands}
      />
      <SelectableRows
        label="Example courses"
        rows={rows}
        renderActions={(row) => (
          <ItemActions id={row.id} label={row.label} commands={commands} />
        )}
        selected={selection.selected}
        onChange={selection.setSelected}
      />
    </section>
  );
}
