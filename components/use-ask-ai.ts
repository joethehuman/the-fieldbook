"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type ChatTransport } from "ai";
import { aiBounds, aiUnavailableMessage } from "@/lib/ai";
import {
  demoAiReply,
  messageText,
  recentAiMessages,
  type AskAiMessage,
} from "@/lib/ai-chat";

const demoTransport: ChatTransport<AskAiMessage> = {
  async sendMessages() {
    return new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "start", messageId: crypto.randomUUID() });
        controller.enqueue({ type: "text-start", id: "answer" });
        controller.enqueue({
          type: "text-delta",
          id: "answer",
          delta: demoAiReply,
        });
        controller.enqueue({ type: "text-end", id: "answer" });
        controller.enqueue({ type: "finish", finishReason: "stop" });
        controller.close();
      },
    });
  },
  async reconnectToStream() {
    return null;
  },
};

export function useAskAi(mode: "demo" | "installed" | "off") {
  const completed = useRef(new Set<string>());
  const sending = useRef(false);
  const request = useRef<Promise<void> | null>(null);
  const [notice, setNotice] = useState("");
  const [completion, setCompletion] = useState(0);
  const transport = useMemo(
    () =>
      mode === "demo"
        ? demoTransport
        : new DefaultChatTransport<AskAiMessage>({
            api: "/api/ask-ai",
            prepareSendMessagesRequest: ({ messages }) => ({
              body: { messages: recentAiMessages(messages, completed.current) },
            }),
            async fetch(input, init) {
              let response: Response;
              try {
                response = await fetch(input, { ...init, cache: "no-store" });
              } catch (error) {
                if (init?.signal?.aborted) throw error;
                throw new Error(aiUnavailableMessage);
              }
              if (!response.ok) {
                const payload = await response.json().catch(() => null);
                throw new Error(
                  typeof payload?.error === "string"
                    ? payload.error
                    : aiUnavailableMessage,
                );
              }
              return response;
            },
          }),
    [mode],
  );
  const chat = useChat<AskAiMessage>({
    transport,
    onFinish({ message, isAbort, isError, isDisconnect }) {
      if (!isAbort && !isError && !isDisconnect) {
        completed.current.add(message.id);
        setCompletion((value) => value + 1);
      }
      sending.current = false;
    },
    onError() {
      sending.current = false;
    },
  });
  const busy = chat.status === "submitted" || chat.status === "streaming";
  useEffect(
    () => () => {
      void chat.stop();
    },
    [chat.stop],
  );

  async function submit(value: string, retry = false) {
    const text = value.trim();
    if (!text || sending.current || busy || mode === "off") return false;
    if (text.length > aiBounds.questionCharacters) {
      setNotice("Use a question of up to 2,000 characters.");
      return false;
    }
    sending.current = true;
    setNotice("");
    chat.clearError();
    const previous = retry
      ? chat.messages.findLast((message) => message.role === "user")
      : undefined;
    const pending = chat.sendMessage({
      text,
      ...(previous ? { messageId: previous.id } : {}),
    });
    request.current = pending;
    void pending.finally(() => {
      sending.current = false;
      if (request.current === pending) request.current = null;
    });
    return true;
  }
  async function stop() {
    await chat.stop();
    sending.current = false;
    setNotice("Response stopped.");
  }
  async function reset() {
    await chat.stop();
    await request.current;
    completed.current.clear();
    chat.setMessages([]);
    chat.clearError();
    sending.current = false;
    setNotice("");
    setCompletion(0);
  }
  const lastQuestion = chat.messages.findLast(
    (message) => message.role === "user",
  );
  return {
    ...chat,
    busy,
    notice,
    completion,
    completed: completed.current,
    submit,
    stop,
    reset,
    retry: () =>
      lastQuestion
        ? submit(messageText(lastQuestion), true)
        : Promise.resolve(false),
  };
}
