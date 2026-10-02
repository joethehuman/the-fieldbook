import "server-only";
import { z } from "zod";
import { aiModelChoices } from "@/lib/ai-models";
import type { AiSetup } from "@/lib/ai";
import type { User } from "@/lib/types";
import type { AiProvider } from "./ports/ai";
import type { DataStore } from "./ports/data";
import { requireAdmin, HttpError } from "./auth";
import { askAiSettingsSchema } from "./ai-schema";
import { selectionRouter } from "./ai-router";

const setupSchema = z
  .object({
    action: z.literal("check"),
    settings: askAiSettingsSchema,
  })
  .strict();
type Dependencies = {
  provider: () => AiProvider;
  store: Pick<DataStore, "searchAiPassages" | "areAiSourcesCurrent">;
  currentUser: () => Promise<User | null>;
};

/** Read-only metadata. Never generates text or writes settings. */
export async function aiSetup(
  input: unknown,
  user: User | null,
  signal: AbortSignal,
  deps: Dependencies,
) {
  requireAdmin(user);
  const parsed = setupSchema.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Use valid Ask AI settings and a metadata check.");
  signal.throwIfAborted();
  const { settings } = parsed.data;
  const status: AiSetup = {
    router: null,
    selectionRouter: selectionRouter(settings),
    checkedAt: new Date().toISOString(),
    models: [],
    catalog: { ready: false, message: "The model list is unavailable." },
    connection: {
      configured: false,
      message:
        "Connect a supported model router in the installation configuration.",
    },
    retrieval: {
      ready: false,
      message: "Published content has not been checked.",
    },
  };
  let provider: AiProvider | null = null;
  try {
    provider = deps.provider();
  } catch {
    // Missing/unsupported deployment configuration is a setup warning, not a
    // claimed connection. Never expose raw configuration or credential errors.
  }
  if (provider) {
    status.router = {
      id: provider.id,
      name: provider.name,
      supportsFallback: provider.supportsFallback,
    };
    status.connection = provider.connection();
    const [catalog, retrieval] = await Promise.allSettled([
      provider.models(signal),
      // Both functions must exist. Empty inputs read no published text.
      Promise.all([
        deps.store.searchAiPassages([], settings.sources, signal),
        deps.store.areAiSourcesCurrent([], signal),
      ]),
    ]);
    status.models =
      catalog.status === "fulfilled" ? aiModelChoices(catalog.value) : [];
    status.catalog = {
      ready: catalog.status === "fulfilled",
      message:
        catalog.status === "fulfilled"
          ? "Available models loaded. Authentication and credit have not been verified."
          : "The model list is unavailable. Check the model router configuration.",
    };
    status.retrieval = {
      ready: retrieval.status === "fulfilled",
      message:
        retrieval.status === "fulfilled"
          ? "Published content is ready for Ask AI."
          : "Published content is not ready for Ask AI. Complete the installation database setup.",
    };
  }
  signal.throwIfAborted();
  const current = await deps.currentUser();
  requireAdmin(current);
  if (current.id !== user!.id)
    throw new HttpError(401, "Sign in again before checking Ask AI settings.");
  return { setup: status };
}
