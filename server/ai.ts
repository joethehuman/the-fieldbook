import "server-only";
import type { AiProvider } from "./ports/ai";
import { vercelAi } from "./providers/vercel/ai";

/** AI is optional. This composition creates no connection or generation at import. */
export function ai(): AiProvider {
  return vercelAi;
}
