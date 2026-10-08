"use client";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { createPortal } from "react-dom";
import type { AiCitation } from "@/lib/ai";
import { useAskAi } from "./use-ask-ai";
import { AskAiConversation } from "./AskAiConversation";

export type AskAiSessionHandle = Pick<
  ReturnType<typeof useAskAi>,
  "submit" | "reset"
>;

export type AskAiSessionProps = {
  sessionRef: Ref<AskAiSessionHandle>;
  mode: "installed" | "demo";
  initialQuestion: string | null;
  target: HTMLDivElement | null;
  onReady: (ready: boolean) => void;
  id: string;
  draft: string;
  setDraft: (value: string) => void;
  onSource: (source: AiCitation) => void;
};

/** Activated once per workspace session, independently of the visible panel/tab. */
export default function AskAiSession({
  sessionRef,
  mode,
  initialQuestion,
  target,
  onReady,
  ...conversation
}: AskAiSessionProps) {
  const chat = useAskAi(mode);
  const submittedInitial = useRef(false);
  useImperativeHandle(sessionRef, () => ({
    submit: chat.submit,
    reset: chat.reset,
  }));
  useEffect(() => {
    onReady(true);
    if (initialQuestion === null || submittedInitial.current) return;
    // Wait for mount effects to settle so Strict Mode's cleanup cannot abort
    // the queued first question before its real session is ready.
    let active = true;
    queueMicrotask(() => {
      if (!active || submittedInitial.current) return;
      submittedInitial.current = true;
      void chat.submit(initialQuestion);
    });
    return () => {
      active = false;
    };
  }, [initialQuestion, onReady, chat.submit]);

  // Only the renderer follows panel/tab visibility; streaming stays in this owner.
  return (
    target &&
    createPortal(<AskAiConversation {...conversation} chat={chat} />, target)
  );
}
