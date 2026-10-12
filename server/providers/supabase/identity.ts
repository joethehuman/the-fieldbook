import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { db } from "./client";
import { loginSubjectForPerson } from "./identity-store";
import { refreshIdentitySession } from "./session";
import { env } from "../../env";
import { HttpError, ServiceError } from "../../errors";
import { isAbsentSession } from "./auth-errors";
import type {
  AuthorizationDetails,
  AuthorizationRedirect,
  McpIdentity,
  ReaderIdentity,
  VerifiedIdentity,
} from "../../ports/identity";

async function sessionClient(readOnly = false) {
  const jar = await cookies();
  const { url, key } = env();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (values) => {
        if (readOnly) return; // Proxy refreshes cookies before reader rendering.
        for (const { name, value, options } of values)
          jar.set(name, value, options);
      },
    },
  });
}

function unavailable(code?: string) {
  return new ServiceError(
    "Sign-in verification is unavailable. Try again shortly; contact an administrator if it continues.",
    "auth",
    code,
  );
}

export async function verifyIdentity(
  token?: string,
  readOnly = false,
): Promise<VerifiedIdentity | null> {
  const client = token ? db() : await sessionClient(readOnly);
  let result;
  try {
    result = await client.auth.getUser(token);
  } catch {
    throw unavailable();
  }
  if (result.error) {
    if (isAbsentSession(result.error)) return null;
    throw unavailable(result.error.code);
  }
  const user = result.data.user;
  return user
    ? {
        subject: user.id,
        email: user.email,
        emailVerified: Boolean(user.email_confirmed_at),
        displayName: user.user_metadata?.full_name
          ? String(user.user_metadata.full_name)
          : undefined,
      }
    : null;
}

export async function verifyReaderIdentity(): Promise<ReaderIdentity> {
  const client = await sessionClient(true);
  let result;
  try {
    result = await client.auth.getClaims();
  } catch {
    throw unavailable();
  }
  if (result.error)
    return { status: isAbsentSession(result.error) ? "absent" : "verify-user" };
  const subject = result.data?.claims.sub;
  return subject ? { status: "verified", subject } : { status: "absent" };
}

export function signInPresentation(): import("@/lib/identity").SignInPresentation {
  return {
    options: [{ id: "google", label: "Continue with Google" }],
    signInLabel: "Sign in with Google",
    progressDescription:
      "Sign in with Google to save course progress across devices and browsers.",
    accessDeniedDescription:
      "This account doesn’t have access. Use an approved Google account or contact an administrator.",
    registration: {
      emailLabel: "Google email",
      description:
        "Add someone before they sign in. Their verified Google email activates this roster entry. No email is sent.",
      pendingDescription:
        "This preregistered user can activate their account with verified Google sign-in. Email is read-only.",
    },
  };
}

export async function startSignIn(
  redirectTo: string,
  optionId = "google",
): Promise<string> {
  if (optionId !== "google")
    throw new HttpError(400, "Choose an available sign-in option.");
  const client = await sessionClient();
  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  if (error || !data.url) throw error || new Error("Login unavailable");
  return data.url;
}

export async function exchangeSignInCode(code: string): Promise<boolean> {
  const { error } = await (
    await sessionClient()
  ).auth.exchangeCodeForSession(code);
  if (!error) return true;
  if (
    [
      "flow_state_not_found",
      "flow_state_expired",
      "bad_code_verifier",
    ].includes(error.code || "")
  )
    return false;
  throw error;
}

export async function signOutIdentity(): Promise<void> {
  await (await sessionClient()).auth.signOut({ scope: "local" });
}

export async function authorizationDetails(
  id: string,
): Promise<AuthorizationDetails | null> {
  const { data, error } = await (
    await sessionClient()
  ).auth.oauth.getAuthorizationDetails(id);
  return error ? null : data;
}

export async function decideAuthorization(
  id: string,
  allow: boolean,
): Promise<AuthorizationRedirect | null> {
  const client = await sessionClient();
  const result = allow
    ? await client.auth.oauth.approveAuthorization(id, {
        skipBrowserRedirect: true,
      })
    : await client.auth.oauth.denyAuthorization(id, {
        skipBrowserRedirect: true,
      });
  return result.error ? null : result.data;
}

export async function revokeAuthorization(clientId: string): Promise<boolean> {
  const { error } = await (
    await sessionClient()
  ).auth.oauth.revokeGrant({ clientId });
  return !error;
}

export function authorizationServer(): string {
  return `${env().url}/auth/v1`;
}

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
export async function verifyMcpIdentity(
  token: string,
  resource: string,
): Promise<McpIdentity | null> {
  jwks ??= createRemoteJWKSet(
    new URL(`${authorizationServer()}/.well-known/jwks.json`),
  );
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: authorizationServer(),
      audience: resource,
      requiredClaims: ["sub", "client_id", "exp"],
    });
    if (!payload.sub || typeof payload.client_id !== "string") return null;
    return { subject: payload.sub, clientId: payload.client_id };
  } catch {
    return null;
  }
}

/** Pending people have no provider identity to lock, unlock or delete. */
export async function lockIdentity(personId: string): Promise<void> {
  const subject = await loginSubjectForPerson(personId);
  if (!subject) return;
  const { error } = await db().auth.admin.updateUserById(subject, {
    ban_duration: "876600h",
  });
  if (error) throw error;
}
export async function unlockIdentity(personId: string): Promise<void> {
  const subject = await loginSubjectForPerson(personId);
  if (!subject) return;
  const { error } = await db().auth.admin.updateUserById(subject, {
    ban_duration: "none",
  });
  if (error) throw error;
}
export async function deleteIdentity(personId: string): Promise<void> {
  const subject = await loginSubjectForPerson(personId);
  if (!subject) return;
  const { error } = await db().auth.admin.deleteUser(subject);
  if (error && error.code !== "user_not_found") throw error;
}

export const supabaseIdentity: import("../../ports/identity").IdentityProvider =
  {
    signInPresentation,
    verifyIdentity,
    verifyReaderIdentity,
    startSignIn,
    exchangeSignInCode,
    signOutIdentity,
    refreshIdentitySession,
    authorizationDetails,
    decideAuthorization,
    revokeAuthorization,
    authorizationServer,
    verifyMcpIdentity,
    lockIdentity,
    unlockIdentity,
    deleteIdentity,
  };
