import type { User } from "./types";
import type { AdminScope } from "./admin-scope";

type Account = Pick<User, "role" | "active" | "registered">;
export function canPublish(user: Account | null | undefined): boolean {
  return (
    !!user &&
    user.active &&
    user.registered !== false &&
    (user.role === "admin" || user.role === "contributor")
  );
}
export function canAdminister(user: Account | null | undefined): boolean {
  return canPublish(user) && user?.role === "admin";
}
export function canOpenPublishingScope(
  user: Account,
  scope: AdminScope,
): boolean {
  return (
    canPublish(user) &&
    (canAdminister(user) ||
      ["content", "feedback", "maintenance"].includes(scope))
  );
}
export function canOpenAdminTab(user: Account, tab: string): boolean {
  return (
    canPublish(user) &&
    (canAdminister(user) ||
      ["content", "feedback", "settings-mcp", "deleted"].includes(tab))
  );
}
export function roleLabel(role: User["role"]): string {
  return {
    admin: "Administrator",
    contributor: "Contributor",
    manager: "Manager",
    learner: "Learner",
  }[role];
}
