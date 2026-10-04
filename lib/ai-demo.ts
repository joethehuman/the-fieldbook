import type { ChatTransport, UIMessageChunk } from "ai";
import { demoAiReply, type AskAiMessage } from "./ai-chat";

const replies = [
  "Hoolibook is just a demo, and Gavin didn’t approve the budget for a real model. Visit [thefieldbook.org](https://thefieldbook.org/) to try production Ask AI.",
  "I escalated your request. Gavin approved a second canned response. That’s this one.",
];

/** One local transport per demo profile session; no questions leave the browser. */
export function createDemoAiTransport(): ChatTransport<AskAiMessage> {
  let questionCount = 0;
  let lastQuestionId: string | undefined;
  let reply = demoAiReply;
  return {
    async sendMessages({ messages, abortSignal }) {
      abortSignal?.throwIfAborted();
      const question = messages.findLast((message) => message.role === "user");
      if (!question) throw new Error("A question is required.");
      // Retrying the same question replays its reply without advancing the sequence.
      if (question.id !== lastQuestionId) {
        lastQuestionId = question.id;
        reply = replies[questionCount++] ?? demoAiReply;
      }
      const words = reply.match(/\S+\s*/g)!;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let closed = false;
      let abort = () => {};
      const cleanup = () => {
        clearTimeout(timer);
        abortSignal?.removeEventListener("abort", abort);
      };
      return new ReadableStream<UIMessageChunk>({
        start(controller) {
          abort = () => {
            if (closed) return;
            closed = true;
            cleanup();
            controller.error(
              new DOMException("Response stopped.", "AbortError"),
            );
          };
          abortSignal?.addEventListener("abort", abort, { once: true });
          controller.enqueue({ type: "start", messageId: crypto.randomUUID() });
          controller.enqueue({ type: "text-start", id: "answer" });
          let index = 0;
          const next = () => {
            if (closed) return;
            controller.enqueue({
              type: "text-delta",
              id: "answer",
              delta: words[index++],
            });
            if (index < words.length) {
              timer = setTimeout(next, 45);
            } else {
              controller.enqueue({ type: "text-end", id: "answer" });
              controller.enqueue({ type: "finish", finishReason: "stop" });
              closed = true;
              cleanup();
              controller.close();
            }
          };
          // The shared conversation keeps LoadingDots visible until text arrives.
          timer = setTimeout(next, 900);
        },
        cancel() {
          closed = true;
          cleanup();
        },
      });
    },
    async reconnectToStream() {
      return null;
    },
  };
}
