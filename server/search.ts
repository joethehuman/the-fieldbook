import "server-only";
import type { User } from "@/lib/types";
import {
  makeResult,
  searchWords,
  type SearchFilter,
  type SearchResponse,
  type SourcePassage,
} from "@/lib/search";
import { canRead } from "./content";
import { HttpError } from "./auth";
import { data as dataStore } from "./data";
export async function retrievePublished(
  query: string,
  filter: string,
  user: User | null,
): Promise<SourcePassage[]> {
  await canRead(user);
  if (user && !user.active)
    throw new HttpError(403, "This account is inactive.");
  if (
    query.length > 160 ||
    !["all", "brief", "doc", "course"].includes(filter) ||
    (query.match(/[\p{L}\p{N}]+/gu) || []).length > 12
  )
    throw new HttpError(400, "Use up to 160 characters and 12 words.");
  if (!searchWords(query).length) return [];
  return dataStore().searchPublished(query, filter);
}
export async function searchPublished(
  query: string,
  filter: SearchFilter,
  user: User | null,
): Promise<SearchResponse> {
  const sources = await retrievePublished(query, filter, user);
  return {
    results: sources.slice(0, 30).map((s) => makeResult(s, query)),
    hasMore: sources.length > 30,
  };
}
