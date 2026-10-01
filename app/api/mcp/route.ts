import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcp } from "@server/mcp";
import {
  verifyMcpIdentity,
  hasConnectionGrantForSubject,
  findProfileBySubject,
  allowMcpRequest,
} from "@server/identity";
import { profile, requireAdmin, HttpError, errorResponse } from "@server/auth";
import { installation } from "@server/installation";
import { invalidatePublishedReader } from "@server/reader-cache";
export const runtime = "nodejs";
export const maxDuration = 30;
async function handle(req: Request) {
  try {
    const config = installation(),
      resource = `${config.origin}/api/mcp`,
      origin = req.headers.get("origin");
    if (
      origin &&
      ![config.origin, "https://chatgpt.com", "https://claude.ai"].includes(
        origin,
      )
    )
      throw new HttpError(403, "Origin not allowed.");
    const token = req.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];
    const unauth = () =>
      new Response(null, {
        status: 401,
        headers: {
          "WWW-Authenticate": `Bearer resource_metadata="${config.origin}/.well-known/oauth-protected-resource/api/mcp"`,
          "Cache-Control": "no-store",
        },
      });
    if (!token) return unauth();
    const identity = await verifyMcpIdentity(token, resource);
    if (!identity) return unauth();
    const approved = await hasConnectionGrantForSubject(
      identity.subject,
      identity.clientId,
    );
    if (!approved)
      throw new HttpError(
        403,
        "This AI connection has not been approved or has been revoked.",
      );
    const row = await findProfileBySubject(identity.subject, true);
    const user = row ? profile(row) : null;
    requireAdmin(user);
    const allowed = await allowMcpRequest(user.id);
    if (!allowed) throw new HttpError(429, "Request limit reached.");
    if (req.method !== "POST")
      return new Response(null, { status: 405, headers: { Allow: "POST" } });
    if (Number(req.headers.get("content-length")) > 2000000)
      throw new HttpError(413, "Request is too large.");
    const server = createMcp(
        user,
        identity.clientId,
        invalidatePublishedReader,
      ),
      transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
    await server.connect(transport);
    try {
      const response = await transport.handleRequest(req);
      response.headers.set("Cache-Control", "no-store");
      return response;
    } finally {
      await server.close();
    }
  } catch (e) {
    return errorResponse(e, "api/mcp");
  }
}
export const POST = handle;
export const GET = handle;
export const DELETE = handle;
