"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import type { Content } from "@/lib/types";
import type { SearchProvider, SearchResult } from "@/lib/search";
import type { AiCitation } from "@/lib/ai";
import { useAskAi } from "./use-ask-ai";
import { AskAiConversation } from "./AskAiConversation";
import { ContentSearch } from "./ContentSearch";
import { SearchPanel } from "./patterns/search-panel";
import { SearchField } from "./patterns/search-field";
import { Toolbar } from "./patterns/layout";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";

/** Mounted by the persistent workspace; panel dismissal never owns chat lifetime. */
export function SearchExperience({
  id,
  content,
  searchProvider,
  clientNavigation = false,
  aiMode,
  signedIn,
  onOpen,
}: {
  id: string;
  content: Content[];
  searchProvider?: SearchProvider;
  clientNavigation?: boolean;
  aiMode: "installed" | "demo" | "off";
  signedIn: boolean;
  onOpen: (result: SearchResult) => void | Promise<boolean | void>;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [view, setView] = useState("search");
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const chat = useAskAi(aiMode, signedIn);
  const enabled = aiMode !== "off";
  const visible =
    open &&
    (!!query.trim() || (enabled && (view === "ai" || !!chat.messages.length)));
  useLayoutEffect(() => {
    // Search starts with its first result, independently of chat autoscrolling.
    if (view === "search") {
      const results = document
        .getElementById(id)
        ?.querySelector('[data-slot="search-results-scroll"]');
      if (results) results.scrollTop = 0;
    }
  }, [id, view, query, visible]);
  async function ask() {
    setView("ai");
    setOpen(true);
    await chat.submit(query);
  }
  async function openResult(result: SearchResult) {
    if ((await onOpen(result)) !== false) setOpen(false);
  }
  function openSource(source: AiCitation) {
    void openResult({
      ...source,
      excerpt: "",
      highlights: [],
      contentDate: null,
    });
  }
  const results = query.trim() ? (
    <ContentSearch
      query={query.trim().slice(0, 160).split(/\s+/).slice(0, 12).join(" ")}
      content={content}
      searchProvider={searchProvider}
      clientNavigation={clientNavigation}
      onOpen={(result) => void openResult(result)}
      onAskAi={enabled ? () => void ask() : undefined}
    />
  ) : (
    <p className="p-4 text-sm text-muted-foreground">
      Type in the search bar to find content.
    </p>
  );
  return (
    <SearchPanel
      id={id}
      open={visible}
      onDismiss={() => setOpen(false)}
      trigger={
        <Toolbar>
          <SearchField>
            <Input
              ref={input}
              aria-label="Search all content"
              aria-expanded={visible}
              aria-controls={visible ? id : undefined}
              maxLength={enabled ? 2000 : 160}
              placeholder={
                enabled ? "Search Fieldbook or Ask AI" : "Search Fieldbook"
              }
              value={query}
              onFocus={() => setOpen(true)}
              onClick={() => setOpen(true)}
              onChange={(event) => {
                setQuery(event.target.value);
                setView("search");
                setOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.keyCode === 229)
                  return;
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (event.repeat) return;
                  if (enabled && query.trim().endsWith("?")) void ask();
                  else {
                    setView("search");
                    setOpen(true);
                  }
                }
                if (event.key === "ArrowDown") {
                  setOpen(true);
                  const first = document
                    .getElementById(id)
                    ?.querySelector<HTMLAnchorElement>(
                      '[aria-label="Search results"] a',
                    );
                  if (first) {
                    event.preventDefault();
                    first.focus();
                  }
                }
              }}
            />
            {query && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Clear search"
                onClick={() => {
                  setQuery("");
                  setView("search");
                  input.current?.focus();
                }}
              >
                <X size={14} />
              </Button>
            )}
          </SearchField>
        </Toolbar>
      }
    >
      {enabled ? (
        <Tabs
          value={view}
          onValueChange={setView}
          className="flex h-full min-h-0 flex-col"
        >
          <div className="flex shrink-0 items-center justify-between gap-2 bg-card px-4 pt-2">
            <TabsList aria-label="Search and Ask AI">
              <TabsTrigger value="search">Search</TabsTrigger>
              <TabsTrigger value="ai">Ask AI</TabsTrigger>
            </TabsList>
            {view === "ai" && (
              <Button
                type="button"
                variant="ghost"
                size="default"
                onClick={async () => {
                  await chat.reset();
                  setDraft("");
                }}
              >
                <Plus aria-hidden="true" />
                New conversation
              </Button>
            )}
          </div>
          <TabsContent value="search" className="mt-0 min-h-0 flex-1">
            <div
              data-slot="search-results-scroll"
              className="h-full overflow-y-auto overscroll-contain [scrollbar-gutter:stable_both-edges]"
            >
              {results}
            </div>
          </TabsContent>
          <TabsContent value="ai" className="mt-0 min-h-0 flex-1">
            <AskAiConversation
              id={id}
              chat={chat}
              onSource={openSource}
              draft={draft}
              setDraft={setDraft}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <div
          data-slot="search-results-scroll"
          className="h-full overflow-y-auto overscroll-contain [scrollbar-gutter:stable_both-edges]"
        >
          {results}
        </div>
      )}
    </SearchPanel>
  );
}
