import "server-only";
import type { User } from "@/lib/types";
import {
  contentDate,
  makeResult,
  searchWords,
  type SearchFilter,
  type SearchResponse,
  type SourcePassage,
} from "@/lib/search";
import { canRead } from "./content";
import { HttpError } from "./auth";
import { db, check } from "./db";
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
  const { data, error } = await db().rpc("fb_search", {
    p_query: query,
    p_kind: filter,
    p_limit: 31,
  });
  check(error);
  return (data || []).map((r: any) => ({
    contentId: r.content_id,
    passageId: r.passage_id,
    kind: r.kind,
    title: r.title,
    lessonId: r.lesson_id,
    lessonTitle: r.lesson_title,
    text: r.source_text,
    matchedTerms: r.matched_terms,
    publishedRevision: r.published_revision,
    contentDate: contentDate(r.content_date),
  }));
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
