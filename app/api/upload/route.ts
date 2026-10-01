import { actor, requireAdmin, sameOrigin } from "@/server/auth";
import { errorResponse } from "@/server/errors";
import { uploadMedia } from "@/server/upload";

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await actor();
    requireAdmin(user);
    return Response.json(await uploadMedia(user, await req.json()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e, "api/upload");
  }
}
