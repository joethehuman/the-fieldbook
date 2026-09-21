import { authClient, sameOrigin, errorResponse } from "@production/lib/auth";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await (await authClient()).auth.signOut();
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "auth/logout");
  }
}
