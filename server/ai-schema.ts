import { z } from "zod";
import { aiBounds, type AiMessage } from "@/lib/ai";
import { HttpError } from "./errors";

export { askAiSettingsSchema, aiSearchPlanSchema } from "@/lib/ai-schema";

const messageSchema = z
  .object({
    id: z.string().max(100).optional(),
    role: z.enum(["user", "assistant"]),
    parts: z
      .array(
        z
          .object({
            type: z.literal("text"),
            text: z.string().max(4_000),
          })
          .strict(),
      )
      .min(1)
      .max(4),
  })
  .strict();
const requestSchema = z
  .object({
    messages: z.array(messageSchema).min(1).max(32),
    id: z.string().max(100).optional(),
    trigger: z.literal("submit-user-message").optional(),
  })
  .strict();

/** Accept text only. Source/tool/system parts from a browser are never trusted. */
export function parseAiMessages(input: unknown): AiMessage[] {
  const parsed = requestSchema.safeParse(input);
  if (!parsed.success)
    throw new HttpError(
      400,
      "Send a question and recent conversation text only.",
    );
  const messages = parsed.data.messages.map((message) => ({
    role: message.role,
    text: message.parts
      .map((part) => part.text)
      .join("\n")
      .trim(),
  }));
  const question = messages.at(-1)!;
  if (
    question.role !== "user" ||
    !question.text ||
    question.text.length > aiBounds.questionCharacters
  )
    throw new HttpError(400, "Use a question of up to 2,000 characters.");
  const recent: AiMessage[] = [];
  let remaining = aiBounds.historyCharacters;
  for (const message of messages.slice(0, -1).reverse()) {
    if (!message.text) continue;
    if (message.text.length > remaining) break;
    recent.unshift(message);
    remaining -= message.text.length;
    if (recent.length === 6) break;
  }
  return [...recent, question];
}

/** Bound bytes while reading, including requests without Content-Length. */
export async function readAiRequest(request: Request, signal = request.signal) {
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    throw new HttpError(415, "Send a JSON question.");
  const length = Number(request.headers.get("content-length"));
  if (length > aiBounds.requestBytes)
    throw new HttpError(413, "The question is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "A question is required.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  const abort = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > aiBounds.requestBytes)
        throw new HttpError(413, "The question is too large.");
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener("abort", abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  try {
    const data = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data));
  } catch {
    throw new HttpError(400, "Send a valid JSON question.");
  }
}
