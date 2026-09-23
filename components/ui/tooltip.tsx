"use client";
import type { ReactNode } from "react";
import * as Primitive from "@radix-ui/react-tooltip";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <Primitive.Provider delayDuration={400}>{children}</Primitive.Provider>
  );
}

/** Supplemental text only. Essential instructions and errors must remain visible. */
export function Tooltip({
  content,
  children,
}: {
  content: string;
  children: ReactNode;
}) {
  return (
    <Primitive.Root>
      <Primitive.Trigger asChild>{children}</Primitive.Trigger>
      <Primitive.Portal>
        <Primitive.Content
          sideOffset={6}
          collisionPadding={12}
          className="z-70 max-w-64 rounded-control border border-border bg-popover px-3 py-2 text-compact text-popover-foreground shadow-md [overflow-wrap:anywhere]"
        >
          {content}
          <Primitive.Arrow className="fill-popover" />
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
