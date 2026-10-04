"use client";
import type { ReactNode } from "react";
import { ArrowDownWideNarrow } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectTrigger,
  SelectValue,
  selectOptions,
} from "../ui/select";

/** One compact trigger opens the choices directly. State and ordering belong to the collection. */
export function SortPicker({
  value,
  onValueChange,
  children,
  label,
  displayLabel,
  disabled = false,
}: {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  label: string;
  /** Search can apply relevance before the selected tie-break order. */
  displayLabel?: string;
  disabled?: boolean;
}) {
  return (
    <Select
      value={`option:${value}`}
      onValueChange={(next) => {
        if (next.startsWith("option:")) onValueChange(next.slice(7));
      }}
      disabled={disabled}
    >
      <SelectTrigger
        data-slot="sort-picker"
        className="w-fit max-w-full justify-self-start"
        aria-label={label}
      >
        <ArrowDownWideNarrow size={16} aria-hidden="true" />
        <span className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">
          Sort: <SelectValue>{displayLabel || undefined}</SelectValue>
        </span>
      </SelectTrigger>
      <SelectContent>{selectOptions(children)}</SelectContent>
    </Select>
  );
}
