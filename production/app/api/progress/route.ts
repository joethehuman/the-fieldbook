import {
  actor,
  sameOrigin,
  errorResponse,
  HttpError,
} from "@production/lib/auth";
import { db, check } from "@production/lib/db";
import { recordProgress } from "@production/lib/progress";
import { createHash } from "node:crypto";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await actor();
    const bucket = createHash("sha256")
      .update(user?.id || req.headers.get("x-vercel-forwarded-for") || "guest")
      .digest("hex");
    const { data, error } = await db().rpc("fb_allow_request", {
      p_key: `progress:${bucket}`,
      p_limit: 120,
      p_seconds: 60,
    });
    check(error);
    if (!data)
      throw new HttpError(429, "Please wait a moment before trying again.");
    return Response.json(await recordProgress(user, await req.json()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e, "api/progress");
  }
}
