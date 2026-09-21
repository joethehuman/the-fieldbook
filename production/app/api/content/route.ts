import {
  actor,
  sameOrigin,
  errorResponse,
  HttpError,
  requireAdmin,
} from "@production/lib/auth";
import { saveContent, getContent } from "@production/lib/content";
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
    requireAdmin(user);
    if (Number(req.headers.get("content-length")) > 2000000)
      throw new HttpError(413, "Content is too large.");
    const a = await req.json();
    if (!Number.isInteger(a.expected) || a.expected < 0)
      throw new HttpError(400, "A revision is required.");
    return Response.json(
      await saveContent(
        user,
        a.content,
        a.expected,
        a.publish === true,
        "web",
        a.unpublish === true,
      ),
    );
  } catch (e) {
    return errorResponse(e, "api/content");
  }
}
