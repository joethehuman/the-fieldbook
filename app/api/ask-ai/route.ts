import { actor, sameOrigin, errorResponse } from "@server/auth";
import { prepareAskAi, requireAiReader } from "@server/ask-ai";
import { readAiRequest } from "@server/ai-schema";
import { askAiResponse } from "@server/ask-ai-response";
import { ai } from "@server/ai";
import { data } from "@server/data";
import { aiBounds } from "@/lib/ai";

export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  const cancellation = new AbortController();
  const signal = AbortSignal.any([
    request.signal,
    cancellation.signal,
    AbortSignal.timeout(aiBounds.requestMilliseconds),
  ]);
  try {
    sameOrigin(request);
    const user = await actor(undefined, true);
    requireAiReader(user);
    const input = await readAiRequest(request, signal);
    const events = await prepareAskAi(input, user, signal, {
      store: data(),
      provider: ai,
      currentUser: () => actor(undefined, true),
    });
    return askAiResponse(events, cancellation, signal);
  } catch (error) {
    cancellation.abort();
    return errorResponse(error, "api/ask-ai");
  }
}
