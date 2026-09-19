import { env } from "@production/lib/env";
export async function GET() {
  const { origin, url } = env();
  return Response.json(
    {
      resource: `${origin}/api/mcp`,
      authorization_servers: [`${url}/auth/v1`],
      scopes_supported: ["openid", "email", "profile"],
      bearer_methods_supported: ["header"],
      resource_name: "Fieldbook content management",
    },
    { headers: { "Access-Control-Allow-Origin": "*" } },
  );
}
