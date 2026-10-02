import type { SearchKind } from "./search";

/** Nonsecret, installation-owned configuration. Credentials never belong here. */
export type AskAiSettings = {
  enabled: boolean;
  model: string;
  sources: SearchKind[];
  guidance: string;
};
export const defaultAskAiSettings: AskAiSettings = {
  enabled: false,
  // This promotional ID stops serving instead of beginning to bill.
  model: "inclusionai/ling-3.1-flash-free",
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
  sourceCharacters: 9_600,
  planningOutputTokens: 256,
  answerOutputTokens: 600,
  requestMilliseconds: 45_000,
} as const;
