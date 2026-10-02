export const aiUnavailableMessage =
  "Ask AI is temporarily unavailable. Try again later or use Search.";

import type { SearchKind } from "./search";

/** Nonsecret, installation-owned configuration. Credentials never belong here. */
export type AskAiSettings = {
  enabled: boolean;
  model: string;
  fallbackModel: string;
  sources: SearchKind[];
  guidance: string;
};
/** Public provider metadata, never credentials or SDK objects. Prices are USD. */
export type AiModel = {
  id: string;
  name: string;
  inputPerMillion: number | null;
  outputPerMillion: number | null;
  zeroRetention: "all" | "some" | "none" | "unknown";
  noTraining: "all" | "some" | "none" | "unknown";
};
export type AiConnection = {
  configured: boolean;
  message: string;
};
export type AiSetup = {
  provider: string;
  checkedAt: string;
  models: AiModel[];
  catalog: { ready: boolean; message: string };
  connection: AiConnection;
  retrieval: { ready: boolean; message: string };
};
export const defaultAskAiSettings: AskAiSettings = {
  enabled: false,
  // Each installation chooses its models before enabling AI.
  model: "",
  fallbackModel: "",
  sources: ["doc", "brief", "course"],
  guidance:
    "Answer directly and briefly. Use one or two sentences when that is enough. Otherwise use at most two short paragraphs, with up to three useful source links. Include only detail needed to answer the question. Say when the available Fieldbook content does not contain the answer.",
};
export type AiMessage = { role: "user" | "assistant"; text: string };
export type AiSourceIdentity = {
  contentId: string;
  passageId: string;
  publishedRevision: number;
};
export type AiSource = AiSourceIdentity & {
  id: string;
  kind: SearchKind;
  title: string;
  lessonId: string | null;
  lessonTitle: string | null;
  href: string;
  text: string;
};
export type AiCitation = Omit<AiSource, "text">;

/** Payload/context bounds, never a daily allowance or limit on question count. */
export const aiBounds = {
  requestBytes: 32_768,
  questionCharacters: 2_000,
  historyCharacters: 4_000,
  sourceCount: 12,
  sourceCharacters: 9_600,
  planningOutputTokens: 256,
  answerOutputTokens: 600,
  requestMilliseconds: 45_000,
} as const;
