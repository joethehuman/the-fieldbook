import {
  actor,
  requireAdmin,
  sameOrigin,
  errorResponse,
  HttpError,
} from "@server/auth";
import {
  authorizationDetails,
  enableConnectionGrant,
  setMcpResource,
  decideAuthorization,
} from "@server/identity";
import { installation } from "@server/installation";
export async function GET(req: Request) {
  try {
    const user = await actor();
    requireAdmin(user);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "Authorization ID is missing.");
    const data = await authorizationDetails(id);
    if (!data)
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
    const { id, allow } = await req.json();
    if (typeof id !== "string")
      throw new HttpError(400, "Invalid authorization request.");
    const details = await authorizationDetails(id);
    if (!details)
      throw new HttpError(400, "This authorization request expired.");
    if ("redirect_url" in details) return Response.json(details);
    if (allow === true) {
      await enableConnectionGrant(
        user.id,
        details.client.id,
        details.client.name,
      );
      await setMcpResource(`${installation().origin}/api/mcp`);
    }
    const result = await decideAuthorization(id, allow === true);
    if (!result)
      throw new HttpError(
        400,
        "The authorization request could not be completed.",
      );
    return Response.json(result);
  } catch (e) {
    return errorResponse(e, "api/consent");
  }
}
