import { Avatar, AvatarFallback } from "./avatar";

/** Decorative identity marker; pair with a visible name. */
export function InitialsAvatar({
  initials,
  size = "default",
}: {
  initials: string;
  size?: "default" | "sm";
}) {
  return (
    <Avatar
      aria-hidden="true"
      data-slot="initials-avatar"
      size={size}
    >
      <AvatarFallback>{initials.trim().slice(0, 2).toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}
