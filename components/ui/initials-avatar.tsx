import { cn } from "@/lib/utils";

/** Decorative identity marker; pair with a visible name. */
export function InitialsAvatar({
  initials,
  size = "default",
}: {
  initials: string;
  size?: "default" | "sm";
}) {
  return (
    <span
      aria-hidden="true"
      data-slot="initials-avatar"
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full border border-border bg-muted font-semibold leading-none text-foreground",
        size === "sm" ? "size-8 text-xs" : "size-9 text-xs",
      )}
    >
      {initials}
    </span>
  );
}
