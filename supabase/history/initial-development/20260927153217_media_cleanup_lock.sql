create or replace function public.fb_collect_deleted_media() returns table(id uuid,path text)
language plpgsql set search_path='' as $$
begin
 perform 1 from public.fb_config cfg where cfg.id for update;
 -- Mark unusable before returning paths. Save triggers below prevent a race with new references.
 return query update public.fb_media m set ready=false where m.id in(select q.id from public.fb_media_cleanup q)
 and not exists(select 1 from public.fb_documents d where (d.draft::text||coalesce(d.published::text,'')) like '%/api/media/'||m.id::text||'.%')
 and not exists(select 1 from public.fb_deleted_items d where d.snapshot::text like '%/api/media/'||m.id::text||'.%')
 and not exists(select 1 from public.fb_audit a where a.snapshot::text like '%/api/media/'||m.id::text||'.%')
 and not exists(select 1 from public.fb_config c where c.settings::text like '%/api/media/'||m.id::text||'.%')
 returning m.id,m.path;
end $$;
