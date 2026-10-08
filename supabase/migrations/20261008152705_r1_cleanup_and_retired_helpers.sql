-- Preserve current curriculum artwork during uploader cleanup and finalize
-- expired preregistered-person deletions without weakening Auth or claim guards.
-- Existing function signatures, ownership and EXECUTE permissions are retained.

CREATE OR REPLACE FUNCTION public.fb_collect_deleted_media()
 RETURNS TABLE(id uuid, path text)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
 perform 1 from public.fb_config cfg where cfg.id for update;
 -- Mark unusable before returning paths. Save triggers below prevent a race with new references.
 return query update public.fb_media m set ready=false where m.id in(select q.id from public.fb_media_cleanup q)
 and not exists(select 1 from public.fb_documents d where (d.draft::text||coalesce(d.published::text,'')) like '%/api/media/'||m.id::text||'.%')
 and not exists(select 1 from public.fb_deleted_items d where d.snapshot::text like '%/api/media/'||m.id::text||'.%')
 and not exists(select 1 from public.fb_audit a where a.snapshot::text like '%/api/media/'||m.id::text||'.%')
 and not exists(select 1 from public.fb_config c where
   (c.settings::text||c.curricula::text) like '%/api/media/'||m.id::text||'.%')
 returning m.id,m.path;
end $function$;

CREATE OR REPLACE FUNCTION public.fb_finish_deletion(p_entity text, p_id uuid, p_claim uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare d public.fb_deleted_items; cfg public.fb_config;
begin
 select * into cfg from public.fb_config where id for update;
 select * into d from public.fb_deleted_items where entity=p_entity and id=p_id and claim=p_claim and purging and purge_after<=now() for update;
 if not found then raise exception 'Deletion claim expired'; end if;
 insert into public.fb_media_cleanup(id) select m.id from public.fb_media m where (p_entity='user' and m.owner=p_id) or d.snapshot::text like '%/api/media/'||m.id::text||'.%' or exists(select 1 from public.fb_audit a where a.entity_id=p_id::text and a.snapshot::text like '%/api/media/'||m.id::text||'.%') on conflict do nothing;
 if p_entity='user' then update public.fb_media set owner='00000000-0000-0000-0000-000000000000' where owner=p_id; end if;
 if p_entity='content' then
  delete from public.fb_progress where content_id=p_id;
  delete from public.fb_feedback where content_id=p_id;
  update public.fb_config set curricula=(select coalesce(jsonb_agg(c||jsonb_build_object('courseIds',coalesce((select jsonb_agg(x) from jsonb_array_elements(c->'courseIds') x where x#>>'{}'<>p_id::text),'[]'),'status',case when c->'courseIds'=jsonb_build_array(p_id::text) then 'draft' else c->>'status' end)),'[]') from jsonb_array_elements(curricula) c),
    groups=(select coalesce(jsonb_agg(g||jsonb_build_object('requiredCourseIds',coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(g->'requiredCourseIds','[]')) x where x#>>'{}'<>p_id::text),'[]'),'learningItems',coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(g->'learningItems','[]')) x where not(x->>'kind'='course' and x->>'id'=p_id::text)),'[]'))),'[]') from jsonb_array_elements(groups) g),governance_revision=governance_revision+1 where id;
  -- An emptied curriculum becomes a draft; remove its assignments so later governance saves remain valid.
  update public.fb_config c set groups=(select coalesce(jsonb_agg(g||jsonb_build_object('learningItems',coalesce((select jsonb_agg(i) from jsonb_array_elements(g->'learningItems') i where i->>'kind'<>'curriculum' or exists(select 1 from jsonb_array_elements(c.curricula) x where x->>'id'=i->>'id' and x->>'status'='published')),'[]'))),'[]') from jsonb_array_elements(c.groups) g) where id;
  update public.fb_config c set teams=(select coalesce(jsonb_agg(t||jsonb_build_object('learningItems',coalesce((select jsonb_agg(i) from jsonb_array_elements(coalesce(t->'learningItems','[]')) i where (i->>'kind'<>'course' or i->>'id'<>p_id::text) and (i->>'kind'<>'curriculum' or exists(select 1 from jsonb_array_elements(c.curricula) x where x->>'id'=i->>'id' and x->>'status'='published'))),'[]'))),'[]') from jsonb_array_elements(c.teams) t) where id;
  perform public.fb_sync_learning();
  delete from public.fb_documents where id=p_id and deleted_at is not null;
  delete from public.fb_audit where entity_id=p_id::text;
 else
  -- Preregistered people have no Auth account to cascade their profile deletion.
  -- The locked, expired deletion claim above remains the authorization boundary.
  delete from public.fb_profiles where id=p_id and auth_user_id is null and deleted_at is not null;
  -- Linked people still require Auth deletion through the supported Admin API.
  if exists(select 1 from public.fb_profiles where id=p_id) then raise exception 'Delete the Auth account before finalizing'; end if;
  update public.fb_deleted_items set deleted_by='00000000-0000-0000-0000-000000000000' where deleted_by=p_id;
  update public.fb_audit set actor='00000000-0000-0000-0000-000000000000',snapshot=null where actor=p_id;
  delete from public.fb_audit where entity_id=p_id::text;
 end if;
 -- Historical full governance snapshots can contain the erased user's identity or content references.
 update public.fb_audit set snapshot=null where snapshot is not null and (snapshot::text like '%'||p_id::text||'%' or (d.email is not null and lower(snapshot::text) like '%'||lower(d.email)||'%'));
 delete from public.fb_deleted_items where entity=p_entity and id=p_id and claim=p_claim;
end $function$;

-- Serialize curriculum saves with media retirement using the existing config lock.
drop trigger fb_guard_retired_settings_media on public.fb_config;
create trigger fb_guard_retired_config_media
  before update of settings, curricula on public.fb_config
  for each row execute function public.fb_guard_retired_media();

-- No current application, function, view or trigger uses these superseded helpers.
-- RESTRICT prevents accidentally removing a dependency added by an installation.
drop function public.fb_assignment_coverage(uuid, uuid) restrict;
drop function public.fb_validate_learning_before_teams(jsonb, jsonb, jsonb) restrict;
