import {
  actor,
  sameOrigin,
  errorResponse,
  HttpError,
} from "@server/auth";
import { bulkAction } from "@server/bulk-actions";
import { invalidatePublishedReader } from "@server/reader-cache";
export const maxDuration = 60;
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    if (Number(req.headers.get("content-length")) > 50000)
      throw new HttpError(413, "Choose a smaller batch.");
    const results = await bulkAction(await actor(), await req.json());
    if (results.some((r) => r.status === "changed"))
      invalidatePublishedReader();
    return Response.json(
      { results },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e, "api/admin/bulk");
  }
}
