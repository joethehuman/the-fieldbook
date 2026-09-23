// Adapted from shadcn/ui Checkbox (MIT).
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { CheckIcon, MinusIcon } from "lucide-react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";

function Checkbox({
  className,
  checked,
  ...props
}: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="choice"
      checked={checked}
      className={cn(
        "peer size-4 shrink-0 cursor-pointer rounded-sm border border-control-border bg-background outline-none transition-colors motion-reduce:transition-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        {checked === "indeterminate" ? (
          <MinusIcon aria-hidden="true" className="size-3" />
        ) : (
          <CheckIcon aria-hidden="true" className="size-3" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
