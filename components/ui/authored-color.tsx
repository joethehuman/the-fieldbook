import type { ReactNode } from "react";

const palette = new Set([
  "gray",
  "brown",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
]);
function color(value: string | undefined, kind: "text" | "background") {
  if (!value || value === "default") return undefined;
  if (palette.has(value)) return `var(--authored-${value}-${kind})`;
  // Pasted literal colors are content, never executable CSS or arbitrary URLs.
  return /^(#[a-f\d]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%]+\)|transparent|black|white)$/i.test(
    value,
  )
    ? value
    : undefined;
}
export function AuthoredColor({
  inline = false,
  textColor,
  backgroundColor,
  children,
}: {
  inline?: boolean;
  textColor?: string;
  backgroundColor?: string;
  children: ReactNode;
}) {
  const Tag = inline ? "span" : "div";
  return (
    <Tag
      style={{
        color: color(textColor, "text"),
        backgroundColor: color(backgroundColor, "background"),
      }}
    >
      {children}
    </Tag>
  );
}
