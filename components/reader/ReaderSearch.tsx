"use client";
import { useState } from "react";
import { X } from "lucide-react";
import { ContentSearch } from "@/components/ContentSearch";
import { SearchPanel } from "@/components/patterns/search-panel";
import { SearchField } from "@/components/patterns/search-field";
import { Toolbar } from "@/components/patterns/layout";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Content } from "@/lib/types";
import type { SearchProvider } from "@/lib/search";

const noWorkspaceContent: Content[] = [];
const searchReader: SearchProvider = async (query, filter, signal) => {
  const response = await fetch(
    `/api/search?q=${encodeURIComponent(query)}&type=${filter}`,
    {
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
      cache: "no-store",
    },
  );
  if (!response.ok) throw new Error("Search unavailable");
  return response.json();
};
export function ReaderSearch() {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <SearchPanel
      id="reader-search-results"
      open={!!query && open}
      onDismiss={() => setOpen(false)}
      trigger={
        <Toolbar>
          <SearchField>
            <Input
              aria-label="Search all content"
              aria-expanded={!!query && open}
              aria-controls={
                query && open ? "reader-search-results" : undefined
              }
              maxLength={160}
              placeholder="Search fieldbook…"
              value={query}
              onFocus={() => setOpen(true)}
              onChange={(event) => {
                setQuery(event.target.value);
                setOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  const first = document.querySelector<HTMLAnchorElement>(
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
                variant="ghost"
                size="icon"
                aria-label="Clear search"
                onClick={() => setQuery("")}
              >
                <X size={14} />
              </Button>
            )}
          </SearchField>
        </Toolbar>
      }
    >
      <ContentSearch
        query={query}
        content={noWorkspaceContent}
        searchProvider={searchReader}
        clientNavigation
        onOpen={() => setOpen(false)}
      />
    </SearchPanel>
  );
}
