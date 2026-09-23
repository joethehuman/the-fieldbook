import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Native radios retain form events, group arrow keys and reset semantics.
// Presentation is owned here; application screens never style the input itself.
export { Checkbox } from "./checkbox";

export function Radio({
  className,
  ...props
}: Omit<ComponentProps<"input">, "type">) {
  return (
    <input
      data-slot="choice"
      type="radio"
      className={cn(
        "size-4 shrink-0 cursor-pointer accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-70",
        className,
      )}
      {...props}
    />
  );
}
