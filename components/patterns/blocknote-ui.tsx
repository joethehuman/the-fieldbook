import type { ComponentProps } from "react";
import {
  ShadCNDefaultComponents,
  type ShadCNComponents,
} from "@blocknote/shadcn";
import { buttonVariants } from "../ui/button";
import { Input } from "../ui/input";
import { cn } from "@/lib/utils";

const NativeButton = ShadCNDefaultComponents.Button.Button;

// Keep BlockNote's Base UI button contract, refs and trigger composition while
// applying the same variants used by Fieldbook's shared shadcn controls.
function WritingButton({
  className,
  variant = "default",
  size = "default",
  ...props
}: ComponentProps<typeof NativeButton>) {
  return (
    <NativeButton
      {...props}
      variant={variant}
      size={size}
      className={cn(
        buttonVariants({
          variant: variant === "secondary" ? "ghost" : variant,
          size: size?.startsWith("icon")
            ? "icon"
            : size === "xs" || size === "sm"
              ? "sm"
              : "default",
        }),
        variant === "secondary" && "bg-accent text-accent-foreground",
        typeof className === "string" ? className : undefined,
      )}
    />
  );
}

// Menus, selects and popovers retain BlockNote's portal and mobile-focus
// handling. Fieldbook's Radix versions use a different primitive contract.
export const writingShadCNComponents = {
  Button: { Button: WritingButton },
  Input: { Input },
} satisfies Partial<ShadCNComponents>;
