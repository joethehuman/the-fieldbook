"use client";

import { useRef, type ComponentProps } from "react";
import { Upload } from "lucide-react";
import { Button } from "./button";
import { Input } from "./input";

/** Native file selection with an explicit action and a controlled filename. */
export function FilePicker({
  fileName,
  onFileChange,
  buttonLabel = "Choose file",
  emptyLabel = "No file selected",
  disabled,
  ...props
}: Omit<
  ComponentProps<"input">,
  | "type"
  | "value"
  | "defaultValue"
  | "onChange"
  | "multiple"
  | "children"
  | "ref"
> & {
  fileName?: string;
  onFileChange: (file: File) => void;
  buttonLabel?: string;
  emptyLabel?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const fileNameId = props.id ? `${props.id}-filename` : undefined;
  return (
    <div
      data-slot="file-picker"
      className="flex min-w-0 flex-wrap items-center gap-3"
    >
      <Input
        {...props}
        ref={input}
        type="file"
        hidden
        disabled={disabled}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          // Permit selecting the same file again after editing it elsewhere.
          event.currentTarget.value = "";
          if (file) onFileChange(file);
        }}
      />
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        aria-describedby={
          [props["aria-describedby"], fileNameId].filter(Boolean).join(" ") ||
          undefined
        }
        aria-invalid={props["aria-invalid"]}
        onClick={() => input.current?.click()}
      >
        <Upload aria-hidden="true" />
        {buttonLabel}
      </Button>
      <span
        id={fileNameId}
        role="status"
        className="min-w-0 text-copy text-muted-foreground [overflow-wrap:anywhere]"
      >
        {fileName || emptyLabel}
      </span>
    </div>
  );
}
