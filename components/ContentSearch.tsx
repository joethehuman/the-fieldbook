"use client";
import { useEffect, useRef, useState } from "react";
import {
  demoSearch,
  type SearchFilter,
  type SearchResponse,
  type SearchResult,
} from "@/lib/search";
import type { Content } from "@/lib/types";
import type { FieldbookRuntime } from "@/lib/runtime";
import { FilterOptions } from "./patterns/filter-options";
import { SearchResultCard } from "./patterns/search-result";
import { EmptyState } from "./patterns/layout";
import { Alert } from "./ui/alert";
import { Button } from "./ui/button";
export function ContentSearch({
  query,
  content,
  runtime,
  onOpen,
}: {
  query: string;
  content: Content[];
  runtime?: FieldbookRuntime;
  onOpen: (r: SearchResult) => void;
}) {
  const [filter, setFilter] = useState<SearchFilter>("all");
  const [response, setResponse] = useState<SearchResponse>({
    results: [],
    hasMore: false,
  });
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [retry, setRetry] = useState(0);
  const [completed, setCompleted] = useState("");
  const generation = useRef(0);
  const key = query + "\n" + filter;
  // The content array belongs to the workspace, not a render-time filter.
  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    setState("loading");
    setResponse({ results: [], hasMore: false });
    const timer = setTimeout(async () => {
      try {
        const result = runtime
          ? await runtime.search(query, filter, controller.signal)
          : demoSearch(content, query, filter);
        if (current === generation.current && !controller.signal.aborted) {
          setResponse(result);
          setCompleted(key);
          setState("ready");
        }
      } catch {
        if (current === generation.current && !controller.signal.aborted) {
          setCompleted(key);
          setState("error");
        }
      }
    }, 150);
    return () => {
      generation.current++;
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, filter, content, runtime, retry, key]);
  const pending = completed !== key || state === "loading";
  return (
    <section
      className="grid gap-4"
      aria-label="Search results"
      aria-busy={pending}
    >
      <FilterOptions
        label="Content type"
        options={[
          { value: "all", label: "All" },
          { value: "brief", label: "Updates" },
          { value: "doc", label: "Docs" },
          { value: "course", label: "Courses" },
        ]}
        value={filter}
        onValueChange={(v) => setFilter(v as SearchFilter)}
      />
      <p role="status" className="text-sm text-muted-foreground">
        {pending
          ? "Searching…"
          : state === "error"
            ? "Search unavailable"
            : `${response.results.length}${response.hasMore ? " top" : ""} result${response.results.length === 1 ? "" : "s"} for “${query}”`}
      </p>
      {pending ? null : state === "error" ? (
        <Alert variant="destructive">
          <p>
            Search could not load. Try again. If your access changed, sign in
            again.
          </p>
          <Button variant="outline" onClick={() => setRetry((x) => x + 1)}>
            Retry search
          </Button>
        </Alert>
      ) : response.results.length ? (
        <div
          className="grid gap-3"
          onKeyDown={(e) => {
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key))
              return;
            const links = Array.from(e.currentTarget.querySelectorAll("a"));
            const index = links.indexOf(
              document.activeElement as HTMLAnchorElement,
            );
            if (index < 0) return;
            e.preventDefault();
            links[
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? links.length - 1
                  : Math.max(
                      0,
                      Math.min(
                        links.length - 1,
                        index + (e.key === "ArrowDown" ? 1 : -1),
                      ),
                    )
            ].focus();
          }}
        >
          {response.results.map((r) => (
            <SearchResultCard
              key={r.contentId}
              result={r}
              href={
                runtime
                  ? r.href
                  : `/?${r.lessonId ? `lesson=${encodeURIComponent(r.lessonId)}` : ""}#${r.href.split("?")[0].slice(1)}`
              }
              onOpen={runtime ? undefined : () => onOpen(r)}
            />
          ))}
        </div>
      ) : (
        <EmptyState>
          <h2>No results</h2>
          <p>Try fewer words, a different spelling or another content type.</p>
        </EmptyState>
      )}
      {!pending && response.hasMore && (
        <p className="text-sm text-muted-foreground">
          Showing the best 30 matches. Add a word or choose a content type to
          narrow your search.
        </p>
      )}
    </section>
  );
}
