import {
  actor,
  sameOrigin,
  errorResponse,
  HttpError,
  requirePublisher,
} from "@server/auth";
import { saveContent, getContent } from "@server/content";
import { invalidatePublishedReader } from "@server/reader-cache";
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    return Response.json(
      await getContent(
        url.searchParams.get("id") || "",
        await actor(),
        url.searchParams.get("draft") === "true",
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e, "api/content");
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await actor();
    requirePublisher(user);
    if (Number(req.headers.get("content-length")) > 2000000)
      throw new HttpError(413, "Content is too large.");
    const a = await req.json();
    if (!Number.isInteger(a.expected) || a.expected < 0)
      throw new HttpError(400, "A revision is required.");
    const saved = await saveContent(
      user,
      a.content,
      a.expected,
      a.publish === true,
      "web",
      a.unpublish === true,
    );
    if (a.publish === true || a.unpublish === true) invalidatePublishedReader();
    return Response.json(saved);
  } catch (e) {
    return errorResponse(e, "api/content");
  }
}
