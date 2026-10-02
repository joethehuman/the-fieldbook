import type { UIMessage } from "ai";
import type { AiCitation } from "./ai";
import { aiBounds } from "./ai";

export type AskAiMessage = UIMessage<unknown, { sources: AiCitation[] }>;
export const demoAiReply = "This feature is not available in the demo site.";

export function messageText(message: AskAiMessage) {
  return message.parts
    .flatMap((part) => (part.type === "text" ? [part.text] : []))
    .join("\n");
}

/** Only recent text goes back to the server, never citations or partial answers. */
export function recentAiMessages(
  messages: AskAiMessage[],
  completed: ReadonlySet<string>,
) {
  const question = messages.at(-1);
  if (!question || question.role !== "user")
    throw new Error("A question is required.");
  const recent = [];
  let remaining = aiBounds.historyCharacters;
  for (const message of messages.slice(0, -1).reverse()) {
    if (message.role === "assistant" && !completed.has(message.id)) continue;
    if (message.role !== "user" && message.role !== "assistant") continue;
    const text = messageText(message).trim();
    if (!text) continue;
    if (text.length > remaining || recent.length === 6) break;
    recent.unshift({
      id: message.id,
      role: message.role,
      parts: [{ type: "text" as const, text }],
    });
    remaining -= text.length;
  }
  return [
    ...recent,
    {
      id: question.id,
      role: "user" as const,
      parts: [{ type: "text" as const, text: messageText(question).trim() }],
    },
  ];
}

/** Navigation uses server-issued identities, never model-written URLs. */
export function messageSources(message: AskAiMessage): AiCitation[] {
  const part = message.parts.findLast((part) => part.type === "data-sources");
  if (!part || part.type !== "data-sources" || !Array.isArray(part.data))
    return [];
  return part.data
    .filter((source) => {
      if (
        !source ||
        !/^S\d+$/.test(source.id) ||
        typeof source.contentId !== "string"
      )
        return false;
      const section =
        source.kind === "doc"
          ? "docs"
          : source.kind === "course"
            ? "courses"
            : source.kind === "brief"
              ? "updates"
              : null;
      if (!section || typeof source.title !== "string") return false;
      const href = `/${section}/${encodeURIComponent(source.contentId)}${source.lessonId ? `?lesson=${encodeURIComponent(source.lessonId)}` : ""}`;
      return source.href === href;
    })
    .slice(0, 3);
}
