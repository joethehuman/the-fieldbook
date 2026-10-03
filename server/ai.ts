import "server-only";
import type { AiProvider } from "./ports/ai";
import { vercelAi } from "./providers/vercel/ai";
import { HttpError } from "./errors";

/** AI is optional. This composition creates no connection or generation at import. */
export function ai(
  environment: Record<string, string | undefined> = process.env,
): AiProvider {
  // Preserve existing installations. New connectors are explicitly wired here.
  const router = environment.FIELDBOOK_AI_ROUTER ?? "vercel";
  if (router === "vercel") return vercelAi;
  throw new HttpError(
    503,
    "The model router is unavailable. Check the installation's AI router configuration.",
  );
}
