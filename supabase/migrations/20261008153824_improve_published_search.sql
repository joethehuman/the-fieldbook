-- Derived vocabulary only; published documents and passage vectors stay intact.
alter table public.fb_search_words
  add column stem text generated always as
    (coalesce((pg_catalog.ts_lexize('pg_catalog.english_stem'::regdictionary, word))[1], word)) stored;
create index fb_search_words_stem_idx on public.fb_search_words (stem, word);

-- One insertion, deletion, substitution, or adjacent transposition. Trigrams
-- narrow ordinary candidates; direct swap lookups cover short-word swaps.
create function public.fb_search_near(p_query text, p_word text)
returns boolean language plpgsql immutable strict parallel safe
security invoker set search_path = ''
as $function$
declare differences integer[]; shorter text; longer text; i integer := 1; j integer := 1;
  skipped boolean := false;
begin
  if length(p_query)<4 or abs(length(p_query)-length(p_word))>1 then return false; end if;
  if length(p_query)=length(p_word) then
    select array_agg(n) into differences from generate_series(1,length(p_query)) n
      where substr(p_query,n,1)<>substr(p_word,n,1);
    return coalesce(cardinality(differences),0)<=1 or
      (cardinality(differences)=2 and differences[2]=differences[1]+1 and
       substr(p_query,differences[1],1)=substr(p_word,differences[2],1) and
       substr(p_query,differences[2],1)=substr(p_word,differences[1],1));
  end if;
  shorter := case when length(p_query)<length(p_word) then p_query else p_word end;
  longer := case when length(p_query)<length(p_word) then p_word else p_query end;
  while i<=length(shorter) and j<=length(longer) loop
    if substr(shorter,i,1)=substr(longer,j,1) then i:=i+1; j:=j+1;
    elsif skipped then return false;
    else skipped:=true; j:=j+1; end if;
  end loop;
  return true;
end $function$;
revoke all on function public.fb_search_near(text,text) from public,anon,authenticated,service_role,supabase_auth_admin;
grant execute on function public.fb_search_near(text,text) to service_role;

create or replace function public.fb_search(p_query text,p_kind text default 'all',p_limit integer default 31)
returns jsonb language plpgsql stable security invoker
set search_path = 'public','extensions','pg_temp'
set "pg_trgm.similarity_threshold" = '0.2'
as $function$
declare q tsquery; exact_q tsquery; raw_q tsquery; normal_q tsquery;
  raw_queries tsquery[] := '{}'; normal_queries tsquery[] := '{}'; match_queries tsquery[] := '{}';
  normalized text; terms text[]; term text; stemmed text; alternatives text;
  expression text := ''; candidate text; swaps text[]; highlight_terms text[];
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
    raw_q := to_tsquery('simple',alternatives);
    raw_queries := array_append(raw_queries,raw_q);

    -- Supplement literal/Unicode/technical tokens with common English forms.
    -- Restrict suggestions to words that are still in published passages.
    stemmed := case when term ~ '^[a-z]{4,}$'
      then (pg_catalog.ts_lexize('pg_catalog.english_stem'::regdictionary,term))[1] end;
    if stemmed is not null then
      for candidate in
        select w.word from public.fb_search_words w where w.stem=stemmed
          and left(w.word,length(term))<>term
          and w.word ~ '^[a-z]+$'
          and exists(select 1 from public.fb_search_passages s
            where s.search_vector @@ to_tsquery('simple',quote_literal(w.word)))
        order by abs(length(w.word)-length(term)),w.word limit 8
      loop
        alternatives := alternatives || ' | ' || quote_literal(candidate);
        highlight_terms := array_append(highlight_terms,candidate);
      end loop;
    end if;
    normal_q := to_tsquery('simple',alternatives);
    normal_queries := array_append(normal_queries,normal_q);

    -- A valid literal prefix or word form needs no speculative typo guesses.
    if term ~ '^[[:alpha:]]{4,}$' and not exists
      (select 1 from public.fb_search_passages s where s.search_vector @@ normal_q) then
      select array_agg(overlay(term placing substr(term,n+1,1)||substr(term,n,1) from n for 2))
        into swaps from generate_series(1,length(term)-1) n;
      for candidate in
        select w.word from public.fb_search_words w
        where (w.word=any(swaps) or w.word % term)
          and abs(length(w.word)-length(term))<=1
          and public.fb_search_near(term,w.word)
          and exists(select 1 from public.fb_search_passages s
            where s.search_vector @@ to_tsquery('simple',quote_literal(w.word)))
        order by case when w.word=any(swaps) then 0 else 1 end,
          similarity(w.word,term) desc,w.word limit 4
      loop
        alternatives := alternatives || ' | ' || quote_literal(candidate)||':*';
        highlight_terms := array_append(highlight_terms,candidate);
      end loop;
    end if;
    match_queries := array_append(match_queries,to_tsquery('simple',alternatives));
    expression := expression || case when expression='' then '' else ' & ' end || '('||alternatives||')';
  end loop;
  q := to_tsquery('simple',expression);
  return (
  with candidates as (
    select s.content_id,s.passage_id,s.kind,s.content_date, (
      case when lower(s.title)=normalized then 100 else 0 end +
      case when s.title_vector @@ exact_q then 30 else 0 end +
      case when s.search_vector @@ exact_q then 14 else 0 end +
      (select sum(greatest(
        case when s.title_vector @@ raw_queries[i] then 24
             when s.title_vector @@ normal_queries[i] then 18
             when s.title_vector @@ match_queries[i] then 12 else 0 end,
        case when s.lesson_vector @@ raw_queries[i] then 14
             when s.lesson_vector @@ normal_queries[i] then 10
             when s.lesson_vector @@ match_queries[i] then 6 else 0 end,
        case when s.search_vector @@ raw_queries[i] then 5
             when s.search_vector @@ normal_queries[i] then 4 else 1 end
      )) from generate_subscripts(raw_queries,1) i) + ts_rank(s.search_vector,q,32)
    )::real as rank
    from public.fb_search_passages s
    where (p_kind='all' or s.kind=p_kind) and s.search_vector @@ q
  ), best as (
    select distinct on (c.content_id) c.* from candidates c
    order by c.content_id,c.rank desc,c.passage_id
  ), limited as (
    select b.content_id,b.passage_id,b.rank,row_number() over(order by b.rank desc,
      case when b.kind='brief' and b.content_date ~ '^\d{4}-\d{2}-\d{2}T' then b.content_date end desc nulls last,b.content_id) as result_order
    from best b order by b.rank desc,
      case when b.kind='brief' and b.content_date ~ '^\d{4}-\d{2}-\d{2}T' then b.content_date end desc nulls last,b.content_id
    limit greatest(1,least(p_limit,31))
  ), results as (
    select s.content_id,s.passage_id,s.kind,s.title,s.lesson_id,s.lesson_title,
      s.source_text,s.published_revision,s.content_date,l.rank as score,
      (select array_agg(distinct t order by t) from unnest(highlight_terms) t) as matched_terms,l.result_order
    from limited l join public.fb_search_passages s using(content_id,passage_id)
  ) select coalesce(jsonb_agg(to_jsonb(results)-'result_order' order by result_order),'[]'::jsonb) from results);
end $function$;
revoke all on function public.fb_search(text,text,integer) from public,anon,authenticated,service_role,supabase_auth_admin;
grant execute on function public.fb_search(text,text,integer) to service_role;
