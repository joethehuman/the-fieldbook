import { sameOrigin, errorResponse } from "@server/auth";
import { signOutIdentity } from "@server/identity";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await signOutIdentity();
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e, "auth/logout");
  }
}
