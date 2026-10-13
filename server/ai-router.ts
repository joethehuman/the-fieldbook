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
      provider.routerSelection
        ? "The model router changed. Use the configured inference router in Ask AI settings before saving."
        : "The model router changed. Choose a primary model and review the fallback in Ask AI settings before saving.",
    );
  if (settings.fallbackModel && !provider.supportsFallback)
    throw new HttpError(
      400,
      provider.routerSelection
        ? "Fallbacks are configured in the inference router. Use configured router in Ask AI settings to clear the saved Fieldbook fallback before saving."
        : "This model router does not support a fallback. Choose None before saving.",
    );
}
