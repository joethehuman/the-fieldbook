"use client";

import { useState, type ComponentProps } from "react";
import Link from "next/link";

type Props = Omit<ComponentProps<typeof Link>, "prefetch"> & {
  eager?: boolean;
};

/** Full-route prefetch only for likely destinations or explicit user intent. */
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
      prefetch={eager || intent}
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
