import {
  errorResponse,
  HttpError,
  profile,
  requireAdmin,
  sameOrigin,
} from "@server/auth";
import { findProfileBySubject, verifyIdentity } from "@server/identity";
import { readRosterApply, applyRosterImport } from "@server/roster-import";

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    // This boundary deliberately cannot register a first-time visitor.
    const identity = await verifyIdentity(undefined, true);
    if (!identity) throw new HttpError(401, "Sign in to continue.");
    if (!identity.emailVerified || !identity.email)
      throw new HttpError(403, "A verified account is required.");
    const record = await findProfileBySubject(identity.subject);
    const user = record ? profile(record) : null;
    requireAdmin(user);
    const { csv, token } = await readRosterApply(req);
    const result = await applyRosterImport(user, csv, token);
    const current = await findProfileBySubject(identity.subject);
    requireAdmin(current ? profile(current) : null);
    return Response.json(
      { result },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, "api/admin/roster-import/apply");
  }
}
