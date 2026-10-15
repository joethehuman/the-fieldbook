import type { ReactNode } from "react";

/** A validated authored width stays within the reading column on smaller screens. */
export function AuthoredMedia({
  width,
  children,
}: {
  width?: number;
  children: ReactNode;
}) {
  return (
    <div
      className="authored-media"
      style={{ width: width || "100%", maxWidth: "100%" }}
    >
      {children}
    </div>
  );
}
