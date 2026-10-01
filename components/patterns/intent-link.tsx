"use client";

import { useState, type ComponentProps } from "react";
import Link from "next/link";

type Props = Omit<ComponentProps<typeof Link>, "prefetch"> & {
  eager?: boolean;
};

/** Prepare the route shell for likely destinations or explicit user intent. */
export function IntentLink({
  eager = false,
  onMouseEnter,
  onFocus,
  onTouchStart,
  ...props
}: Props) {
  const [intent, setIntent] = useState(false);
  return (
    <Link
      {...props}
      prefetch={eager || intent ? "auto" : false}
      onMouseEnter={(event) => {
        setIntent(true);
        onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        setIntent(true);
        onFocus?.(event);
      }}
      onTouchStart={(event) => {
        setIntent(true);
        onTouchStart?.(event);
      }}
    />
  );
}
