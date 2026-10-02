-- Complete publisher catalog and ready-media listing, with bounded keyset pages.
-- Additive service-only functions; no existing documents, grants or shared functions change.
begin;
create function public.fb_mcp_catalog(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare q text:=coalesce(p_input->>'query',''); k text:=coalesce(p_input->>'kind','all');
 n integer:=coalesce((p_input->>'limit')::integer,50); token jsonb; last_date timestamptz; last_id uuid;
 page jsonb; tail jsonb; more boolean;
begin
 perform public.fb_require_publisher(p_actor);
 if length(q)>200 or k not in ('all','doc','brief','course') or n not between 1 and 100 then raise exception 'Invalid catalog request'; end if;
 if p_input->>'cursor' is not null then
  begin token:=(p_input->>'cursor')::jsonb;
   if token->>'actor' is distinct from p_actor::text or token->>'query' is distinct from q or token->>'kind' is distinct from k or token->>'version'<>'1' then raise exception 'Invalid cursor'; end if;
   last_date:=(token->>'date')::timestamptz; last_id:=(token->>'id')::uuid;
   if last_date is null or last_id is null then raise exception 'Invalid cursor'; end if;
  exception when others then raise exception 'Invalid cursor'; end;
 end if;
 select coalesce(jsonb_agg(row_value order by updated_at desc,id desc),'[]') into page from (
  select d.id,d.updated_at,jsonb_build_object('id',d.id,'title',d.draft->>'title','summary',d.draft->>'summary','kind',d.draft->>'kind',
   'revision',d.revision,'status',d.draft->>'status','published',d.published is not null,'date',d.updated_at) row_value
  from public.fb_documents d where d.deleted_at is null
   and (k='all' or d.draft->>'kind'=k)
   and (last_id is null or (d.updated_at,d.id)<(last_date,last_id))
   and (q='' or position(lower(q) in lower(concat(d.draft->>'title',' ',d.draft->>'summary',' ',d.draft->>'body',' ',
    (select string_agg(concat(l->>'title',' ',l->>'body'),' ') from jsonb_array_elements(coalesce(d.draft->'lessons','[]')) l))))>0)
  order by d.updated_at desc,d.id desc limit n+1
 ) rows;
 more:=jsonb_array_length(page)>n;
 if more then page:=page-(jsonb_array_length(page)-1); end if;
 tail:=page->(jsonb_array_length(page)-1);
 return jsonb_build_object('items',(select coalesce(jsonb_agg(item-'date'),'[]') from jsonb_array_elements(page) item),
  'complete',not more,'nextCursor',case when more then jsonb_build_object('actor',p_actor,'query',q,'kind',k,'version',1,'date',tail->'date','id',tail->'id')::text else null end);
end $$;

create function public.fb_mcp_media(p_actor uuid,p_input jsonb) returns jsonb
language plpgsql stable set search_path='' as $$
declare q text:=coalesce(p_input->>'query',''); t text:=coalesce(p_input->>'type','all');
 n integer:=coalesce((p_input->>'limit')::integer,50); token jsonb; last_date timestamptz; last_id uuid;
 page jsonb; tail jsonb; more boolean;
begin
 perform public.fb_require_publisher(p_actor);
 if length(q)>200 or t not in ('all','image','video') or n not between 1 and 100 then raise exception 'Invalid media request'; end if;
 if p_input->>'cursor' is not null then
  begin token:=(p_input->>'cursor')::jsonb;
   if token->>'actor' is distinct from p_actor::text or token->>'query' is distinct from q or token->>'type' is distinct from t or token->>'version'<>'1' then raise exception 'Invalid cursor'; end if;
   last_date:=(token->>'date')::timestamptz; last_id:=(token->>'id')::uuid;
   if last_date is null or last_id is null then raise exception 'Invalid cursor'; end if;
  exception when others then raise exception 'Invalid cursor'; end;
 end if;
 select coalesce(jsonb_agg(row_value order by created_at desc,id desc),'[]') into page from (
  select m.id,m.created_at,jsonb_build_object('id',m.id,'name',m.filename,'type',m.mime,'bytes',m.bytes,
   'url','/api/media/'||split_part(m.path,'/',2),'date',m.created_at) row_value
  from public.fb_media m where m.ready
   and (t='all' or split_part(m.mime,'/',1)=t)
   and (q='' or position(lower(q) in lower(m.filename))>0)
   and (last_id is null or (m.created_at,m.id)<(last_date,last_id))
  order by m.created_at desc,m.id desc limit n+1
 ) rows;
 more:=jsonb_array_length(page)>n;
 if more then page:=page-(jsonb_array_length(page)-1); end if;
 tail:=page->(jsonb_array_length(page)-1);
 return jsonb_build_object('items',(select coalesce(jsonb_agg(item-'date'),'[]') from jsonb_array_elements(page) item),
  'complete',not more,'nextCursor',case when more then jsonb_build_object('actor',p_actor,'query',q,'type',t,'version',1,'date',tail->'date','id',tail->'id')::text else null end);
end $$;
revoke all on function public.fb_mcp_catalog(uuid,jsonb),public.fb_mcp_media(uuid,jsonb) from public,anon,authenticated;
grant execute on function public.fb_mcp_catalog(uuid,jsonb),public.fb_mcp_media(uuid,jsonb) to service_role;
commit;
