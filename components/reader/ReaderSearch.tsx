"use client";
import { SearchExperience } from "@/components/SearchExperience";
import type { Content } from "@/lib/types";
import type { SearchResult, SearchProvider } from "@/lib/search";

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
export function ReaderSearch({
  enabled,
  userId,
  onOpen,
}: {
  enabled: boolean;
  userId: string | null;
  onOpen: (result: SearchResult) => Promise<boolean>;
}) {
  return (
    <SearchExperience
      key={`${userId || "guest"}:${enabled}`}
      id="reader-search-results"
      content={noWorkspaceContent}
      searchProvider={searchReader}
      clientNavigation
      aiMode={enabled ? "installed" : "off"}
      onOpen={onOpen}
    />
  );
}
