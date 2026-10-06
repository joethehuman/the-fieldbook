begin;
create or replace function public.fb_bulk_content(p_actor uuid,p_id uuid,p_expected integer,p_operation text,p_patch jsonb default '{}',p_settings_expected integer default null) returns text
language plpgsql set search_path='' as $$
declare d public.fb_documents; cfg public.fb_config; old_live integer;
begin
 select * into cfg from public.fb_config where id for update;
 if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin') then raise exception 'Administrator access is required'; end if;
 select * into d from public.fb_documents where id=p_id for update;
 if not found then raise exception 'Content not found'; end if;
 if d.deleted_at is not null then
  if p_operation='delete' then return 'unchanged'; end if;
  raise exception 'Content is in Recently deleted';
 end if;
 if d.revision<>p_expected then raise exception 'Revision conflict'; end if;
 if p_operation='delete' then
  insert into public.fb_deleted_items(entity,id,name,kind,revision,deleted_by,snapshot) values('content',d.id,d.draft->>'title',d.draft->>'kind',d.revision+1,p_actor,to_jsonb(d));
  update public.fb_documents set deleted_at=now(),draft=jsonb_set(draft,'{status}','"draft"'),published=null,published_revision=null,revision=revision+1 where id=p_id;
 elsif p_operation='metadata' then
  if cfg.revision is distinct from p_settings_expected then raise exception 'Settings changed. Reload before moving content'; end if;
  if p_patch-'category'-'folder'-'sectionId'<>'{}'::jsonb or not p_patch ? 'category' then raise exception 'Invalid metadata patch'; end if;
  if d.draft @> p_patch and (d.published is null or d.published @> p_patch) then return 'unchanged'; end if;
  if p_patch ? 'sectionId' then
   p_patch:=p_patch||jsonb_build_object('sectionOrder',1+(select coalesce(max(coalesce((v->>'sectionOrder')::integer,0)),0) from public.fb_documents x cross join lateral (values(x.draft),(x.published)) copies(v) where v->>'sectionId'=p_patch->>'sectionId'));
  end if;
  update public.fb_documents set draft=draft||p_patch,published=case when published is null then null else published||p_patch end,
   published_revision=case when published_revision=revision then revision+1 else published_revision end,revision=revision+1 where id=p_id;
 elsif p_operation='unpublish' then
  if d.published is null then return 'unchanged'; end if;
  update public.fb_documents set draft=jsonb_set(draft,'{status}','"draft"'),published=null,published_revision=null,revision=revision+1 where id=p_id;
 else raise exception 'Unsupported content action'; end if;
 insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','bulk_'||p_operation,p_id::text,d.revision+1,p_patch);
 return 'changed';
end $$;

create or replace function public.fb_finish_deletion(p_entity text,p_id uuid,p_claim uuid) returns void
language plpgsql set search_path='' as $$
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
  delete from public.fb_documents where id=p_id and deleted_at is not null;
  delete from public.fb_audit where entity_id=p_id::text;
 else
  -- Auth deletion happens first through the supported Admin API. The profile and learner records cascade.
  if exists(select 1 from public.fb_profiles where id=p_id) then raise exception 'Delete the Auth account before finalizing'; end if;
  update public.fb_deleted_items set deleted_by='00000000-0000-0000-0000-000000000000' where deleted_by=p_id;
  update public.fb_audit set actor='00000000-0000-0000-0000-000000000000',snapshot=null where actor=p_id;
  delete from public.fb_audit where entity_id=p_id::text;
 end if;
 -- Historical full governance snapshots can contain the erased user's identity or content references.
 update public.fb_audit set snapshot=null where snapshot is not null and (snapshot::text like '%'||p_id::text||'%' or (d.email is not null and lower(snapshot::text) like '%'||lower(d.email)||'%'));
 delete from public.fb_deleted_items where entity=p_entity and id=p_id and claim=p_claim;
end $$;

commit;
