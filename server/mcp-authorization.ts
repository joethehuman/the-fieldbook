import "server-only";
import {
  availableMcpCapabilities,
  resolveMcpAccess,
  validMcpCapabilities,
} from "@/lib/mcp-access";
import type { User } from "@/lib/types";
import { HttpError, profile } from "./auth";
import { data } from "./data";
import { connectionGrantForPerson, findProfileBySubject } from "./identity";
import type { AuthorizationDetails } from "./ports/identity";

export async function validateMcpAuthorization(
  user: User,
  details: Exclude<AuthorizationDetails, { redirect_url: string }>,
  id: string,
) {
  const owner = await findProfileBySubject(details.user.id, true);
  if (owner?.id !== user.id || details.authorization_id !== id)
    throw new HttpError(
      403,
      "This authorization request belongs to another account.",
    );
  const scopes = details.scope.trim().split(/\s+/).filter(Boolean);
  if (
    scopes.some(
      (scope) => !["openid", "email", "profile", "phone"].includes(scope),
    )
  )
    throw new HttpError(
      400,
      "This client requested unsupported identity scopes. Fieldbook tool permissions must be approved separately.",
    );
}

export function requireConnectionOwner(
  user: User | null,
): asserts user is User {
  if (!user) throw new HttpError(401, "Sign in to manage your AI connections.");
  if (!user.active || user.registered === false)
    throw new HttpError(403, "An active registered account is required.");
}

export async function mcpRoleAccess(user: User | null) {
  requireConnectionOwner(user);
  if (user.role === "learner")
    throw new HttpError(
      403,
      "Learner accounts cannot use MCP. Ask an administrator about contributor or team reporting access.",
    );
  const { teams } = await data().readConfiguration();
  if (availableMcpCapabilities(user, teams).length === 0)
    throw new HttpError(
      403,
      "Your account has no MCP permissions. Managers need an explicitly managed reporting team.",
    );
  return { user, teams };
}

/** Each call resolves fresh roster identity, grant consent and explicit reporting responsibilities. */
export async function currentMcpAccess(subject: string, clientId: string) {
  const row = await findProfileBySubject(subject, true);
  if (!row)
    throw new HttpError(
      403,
      "This account has no active Fieldbook access. Ask an administrator to review the account.",
    );
  const { user, teams } = await mcpRoleAccess(profile(row));
  const grant = await connectionGrantForPerson(user.id, clientId);
  if (!grant?.enabled)
    throw new HttpError(
      403,
      "This AI connection has not been approved or has been revoked. Reconnect from your AI client.",
    );
  if (
    !validMcpCapabilities(grant.capabilities) ||
    !["admin", "contributor", "manager"].includes(grant.role_at_consent)
  )
    throw new HttpError(
      503,
      "AI connection permissions are unavailable. Ask an administrator to complete the MCP database upgrade.",
    );
  return {
    user,
    access: resolveMcpAccess(
      user,
      teams,
      grant.capabilities,
      grant.role_at_consent,
    ),
  };
}
