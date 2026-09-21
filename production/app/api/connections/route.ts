import {
  actor,
  requireAdmin,
  sameOrigin,
  errorResponse,
  HttpError,
  authClient,
} from "@production/lib/auth";
import { db, check } from "@production/lib/db";
export async function GET() {
  try {
    const user = await actor();
    requireAdmin(user);
    const { data, error } = await db()
      .from("fb_mcp_grants")
      .select("client_id,client_name,enabled,granted_at")
      .eq("user_id", user.id);
    check(error);
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
    const { error } = await db()
      .from("fb_mcp_grants")
      .update({ enabled: false })
      .eq("user_id", user.id)
      .eq("client_id", clientId);
    check(error);
    const { error: revokeError } = await (
      await authClient()
    ).auth.oauth.revokeGrant({ clientId });
    if (revokeError)
      throw new HttpError(
        502,
        "Fieldbook access is disabled, but the identity provider could not revoke its saved consent. Retry before reconnecting this client.",
      );
    return Response.json({ revoked: true });
  } catch (e) {
    return errorResponse(e, "api/connections");
  }
}
