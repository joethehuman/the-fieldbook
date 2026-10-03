"use client";

import { useState } from "react";
import { BulkPicker } from "@/components/patterns/bulk-selection";
import { HierarchyPicker } from "@/components/patterns/hierarchy-picker";
import { FormField } from "@/components/patterns/form-field";
import { SectionHeader, Stack } from "@/components/patterns/layout";

/** Preferred dimensions remain compact; available space only caps overflow. */
export function ScrollingExamples() {
  const [parent, setParent] = useState("0");
  const choices = Array.from({ length: 40 }, (_, index) => ({
    id: String(index),
    label: `Example team ${index + 1}`,
    description: "A team available for selection",
    path: ["Organization", "Example division", `Example team ${index + 1}`],
  }));
  return (
    <Stack id="scrolling-pickers">
      <SectionHeader
        title={<h2>Compact scrolling pickers</h2>}
        description="Search and actions stay outside the choices. Small sets stay compact; long lists scroll within the available space."
      />
      <div className="flex flex-wrap gap-3">
        <BulkPicker
          title="Choose three teams"
          description="A small set retains its natural size."
          options={choices.slice(0, 3)}
          onApply={() => {}}
        />
        <BulkPicker
          title="Choose forty teams"
          description="A larger set scrolls below its search."
          options={choices}
          onApply={() => {}}
        />
      </div>
      <FormField label="Example parent team">
        <HierarchyPicker
          options={choices}
          value={parent}
          onValueChange={setParent}
          searchLabel="Find an example parent"
        />
      </FormField>
    </Stack>
  );
}
