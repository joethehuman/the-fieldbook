import { actor, sameOrigin, requireAdmin, errorResponse } from "@server/auth";
import { aiSetup } from "@server/ai-setup";
import { readAiRequest } from "@server/ai-schema";
import { ai } from "@server/ai";
import { data } from "@server/data";
import { aiBounds } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const signal = AbortSignal.any([
    request.signal,
    AbortSignal.timeout(aiBounds.requestMilliseconds),
  ]);
  try {
    sameOrigin(request);
    const user = await actor(undefined, true);
    requireAdmin(user);
    const result = await aiSetup(
      await readAiRequest(request, signal),
      user,
      signal,
      {
        provider: ai,
        store: data(),
        currentUser: () => actor(undefined, true),
      },
    );
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error, "api/admin/ask-ai");
  }
}
