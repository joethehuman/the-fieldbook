-- Recoverable content/account deletion. Only server-side service-role callers have access.
begin;
alter table public.fb_documents add column deleted_at timestamptz;
alter table public.fb_profiles add column deleted_at timestamptz;
create table public.fb_deleted_items (
  entity text not null check(entity in ('content','user')), id uuid not null,
  name text not null, email text, kind text, revision integer not null,
  deleted_at timestamptz not null default now(), purge_after timestamptz not null default now()+interval '30 days',
  deleted_by uuid not null, snapshot jsonb not null,
  purging boolean not null default false, claimed_at timestamptz, claim uuid, error text,
  primary key(entity,id), check(purge_after>=deleted_at+interval '30 days')
);
create index fb_deleted_due on public.fb_deleted_items(purge_after,claimed_at);
create index fb_deleted_email on public.fb_deleted_items(lower(email)) where email is not null;
create table public.fb_cleanup_config (id boolean primary key default true check(id), endpoint text, secret text not null default encode(extensions.gen_random_bytes(32),'hex'), last_run timestamptz);
alter table public.fb_deleted_items enable row level security;
alter table public.fb_cleanup_config enable row level security;
revoke all on public.fb_deleted_items,public.fb_cleanup_config from public,anon,authenticated;
grant all on public.fb_deleted_items,public.fb_cleanup_config to service_role;
insert into public.fb_cleanup_config(id) values(true);

create or replace function public.fb_save_document(p_id uuid, p_expected integer, p_draft jsonb, p_publish boolean, p_unpublish boolean, p_actor uuid, p_source text)
returns public.fb_documents language plpgsql set search_path = '' as $$
declare d public.fb_documents;
begin
  perform 1 from public.fb_config where id for update;
  if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin') then raise exception 'Administrator access is required'; end if;
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
revoke all on function public.fb_save_document from public,anon,authenticated;
grant execute on function public.fb_save_document to service_role;


create or replace function public.fb_save_governance(p_actor uuid,p_expected integer,p_operation text,p_data jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare cfg public.fb_config; u jsonb; n jsonb; old public.fb_profiles; direct_dates jsonb; effective_dates jsonb; stamp text;
begin
  select * into cfg from public.fb_config where id for update;
  if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin') then raise exception 'Administrator access is required'; end if;
  if cfg.governance_revision<>p_expected then raise exception 'Revision conflict'; end if;
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  if p_operation='pending' then
    if exists(select 1 from public.fb_profiles where lower(email)=lower(p_data->>'email')) then raise exception 'An account already uses that email'; end if;
    if coalesce((p_data->>'revoke')::boolean,false) then
      delete from public.fb_pending_profiles where email=lower(trim(p_data->>'email'));
    else
      if p_data->>'role' not in ('learner','manager','admin') then raise exception 'Invalid role'; end if;
      if exists(select 1 from jsonb_array_elements_text(p_data->'groups') g where not exists(select 1 from jsonb_array_elements(cfg.groups) x where x->>'id'=g)) then raise exception 'Group does not exist'; end if;
      if p_data->>'teamId' is not null and not exists(select 1 from jsonb_array_elements(cfg.teams) x where x->>'id'=p_data->>'teamId') then raise exception 'Team does not exist'; end if;
      insert into public.fb_pending_profiles(email,name,role,groups,team_id,onboarding_start)
      values(lower(trim(p_data->>'email')),p_data->>'name',p_data->>'role',p_data->'groups',p_data->>'teamId',(p_data->>'onboardingStart')::date)
      on conflict(email) do update set name=excluded.name,role=excluded.role,groups=excluded.groups,team_id=excluded.team_id,onboarding_start=excluded.onboarding_start;
    end if;
  elsif p_operation='save' then
    perform public.fb_validate_nodes(p_data->'groups'); perform public.fb_validate_nodes(p_data->'teams');
    -- Check the stored state under the same config lock as registration and
    -- governance saves. Removing references and deleting must be separate saves.
    for n in select t from jsonb_array_elements(cfg.teams) t
      where not exists(select 1 from jsonb_array_elements(p_data->'teams') x where x->>'id'=t->>'id') loop
      if exists(select 1 from public.fb_profiles where team_id=n->>'id') then
        raise exception 'Move or remove all direct members before deleting a team';
      end if;
      if exists(select 1 from public.fb_pending_profiles where team_id=n->>'id') then
        raise exception 'Remove pending account team assignments before deleting a team';
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
      update public.fb_profiles set onboarding_start=(u->>'onboardingStart')::date,name=u->>'name',role=u->>'role',active=(u->>'active')::boolean,groups=u->'groups',team_id=u->>'teamId',group_joined_at=direct_dates,effective_group_joined_at=effective_dates where id=old.id;
    end loop;
    if not exists(select 1 from public.fb_profiles where active and role='admin') then raise exception 'Keep at least one active administrator'; end if;
    for n in select * from jsonb_array_elements(p_data->'teams') loop
      if n->>'managerId' is not null and not exists(select 1 from public.fb_profiles where id=(n->>'managerId')::uuid and active and role in ('manager','admin')) then raise exception 'Team managers must be active managers or administrators'; end if;
    end loop;
    update public.fb_config set groups=p_data->'groups',teams=p_data->'teams',curricula=coalesce(p_data->'curricula',cfg.curricula) where id;
    update public.fb_pending_profiles p set groups=(select coalesce(jsonb_agg(g),'[]') from jsonb_array_elements_text(p.groups) g where exists(select 1 from jsonb_array_elements(p_data->'groups') node where node->>'id'=g))
    where exists(select 1 from jsonb_array_elements_text(p.groups) g where not exists(select 1 from jsonb_array_elements(p_data->'groups') node where node->>'id'=g));
    perform public.fb_sync_learning();
  else raise exception 'Unknown governance operation'; end if;
  update public.fb_config set governance_revision=governance_revision+1 where id;
  insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','governance_'||p_operation,'governance',cfg.governance_revision+1,p_data);
  return jsonb_build_object('revision',cfg.governance_revision+1);
end $$;

create or replace function public.fb_register_profile(p_id uuid,p_email text,p_name text,p_owner boolean)
returns public.fb_profiles language plpgsql set search_path='' as $$
declare cfg public.fb_config; result public.fb_profiles; pending public.fb_pending_profiles; stamp text;
begin
  select * into cfg from public.fb_config where id for update;
  if exists(select 1 from public.fb_deleted_items where entity='user' and (id=p_id or lower(email)=lower(p_email))) then raise exception 'Account is pending deletion'; end if;
  select * into result from public.fb_profiles where id=p_id;
  if found then return result; end if;
  select * into pending from public.fb_pending_profiles where email=lower(p_email);
  if pending.email is null and not p_owner and cfg.settings->>'registration'<>'open' then raise exception 'New account registration is closed'; end if;
  if exists(select 1 from public.fb_profiles where lower(email)=lower(p_email)) then raise exception 'Email is already linked to an account'; end if;
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  insert into public.fb_profiles(id,email,name,role,groups,team_id,group_joined_at,effective_group_joined_at,onboarding_start)
  values(p_id,p_email,coalesce(pending.name,p_name),case when p_owner then 'admin' else coalesce(pending.role,'learner') end,
    coalesce(pending.groups,'[]'),pending.team_id,
    (select coalesce(jsonb_object_agg(g,stamp),'{}') from jsonb_array_elements_text(coalesce(pending.groups,'[]')) g),
    (select coalesce(jsonb_object_agg(g.id,stamp),'{}') from public.fb_member_groups(coalesce(pending.groups,'[]'),pending.team_id,cfg.groups) g),case when pending.email is not null then pending.onboarding_start when cfg.settings->>'newUserStage'='newhire' then current_date else null end) returning * into result;
  delete from public.fb_pending_profiles where email=lower(p_email);
  update public.fb_config set governance_revision=governance_revision+1 where id;
  insert into public.fb_audit(actor,source,action,entity_id,snapshot) values(p_id,'auth','register',p_id::text,jsonb_build_object('preRegistered',pending.email is not null,'role',result.role));
  return result;
end $$;

create or replace function public.fb_governance_snapshot(p_actor uuid) returns jsonb
language sql stable set search_path='' as $$
with recursive me as (select * from public.fb_profiles where id=p_actor and active),
cfg as (select * from public.fb_config),
team_nodes as (select n from cfg,jsonb_array_elements(cfg.teams) n),
allowed(id) as (
  select n->>'id' from team_nodes,me where me.role='admin' or (me.role='manager' and n->>'managerId'=me.id::text)
  union
  select n->>'id' from team_nodes join allowed a on n->>'parentId'=a.id
), people as (
  select p.* from public.fb_profiles p,me where p.deleted_at is null and (p.id=me.id or me.role='admin' or (me.role='manager' and p.active and p.team_id in(select id from allowed)))
), group_ids as (
  select distinct g.id from people p,cfg,public.fb_member_groups(p.groups,p.team_id,cfg.groups) g
)
select jsonb_build_object(
  'revision',(select governance_revision from cfg),
  'users',coalesce((select jsonb_agg(to_jsonb(p)) from people p),'[]'),
  'groups',coalesce((select jsonb_agg(n) from cfg,jsonb_array_elements(cfg.groups) n where exists(select 1 from me where role='admin') or n->>'id' in(select id from group_ids)),'[]'),
  'teams',coalesce((select jsonb_agg(n) from team_nodes where n->>'id' in(select id from allowed)),'[]'),
  'progress',coalesce((select jsonb_agg(to_jsonb(p)) from public.fb_progress p where p.user_id in(select id from people)),'[]'),
  'pending',case when exists(select 1 from me where role='admin') then coalesce((select jsonb_agg(to_jsonb(p)) from public.fb_pending_profiles p),'[]') else '[]'::jsonb end
);
$$;


create function public.fb_bulk_content(p_actor uuid,p_id uuid,p_expected integer,p_operation text,p_patch jsonb default '{}',p_settings_expected integer default null) returns text
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
  update public.fb_documents set draft=draft||p_patch,published=case when published is null then null else published||p_patch end,
   published_revision=case when published_revision=revision then revision+1 else published_revision end,revision=revision+1 where id=p_id;
 elsif p_operation='unpublish' then
  if d.published is null then return 'unchanged'; end if;
  update public.fb_documents set draft=jsonb_set(draft,'{status}','"draft"'),published=null,published_revision=null,revision=revision+1 where id=p_id;
 else raise exception 'Unsupported content action'; end if;
 insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','bulk_'||p_operation,p_id::text,d.revision+1,p_patch);
 return 'changed';
end $$;

create function public.fb_delete_users(p_actor uuid,p_expected integer,p_ids jsonb,p_owner text) returns jsonb
language plpgsql set search_path='' as $$
declare cfg public.fb_config; u public.fb_profiles; uid uuid; results jsonb:='[]'; changed boolean:=false;
begin
 select * into cfg from public.fb_config where id for update;
 if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin') then raise exception 'Administrator access is required'; end if;
 if cfg.governance_revision<>p_expected then raise exception 'Revision conflict'; end if;
 for uid in select value::uuid from jsonb_array_elements_text(p_ids) loop
  begin
   select * into u from public.fb_profiles where id=uid for update;
   if not found then raise exception 'Account not found'; end if;
   if u.deleted_at is not null then results:=results||jsonb_build_array(jsonb_build_object('id',uid,'status','unchanged')); continue; end if;
   if uid=p_actor then raise exception 'You cannot delete your own account'; end if;
   if lower(u.email)=lower(p_owner) then raise exception 'The installation owner cannot be deleted'; end if;
   if exists(select 1 from jsonb_array_elements(cfg.teams) t where t->>'managerId'=uid::text) then raise exception 'Reassign this person''s managed teams first'; end if;
   if u.role='admin' and not exists(select 1 from public.fb_profiles where id<>uid and active and role='admin') then raise exception 'Keep an active administrator'; end if;
   insert into public.fb_deleted_items(entity,id,name,email,revision,deleted_by,snapshot) values('user',uid,u.name,u.email,1,p_actor,to_jsonb(u));
   update public.fb_profiles set active=false,deleted_at=now(),groups='[]',team_id=null,group_joined_at='{}',effective_group_joined_at='{}' where id=uid;
   update public.fb_mcp_grants set enabled=false where user_id=uid;
   delete from public.fb_pending_profiles where lower(email)=lower(u.email);
   insert into public.fb_audit(actor,source,action,entity_id) values(p_actor,'web','delete_user',uid::text);
   results:=results||jsonb_build_array(jsonb_build_object('id',uid,'status','changed')); changed:=true;
  exception when raise_exception then results:=results||jsonb_build_array(jsonb_build_object('id',uid,'status','failed','message',sqlerrm)); end;
 end loop;
 if changed then update public.fb_config set governance_revision=governance_revision+1 where id; end if;
 return results;
end $$;

create function public.fb_restore_deleted(p_actor uuid,p_entity text,p_id uuid,p_expected integer) returns text
language plpgsql set search_path='' as $$
declare d public.fb_deleted_items;
begin
 perform 1 from public.fb_config where id for update;
 if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin') then raise exception 'Administrator access is required'; end if;
 select * into d from public.fb_deleted_items where entity=p_entity and id=p_id for update;
 if not found then raise exception 'Deleted item not found'; end if;
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

-- A durable claim serializes restore versus purge. Failed jobs retain a retryable tombstone.
create function public.fb_claim_deletions(p_secret text) returns setof public.fb_deleted_items
language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.fb_cleanup_config where secret=p_secret) then raise exception 'Invalid worker credential'; end if;
 perform 1 from public.fb_config where id for update;
 update public.fb_cleanup_config set last_run=now() where id;
 return query update public.fb_deleted_items set purging=true,claimed_at=now(),claim=gen_random_uuid(),error=null
 where (entity,id) in (select entity,id from public.fb_deleted_items where purge_after<=now() and (claimed_at is null or claimed_at<now()-interval '15 minutes') order by purge_after limit 20 for update skip locked) returning *;
end $$;

create function public.fb_finish_deletion(p_entity text,p_id uuid,p_claim uuid) returns void
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

do $$ declare f text; begin
 foreach f in array array['fb_bulk_content','fb_delete_users','fb_restore_deleted','fb_claim_deletions','fb_finish_deletion'] loop
 execute format('revoke all on function public.%I from public,anon,authenticated',f);
 execute format('grant execute on function public.%I to service_role',f);
 end loop;
end $$;
-- Only assets belonging to purged records become cleanup candidates.
create table public.fb_media_cleanup (id uuid primary key, queued_at timestamptz not null default now());
alter table public.fb_media_cleanup enable row level security;
revoke all on public.fb_media_cleanup from public,anon,authenticated;
grant all on public.fb_media_cleanup to service_role;
create function public.fb_collect_deleted_media() returns table(id uuid,path text)
language plpgsql set search_path='' as $$
begin
 perform 1 from public.fb_config where id for update;
 -- Mark unusable before returning paths. Save triggers below prevent a race with new references.
 return query update public.fb_media m set ready=false where m.id in(select q.id from public.fb_media_cleanup q)
 and not exists(select 1 from public.fb_documents d where (d.draft::text||coalesce(d.published::text,'')) like '%/api/media/'||m.id::text||'.%')
 and not exists(select 1 from public.fb_deleted_items d where d.snapshot::text like '%/api/media/'||m.id::text||'.%')
 and not exists(select 1 from public.fb_audit a where a.snapshot::text like '%/api/media/'||m.id::text||'.%')
 and not exists(select 1 from public.fb_config c where c.settings::text like '%/api/media/'||m.id::text||'.%')
 returning m.id,m.path;
end $$;
create function public.fb_guard_retired_media() returns trigger
language plpgsql set search_path='' as $$
begin
 perform 1 from public.fb_config where id for update;
 if exists(select 1 from public.fb_media m join public.fb_media_cleanup q on q.id=m.id where not m.ready and to_jsonb(new)::text like '%/api/media/'||m.id::text||'.%') then raise exception 'This media has been permanently deleted'; end if;
 return new;
end $$;
create trigger fb_guard_retired_media before insert or update on public.fb_documents for each row execute function public.fb_guard_retired_media();
create trigger fb_guard_retired_settings_media before update of settings on public.fb_config for each row execute function public.fb_guard_retired_media();
revoke all on function public.fb_collect_deleted_media,public.fb_guard_retired_media from public,anon,authenticated;
grant execute on function public.fb_collect_deleted_media to service_role;

commit;
