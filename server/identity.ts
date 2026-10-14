import "server-only";
import type { IdentityProvider, IdentityStore } from "./ports/identity";
import { supabaseIdentity } from "./providers/supabase/identity";
import * as supabaseIdentityStore from "./providers/supabase/identity-store";
import { ServiceError } from "./errors";

/** Composition point for both recipes. An alternative integration implements the
 * contract and an explicit subject-to-person mapping; an environment value alone
 * cannot make an unimplemented provider or account migration work. */
export function identityProvider(): IdentityProvider {
  const provider =
    process.env.FIELDBOOK_IDENTITY_PROVIDER?.trim() || "supabase";
  if (provider !== "supabase")
    throw new ServiceError(
      "The configured sign-in provider is unavailable.",
      "configuration",
    );
  return supabaseIdentity;
}

const identityStore: IdentityStore = supabaseIdentityStore;
export const signInPresentation: IdentityProvider["signInPresentation"] = (
  ...args
) => identityProvider().signInPresentation(...args);
export const verifyIdentity: IdentityProvider["verifyIdentity"] = (...args) =>
  identityProvider().verifyIdentity(...args);
export const verifyReaderIdentity: IdentityProvider["verifyReaderIdentity"] = (
  ...args
) => identityProvider().verifyReaderIdentity(...args);
export const startSignIn: IdentityProvider["startSignIn"] = (...args) =>
  identityProvider().startSignIn(...args);
export const exchangeSignInCode: IdentityProvider["exchangeSignInCode"] = (
  ...args
) => identityProvider().exchangeSignInCode(...args);
export const signOutIdentity: IdentityProvider["signOutIdentity"] = (...args) =>
  identityProvider().signOutIdentity(...args);
export const refreshIdentitySession: IdentityProvider["refreshIdentitySession"] =
  (...args) => identityProvider().refreshIdentitySession(...args);
export const authorizationDetails: IdentityProvider["authorizationDetails"] = (
  ...args
) => identityProvider().authorizationDetails(...args);
export const decideAuthorization: IdentityProvider["decideAuthorization"] = (
  ...args
) => identityProvider().decideAuthorization(...args);
export const revokeAuthorization: IdentityProvider["revokeAuthorization"] = (
  ...args
) => identityProvider().revokeAuthorization(...args);
export const authorizationServer: IdentityProvider["authorizationServer"] = (
  ...args
) => identityProvider().authorizationServer(...args);
export const verifyMcpIdentity: IdentityProvider["verifyMcpIdentity"] = (
  ...args
) => identityProvider().verifyMcpIdentity(...args);
export const lockIdentity: IdentityProvider["lockIdentity"] = (...args) =>
  identityProvider().lockIdentity(...args);
export const unlockIdentity: IdentityProvider["unlockIdentity"] = (...args) =>
  identityProvider().unlockIdentity(...args);
export const deleteIdentity: IdentityProvider["deleteIdentity"] = (...args) =>
  identityProvider().deleteIdentity(...args);
export const findProfileBySubject: IdentityStore["findProfileBySubject"] = (
  ...args
) => identityStore.findProfileBySubject(...args);
export const registerProfile: IdentityStore["registerProfile"] = (...args) =>
  identityStore.registerProfile(...args);
export const hasConnectionGrantForSubject: IdentityStore["hasConnectionGrantForSubject"] =
  (...args) => identityStore.hasConnectionGrantForSubject(...args);
export const connectionGrantForPerson: IdentityStore["connectionGrantForPerson"] =
  (...args) => identityStore.connectionGrantForPerson(...args);
export const connectionGrants: IdentityStore["connectionGrants"] = (...args) =>
  identityStore.connectionGrants(...args);
export const enableConnectionGrant: IdentityStore["enableConnectionGrant"] = (
  ...args
) => identityStore.enableConnectionGrant(...args);
export const disableConnectionGrant: IdentityStore["disableConnectionGrant"] = (
  ...args
) => identityStore.disableConnectionGrant(...args);
export const setMcpResource: IdentityStore["setMcpResource"] = (...args) =>
  identityStore.setMcpResource(...args);
export const allowMcpRequest: IdentityStore["allowMcpRequest"] = (...args) =>
  identityStore.allowMcpRequest(...args);
