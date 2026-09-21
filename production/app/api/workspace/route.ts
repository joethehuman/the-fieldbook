import { actor, errorResponse } from "@production/lib/auth";
import { snapshot } from "@production/lib/snapshot";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const user = await actor();
    return Response.json(
      { data: await snapshot(user), user },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e, "api/workspace");
  }
}
