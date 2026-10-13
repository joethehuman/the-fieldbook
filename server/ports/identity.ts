import type { NextRequest, NextResponse } from "next/server";
import type { SignInPresentation } from "@/lib/identity";

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
  /** Whether a verified external login is linked; the provider subject stays in its adapter. */
  registered: boolean;
  added_at?: string | null;
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
  capabilities: import("@/lib/mcp-access").McpCapability[];
  capability_version: number;
  role_at_consent: "admin" | "contributor" | "manager";
};

/** Registration consumes a verified provider subject and returns a Fieldbook person record.
 * The adapter allocates/maps the person ID and enforces registration/pending-account rules. */
export type ProfileRegistration = {
  subject: string;
  email: string;
  name: string;
  owner: boolean;
};

/** Selected sign-in integration. It owns verification, session cookies and external
 * account lifecycle; Fieldbook services still decide roles and access. */
export interface IdentityProvider {
  signInPresentation(): SignInPresentation;
  verifyIdentity(
    token?: string,
    readOnly?: boolean,
  ): Promise<VerifiedIdentity | null>;
  verifyReaderIdentity(): Promise<ReaderIdentity>;
  startSignIn(redirectTo: string, optionId?: string): Promise<string>;
  exchangeSignInCode(code: string): Promise<boolean>;
  /** End this browser session without revoking separately authorized MCP sessions. */
  signOutIdentity(): Promise<void>;
  refreshIdentitySession(
    request: NextRequest,
    requestHeaders: Headers,
  ): Promise<NextResponse>;
  authorizationDetails(id: string): Promise<AuthorizationDetails | null>;
  decideAuthorization(
    id: string,
    allow: boolean,
  ): Promise<AuthorizationRedirect | null>;
  revokeAuthorization(clientId: string): Promise<boolean>;
  authorizationServer(): string;
  /** Human session tokens must never satisfy the MCP resource/client contract. */
  verifyMcpIdentity(
    token: string,
    resource: string,
  ): Promise<McpIdentity | null>;
  lockIdentity(personId: string): Promise<void>;
  unlockIdentity(personId: string): Promise<void>;
  deleteIdentity(personId: string): Promise<void>;
}

/** Fieldbook-owned identity mapping and connection permissions. A replacement
 * integration must preserve person IDs and supply a compatible account mapping. */
export interface IdentityStore {
  findProfileBySubject(
    subject: string,
    activeOnly?: boolean,
  ): Promise<ProfileRecord | null>;
  registerProfile(input: ProfileRegistration): Promise<ProfileRecord | null>;
  hasConnectionGrantForSubject(
    subject: string,
    clientId: string,
  ): Promise<boolean>;
  connectionGrantForPerson(
    personId: string,
    clientId: string,
  ): Promise<ConnectionGrant | null>;
  connectionGrants(personId: string): Promise<ConnectionGrant[] | null>;
  enableConnectionGrant(
    personId: string,
    clientId: string,
    clientName: string,
    capabilities: import("@/lib/mcp-access").McpCapability[],
    requireEnabled?: boolean,
  ): Promise<void>;
  disableConnectionGrant(personId: string, clientId: string): Promise<void>;
  setMcpResource(resource: string): Promise<void>;
  allowMcpRequest(personId: string): Promise<boolean>;
}
