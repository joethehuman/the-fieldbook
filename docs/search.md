# Published-content search

The shared search field searches published Updates, Docs and Courses, including lesson titles and text. Results show the content type, title, a matching excerpt and (when available) the published snapshot's content date. Course lesson matches name and open that lesson. All / Updates / Docs / Courses narrow the collection. Tab reaches filters and links; Down from the search field enters results; Up/Down and Home/End move between results; Enter opens a result; Escape closes the panel and returns focus to the search field; the clear button removes the query. Clicking outside or tabbing out dismisses the panel, and focusing the field reopens it. These are ordinary links, including open-in-new-tab behavior.

Results appear in a contained panel below the shared search field, leaving the current page and in-progress edits mounted. The panel caps its height and scrolls internally, keeps type filters visible, and fits narrow screens. Immediate skeleton rows show the result layout while waiting; they are placeholders, not prefetched content, and respect reduced-motion preferences.

Results update after a 150 ms typing pause. Pending queries clear old results; cancelled or late responses cannot overwrite the current query. Failures show a retry action. The browser stops waiting after eight seconds. The endpoint and browser fetch disable response caching. A successful empty query is distinct from a failed request.

## Installation and upgrade

Apply `supabase/migrations/20260921205449_published_search.sql` **after all earlier migrations and before deploying code that uses search**. Use an isolated backend first; back up the real database and keep your migration ledger. Execute the entire migration in one transaction. It creates `pg_trgm`, two derived tables, indexes, an indexing trigger and a server-only search function. The normal Supabase extension schema is `extensions`. No external service, API key, background worker or model provider is required.

The migration backfills published snapshots without changing source documents, dates, revisions, drafts, progress or assignments. Expect database work proportional to the existing library; rehearse with representative data and schedule a maintenance window for a larger installation. Source writes during the migration should be paused. The DDL and backfill must commit together, so failed setup cannot leave a partially populated index serving results.

After applying it in isolation:

1. Search a title, a body-only phrase, a lesson-only phrase and a typo. Open the lesson result and reload it.
2. Save a draft change: results, source revision and content date must stay unchanged. Publish it: results must reflect the published text and revision.
3. Unpublish and delete sample items: their results must disappear. Try anonymous search on a private installation and an inactive account: both must be denied.
4. Check `EXPLAIN (ANALYZE, BUFFERS) SELECT public.fb_search('your representative query','all',31)` using an authorized database session. Measure the API and browser separately; a database plan excludes authentication, network travel, rendering and the typing delay.

New source changes update the index in the same database transaction. Deletion cascades to passages; publication/unpublication rebuilds/removes them. There is no asynchronous indexing delay. A failure in indexing fails the source write rather than silently leaving stale results. The old application remains compatible with the additive schema, so code rollback can leave the migration in place. Do not replay the migration. Forward-fix a broken index after rehearsal instead of reverting source data.

The internal vocabulary can retain words from formerly published content to avoid cross-document maintenance races. It is not exposed as suggestions or an API, and never produces results without a matching current published passage. To compact it during maintenance, pause source writes and rebuild `fb_search_words` from distinct `unnest(tsvector_to_array(search_vector))` values in `fb_search_passages` within a transaction. Do not grant browser access to either derived table or function.

## Retrieval and access contract

`server/search.ts` owns retrieval; `lib/search.ts` defines the provider-independent contract. `GET /api/search?q=…&type=all|brief|doc|course` returns up to 30 content results plus `hasMore`. Each result carries `contentId`, `kind`, `title`, `passageId`, `lessonId`/`lessonTitle`, `publishedRevision`, `contentDate`, `excerpt`, plain highlight terms and a source `href`. One best passage represents each content item. Add words or a type filter when more matches exist; there is no total count or paging UI. The database RPC returns one JSON value, so the 31-row lookahead is not truncated by a low PostgREST row cap.

The server's `retrievePublished` boundary also retains complete underlying source text and its published revision for citation work. It does not return draft revision numbers as source revisions. It is not a historical revision archive: if content changes, a consumer must compare the published revision before relying on an earlier citation. Optional [Ask AI](ask-ai.md) adds a separate bounded passage retrieval and streaming API. Ordinary search performs no model call. When an administrator enables Ask AI and chooses a supported router and model, Search also opens a temporary published-source conversation. Fieldbook does not store that conversation or use embeddings; see the Ask AI guide for access, citations and provider-data limits.

The server verifies identity and active-account status and checks installation access before searching. Anonymous access is allowed only for public installations. Learning groups do not restrict published content. Administrators use the same published-only learner search; role-aware MCP content search is separate, includes authorized drafts, and uses cursor pagination. Quiz prompts/options/answer keys are not indexed. Tables have RLS and no anonymous/authenticated grants; only the trusted server role can call the RPC. Do not expose a service key to a browser.

## Ranking, dates and limitations

Search requires every query word, with prefix matching and limited typo expansion for unknown words of at least four characters. PostgreSQL's `simple` text configuration preserves words rather than applying English stemming. A GIN full-text index retrieves passages; a trigram index finds up to two nearby vocabulary words per unknown term. Exact title matches lead, followed by title/lesson-heading matches and body matches. This is lexical retrieval: there are no synonyms, semantic answers or guaranteed corrections for every spelling error. Limits are 160 characters and 12 words. Unsupported long queries fail explicitly.

Relevance dominates. A published Update's date breaks otherwise equal relevance scores. Dates come from published `updatedAt`, falling back to published `createdAt`; missing/invalid dates are omitted. Source `fb_documents.updated_at`, newer draft timestamps and unrelated database writes are not freshness signals. “Content updated” describes a content edit, not an accuracy review, and is not a claim about first publication.

Markdown is rendered as plain excerpt text, with React-rendered match highlights rather than database HTML. Images/video are not transcribed or searched. The best matching lesson is included, rather than every lesson hit in a course. Section-level identity for non-course content is currently the whole content passage. The demo uses synthetic browser-local data and a separate small in-memory matcher behind the same UI; its ranking is illustrative, not a PostgreSQL performance or authorization test.

## Verification and performance

Run `pnpm test`, both builds, `pnpm check:ui`, `pnpm test:ui` and `pnpm test:search`. The latter starts a local synthetic provider transport and the real server route against embedded PostgreSQL. It never connects to a hosted backend. Build production with `NEXT_PUBLIC_SUPABASE_URL=https://test.supabase.co` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=synthetic-test-key`. Use installed Chrome with `PLAYWRIGHT_CHANNEL=chrome`, or install Playwright Chromium. Do not use real credentials with fixtures.

The maintained corpus and query set are in `tests/search.test.ts` and `tests/search/library.sql`: 10,003 documents and 20,003 passages, including exact titles, body-only and lesson-only text, prefixes, transposition/missing-letter typos, old relevant content versus new Updates, broad terms and no results. Performance targets are database p95 under 100 ms and local browser p95 under 500 ms including the 150 ms debounce. Tests report measurements rather than enforce hardware-sensitive CI timing. The browser integration uses the larger search corpus with a small workspace projection to isolate retrieval latency from catalog loading. Initial workspace loading still uses the existing complete catalog read.

Embedded PostgreSQL results do not establish hosted Supabase/PostgREST, network, concurrency or production latency. Re-run the representative queries against an isolated hosted installation before rollout, including its longest lessons, vocabulary and expected concurrent traffic. An external provider should be considered only if measured relevance or latency remains inadequate after tuning; it would add synchronization, access-control and operational requirements.

