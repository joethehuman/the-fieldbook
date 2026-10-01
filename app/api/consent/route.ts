import { connection } from "next/server";
import {
  actor,
  authClient,
  requireAdmin,
  sameOrigin,
  errorResponse,
  HttpError,
} from "@server/auth";
import { db, check } from "@server/db";
import { env } from "@server/env";
export async function GET(req: Request) {
  await connection();
  try {
    const user = await actor();
    requireAdmin(user);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "Authorization ID is missing.");
    const client = await authClient(),
      { data, error } = await client.auth.oauth.getAuthorizationDetails(id);
    if (error)
      throw new HttpError(
        400,
        "This authorization request expired. Reconnect from your AI client.",
      );
    return Response.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e, "api/consent");
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await actor();
    requireAdmin(user);
    const { id, allow } = await req.json(),
      client = await authClient();
    if (typeof id !== "string")
      throw new HttpError(400, "Invalid authorization request.");
    const { data: details, error } =
      await client.auth.oauth.getAuthorizationDetails(id);
    if (error || !details)
      throw new HttpError(400, "This authorization request expired.");
    if ("redirect_url" in details) return Response.json(details);
    if (allow === true) {
      const { error: e } = await db()
        .from("fb_mcp_grants")
        .upsert({
          user_id: user.id,
          client_id: details.client.id,
          client_name: details.client.name,
          enabled: true,
          granted_at: new Date().toISOString(),
        });
      check(e);
      const { error: configError } = await db()
        .from("fb_oauth_config")
        .upsert({ id: true, resource: `${env().origin}/api/mcp` });
      check(configError);
    }
    const result =
      allow === true
        ? await client.auth.oauth.approveAuthorization(id, {
            skipBrowserRedirect: true,
          })
        : await client.auth.oauth.denyAuthorization(id, {
            skipBrowserRedirect: true,
          });
    if (result.error)
      throw new HttpError(
        400,
        "The authorization request could not be completed.",
      );
    return Response.json(result.data);
  } catch (e) {
    return errorResponse(e, "api/consent");
  }
}
