import "server-only";
import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import type { AiEvent } from "./ask-ai";
import { aiUnavailableMessage } from "@/lib/ai";
import { HttpError } from "./errors";

/** Generic AI SDK UI transport; provider-specific streams never escape the port. */
export function askAiResponse(
  events: AsyncIterable<AiEvent>,
  controller: AbortController,
  signal = controller.signal,
) {
  const stream = createUIMessageStream({
    async execute({ writer }) {
      writer.write({ type: "start" });
      writer.write({ type: "text-start", id: "answer" });
      try {
        for await (const event of events) {
          if (event.type === "text")
            writer.write({
              type: "text-delta",
              id: "answer",
              delta: event.text,
            });
          else writer.write({ type: "data-sources", data: event.sources });
        }
        writer.write({ type: "text-end", id: "answer" });
        writer.setOutcome({ status: "completed" });
        writer.write({ type: "finish", finishReason: "stop" });
      } catch (error) {
        if (signal.aborted && signal.reason?.name !== "TimeoutError") {
          writer.setOutcome({ status: "aborted" });
          writer.write({ type: "abort" });
        } else throw error;
      }
    },
    onError: (error) =>
      signal.reason?.name === "TimeoutError"
        ? "Ask AI took too long. Try again or use Search."
        : error instanceof HttpError && error.status !== 503
          ? error.message
          : aiUnavailableMessage,
  });
  const response = createUIMessageStreamResponse({
    stream,
    headers: {
      "Cache-Control": "private, no-store",
      Vary: "Cookie",
      "X-Accel-Buffering": "no",
    },
  });
  // Cancellation must reach both model calls; no detached/resumable background stream.
  const reader = response.body!.getReader();
  const cancellable = new ReadableStream({
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    async cancel() {
      controller.abort();
      await reader.cancel();
    },
  });
  return new Response(cancellable, {
    status: response.status,
    headers: response.headers,
  });
}
