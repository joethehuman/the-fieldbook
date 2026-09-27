"use client";

import { useState, type ReactNode } from "react";

/** Only uploaded artwork needs a client boundary for failed-image recovery. */
export function CardImage({
  src,
  fallback,
}: {
  src: string;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return failed === src ? (
    fallback
  ) : (
    <img
      className="card-artwork-image"
      src={src}
      alt=""
      loading="lazy"
      onError={() => setFailed(src)}
    />
  );
}
