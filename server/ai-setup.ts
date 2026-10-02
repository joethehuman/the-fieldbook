import "server-only";
import { z } from "zod";
import { aiModelChoices } from "@/lib/ai-models";
import type { AiSetup, AskAiSettings, AiSource } from "@/lib/ai";
import type { User } from "@/lib/types";
import type { AiProvider } from "./ports/ai";
import type { DataStore } from "./ports/data";
import { requireAdmin, HttpError } from "./auth";
import { askAiSettingsSchema, aiSearchPlanSchema } from "./ai-schema";
import { answerPolicy, planningInstructions } from "./ask-ai";

const setupSchema = z
  .object({
    action: z.enum(["check", "test", "test-fallback"]),
    settings: askAiSettingsSchema,
  })
  .strict();
type Dependencies = {
  provider: () => AiProvider;
  store: Pick<DataStore, "searchAiPassages" | "areAiSourcesCurrent">;
  currentUser: () => Promise<User | null>;
};

async function retrievalReady(
  store: Dependencies["store"],
  settings: AskAiSettings,
  signal: AbortSignal,
) {
  // Both migration functions must exist. Empty inputs read no published text.
  await Promise.all([
    store.searchAiPassages([], settings.sources, signal),
    store.areAiSourcesCurrent([], signal),
  ]);
}

/** Catalog/retrieval checks never generate text or write settings. */
export async function aiSetup(
  input: unknown,
  user: User | null,
  signal: AbortSignal,
  deps: Dependencies,
) {
  requireAdmin(user);
  const parsed = setupSchema.safeParse(input);
  if (!parsed.success)
    throw new HttpError(400, "Use valid Ask AI settings and a setup action.");
  signal.throwIfAborted();
  const { action, settings } = parsed.data;
  const provider = deps.provider();
  const [catalog, retrieval] = await Promise.allSettled([
    provider.models(signal),
    retrievalReady(deps.store, settings, signal),
  ]);
  signal.throwIfAborted();
  const status: AiSetup = {
    provider: provider.name,
    checkedAt: new Date().toISOString(),
    models:
      catalog.status === "fulfilled"
        ? aiModelChoices(catalog.value, settings.model, settings.fallbackModel)
        : [],
    catalog: {
      ready: catalog.status === "fulfilled",
      message:
        catalog.status === "fulfilled"
          ? "Compatible models and prices loaded. Authentication has not been tested."
          : "Model list unavailable. Check the Gateway service and try again.",
    },
    connection: provider.connection(),
    retrieval: {
      ready: retrieval.status === "fulfilled",
      message:
        retrieval.status === "fulfilled"
          ? "Published-content retrieval is ready."
          : "Published-content retrieval is unavailable. Check Supabase and apply the Ask AI migration before enabling it.",
    },
  };
  if (action === "check") return { setup: status };
  const selectedModel =
    action === "test-fallback" ? settings.fallbackModel : settings.model;
  if (!selectedModel)
    throw new HttpError(400, "Choose the model before testing an answer.");
  if (
    !status.catalog.ready ||
    !status.retrieval.ready ||
    !status.connection.configured
  )
    throw new HttpError(
      503,
      "Setup is incomplete. Run Check setup and resolve its messages before testing an answer.",
    );
  async function admission() {
    signal.throwIfAborted();
    const current = await deps.currentUser();
    requireAdmin(current);
    if (current.id !== user!.id)
      throw new HttpError(401, "Sign in again before testing an answer.");
  }
  await admission();
  await provider.validateModel(selectedModel, signal);
  const messages = [
    { role: "user" as const, text: "What is the Fieldbook setup check code?" },
  ];
  aiSearchPlanSchema.parse({
    queries: await provider.planSearch({
      model: selectedModel,
      messages,
      instructions: planningInstructions,
      signal,
    }),
  });
  await admission();
  const sources: AiSource[] = [
    {
      id: "S1",
      contentId: "setup-check",
      passageId: "setup-check",
      publishedRevision: 1,
      kind: "doc",
      title: "Synthetic setup check",
      lessonId: null,
      lessonTitle: null,
      href: "",
      text: "The Fieldbook setup check code is ready. This is synthetic test data, not installation content.",
    },
  ];
  let answer = "";
  for await (const text of provider.streamAnswer({
    model: selectedModel,
    messages,
    sources,
    instructions:
      answerPolicy + "\nSupplemental operator guidance:\n" + settings.guidance,
    signal,
  })) {
    signal.throwIfAborted();
    answer += text;
    if (answer.length > 12_000)
      throw new HttpError(
        502,
        "The test answer was too long. Try another model.",
      );
  }
  signal.throwIfAborted();
  await admission();
  const citations = [...answer.matchAll(/\[S(\d+)\]/g)];
  if (
    !answer.trim() ||
    !citations.length ||
    citations.some((match) => match[1] !== "1")
  )
    throw new HttpError(
      502,
      "The model did not return a verifiable test answer. Try again or choose another model.",
    );
  return { setup: status, answer, model: selectedModel };
}
