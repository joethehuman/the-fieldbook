import { actor, sameOrigin, errorResponse } from "@server/auth";
import { reviewDeadlines } from "@server/deadlines";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    return Response.json(
      await reviewDeadlines(await actor(), await req.json()),
    );
  } catch (error) {
    return errorResponse(error, "api/admin/deadlines");
  }
}
