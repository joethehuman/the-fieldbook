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
import type { SearchProvider, SearchDestination } from "@/lib/search";
import {
  searchSuggestions,
  type SearchSuggestion,
  type SearchSuggestionsProvider,
  type SearchBrowsePath,
} from "@/lib/search-suggestions";
import type { AiCitation } from "@/lib/ai";
import type { AskAiSessionHandle, AskAiSessionProps } from "./AskAiSession";
import { ContentSearch } from "./ContentSearch";
import { SearchSuggestions } from "./SearchSuggestions";
import { SearchPanel, SearchEscapeHint } from "./patterns/search-panel";
import { SearchField } from "./patterns/search-field";
import { useCompactLayout } from "./patterns/use-compact-layout";
import { AppBarSearchCompactContext } from "./patterns/app-bar";
import { Toolbar } from "./patterns/layout";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Alert } from "./ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";

function AskAiUnavailable({ target, onReady, escapeHint }: AskAiSessionProps) {
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
        {escapeHint && <div className="flex justify-end">{escapeHint}</div>}
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
  suggestions,
  suggestionsProvider,
  clientNavigation = false,
  aiMode,
  onRequestOpen,
  onOpen,
  onBrowse,
}: {
  id: string;
  content: Content[];
  searchProvider?: SearchProvider;
  suggestions?: SearchSuggestion[];
  suggestionsProvider?: SearchSuggestionsProvider;
  clientNavigation?: boolean;
  aiMode: "installed" | "demo" | "off";
  onRequestOpen?: () => void;
  onOpen: (result: SearchDestination) => void | Promise<boolean | void>;
  onBrowse?: (href: SearchBrowsePath) => void | Promise<boolean | void>;
}) {
  const [query, setQuery] = useState("");
  const compactLayout = useCompactLayout();
  const searchCollision = useContext(AppBarSearchCompactContext);
  const compact = compactLayout || searchCollision;
  const [panel, setPanel] = useState({ compact, fullScreen: compactLayout, open: false });
  // Changing presentation closes the surface without clearing the query or chat.
  if (panel.compact !== compact || panel.fullScreen !== compactLayout)
    setPanel({ compact, fullScreen: compactLayout, open: false });
  const open = panel.compact === compact && panel.fullScreen === compactLayout && panel.open;
  function setOpen(open: boolean) { setPanel({ compact, fullScreen: compactLayout, open }); }
  const [view, setView] = useState("search");
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const session = useRef<AskAiSessionHandle>(null);
  const [aiActivated, setAiActivated] = useState(false);
  const [aiReady, setAiReady] = useState(false);
  const [aiTarget, setAiTarget] = useState<HTMLDivElement | null>(null);
  const [initialQuestion, setInitialQuestion] = useState<string | null>(null);
  const [shortcut, setShortcut] = useState("Ctrl K");
  const enabled = aiMode !== "off";
  const visible = open;
  const fitContent = view === "search" && !query.trim();
  const fitPanel = fitContent && !compactLayout;
  const escapeHint = compactLayout ? null : <SearchEscapeHint />;
  const showSuggestions = visible && fitContent;
  const [suggested, setSuggested] = useState<{
    items: SearchSuggestion[];
    loading: boolean;
    error: boolean;
  }>({ items: [], loading: false, error: false });
  useEffect(() => {
    if (!showSuggestions || !suggestionsProvider) return;
    const controller = new AbortController();
    setSuggested((previous) => ({ ...previous, loading: true, error: false }));
    void suggestionsProvider(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted)
          setSuggested({ items, loading: false, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setSuggested({ items: [], loading: false, error: true });
      });
    return () => controller.abort();
  }, [showSuggestions, suggestionsProvider]);
  useEffect(() => {
    setShortcut(/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘ K" : "Ctrl K");
    const focusSearch = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "k" || event.isComposing || event.repeat) return;
      const dialog = document.activeElement?.closest('[role="dialog"], [role="alertdialog"]');
      if (dialog && dialog.id !== id) return;
      event.preventDefault();
      onRequestOpen?.();
      setPanel({ compact, fullScreen: compactLayout, open: true });
      if (input.current) {
        input.current?.focus({ preventScroll: true });
        input.current?.select();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, [compact, compactLayout, id, onRequestOpen]);
  useLayoutEffect(() => {
    if (compact && visible) input.current?.focus({ preventScroll: true });
  }, [compact, visible]);
  function dismiss() {
    setOpen(false);
    if (compact && !compactLayout) searchTrigger.current?.focus({ preventScroll: true });
  }
  useLayoutEffect(() => {
    // Search starts with its first result, independently of chat autoscrolling.
    if (view === "search") {
      const results = document
        .getElementById(id)
        ?.querySelector(
          '[data-slot="search-suggestions-scroll"], [data-slot="search-results-scroll"]',
        );
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
  async function openResult(result: SearchDestination) {
    if ((await onOpen(result)) !== false) setOpen(false);
  }
  async function browse(href: SearchBrowsePath) {
    if (onBrowse && (await onBrowse(href)) !== false) setOpen(false);
  }
  function openSource(source: AiCitation) {
    void openResult(source);
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
    <SearchField className={!query && !compact ? "[&>[data-slot=input]]:pr-16" : "[&>[data-slot=input]]:pr-10"}>
      <Input
        ref={input}
        aria-label="Search all content"
        aria-expanded={visible}
        aria-controls={visible ? id : undefined}
        aria-keyshortcuts="Meta+K Control+K"
        maxLength={enabled ? 2000 : 160}
        placeholder={
          enabled ? "Search or Ask AI" : "Search Fieldbook"
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
            setOpen(true);
            const first = document
              .getElementById(id)
              ?.querySelector<HTMLAnchorElement>(
                '[aria-label="Search results"] a, [aria-label="Search suggestions"] a',
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
            input.current?.focus({ preventScroll: true });
            setOpen(true);
          }}
        >
          <X size={14} />
        </Button>
      )}
      {!query && !compact && <kbd className="search-shortcut" aria-hidden="true">{shortcut}</kbd>}
    </SearchField>
  );
  const emptySearch = (
    <SearchSuggestions
      items={suggestionsProvider ? suggested.items : suggestions || searchSuggestions({ content })}
      loading={!!suggestionsProvider && suggested.loading}
      error={suggested.error}
      clientNavigation={clientNavigation}
      onOpen={(item) => void openResult(item)}
      onBrowse={onBrowse ? (href) => void browse(href) : undefined}
      escapeHint={escapeHint}
    />
  );
  return (
    <SearchPanel
      id={id}
      open={visible}
      compact={compact}
      fullScreen={compactLayout}
      fitContent={fitPanel}
      showEscapeHint={view === "search" && !fitContent}
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
            escapeHint={escapeHint}
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
              aria-keyshortcuts="Meta+K Control+K"
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
      <div
        data-slot={fitPanel ? "search-suggestions-scroll" : undefined}
        className={`flex min-h-0 flex-1 flex-col ${fitPanel ? "overflow-y-auto overscroll-contain" : ""}`}
      >
        {compact && (
          <div data-slot="search-compact-header" className={`flex shrink-0 items-center gap-2 px-4 ${compactLayout ? "py-3" : "py-4"}`}>
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
        <div className={`flex min-h-0 flex-col ${fitPanel ? "flex-none" : "flex-1"}`}>
          {enabled ? (
            <Tabs
              value={view}
              onValueChange={(next) => {
                if (next === "ai") setAiActivated(true);
                setView(next);
              }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 bg-card px-4 pt-2">
                <TabsList aria-label="Search and Ask AI">
                  <TabsTrigger value="search">Search</TabsTrigger>
                  <TabsTrigger value="ai">Ask AI</TabsTrigger>
                </TabsList>
                {view === "ai" && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="default"
                    aria-label="New conversation"
                    className="search-new-conversation"
                    onClick={async () => {
                      setInitialQuestion(null);
                      await session.current?.reset();
                      setDraft("");
                    }}
                  >
                    <Plus aria-hidden="true" />
                    <span className="search-new-conversation-label">New conversation</span>
                  </Button>
                )}
              </div>
              <TabsContent value="search" className="mt-0 flex min-h-0 flex-1 flex-col">
                <div
                  data-slot={compactLayout && fitContent ? "search-suggestions-scroll" : "search-results-scroll"}
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable_both-edges]"
                >
                  {results || emptySearch}
                </div>
              </TabsContent>
              <TabsContent value="ai" className="mt-0 flex min-h-0 flex-1 flex-col">
                <div
                  ref={setAiTarget}
                  className="min-h-0 flex-1"
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
              data-slot={compactLayout && fitContent ? "search-suggestions-scroll" : "search-results-scroll"}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable_both-edges]"
            >
              {results || emptySearch}
            </div>
          )}
        </div>
      </div>
    </SearchPanel>
  );
}
