import { connection } from "next/server";
import { actor, errorResponse, HttpError } from "@server/auth";
import { snapshot } from "@server/snapshot";
export async function GET() {
  await connection();
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
