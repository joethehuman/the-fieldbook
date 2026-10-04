"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
} from "react";
import { flushSync } from "react-dom";
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
  const button = useRef<HTMLButtonElement>(null);
  const [opening, setOpening] = useState(false);
  const cleanup = useRef<(() => void) | null>(null);
  const restoreFocus = useRef(false);
  const fileNameId = props.id ? `${props.id}-filename` : undefined;

  useEffect(() => () => cleanup.current?.(), []);
  useLayoutEffect(() => {
    if (!opening && restoreFocus.current) {
      restoreFocus.current = false;
      // Loading temporarily disables the trigger. Restore keyboard focus unless
      // the owning feature has already moved it to the next step.
      if (document.activeElement === document.body) {
        button.current?.focus({ preventScroll: true });
      }
    }
  }, [opening]);

  function finishOpening() {
    cleanup.current?.();
    cleanup.current = null;
    setOpening(false);
  }

  function openPicker() {
    const nativeInput = input.current;
    if (!nativeInput || disabled || cleanup.current) return;
    restoreFocus.current = document.activeElement === button.current;
    nativeInput.addEventListener("cancel", finishOpening);
    // Older browsers may return focus without firing the input's cancel event.
    window.addEventListener("focus", finishOpening);
    cleanup.current = () => {
      nativeInput.removeEventListener("cancel", finishOpening);
      window.removeEventListener("focus", finishOpening);
    };
    // Commit acknowledgment before the browser takes over. Keep invocation in
    // this gesture: deferring it can lose transient user activation. The browser
    // still controls when the page paints and the native dialog appears.
    flushSync(() => setOpening(true));
    try {
      nativeInput.click();
    } catch (error) {
      finishOpening();
      throw error;
    }
  }

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
          finishOpening();
          const file = event.currentTarget.files?.[0];
          // Permit selecting the same file again after editing it elsewhere.
          event.currentTarget.value = "";
          if (file) onFileChange(file);
        }}
      />
      <Button
        ref={button}
        type="button"
        variant="outline"
        disabled={disabled}
        loading={opening}
        aria-describedby={
          [props["aria-describedby"], fileNameId].filter(Boolean).join(" ") ||
          undefined
        }
        aria-invalid={props["aria-invalid"]}
        onClick={openPicker}
      >
        <Upload aria-hidden="true" />
        {buttonLabel}
      </Button>
      <span
        id={fileNameId}
        role="status"
        className="min-w-0 text-copy text-muted-foreground [overflow-wrap:anywhere]"
      >
        {opening ? "Opening file picker…" : fileName || emptyLabel}
      </span>
    </div>
  );
}
