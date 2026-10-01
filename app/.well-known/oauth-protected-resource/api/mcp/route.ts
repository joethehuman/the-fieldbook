import { env } from "@server/env";
import { authorizationServer } from "@server/identity";
export async function GET() {
  const { origin } = env();
  return Response.json(
    {
      resource: `${origin}/api/mcp`,
      authorization_servers: [authorizationServer()],
      scopes_supported: ["openid", "email", "profile"],
      bearer_methods_supported: ["header"],
      resource_name: "Fieldbook content management",
    },
    { headers: { "Access-Control-Allow-Origin": "*" } },
  );
}
