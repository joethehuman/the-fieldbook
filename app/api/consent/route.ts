import { actor, sameOrigin, errorResponse, HttpError } from "@server/auth";
import {
  authorizationDetails,
  enableConnectionGrant,
  setMcpResource,
  decideAuthorization,
} from "@server/identity";
import { installation } from "@server/installation";
import {
  availableMcpCapabilities,
  MCP_CAPABILITY_DESCRIPTIONS,
  validMcpCapabilities,
} from "@/lib/mcp-access";
import {
  mcpRoleAccess,
  requireConnectionOwner,
  validateMcpAuthorization,
} from "@server/mcp-authorization";
export async function GET(req: Request) {
  try {
    const user = await actor();
    const { teams } = await mcpRoleAccess(user);
    const id = new URL(req.url).searchParams.get("id");
    if (!id) throw new HttpError(400, "Authorization ID is missing.");
    const data = await authorizationDetails(id);
    if (!data)
      throw new HttpError(
        400,
        "This authorization request expired. Reconnect from your AI client.",
      );
    if ("redirect_url" in data)
      return Response.json(data, { headers: { "Cache-Control": "no-store" } });
    await validateMcpAuthorization(user!, data, id);
    return Response.json(
      {
        ...data,
        capabilities: availableMcpCapabilities(user!, teams),
        capabilityDescriptions: MCP_CAPABILITY_DESCRIPTIONS,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e, "api/consent");
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await actor();
    requireConnectionOwner(user);
    const { id, allow, capabilities } = await req.json();
    if (typeof id !== "string")
      throw new HttpError(400, "Invalid authorization request.");
    const details = await authorizationDetails(id);
    if (!details)
      throw new HttpError(400, "This authorization request expired.");
    if ("redirect_url" in details) return Response.json(details);
    await validateMcpAuthorization(user, details, id);
    if (allow === true) {
      const { teams } = await mcpRoleAccess(user);
      const available = availableMcpCapabilities(user, teams);
      if (
        !validMcpCapabilities(capabilities) ||
        capabilities.length === 0 ||
        capabilities.some((c) => !available.includes(c))
      )
        throw new HttpError(
          400,
          "Select permissions currently available to your account.",
        );
      await setMcpResource(`${installation().origin}/api/mcp`);
    }
    const result = await decideAuthorization(id, allow === true);
    if (!result)
      throw new HttpError(
        400,
        "The authorization request could not be completed.",
      );
    // The client cannot exchange the code until it receives this redirect.
    // Store consent only after successful provider approval, before returning it.
    if (allow === true)
      await enableConnectionGrant(
        user.id,
        details.client.id,
        details.client.name,
        capabilities,
      );
    return Response.json(result);
  } catch (e) {
    return errorResponse(e, "api/consent");
  }
}
