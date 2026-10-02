"use client";
import { useEffect, useRef } from "react";
import type { AiCitation } from "@/lib/ai";
import { aiBounds } from "@/lib/ai";
import { messageSources, messageText } from "@/lib/ai-chat";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "./ai-elements/message";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Alert } from "./ui/alert";
import { Field } from "./ui/field";
import { ActionGroup } from "./ui/action-group";
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
  const tail = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  useEffect(() => {
    const panel = tail.current?.closest('[data-slot="search-panel"]');
    if (!panel) return;
    const scroll = () => {
      following.current =
        panel.scrollHeight - panel.scrollTop - panel.clientHeight < 100;
    };
    panel.addEventListener("scroll", scroll, { passive: true });
    return () => panel.removeEventListener("scroll", scroll);
  }, []);
  useEffect(() => {
    const panel = tail.current?.closest('[data-slot="search-panel"]');
    if (panel && following.current) panel.scrollTop = panel.scrollHeight;
  }, [chat.messages, chat.busy]);
  async function send() {
    if (await chat.submit(draft)) setDraft("");
  }
  return (
    <section
      className="grid min-w-0 gap-4 p-4"
      aria-label="Ask AI conversation"
    >
      <p className="text-sm text-muted-foreground">
        Answers from published Fieldbook content.
      </p>
      <div
        role="log"
        aria-label="Conversation messages"
        aria-live="off"
        className="grid min-w-0 gap-4"
      >
        {!chat.messages.length && (
          <p className="text-sm text-muted-foreground">
            Ask a question using the search bar or the field below.
          </p>
        )}
        {chat.messages.map((message) => {
          const complete = chat.completed.has(message.id);
          const sources = complete ? messageSources(message) : [];
          const text = messageText(message).replace(
            /\[S(\d+)\]/g,
            (marker, number) =>
              sources.some((source) => source.id === `S${number}`)
                ? `[${number}]`
                : marker,
          );
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
                    <MessageResponse
                      isAnimating={
                        chat.busy && message === chat.messages.at(-1)
                      }
                      skipHtml
                      controls={false}
                      components={{
                        a: ({ children }) => <span>{children}</span>,
                        img: () => null,
                      }}
                    >
                      {text}
                    </MessageResponse>
                    {!!sources.length && (
                      <ul
                        aria-label="Answer sources"
                        className="grid gap-1 text-sm"
                      >
                        {sources.map((source) => (
                          <li key={source.id}>
                            <a
                              href={source.href}
                              aria-label={`Source ${source.id.slice(1)}: ${source.title}${source.lessonTitle ? ` — ${source.lessonTitle}` : ""}`}
                              onClick={(event) => {
                                if (
                                  !event.metaKey &&
                                  !event.ctrlKey &&
                                  !event.shiftKey &&
                                  !event.altKey
                                ) {
                                  event.preventDefault();
                                  onSource(source);
                                }
                              }}
                            >
                              [{source.id.slice(1)}] {source.title}
                              {source.lessonTitle
                                ? ` — ${source.lessonTitle}`
                                : ""}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
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
      <p role="status" className="text-sm text-muted-foreground">
        {chat.busy
          ? "Answering…"
          : chat.notice || (chat.completion ? "Answer ready." : "")}
      </p>
      {chat.notice.startsWith("Sign in") && <a href="/auth/sign-in">Sign in</a>}
      <form
        className="sticky bottom-0 grid gap-2 border-t border-border bg-card pt-3"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <Field htmlFor={`${id}-follow-up`}>
          <span>
            {chat.messages.length ? "Ask a follow-up" : "Your question"}
          </span>
          <Textarea
            id={`${id}-follow-up`}
            size="compact"
            maxLength={aiBounds.questionCharacters}
            value={draft}
            placeholder="Ask Fieldbook a question…"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                event.keyCode !== 229
              ) {
                event.preventDefault();
                if (!event.repeat) void send();
              }
            }}
          />
        </Field>
        <ActionGroup className="justify-end">
          {chat.busy ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void chat.stop()}
            >
              Stop response
            </Button>
          ) : (
            <Button type="submit" size="sm" disabled={!draft.trim()}>
              Ask AI
            </Button>
          )}
        </ActionGroup>
      </form>
      <p className="text-xs text-muted-foreground">
        AI can make mistakes. Check the sources. This conversation clears when
        you reload or sign out.
      </p>
      <div ref={tail} />
    </section>
  );
}
