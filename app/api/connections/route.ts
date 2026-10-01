import {
  actor,
  requireAdmin,
  sameOrigin,
  errorResponse,
  HttpError,
} from "@server/auth";
import {
  connectionGrants,
  disableConnectionGrant,
  revokeAuthorization,
} from "@server/identity";
export async function GET() {
  try {
    const user = await actor();
    requireAdmin(user);
    const data = await connectionGrants(user.id);
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e, "api/connections");
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await actor();
    requireAdmin(user);
    const { clientId } = await req.json();
    if (typeof clientId !== "string")
      throw new HttpError(400, "Invalid client.");
    await disableConnectionGrant(user.id, clientId);
    const revoked = await revokeAuthorization(clientId);
    if (!revoked)
      throw new HttpError(
        502,
        "Fieldbook access is disabled, but the identity provider could not revoke its saved consent. Retry before reconnecting this client.",
      );
    return Response.json({ revoked: true });
  } catch (e) {
    return errorResponse(e, "api/connections");
  }
}
