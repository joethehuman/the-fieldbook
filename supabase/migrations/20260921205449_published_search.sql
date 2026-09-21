-- Derived only from published snapshots. No client grants: the application
-- checks installation access and verified active accounts before retrieval.
create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
grant usage on schema extensions to service_role;
create table public.fb_search_passages (
  content_id uuid not null references public.fb_documents(id) on delete cascade,
  passage_id text not null,
  kind text not null check (kind in ('brief','doc','course')),
  title text not null, lesson_id text, lesson_title text,
  source_text text not null, published_revision integer,
  content_date text,
  search_vector tsvector not null,
  title_vector tsvector not null, lesson_vector tsvector not null,
  primary key(content_id, passage_id)
);
alter table public.fb_search_passages enable row level security;
revoke all on public.fb_search_passages from public, anon, authenticated;
grant all on public.fb_search_passages to service_role;
create index fb_search_vector_idx on public.fb_search_passages using gin(search_vector);
-- Internal vocabulary is only used to correct query terms, never returned.
-- Historical words may remain after deletion; only current indexed passages match.
create table public.fb_search_words(word text primary key);
alter table public.fb_search_words enable row level security;
revoke all on public.fb_search_words from public,anon,authenticated;
grant all on public.fb_search_words to service_role;
-- Supabase normally installs extensions in extensions; also accept an existing
-- pg_trgm in public without relocating an operator-owned extension.
do $$ declare extension_schema text; begin
  select n.nspname into extension_schema from pg_extension e
    join pg_namespace n on n.oid=e.extnamespace where e.extname='pg_trgm';
  if extension_schema not in ('public','extensions') then
    raise exception 'pg_trgm must be installed in public or extensions';
  end if;
  execute format('create index fb_search_words_typo_idx on public.fb_search_words using gin(word %I.gin_trgm_ops)',extension_schema);
end $$;

create function public.fb_index_published() returns trigger
language plpgsql set search_path = public, extensions, pg_temp as $$
declare p jsonb; part record; heading text; body text;
begin
  if TG_OP = 'UPDATE' and new.published is not distinct from old.published
     and new.published_revision is not distinct from old.published_revision then return new; end if;
  delete from public.fb_search_passages where content_id=new.id;
  p := new.published;
  if p is null or p->>'kind' not in ('brief','doc','course') then return new; end if;
  for part in
    select 'content' as id, null::text as lesson_id, null::text as lesson_title,
      concat_ws(E'\n',p->>'summary',p->>'body') as body
    union all
    select 'lesson:'||(l->>'id'), l->>'id', l->>'title', coalesce(l->>'body','')
    from jsonb_array_elements(case when p->>'kind'='course' then coalesce(p->'lessons','[]') else '[]'::jsonb end) l
  loop
    heading := coalesce(part.lesson_title,'');
    body := coalesce(part.body,'');
    insert into public.fb_search_passages values (
      new.id,part.id,p->>'kind',coalesce(p->>'title',''),part.lesson_id,part.lesson_title,
      body,new.published_revision,coalesce(nullif(p->>'updatedAt',''),nullif(p->>'createdAt','')),
      setweight(to_tsvector('simple',coalesce(p->>'title','')),'A') ||
      setweight(to_tsvector('simple',heading),'B') ||
      setweight(to_tsvector('simple',body),'C'),
      to_tsvector('simple',coalesce(p->>'title','')),to_tsvector('simple',heading)
    );
    insert into public.fb_search_words
      select unnest(tsvector_to_array(to_tsvector('simple',concat_ws(' ',p->>'title',heading,body))))
      on conflict do nothing;
  end loop;
  return new;
end $$;
revoke all on function public.fb_index_published() from public,anon,authenticated;
create trigger fb_index_published after insert or update of published,published_revision
on public.fb_documents for each row execute function public.fb_index_published();
-- Backfill via INSERT events on a temporary copy without touching source records.
create temporary table fb_search_seed (like public.fb_documents including defaults) on commit drop;
create trigger fb_search_seed_trigger after insert on fb_search_seed
for each row execute function public.fb_index_published();
insert into fb_search_seed select * from public.fb_documents where published is not null;
drop table fb_search_seed;

create function public.fb_search(p_query text, p_kind text default 'all', p_limit integer default 31)
returns jsonb
language plpgsql stable set search_path = public, extensions, pg_temp
set pg_trgm.similarity_threshold = '0.3' as $$
declare q tsquery; exact_q tsquery; normalized text; terms text[]; term text;
  alternatives text; expression text := ''; candidate text; highlight_terms text[];
begin
  if length(p_query)>160 or p_kind not in ('all','brief','doc','course') then
    raise exception 'Invalid search input'; end if;
  select array_agg(m[1]) into terms from regexp_matches(lower(p_query),'[[:alnum:]]+','g') m;
  if coalesce(array_length(terms,1),0)=0 then return '[]'::jsonb; end if;
  if array_length(terms,1)>12 then raise exception 'Too many search terms'; end if;
  normalized := array_to_string(terms,' ');
  highlight_terms := terms;
  select to_tsquery('simple',string_agg(quote_literal(t)||':*',' & ')) into exact_q from unnest(terms) t;
  foreach term in array terms loop
    alternatives := quote_literal(term)||':*';
    -- Preserve exact words. Correct unknown words of at least four characters.
    if length(term)>=4 and not exists(select 1 from public.fb_search_words w where w.word=term) then
      for candidate in select w.word from public.fb_search_words w
        where w.word % term and abs(length(w.word)-length(term))<=2
        order by similarity(w.word,term) desc,w.word limit 2
      loop
        alternatives := alternatives || ' | ' || quote_literal(candidate);
        highlight_terms := array_append(highlight_terms,candidate);
      end loop;
    end if;
    expression := expression || case when expression='' then '' else ' & ' end || '('||alternatives||')';
  end loop;
  q := to_tsquery('simple',expression);
  return (
  with candidates as (
    select s.content_id,s.passage_id,s.kind,s.content_date, (
      case when lower(s.title)=normalized then 100 else 0 end +
      case when s.title_vector @@ exact_q then 30
           when s.title_vector @@ q then 20 else 0 end +
      case when s.lesson_vector @@ q then 15 else 0 end +
      case when s.search_vector @@ exact_q then 10 else 0 end + ts_rank(s.search_vector,q)
    )::real as rank
    from public.fb_search_passages s
    where (p_kind='all' or s.kind=p_kind) and s.search_vector @@ q
  ), best as (
    select distinct on (c.content_id) c.* from candidates c
    order by c.content_id,c.rank desc,c.passage_id
  )
  , limited as (
    select b.content_id,b.passage_id,b.rank, row_number() over (order by b.rank desc,
      case when b.kind='brief' and b.content_date ~ '^\d{4}-\d{2}-\d{2}T' then b.content_date end desc nulls last, b.content_id) as result_order from best b order by b.rank desc,
      case when b.kind='brief' and b.content_date ~ '^\d{4}-\d{2}-\d{2}T' then b.content_date end desc nulls last,
      b.content_id limit greatest(1,least(p_limit,31))
  ), results as (
    select s.content_id,s.passage_id,s.kind,s.title,s.lesson_id,s.lesson_title,
      s.source_text,s.published_revision,s.content_date,l.rank as score,
      highlight_terms as matched_terms,
      l.result_order
    from limited l join public.fb_search_passages s using(content_id,passage_id)
  ) select coalesce(jsonb_agg(to_jsonb(results)-'result_order' order by result_order), '[]'::jsonb) from results);

end $$;
revoke all on function public.fb_search(text,text,integer) from public,anon,authenticated;
grant execute on function public.fb_search(text,text,integer) to service_role;
