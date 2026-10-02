import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcp } from "@server/mcp";
import { verifyMcpIdentity, allowMcpRequest } from "@server/identity";
import { HttpError, errorResponse } from "@server/auth";
import { currentMcpAccess } from "@server/mcp-authorization";
import { installation } from "@server/installation";
import { invalidatePublishedReader } from "@server/reader-cache";
export const runtime = "nodejs";
export const maxDuration = 30;

/** Read the actual stream: Content-Length can be absent or dishonest. */
async function boundedRequest(req: Request): Promise<Request> {
  const limit = 2_000_000;
  if (Number(req.headers.get("content-length")) > limit)
    throw new HttpError(413, "Request is too large.");
  const reader = req.body?.getReader();
  if (!reader) return req;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new HttpError(413, "Request is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new Request(req.url, {
    method: req.method,
    headers: req.headers,
    body,
  });
}
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
    const refreshAccess = () =>
      currentMcpAccess(identity.subject, identity.clientId);
    const { user, access } = await refreshAccess();
    const allowed = await allowMcpRequest(user.id);
    if (!allowed) throw new HttpError(429, "Request limit reached.");
    if (req.method !== "POST")
      return new Response(null, { status: 405, headers: { Allow: "POST" } });
    const request = await boundedRequest(req);
    const server = createMcp(
        user,
        identity.clientId,
        invalidatePublishedReader,
        access,
        refreshAccess,
      ),
      transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
    await server.connect(transport);
    try {
      const response = await transport.handleRequest(request);
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
