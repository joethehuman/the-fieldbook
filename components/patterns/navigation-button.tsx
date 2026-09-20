import type { ComponentProps } from "react";
import { Button } from "../ui/button";
import { cn } from "@/lib/utils";
export function NavigationButton({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button
      variant="ghost"
      className={cn(
        "w-full justify-start text-left [&.selected]:bg-accent [&.active]:bg-background",
        className,
      )}
      {...props}
    />
  );
}
