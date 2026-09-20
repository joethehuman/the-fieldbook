import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createMcp } from "@production/lib/mcp";
import { db, check } from "@production/lib/db";
import {
  profile,
  requireAdmin,
  HttpError,
  errorResponse,
} from "@production/lib/auth";
import { env } from "@production/lib/env";
export const runtime = "nodejs";
export const maxDuration = 30;
let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
async function handle(req: Request) {
  try {
    const config = env(),
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
    jwks ??= createRemoteJWKSet(
      new URL(`${config.url}/auth/v1/.well-known/jwks.json`),
    );
    let claims;
    try {
      claims = (
        await jwtVerify(token, jwks, {
          issuer: `${config.url}/auth/v1`,
          audience: resource,
        })
      ).payload;
    } catch {
      return unauth();
    }
    if (!claims.sub || typeof claims.client_id !== "string") return unauth();
    const { data: grant, error: gerr } = await db()
      .from("fb_mcp_grants")
      .select("enabled")
      .eq("user_id", claims.sub)
      .eq("client_id", claims.client_id)
      .maybeSingle();
    check(gerr);
    if (!grant?.enabled)
      throw new HttpError(
        403,
        "This AI connection has not been approved or has been revoked.",
      );
    const { data: row, error } = await db()
      .from("fb_profiles")
      .select("*")
      .eq("id", claims.sub)
      .eq("active", true)
      .maybeSingle();
    check(error);
    const user = row ? profile(row) : null;
    requireAdmin(user);
    const { data: allowed, error: limitError } = await db().rpc(
      "fb_allow_request",
      { p_key: `mcp:${user.id}`, p_limit: 120, p_seconds: 60 },
    );
    check(limitError);
    if (!allowed) throw new HttpError(429, "Request limit reached.");
    if (req.method !== "POST")
      return new Response(null, { status: 405, headers: { Allow: "POST" } });
    if (Number(req.headers.get("content-length")) > 2000000)
      throw new HttpError(413, "Request is too large.");
    const server = createMcp(user, claims.client_id),
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
    return errorResponse(e);
  }
}
export const POST = handle;
export const GET = handle;
export const DELETE = handle;
