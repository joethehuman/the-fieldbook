"use client";
import { useState } from "react";
import {
  BulkSelectionBar,
  BulkPicker,
  SelectRows,
} from "@/components/patterns/bulk-selection";
import { Field } from "@/components/ui/field";
export function BulkExamples() {
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <section className="grid gap-4" aria-label="Bulk selection example">
      <h2>Bulk selection and review</h2>
      <Field orientation="horizontal">
        <SelectRows
          ids={["one", "two", "three"]}
          value={selected}
          onChange={setSelected}
        />
        Select example rows
      </Field>
      <BulkSelectionBar count={selected.length} onClear={() => setSelected([])}>
        <BulkPicker
          title="Choose destinations"
          description="Selections persist across search. Only Apply changes the example."
          options={Array.from({ length: 22 }, (_, i) => ({
            id: String(i),
            label: `Example group ${i + 1}`,
          }))}
          onApply={() => setSelected([])}
        />
      </BulkSelectionBar>
    </section>
  );
}
