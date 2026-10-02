import "server-only";
import type { AskAiSettings } from "@/lib/ai";
import type { AiProvider } from "./ports/ai";
import { HttpError } from "./errors";

/** Unbound settings predate router selection and belong to the original adapter. */
export const selectionRouter = (settings: AskAiSettings) =>
  settings.router ?? "vercel";

export function requireAiRouter(settings: AskAiSettings, provider: AiProvider) {
  if (selectionRouter(settings) !== provider.id)
    throw new HttpError(
      409,
      "The model router changed. Choose a primary model and review the fallback in Ask AI settings before saving.",
    );
  if (settings.fallbackModel && !provider.supportsFallback)
    throw new HttpError(
      400,
      "This model router does not support a fallback. Choose None before saving.",
    );
}
