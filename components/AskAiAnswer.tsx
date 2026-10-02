"use client";

import { useMemo, type MouseEvent } from "react";
import { ChevronDown } from "lucide-react";
import { defaultRemarkPlugins } from "streamdown";
import type { AiCitation } from "@/lib/ai";
import { messageSources, messageText, type AskAiMessage } from "@/lib/ai-chat";
import { answerCitations, citationLinks } from "@/lib/ai-citations";
import {
  MessageResponse,
  type MessageResponseProps,
} from "./ai-elements/message";
import { Button } from "./ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";

const sourceTitle = (source: AiCitation) =>
  source.title + (source.lessonTitle ? ` — ${source.lessonTitle}` : "");

function openSource(
  event: MouseEvent<HTMLAnchorElement>,
  source: AiCitation,
  onSource: (source: AiCitation) => void,
) {
  if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
    event.preventDefault();
    onSource(source);
  }
}

export function AskAiAnswer({
  message,
  complete,
  animating,
  onSource,
}: {
  message: AskAiMessage;
  complete: boolean;
  animating: boolean;
  onSource: (source: AiCitation) => void;
}) {
  const text = messageText(message);
  const citations = useMemo(
    () => answerCitations(text, complete ? messageSources(message) : []),
    [message, complete, text],
  );
  const rendering = useMemo(
    () => ({
      remarkPlugins: [
        ...Object.values(defaultRemarkPlugins),
        // Streamdown caches processors by plugin name and serialized options.
        [
          citationLinks,
          {
            numbers: Object.fromEntries(
              [...citations.byId].map(([id, citation]) => [
                id,
                citation.number,
              ]),
            ),
          },
        ],
      ] satisfies NonNullable<MessageResponseProps["remarkPlugins"]>,
      components: {
        a: ({ href, children }: React.ComponentProps<"a">) => {
          const citation = citations.sources.find(
            (item) => href === `/__fieldbook-citation/${item.number}`,
          );
          if (!citation) return <span>{children}</span>;
          const { source, number } = citation;
          return (
            <a
              href={source.href}
              className="whitespace-nowrap"
              aria-label={`Source ${number}: ${sourceTitle(source)}`}
              title={sourceTitle(source)}
              onClick={(event) => openSource(event, source, onSource)}
            >
              {children}
            </a>
          );
        },
        img: () => null,
      },
    }),
    [citations, onSource],
  );
  return (
    <>
      <MessageResponse
        // Final metadata arrives after text; discard the streaming block cache.
        key={complete ? "complete" : "streaming"}
        mode={complete ? "static" : "streaming"}
        isAnimating={animating}
        skipHtml
        controls={false}
        {...rendering}
      >
        {text}
      </MessageResponse>
      {!!citations.sources.length && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="group">
              {citations.sources.length}{" "}
              {citations.sources.length === 1 ? "source" : "sources"}
              <ChevronDown
                aria-hidden="true"
                className="group-data-[state=open]:rotate-180"
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ul aria-label="Answer sources" className="mt-2 grid gap-2 text-sm">
              {citations.sources.map(({ number, source }) => (
                <li key={source.href}>
                  <a
                    href={source.href}
                    aria-label={`Open source ${number}: ${sourceTitle(source)}`}
                    onClick={(event) => openSource(event, source, onSource)}
                  >
                    [{number}] {sourceTitle(source)}
                  </a>
                </li>
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </>
  );
}
