/** Subject is opaque within the configured identity provider; it is not a Fieldbook person ID.
 * Application roles and access never come from this record. */
export type VerifiedIdentity = {
  subject: string;
  email?: string;
  emailVerified: boolean;
  displayName?: string;
};

/** Reader verification must retain the full-user fallback for legacy signing keys. */
export type ReaderIdentity =
  | { status: "verified"; subject: string }
  | { status: "absent" }
  | { status: "verify-user" };

export type McpIdentity = { subject: string; clientId: string };

export type AuthorizationDetails =
  | { redirect_url: string }
  | {
      authorization_id: string;
      redirect_uri: string;
      client: { id: string; name: string; uri?: string; logo_uri?: string };
      user: { id: string; email?: string };
      scope: string;
    };

export type AuthorizationRedirect = { redirect_url: string };

/** Application person record. The adapter resolves the provider subject to this stable ID.
 * Roster IDs remain stable when a preregistered person activates a provider login. */
export type ProfileRecord = {
  assignment_context?: {
    learning_assignments?: import("@/lib/types").EffectiveAssignment[];
    assignment_teams?: import("@/lib/types").User["assignmentTeams"];
    effective_group_ids?: string[];
  };
  assignment_teams?: import("@/lib/types").User["assignmentTeams"];
  effective_group_ids?: string[];
  id: string;
  name: string;
  email: string;
  role: "admin" | "learner" | "manager" | "contributor";
  active: boolean;
  auth_user_id?: string | null;
  hire_date?: string | null;
  onboarding_days?: number | null;
  groups: string[];
  team_id?: string | null;
  onboarding_start?: string | null;
  group_joined_at?: Record<string, string>;
  effective_group_joined_at?: Record<string, string>;
  learning_assignments?: (import("@/lib/types").EffectiveAssignment & {
    ended_at?: string | null;
  })[];
};

export type ConnectionGrant = {
  client_id: string;
  client_name: string;
  enabled: boolean;
  granted_at: string;
};

/** Registration consumes a verified provider subject and returns a Fieldbook person record.
 * The adapter allocates/maps the person ID and enforces registration/pending-account rules. */
export type ProfileRegistration = {
  subject: string;
  email: string;
  name: string;
  owner: boolean;
};
