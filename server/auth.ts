import "server-only";
import { installation, siteOrigins } from "./installation";
import type { User } from "@/lib/types";
import { canPublish } from "@/lib/permissions";
import type { ProfileRecord } from "./ports/identity";
import {
  findProfileBySubject,
  registerProfile,
  verifyIdentity,
  verifyReaderIdentity,
} from "./identity";
import { HttpError } from "./errors";
export { HttpError, errorResponse } from "./errors";
export function profile(row: ProfileRecord): User {
  return {
    assignmentTeams:
      row.assignment_teams || row.assignment_context?.assignment_teams,
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active,
    registered: row.auth_user_id !== null,
    learningAssignments: (
      row.learning_assignments || row.assignment_context?.learning_assignments
    )
      ?.filter((a) => !("ended_at" in a) || !a.ended_at)
      .map((a) => ({ ...a, onboardingEnd: a.onboardingEnd || undefined })),
    hireDate: row.hire_date || undefined,
    onboardingDays: row.onboarding_days ?? undefined,
    groups: row.groups,
    teamId: row.team_id || undefined,
    onboardingStart: row.onboarding_start || undefined,
    groupJoinedAt: row.group_joined_at,
    effectiveGroupJoinedAt: row.effective_group_joined_at,
    effectiveGroupIds:
      row.effective_group_ids ||
      row.assignment_context?.effective_group_ids ||
      (row.effective_group_joined_at
        ? Object.keys(row.effective_group_joined_at)
        : undefined),
  };
}
export async function actor(
  token?: string,
  readOnly = false,
): Promise<User | null> {
  const identity = await verifyIdentity(token, readOnly);
  if (!identity) return null;
  if (!identity.email || !identity.emailVerified)
    throw new HttpError(403, "A verified account is required.");
  const found = await findProfileBySubject(identity.subject);
  if (found) {
    if (!found.active) throw new HttpError(403, "This account is inactive.");
    return profile(found);
  }
  if (token)
    throw new HttpError(
      403,
      "Sign in to Fieldbook before connecting an AI client.",
    );
  const saved = await registerProfile({
    subject: identity.subject,
    email: identity.email,
    name: String(identity.displayName || identity.email.split("@")[0]).slice(
      0,
      80,
    ),
    owner: identity.email.toLowerCase() === installation().owner,
  });
  if (!saved)
    throw new HttpError(
      403,
      "This account cannot register. Contact an administrator.",
    );
  if (!saved.active) throw new HttpError(403, "This account is inactive.");
  return profile(saved);
}
/** Reader identity uses a verified JWT and keeps the profile check fresh. */
export async function readerActor(): Promise<User | null> {
  const identity = await verifyReaderIdentity();
  if (identity.status === "absent") return null;
  if (identity.status === "verify-user") return actor(undefined, true);
  const found = await findProfileBySubject(identity.subject);
  if (!found) return actor(undefined, true);
  if (!found.active) throw new HttpError(403, "This account is inactive.");
  return profile(found);
}
export function requireAdmin(user: User | null): asserts user is User {
  if (!user) throw new HttpError(401, "Sign in to continue.");
  if (!user.active || user.role !== "admin")
    throw new HttpError(403, "Administrator access is required.");
}
export function sameOrigin(req: Request) {
  if (!siteOrigins().includes(req.headers.get("origin") || ""))
    throw new HttpError(
      403,
      "This request must come from your Fieldbook site.",
    );
}

export function requirePublisher(user: User | null): asserts user is User {
  if (!user) throw new HttpError(401, "Sign in to publish content.");
  if (!canPublish(user))
    throw new HttpError(
      403,
      "Administrator or contributor publishing access is required.",
    );
}
