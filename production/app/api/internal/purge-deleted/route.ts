import { errorResponse } from "@production/lib/errors";
import { purgeDeleted } from "@production/lib/deletion-worker";
import { invalidatePublishedReader } from "@production/lib/reader-cache";
export const maxDuration = 60;
export async function POST(request: Request) {
  try {
    const result = await purgeDeleted(
      request.headers.get("authorization")?.replace(/^Bearer /, "") || "",
    );
    if (result.removed) invalidatePublishedReader();
    return Response.json(result, {
      status: result.failed ? 503 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error, "internal/purge-deleted");
  }
}
