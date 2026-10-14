"use client";
import { SearchExperience } from "@/components/SearchExperience";
import type { Content } from "@/lib/types";
import type { SearchDestination, SearchProvider } from "@/lib/search";
import type {
  SearchSuggestionsProvider,
  SearchBrowsePath,
} from "@/lib/search-suggestions";

const noWorkspaceContent: Content[] = [];
const readerSuggestions: SearchSuggestionsProvider = async (signal) => {
  const response = await fetch("/api/search/suggestions", {
    signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Suggestions unavailable");
  return response.json();
};
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
export function ReaderSearch({
  enabled,
  userId,
  onRequestOpen,
  onOpen,
  onBrowse,
}: {
  enabled: boolean;
  userId: string | null;
  onRequestOpen?: () => void;
  onOpen: (result: SearchDestination) => Promise<boolean>;
  onBrowse: (href: SearchBrowsePath) => Promise<boolean>;
}) {
  return (
    <SearchExperience
      key={`${userId || "guest"}:${enabled}`}
      id="reader-search-results"
      content={noWorkspaceContent}
      searchProvider={searchReader}
      suggestionsProvider={readerSuggestions}
      clientNavigation
      onRequestOpen={onRequestOpen}
      aiMode={enabled ? "installed" : "off"}
      onOpen={onOpen}
      onBrowse={onBrowse}
    />
  );
}
