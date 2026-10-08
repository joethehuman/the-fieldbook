"use client";
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { Plus, Search, X } from "lucide-react";
import type { Content } from "@/lib/types";
import type { SearchProvider, SearchResult } from "@/lib/search";
import type { AiCitation } from "@/lib/ai";
import type { AskAiSessionHandle, AskAiSessionProps } from "./AskAiSession";
import { ContentSearch } from "./ContentSearch";
import { SearchPanel } from "./patterns/search-panel";
import { SearchField } from "./patterns/search-field";
import { useCompactLayout } from "./patterns/use-compact-layout";
import { AppBarSearchCompactContext } from "./patterns/app-bar";
import { Toolbar } from "./patterns/layout";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Alert } from "./ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";

function AskAiUnavailable({ target, onReady }: AskAiSessionProps) {
  useEffect(() => {
    onReady(true);
  }, [onReady]);
  return (
    target &&
    createPortal(
      <div className="grid gap-3 p-4">
        <Alert variant="destructive">
          <p>Ask AI couldn’t load. Reload the page to try again, or use Search.</p>
        </Alert>
        <Button type="button" variant="outline" onClick={() => window.location.reload()}>
          Reload page
        </Button>
      </div>,
      target,
    )
  );
}

const AskAiSession = dynamic<AskAiSessionProps>(
  () => import("./AskAiSession").catch(() => ({ default: AskAiUnavailable })),
  { ssr: false },
);

/** Mounted by the persistent workspace; panel dismissal never owns chat lifetime. */
export function SearchExperience({
  id,
  content,
  searchProvider,
  clientNavigation = false,
  aiMode,
  onOpen,
}: {
  id: string;
  content: Content[];
  searchProvider?: SearchProvider;
  clientNavigation?: boolean;
  aiMode: "installed" | "demo" | "off";
  onOpen: (result: SearchResult) => void | Promise<boolean | void>;
}) {
  const [query, setQuery] = useState("");
  const compactLayout = useCompactLayout();
  const searchCollision = useContext(AppBarSearchCompactContext);
  const compact = compactLayout || searchCollision;
  const [panel, setPanel] = useState({ compact, open: false });
  // A hidden empty panel must not revive when the field switches back to an icon.
  if (panel.compact !== compact) setPanel({ compact, open: false });
  const open = panel.compact === compact && panel.open;
  function setOpen(open: boolean) { setPanel({ compact, open }); }
  const [view, setView] = useState("search");
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const session = useRef<AskAiSessionHandle>(null);
  const [aiActivated, setAiActivated] = useState(false);
  const [aiReady, setAiReady] = useState(false);
  const [aiTarget, setAiTarget] = useState<HTMLDivElement | null>(null);
  const [initialQuestion, setInitialQuestion] = useState<string | null>(null);
  const enabled = aiMode !== "off";
  const visible = open && (compact || !!query.trim());
  useLayoutEffect(() => {
    if (compact && visible) input.current?.focus({ preventScroll: true });
  }, [compact, visible]);
  function dismiss() {
    setOpen(false);
    if (compact) searchTrigger.current?.focus({ preventScroll: true });
  }
  useLayoutEffect(() => {
    // Search starts with its first result, independently of chat autoscrolling.
    if (view === "search") {
      const results = document
        .getElementById(id)
        ?.querySelector('[data-slot="search-results-scroll"]');
      if (results) results.scrollTop = 0;
    }
  }, [id, view, query, visible]);
  function ask() {
    setAiActivated(true);
    setView("ai");
    setOpen(true);
    if (session.current) void session.current.submit(query);
    // Preserve the first question through chunk loading and repeated Enter.
    else setInitialQuestion((pending) => pending ?? query);
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
    />
  ) : null;
  const searchField = (
    <SearchField className="[&>[data-slot=input]]:pr-10">
      <Input
        ref={input}
        aria-label="Search all content"
        aria-expanded={visible}
        aria-controls={visible ? id : undefined}
        maxLength={enabled ? 2000 : 160}
        placeholder={
          enabled ? "Search or Ask AI" : "Search Fieldbook"
        }
        value={query}
        onFocus={() => setOpen(compact || !!query.trim())}
        onClick={() => setOpen(compact || !!query.trim())}
        onChange={(event) => {
          setQuery(event.target.value);
          setView("search");
          setOpen(compact || !!event.target.value.trim());
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          if (event.key === "Enter") {
            event.preventDefault();
            if (event.repeat) return;
            if (!query.trim()) return;
            if (enabled && query.trim().endsWith("?")) void ask();
            else {
              setView("search");
              setOpen(true);
            }
          }
          if (event.key === "ArrowDown") {
            if (!query.trim()) return;
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
          className="absolute right-1 size-7 rounded-full text-muted-foreground hover:text-foreground"
          onClick={() => {
            setQuery("");
            setView("search");
            input.current?.focus();
            setOpen(compact);
          }}
        >
          <X size={14} />
        </Button>
      )}
    </SearchField>
  );
  return (
    <SearchPanel
      id={id}
      open={visible}
      compact={compact}
      onDismiss={() => setOpen(false)}
      returnFocus={compact ? searchTrigger : undefined}
      persistentContent={
        enabled && aiActivated ? (
          <AskAiSession
            sessionRef={session}
            mode={aiMode}
            initialQuestion={initialQuestion}
            target={aiTarget}
            onReady={setAiReady}
            id={id}
            onSource={openSource}
            draft={draft}
            setDraft={setDraft}
          />
        ) : null
      }
      trigger={
        <Toolbar>
          {compact ? (
            <Button
              ref={searchTrigger}
              type="button"
              variant="outline"
              size="icon"
              aria-label="Open search"
              aria-expanded={visible}
              aria-controls={visible ? id : undefined}
              onClick={() => setOpen(true)}
            >
              <Search aria-hidden="true" />
            </Button>
          ) : (
            searchField
          )}
        </Toolbar>
      }
    >
      <div className="flex h-full min-h-0 flex-col">
        {compact && (
          <div className="flex shrink-0 items-center gap-2 p-4">
            <div className="min-w-0 flex-1">{searchField}</div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Close search"
              onClick={dismiss}
            >
              <X />
            </Button>
          </div>
        )}
        <div className="min-h-0 flex-1">
          {enabled ? (
            <Tabs
              value={view}
              onValueChange={(next) => {
                if (next === "ai") setAiActivated(true);
                setView(next);
              }}
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
                      setInitialQuestion(null);
                      await session.current?.reset();
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
                  {results ||
                    (compact && !query.trim() && (
                      <p className="px-4 py-3 text-copy text-muted-foreground">
                        Search courses, updates, and docs.
                      </p>
                    ))}
                </div>
              </TabsContent>
              <TabsContent value="ai" className="mt-0 min-h-0 flex-1">
                <div
                  ref={setAiTarget}
                  className="h-full min-h-0"
                  aria-busy={!aiReady}
                >
                  {!aiReady && (
                    <span className="sr-only" role="status">
                      Loading Ask AI…
                    </span>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          ) : (
            <div
              data-slot="search-results-scroll"
              className="h-full overflow-y-auto overscroll-contain [scrollbar-gutter:stable_both-edges]"
            >
              {results ||
                (compact && !query.trim() && (
                  <p className="px-4 py-3 text-copy text-muted-foreground">
                    Search courses, updates, and docs.
                  </p>
                ))}
            </div>
          )}
        </div>
      </div>
    </SearchPanel>
  );
}
