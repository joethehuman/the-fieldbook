import { cn } from "@/lib/utils";

export type ConnectorLineGeometry = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/** Decorative orthogonal hairline; the owning pattern measures pixel geometry. */
export function ConnectorLine({ x, y, width, height }: ConnectorLineGeometry) {
  return (
    <span
      aria-hidden="true"
      data-slot="connector-line"
      className={cn(
        "pointer-events-none absolute border-border",
        width ? "border-t" : "border-s",
      )}
      style={{ left: x, top: y, width, height }}
    />
  );
}
