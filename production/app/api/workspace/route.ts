import { actor, errorResponse, HttpError } from "@production/lib/auth";
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
    if (e instanceof HttpError && e.status === 401)
      return Response.json(
        { error: "Sign in to continue." },
        { status: 401, headers: { "Cache-Control": "no-store" } },
      );
    return errorResponse(e, "api/workspace");
  }
}
