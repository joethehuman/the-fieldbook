-- Contributor publishing is independent of explicitly assigned team management.
-- Existing data, revisions, service-role grants and administrator governance stay intact.
begin;
alter table public.fb_profiles drop constraint fb_profiles_role_check;
alter table public.fb_profiles add constraint fb_profiles_role_check check(role in ('admin','manager','learner','contributor'));

create function public.fb_require_publisher(p_actor uuid) returns text
language plpgsql stable set search_path='' as $$
declare account_role text;
begin
 select role into account_role from public.fb_profiles where id=p_actor and active and deleted_at is null and auth_user_id is not null and role in ('admin','contributor');
 if account_role is null then raise exception 'Administrator or contributor publishing access is required'; end if;
 return account_role;
end $$;
revoke all on function public.fb_require_publisher from public,anon,authenticated;
grant execute on function public.fb_require_publisher to service_role;

-- Match encodeURIComponent used by existing legacy Docs section IDs.
create function public.fb_section_component(p_value text) returns text
language plpgsql immutable set search_path='' as $$
declare bytes bytea:=convert_to(p_value,'UTF8'); result text:=''; code integer;
begin
 if length(bytes)=0 then return result; end if;
 for i in 0..length(bytes)-1 loop
  code:=get_byte(bytes,i);
  result:=result||case when (code between 65 and 90) or (code between 97 and 122) or (code between 48 and 57) or code in (45,95,46,33,126,42,39,40,41) then chr(code) else '%'||upper(lpad(to_hex(code),2,'0')) end;
 end loop;
 return result;
end $$;
revoke all on function public.fb_section_component from public,anon,authenticated;
grant execute on function public.fb_section_component to service_role;

create function public.fb_validate_contributor_section(p_doc jsonb) returns void
language plpgsql stable set search_path='' as $$
declare cfg public.fb_config; section jsonb; parent jsonb; category text:=coalesce(p_doc->>'category',''); folder text:=coalesce(p_doc->>'folder',''); sid text:=coalesce(p_doc->>'sectionId','');
begin
 select * into cfg from public.fb_config where id;
 select s into section from jsonb_array_elements(coalesce(cfg.settings->'docSections','[]')) s where s->>'id'=sid;
 if section is not null then
  select s into parent from jsonb_array_elements(coalesce(cfg.settings->'docSections','[]')) s where s->>'id'=section->>'parentId';
  if category=coalesce(parent->>'name',section->>'name') and folder=(case when parent is null then '' else section->>'name' end) then return; end if;
 elsif (sid='' or sid='legacy:'||public.fb_section_component(category)||':'||public.fb_section_component(folder)) and
   ((category='' and folder='' and sid='') or
    exists(select 1 from jsonb_array_elements(coalesce(cfg.settings->'docCategoryOrder','[]')) n where n#>>'{}'=category and folder='') or
    exists(select 1 from public.fb_documents d where d.deleted_at is null and d.draft->>'kind'='doc' and coalesce(d.draft->>'category','')=category and coalesce(d.draft->>'folder','')=folder)) then return;
 end if;
 -- Keep documents in a retired section editable without permitting a new hierarchy.
 if exists(select 1 from public.fb_documents d where d.deleted_at is null and d.draft->>'kind'='doc' and d.draft->>'sectionId'=sid and coalesce(d.draft->>'category','')=category and coalesce(d.draft->>'folder','')=folder) then return; end if;
 raise exception 'Choose an existing Docs section';
end $$;
revoke all on function public.fb_validate_contributor_section from public,anon,authenticated;
grant execute on function public.fb_validate_contributor_section to service_role;
create or replace function public.fb_save_document(p_id uuid, p_expected integer, p_draft jsonb, p_publish boolean, p_unpublish boolean, p_actor uuid, p_source text)
returns public.fb_documents language plpgsql set search_path = '' as $$
declare d public.fb_documents;
begin
  perform 1 from public.fb_config where id for update;
  perform public.fb_require_publisher(p_actor);
  -- Validate protected authoring fields against the stored draft before writing.
  select * into d from public.fb_documents where id=p_id for update;
  if public.fb_require_publisher(p_actor)='contributor' then
    if d.id is not null and p_draft->>'kind' is distinct from d.draft->>'kind' then raise exception 'Content type cannot change'; end if;
    if p_draft->>'kind'='course' and
      (coalesce(p_draft->'groups','[]') is distinct from coalesce(d.draft->'groups','[]') or
       coalesce(p_draft->'assignments','[]') is distinct from coalesce(d.draft->'assignments','[]')) then
      raise exception 'Only administrators can change course assignments';
    end if;
    if p_draft->>'kind'='doc' then
      if p_draft->'sectionOrder' is distinct from d.draft->'sectionOrder' then raise exception 'Only administrators can reorder Docs'; end if;
      perform public.fb_validate_contributor_section(p_draft);
    end if;
  end if;
  if p_expected = 0 then
    insert into public.fb_documents(id,draft) values(p_id,p_draft) on conflict do nothing;
    if not found then raise exception 'Revision conflict'; end if;
    select * into d from public.fb_documents where id=p_id for update;
  else
    select * into d from public.fb_documents where id=p_id for update;
    if d.deleted_at is not null then raise exception 'Content is in Recently deleted'; end if;
    if not found or d.revision <> p_expected then raise exception 'Revision conflict'; end if;
    update public.fb_documents set draft=p_draft,revision=revision+1,updated_at=now() where id=p_id returning * into d;
  end if;
  if p_publish then
    update public.fb_documents set published=p_draft,published_revision=d.revision where id=p_id returning * into d;
  elsif p_unpublish then
    update public.fb_documents set published=null,published_revision=null where id=p_id returning * into d;
  end if;
  insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot)
    values(p_actor,p_source,case when p_publish then 'publish' when p_unpublish then 'unpublish' else 'save_draft' end,p_id::text,d.revision,d.draft);
  return d;
end $$;

create or replace function public.fb_bulk_content(p_actor uuid,p_id uuid,p_expected integer,p_operation text,p_patch jsonb default '{}',p_settings_expected integer default null) returns text
language plpgsql set search_path='' as $$
declare d public.fb_documents; cfg public.fb_config; old_live integer;
begin
 select * into cfg from public.fb_config where id for update;
 perform public.fb_require_publisher(p_actor);
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
  if public.fb_require_publisher(p_actor)='contributor' and d.draft->>'kind'='doc' then perform public.fb_validate_contributor_section(d.draft||p_patch); end if;
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

create or replace function public.fb_restore_deleted(p_actor uuid,p_entity text,p_id uuid,p_expected integer) returns text
language plpgsql set search_path='' as $$
declare d public.fb_deleted_items;
begin
 perform 1 from public.fb_config where id for update;
 if public.fb_require_publisher(p_actor)<>'admin' and p_entity<>'content' then raise exception 'Administrator access is required'; end if;
 select * into d from public.fb_deleted_items where entity=p_entity and id=p_id for update;
 if not found then raise exception 'Deleted item not found'; end if;
 if d.entity='user' and not d.auth_locked then raise exception 'Account deactivation is finishing. Try restoration after the worker retries'; end if;
 if d.purging or d.purge_after<=clock_timestamp() then raise exception 'The recovery window has ended'; end if;
 if d.revision<>p_expected then raise exception 'Revision conflict'; end if;
 if p_entity='content' then
  update public.fb_documents set deleted_at=null,revision=revision+1,draft=jsonb_set(draft,'{status}','"draft"'),published=null,published_revision=null where id=p_id;
 else
  update public.fb_profiles set deleted_at=null,active=false,role='learner',groups='[]',team_id=null,group_joined_at='{}',effective_group_joined_at='{}' where id=p_id;
  update public.fb_config set governance_revision=governance_revision+1 where id;
 end if;
 delete from public.fb_deleted_items where entity=p_entity and id=p_id;
 insert into public.fb_audit(actor,source,action,entity_id) values(p_actor,'web','restore_'||p_entity,p_id::text);
 return 'changed';
end $$;

create or replace function public.fb_save_governance(p_actor uuid,p_expected integer,p_operation text,p_data jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare cfg public.fb_config; u jsonb; n jsonb; old public.fb_profiles; direct_dates jsonb; effective_dates jsonb; stamp text;
begin
  select * into cfg from public.fb_config where id for update;
  if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin' and auth_user_id is not null and deleted_at is null) then raise exception 'Administrator access is required'; end if;
  if cfg.governance_revision<>p_expected then raise exception 'Revision conflict'; end if;
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  if p_operation='pending' then
    -- Preregistration creates a person; later edits/deletion use its stable ID.
    if coalesce((p_data->>'revoke')::boolean,false) then raise exception 'Use recoverable person deletion'; end if;
    if exists(select 1 from public.fb_profiles where lower(trim(email))=lower(trim(p_data->>'email'))) then raise exception 'A person already uses that email'; end if;
    if exists(select 1 from public.fb_deleted_items where entity='user' and lower(trim(email))=lower(trim(p_data->>'email'))) then raise exception 'Account is pending deletion'; end if;
    if p_data->>'role' not in ('learner','manager','admin','contributor') then raise exception 'Invalid role'; end if;
    if exists(select 1 from jsonb_array_elements_text(p_data->'groups') g where not exists(select 1 from jsonb_array_elements(cfg.groups) x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
    if p_data->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(cfg.teams) x where x->>'id'=p_data->>'teamId') then raise exception 'Team does not exist'; end if;
    select coalesce(jsonb_object_agg(g,stamp),'{}') into direct_dates from jsonb_array_elements_text(p_data->'groups') g;
    select coalesce(jsonb_object_agg(g.id,stamp),'{}') into effective_dates from public.fb_member_groups(p_data->'groups',p_data->>'teamId',cfg.groups) g;
    insert into public.fb_profiles(id,email,name,role,groups,team_id,hire_date,group_joined_at,effective_group_joined_at)
    values(gen_random_uuid(),lower(trim(p_data->>'email')),p_data->>'name',p_data->>'role',p_data->'groups',p_data->>'teamId',(p_data->>'hireDate')::date,direct_dates,effective_dates);
  elsif p_operation='save' then
    perform public.fb_validate_nodes(p_data->'groups'); perform public.fb_validate_nodes(p_data->'teams');
    -- Check the stored state under the same config lock as registration and
    -- governance saves. Removing references and deleting must be separate saves.
    for n in select t from jsonb_array_elements(cfg.teams) t
      where not exists(select 1 from jsonb_array_elements(p_data->'teams') x where x->>'id'=t->>'id') loop
      if exists(select 1 from public.fb_profiles where team_id=n->>'id') then
        raise exception 'Move or remove all direct members before deleting a team';
      end if;
      if exists(select 1 from jsonb_array_elements(cfg.teams) t where t->>'parentId'=n->>'id') then
        raise exception 'Move subteams before deleting a team';
      end if;
      if exists(select 1 from jsonb_array_elements(cfg.groups) g where coalesce(g->'teamIds','[]') ? (n->>'id')) then
        raise exception 'Remove learning-group links before deleting a team';
      end if;
    end loop;
    perform public.fb_validate_learning(p_data->'groups',p_data->'teams',coalesce(p_data->'curricula',cfg.curricula));
    if exists(select 1 from jsonb_array_elements(p_data->'users') x group by x->>'id' having count(*)>1) then raise exception 'Duplicate user'; end if;
    -- Payload is a complete revision-checked set, never a deletion request.
    if (select count(*) from public.fb_profiles where deleted_at is null)<>jsonb_array_length(p_data->'users') then raise exception 'People changed. Reload before saving'; end if;
    for u in select * from jsonb_array_elements(p_data->'users') loop
      select * into old from public.fb_profiles where id=(u->>'id')::uuid;
      if not found or old.deleted_at is not null then raise exception 'Account does not exist. Pre-register its email instead'; end if;
      if u->>'email'<>old.email then raise exception 'Login email cannot be changed here'; end if;
      if old.id=p_actor and (u->>'role'<>'admin' or not (u->>'active')::boolean) then raise exception 'You cannot remove your own administrator access'; end if;
      if u->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(p_data->'teams') t where t->>'id'=u->>'teamId') then raise exception 'Team does not exist'; end if;
      if exists(select 1 from jsonb_array_elements_text(u->'groups') g where not exists(select 1 from jsonb_array_elements(p_data->'groups') x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
      select coalesce(jsonb_object_agg(g,coalesce(old.group_joined_at->>g,stamp)),'{}') into direct_dates from jsonb_array_elements_text(u->'groups') g;
      select coalesce(jsonb_object_agg(g.id,coalesce(old.effective_group_joined_at->>g.id,stamp)),'{}') into effective_dates from public.fb_member_groups(u->'groups',u->>'teamId',p_data->'groups') g;
      update public.fb_profiles set hire_date=(u->>'hireDate')::date,onboarding_start=(u->>'onboardingStart')::date,name=u->>'name',role=u->>'role',active=(u->>'active')::boolean,groups=u->'groups',team_id=u->>'teamId',group_joined_at=direct_dates,effective_group_joined_at=effective_dates where id=old.id;
    end loop;
    if not exists(select 1 from public.fb_profiles where active and role='admin' and auth_user_id is not null) then raise exception 'Keep at least one active administrator'; end if;
    for n in select * from jsonb_array_elements(p_data->'teams') loop
      if n->>'managerId' is not null and not exists(select 1 from public.fb_profiles where id=(n->>'managerId')::uuid and active and role in ('manager','admin','contributor')) then raise exception 'Team managers must be active managers, contributors or administrators'; end if;
    end loop;
    update public.fb_config set groups=p_data->'groups',teams=p_data->'teams',curricula=coalesce(p_data->'curricula',cfg.curricula) where id;
    perform public.fb_sync_learning();
  else raise exception 'Unknown governance operation'; end if;
  update public.fb_config set governance_revision=governance_revision+1 where id;
  insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','governance_'||p_operation,'governance',cfg.governance_revision+1,p_data);
  return jsonb_build_object('revision',cfg.governance_revision+1);
end $$;

create or replace function public.fb_governance_snapshot(p_actor uuid) returns jsonb
language sql stable set search_path='' as $$
with recursive me as (select * from public.fb_profiles where id=p_actor and active and auth_user_id is not null),
cfg as (select * from public.fb_config),
team_nodes as (select n from cfg,jsonb_array_elements(cfg.teams) n),
allowed(id) as (
  select n->>'id' from team_nodes,me where me.role='admin' or (me.role in ('manager','contributor') and n->>'managerId'=me.id::text)
  union
  select n->>'id' from team_nodes join allowed a on n->>'parentId'=a.id
), people as (
  select p.* from public.fb_profiles p,me where p.deleted_at is null and (p.id=me.id or me.role='admin' or (me.role in ('manager','contributor') and p.active and p.team_id in(select id from allowed)))
), group_ids as (
  select distinct g.id from people p,cfg,public.fb_member_groups(p.groups,p.team_id,cfg.groups) g
)
select jsonb_build_object(
  'revision',(select governance_revision from cfg),
  'users',coalesce((select jsonb_agg(to_jsonb(p)) from people p),'[]'),
  'groups',coalesce((select jsonb_agg(n) from cfg,jsonb_array_elements(cfg.groups) n where exists(select 1 from me where role='admin') or n->>'id' in(select id from group_ids)),'[]'),
  'teams',coalesce((select jsonb_agg(n) from team_nodes where n->>'id' in(select id from allowed)),'[]'),
  'progress',coalesce((select jsonb_agg(to_jsonb(p)) from public.fb_progress p where p.user_id in(select id from people)),'[]'),
  'pending','[]'::jsonb
);
$$;
commit;
