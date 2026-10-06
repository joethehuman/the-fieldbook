-- Read-only retrieval over the existing publication-maintained index.
-- No new table, embedding job, transcript persistence, or ordinary-search change.
create function public.fb_ai_passages(
  p_queries text[], p_kinds text[], p_limit integer default 12
) returns jsonb
language sql stable security invoker set search_path = '' as $$
  with queries as (
    select distinct pg_catalog.websearch_to_tsquery('simple',
      pg_catalog.left(pg_catalog.regexp_replace(q, '[^[:alnum:] -]', ' ', 'g'), 120)) as query
    from pg_catalog.unnest(p_queries[1:3]) q
    where pg_catalog.length(pg_catalog.btrim(q)) > 0
  ), candidates as (
    select s.content_id, s.passage_id, max(pg_catalog.ts_rank(s.search_vector, q.query)) as score,
      (array_agg(q.query order by pg_catalog.ts_rank(s.search_vector, q.query) desc))[1] as query
    from public.fb_search_passages s
    join public.fb_documents d on d.id = s.content_id
    cross join queries q
    where s.kind = any(p_kinds[1:3]) and s.search_vector @@ q.query
      and d.deleted_at is null and d.published is not null
      and s.published_revision is not null
      and d.published_revision = s.published_revision
      and d.published->>'kind' = s.kind
    group by s.content_id, s.passage_id
  ), diverse as (
    select c.*, row_number() over (partition by c.content_id order by c.score desc, c.passage_id) as item_rank
    from candidates c
  ), limited as (
    select c.* from diverse c where c.item_rank <= 3
    order by c.score desc, c.content_id, c.passage_id
    limit greatest(1, least(coalesce(p_limit, 12), 12))
  ), results as (
    select s.content_id, s.passage_id, s.kind, s.title, s.lesson_id, s.lesson_title,
      -- Select matching windows even when a term is near the end of a long lesson.
      pg_catalog.ts_headline('simple', s.source_text, l.query,
        'StartSel="",StopSel="",MaxWords=200,MinWords=100,MaxFragments=2,FragmentDelimiter= … ') as source_text,
      s.published_revision, s.content_date, l.score
    from limited l join public.fb_search_passages s using(content_id, passage_id)
  ) select coalesce(jsonb_agg(to_jsonb(r) - 'score' order by r.score desc, r.content_id, r.passage_id), '[]'::jsonb)
    from results r;
$$;
revoke all on function public.fb_ai_passages(text[],text[],integer) from public, anon, authenticated;
grant execute on function public.fb_ai_passages(text[],text[],integer) to service_role;

-- The application calls this before generation and before sending final citations.
create function public.fb_ai_sources_current(p_sources jsonb) returns boolean
language sql stable security invoker set search_path = '' as $$
  select case when p_sources is null or jsonb_typeof(p_sources) <> 'array' then false
  when jsonb_array_length(p_sources) > 12 then false
  else not exists (
    select 1 from jsonb_to_recordset(p_sources) as expected(content_id uuid, passage_id text, published_revision integer)
    left join public.fb_search_passages s
      on s.content_id = expected.content_id and s.passage_id = expected.passage_id
    left join public.fb_documents d on d.id = expected.content_id
    where s.content_id is null or d.id is null or d.deleted_at is not null
      or d.published is null or expected.published_revision is null
      or d.published_revision is distinct from expected.published_revision
      or s.published_revision is distinct from expected.published_revision
      or d.published->>'kind' is distinct from s.kind
  ) end;
$$;
revoke all on function public.fb_ai_sources_current(jsonb) from public, anon, authenticated;
grant execute on function public.fb_ai_sources_current(jsonb) to service_role;
