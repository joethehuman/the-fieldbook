import {
  errorResponse,
  HttpError,
  profile,
  requireAdmin,
  sameOrigin,
} from "@server/auth";
import { findProfileBySubject, verifyIdentity } from "@server/identity";
import { readRosterUpload, reviewRosterImport } from "@server/roster-import";

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    // This read boundary deliberately cannot register a first-time visitor.
    const identity = await verifyIdentity(undefined, true);
    if (!identity) throw new HttpError(401, "Sign in to continue.");
    if (!identity.emailVerified || !identity.email)
      throw new HttpError(403, "A verified account is required.");
    const record = await findProfileBySubject(identity.subject);
    const user = record ? profile(record) : null;
    requireAdmin(user);
    const csv = await readRosterUpload(req);
    const review = await reviewRosterImport(user, csv);
    const current = await findProfileBySubject(identity.subject);
    requireAdmin(current ? profile(current) : null);
    return Response.json(
      { review },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, "api/admin/roster-import/review");
  }
}
