import "server-only";
// One supported implementation. A fresh alternate stack supplies its own adapters and schema.
// Provider subjects are resolved to Fieldbook person IDs inside the identity store.
export {
  verifyIdentity,
  verifyReaderIdentity,
  startSignIn,
  exchangeSignInCode,
  signOutIdentity,
  authorizationDetails,
  decideAuthorization,
  revokeAuthorization,
  authorizationServer,
  verifyMcpIdentity,
  lockIdentity,
  unlockIdentity,
  deleteIdentity,
} from "./providers/supabase/identity";
export {
  findProfileBySubject,
  registerProfile,
  hasConnectionGrantForSubject,
  connectionGrants,
  enableConnectionGrant,
  disableConnectionGrant,
  setMcpResource,
  allowMcpRequest,
} from "./providers/supabase/identity-store";
export { refreshIdentitySession } from "./providers/supabase/session";
