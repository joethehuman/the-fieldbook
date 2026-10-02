import { actor, sameOrigin, errorResponse, HttpError } from "@server/auth";
import {
  connectionGrants,
  disableConnectionGrant,
  revokeAuthorization,
  connectionGrantForPerson,
  enableConnectionGrant,
} from "@server/identity";
import {
  mcpRoleAccess,
  requireConnectionOwner,
} from "@server/mcp-authorization";
import {
  availableMcpCapabilities,
  resolveMcpAccess,
  MCP_CAPABILITY_DESCRIPTIONS,
  validMcpCapabilities,
} from "@/lib/mcp-access";
import { data as store } from "@server/data";
export async function GET() {
  try {
    const user = await actor();
    requireConnectionOwner(user);
    const data = await connectionGrants(user.id);
    const { teams } = await store().readConfiguration();
    return Response.json(
      (data || []).map((grant) => ({
        ...grant,
        access: resolveMcpAccess(
          user,
          teams,
          grant.capabilities,
          grant.role_at_consent,
        ),
        capabilityDescriptions: MCP_CAPABILITY_DESCRIPTIONS,
      })),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e, "api/connections");
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await actor();
    requireConnectionOwner(user);
    const { clientId, capabilities } = await req.json();
    if (typeof clientId !== "string")
      throw new HttpError(400, "Invalid client.");
    if (capabilities !== undefined) {
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
      const grant = await connectionGrantForPerson(user.id, clientId);
      if (!grant?.enabled)
        throw new HttpError(
          409,
          "This connection is revoked or missing. Reconnect from your AI client before approving permissions.",
        );
      await enableConnectionGrant(
        user.id,
        clientId,
        grant.client_name,
        capabilities,
        true,
      );
      return Response.json({ approved: true });
    }
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
