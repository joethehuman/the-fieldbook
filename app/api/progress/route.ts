import { actor, sameOrigin, errorResponse, HttpError } from "@server/auth";
import { data as dataStore } from "@server/data";
import { recordProgress } from "@server/progress";
import { createHash } from "node:crypto";
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await actor();
    const bucket = createHash("sha256")
      .update(user?.id || req.headers.get("x-vercel-forwarded-for") || "guest")
      .digest("hex");
    const data = await dataStore().consumeRateLimit(
      `progress:${bucket}`,
      120,
      60,
    );
    if (!data)
      throw new HttpError(429, "Please wait a moment before trying again.");
    return Response.json(await recordProgress(user, await req.json()), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e, "api/progress");
  }
}
