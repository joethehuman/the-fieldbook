"use client";
import { useEffect, useRef } from "react";
import type { AiCitation } from "@/lib/ai";
import { aiBounds } from "@/lib/ai";
import { messageText } from "@/lib/ai-chat";
import { Message, MessageContent } from "./ai-elements/message";
import { AskAiAnswer } from "./AskAiAnswer";
import { Button } from "./ui/button";
import { Alert } from "./ui/alert";
import { LoadingDots } from "./ui/loading-dots";
import { MessageComposer } from "./patterns/message-composer";
import type { useAskAi } from "./use-ask-ai";

export function AskAiConversation({
  chat,
  onSource,
  id,
  draft,
  setDraft,
}: {
  id: string;
  draft: string;
  setDraft: (value: string) => void;
  chat: ReturnType<typeof useAskAi>;
  onSource: (source: AiCitation) => void;
}) {
  const transcript = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  const latest = chat.messages.at(-1);
  const thinking =
    chat.busy &&
    (!latest || latest.role === "user" || !messageText(latest).trim());
  useEffect(() => {
    const scrollArea = transcript.current;
    if (!scrollArea) return;
    const scroll = () => {
      following.current =
        scrollArea.scrollHeight -
          scrollArea.scrollTop -
          scrollArea.clientHeight <
        100;
    };
    scrollArea.addEventListener("scroll", scroll, { passive: true });
    const resize = new ResizeObserver(() => {
      if (following.current) scrollArea.scrollTop = scrollArea.scrollHeight;
    });
    resize.observe(scrollArea);
    return () => {
      scrollArea.removeEventListener("scroll", scroll);
      resize.disconnect();
    };
  }, []);
  useEffect(() => {
    const scrollArea = transcript.current;
    if (scrollArea && following.current)
      scrollArea.scrollTop = scrollArea.scrollHeight;
  }, [chat.messages, chat.busy]);
  async function send() {
    if (await chat.submit(draft)) setDraft("");
  }
  return (
    <section
      className="flex h-full min-h-0 min-w-0 flex-col"
      aria-label="Ask AI conversation"
    >
      <div
        ref={transcript}
        data-slot="conversation-scroll"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 [scrollbar-gutter:stable_both-edges]"
      >
        <div className="grid min-w-0 gap-4">
          <div
            role="log"
            aria-label="Conversation messages"
            aria-live="off"
            className="grid min-w-0 gap-4"
          >
            {chat.messages.map((message) => {
              const complete = chat.completed.has(message.id);
              const text = messageText(message);
              // SDK start/text-start can create an empty assistant before text arrives.
              // Keep one pending row in its place throughout planning and streaming setup.
              if (message.role === "assistant" && !text.trim()) return null;
              return (
                <Message key={message.id} from={message.role}>
                  <span className="sr-only">
                    {message.role === "user" ? "You" : "Fieldbook AI"}
                  </span>
                  <MessageContent>
                    {message.role === "user" ? (
                      <p className="whitespace-pre-wrap break-words">{text}</p>
                    ) : (
                      <>
                        <AskAiAnswer
                          message={message}
                          demo={chat.demo}
                          complete={complete}
                          animating={
                            chat.busy && message === chat.messages.at(-1)
                          }
                          onSource={onSource}
                        />
                        {!!text &&
                          !complete &&
                          (!chat.busy || message !== chat.messages.at(-1)) && (
                            <p className="text-sm text-muted-foreground">
                              Response incomplete.
                            </p>
                          )}
                      </>
                    )}
                  </MessageContent>
                </Message>
              );
            })}
            {thinking && (
              <Message from="assistant">
                <MessageContent>
                  <LoadingDots />
                </MessageContent>
              </Message>
            )}
          </div>
          {chat.error && (
            <Alert variant="destructive">
              <p>{chat.error.message}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={chat.busy}
                onClick={() => void chat.retry()}
              >
                Retry answer
              </Button>
            </Alert>
          )}
          <p
            role="status"
            className={
              !chat.busy && chat.notice
                ? "text-sm text-muted-foreground"
                : "sr-only"
            }
          >
            {chat.busy
              ? "Answering…"
              : chat.notice || (chat.completion ? "Answer ready." : "")}
          </p>
          {chat.notice.startsWith("Sign in") && (
            <a href="/auth/sign-in">Sign in</a>
          )}
        </div>
      </div>
      <div className="grid shrink-0 gap-3 bg-card p-4">
        <MessageComposer
          id={`${id}-follow-up`}
          label={chat.messages.length ? "Ask a follow-up" : "Your question"}
          value={draft}
          onValueChange={setDraft}
          onSend={() => void send()}
          onStop={() => void chat.stop()}
          busy={chat.busy}
          maxLength={aiBounds.questionCharacters}
          placeholder="Ask Fieldbook a question…"
        />
        <p className="text-xs text-muted-foreground">
          AI can make mistakes. This chat clears on reload or sign-out.
        </p>
      </div>
    </section>
  );
}
