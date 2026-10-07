import { actor, sameOrigin, errorResponse } from "@server/auth";
import { deleteFeedback } from "@server/delete-feedback";

export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const deleted = await deleteFeedback(await actor(), await req.json());
    return Response.json(
      { deleted },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, "api/admin/feedback");
  }
}
