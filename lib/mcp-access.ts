import { canAdminister, canPublish } from "./permissions";
import { reportTeamIds, type Team, type User } from "./types";

/** Fieldbook permissions, independent of OAuth provider scope names. */
export const MCP_CAPABILITIES = [
  "content:read",
  "content:write",
  "content:assign",
  "media:read",
  "media:write",
  "reports:aggregate",
  "reports:read",
  "feedback:read",
] as const;
export type McpCapability = (typeof MCP_CAPABILITIES)[number];

/** The original connection consent covered only these operations. */
export const LEGACY_MCP_CAPABILITIES: readonly McpCapability[] = [
  "content:read",
  "content:write",
  "media:read",
  "reports:aggregate",
];
export const MCP_CAPABILITY_DESCRIPTIONS: Record<McpCapability, string> = {
  "content:read": "Read published content and unpublished drafts.",
  "content:write":
    "Create and edit Docs, Updates, Courses, lessons and quizzes; publish or unpublish when requested.",
  "content:assign": "Manage course assignments to learning groups and teams.",
  "media:read": "List existing private media and use its content references.",
  "media:write": "Upload images and videos to this installation.",
  "reports:aggregate":
    "Read organization-wide aggregate course progress and feedback counts.",
  "reports:read":
    "Read individual learners, course progress, assignments and due dates in your currently managed teams and descendants (all teams for administrators).",
  "feedback:read":
    "Read content and general feedback, including comments and respondent names.",
};
export type McpAccess = {
  role: User["role"];
  approvedRole: User["role"];
  capabilities: McpCapability[];
  availableCapabilities: McpCapability[];
  approvedCapabilities: McpCapability[];
  consentRequired: McpCapability[];
  teamIds: string[];
  allTeams: boolean;
};

export function validMcpCapabilities(value: unknown): value is McpCapability[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "string" &&
        MCP_CAPABILITIES.includes(item as McpCapability),
    )
  );
}

export function availableMcpCapabilities(
  user: User,
  teams: Team[],
): McpCapability[] {
  if (!user.active || user.registered === false || user.role === "learner")
    return [];
  if (canAdminister(user)) return [...MCP_CAPABILITIES];
  const result: McpCapability[] = canPublish(user)
    ? [
        "content:read",
        "content:write",
        "media:read",
        "media:write",
        "feedback:read",
      ]
    : [];
  if (reportTeamIds(user, teams).size > 0) result.push("reports:read");
  return result;
}

/** Recomputed from current role/team responsibilities and stored consent, never token claims. */
export function resolveMcpAccess(
  user: User,
  teams: Team[],
  approved: readonly McpCapability[],
  approvedRole: User["role"] = user.role,
): McpAccess {
  const availableCapabilities = availableMcpCapabilities(user, teams);
  const approvedCapabilities = MCP_CAPABILITIES.filter((c) =>
    approved.includes(c),
  );
  // Administrator access changes the scope of existing tools (all teams and
  // protected content fields), so a promotion requires fresh explicit consent.
  const promotedToAdmin = user.role === "admin" && approvedRole !== "admin";
  return {
    role: user.role,
    approvedRole,
    availableCapabilities,
    approvedCapabilities,
    capabilities: promotedToAdmin
      ? []
      : availableCapabilities.filter((c) => approvedCapabilities.includes(c)),
    consentRequired: promotedToAdmin
      ? availableCapabilities
      : availableCapabilities.filter((c) => !approvedCapabilities.includes(c)),
    teamIds: [...reportTeamIds(user, teams)].sort(),
    allTeams: canAdminister(user),
  };
}
