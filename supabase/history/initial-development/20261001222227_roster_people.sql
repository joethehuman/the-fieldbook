-- Stable roster people exist before a provider login. Existing IDs and histories stay unchanged.
begin;
set local lock_timeout = '5s';

alter table public.fb_profiles
  add column auth_user_id uuid,
  add column hire_date date,
  add column onboarding_days integer check(onboarding_days between 1 and 365);
update public.fb_profiles set auth_user_id=id where auth_user_id is null;
alter table public.fb_profiles drop constraint fb_profiles_id_fkey;
alter table public.fb_profiles alter column id set default gen_random_uuid();
alter table public.fb_profiles add constraint fb_profiles_auth_user_id_key unique(auth_user_id);
-- Preserve the existing supported Auth-deletion cascade through the person row.
alter table public.fb_profiles add constraint fb_profiles_auth_user_id_fkey foreign key(auth_user_id) references auth.users(id) on delete cascade;
alter table public.fb_progress drop constraint fb_progress_user_id_fkey;
alter table public.fb_progress add constraint fb_progress_user_id_fkey foreign key(user_id) references public.fb_profiles(id) on delete cascade;
alter table public.fb_feedback drop constraint fb_feedback_user_id_fkey;
alter table public.fb_feedback add constraint fb_feedback_user_id_fkey foreign key(user_id) references public.fb_profiles(id) on delete cascade;
alter table public.fb_mcp_grants drop constraint fb_mcp_grants_user_id_fkey;
alter table public.fb_mcp_grants add constraint fb_mcp_grants_user_id_fkey foreign key(user_id) references public.fb_profiles(id) on delete cascade;

create unique index fb_profiles_normalized_email_key on public.fb_profiles(lower(trim(email)));

-- Preserve legacy clocks as recorded dates; do not invent a hire date.
update public.fb_profiles set onboarding_days=coalesce((select (settings->>'onboardingDays')::integer from public.fb_config where id),90) where onboarding_start is not null;

create function public.fb_roster_clock() returns trigger
language plpgsql set search_path='' as $$
begin
  if new.hire_date is null and new.onboarding_start is null then
    new.onboarding_days:=null;
  elsif new.onboarding_days is null then
    select coalesce((settings->>'onboardingDays')::integer,90) into new.onboarding_days from public.fb_config where id;
  end if;
  return new;
end $$;
revoke all on function public.fb_roster_clock() from public,anon,authenticated;
create trigger fb_roster_clock before insert or update on public.fb_profiles for each row execute function public.fb_roster_clock();

-- A conflicting legacy identity must be reviewed rather than silently merged.
do $$ begin
  if exists(select 1 from public.fb_pending_profiles x join public.fb_profiles p on lower(trim(p.email))=lower(trim(x.email))) then
    raise exception 'Review duplicate pending and registered email records before applying the roster migration';
  end if;
end $$;
insert into public.fb_profiles(id,email,name,role,groups,team_id,onboarding_start,group_joined_at,effective_group_joined_at)
select gen_random_uuid(),lower(trim(p.email)),p.name,p.role,p.groups,p.team_id,p.onboarding_start,
  (select coalesce(jsonb_object_agg(g,to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),'{}') from jsonb_array_elements_text(p.groups) g),
  (select coalesce(jsonb_object_agg(g.id,to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),'{}') from public.fb_config c,public.fb_member_groups(p.groups,p.team_id,c.groups) g)
from public.fb_pending_profiles p;

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
    if p_data->>'role' not in ('learner','manager','admin') then raise exception 'Invalid role'; end if;
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
      if n->>'managerId' is not null and not exists(select 1 from public.fb_profiles where id=(n->>'managerId')::uuid and active and role in ('manager','admin')) then raise exception 'Team managers must be active managers or administrators'; end if;
    end loop;
    update public.fb_config set groups=p_data->'groups',teams=p_data->'teams',curricula=coalesce(p_data->'curricula',cfg.curricula) where id;
    perform public.fb_sync_learning();
  else raise exception 'Unknown governance operation'; end if;
  update public.fb_config set governance_revision=governance_revision+1 where id;
  insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','governance_'||p_operation,'governance',cfg.governance_revision+1,p_data);
  return jsonb_build_object('revision',cfg.governance_revision+1);
end $$;

create or replace function public.fb_register_profile(p_id uuid,p_email text,p_name text,p_owner boolean)
returns public.fb_profiles language plpgsql set search_path='' as $$
declare cfg public.fb_config; result public.fb_profiles; preregistered boolean:=false;
begin
  select * into cfg from public.fb_config where id for update;
  select * into result from public.fb_profiles where auth_user_id=p_id;
  if found then return result; end if;
  if exists(select 1 from public.fb_deleted_items where entity='user' and (id=p_id or lower(trim(email))=lower(trim(p_email)))) then raise exception 'Account is pending deletion'; end if;
  select * into result from public.fb_profiles where lower(trim(email))=lower(trim(p_email)) for update;
  if found then
    if result.auth_user_id is not null then raise exception 'Email is already linked to an account'; end if;
    if not result.active or result.deleted_at is not null then raise exception 'This account is inactive'; end if;
    preregistered:=true;
    -- Verified first activation attaches the login; no membership, clock or progress reset.
    update public.fb_profiles set auth_user_id=p_id,role=case when p_owner then 'admin' else role end where id=result.id returning * into result;
  else
    if not p_owner and cfg.settings->>'registration'<>'open' then raise exception 'New account registration is closed'; end if;
    -- An account's first login is not evidence of its employee hire date.
    insert into public.fb_profiles(id,auth_user_id,email,name,role)
    values(p_id,p_id,lower(trim(p_email)),p_name,case when p_owner then 'admin' else 'learner' end) returning * into result;
  end if;
  update public.fb_config set governance_revision=governance_revision+1 where id;
  insert into public.fb_audit(actor,source,action,entity_id,snapshot) values(result.id,'auth','register',result.id::text,jsonb_build_object('preRegistered',preregistered,'role',result.role));
  return result;
end $$;
revoke all on function public.fb_register_profile from public,anon,authenticated;
grant execute on function public.fb_register_profile to service_role;

create or replace function public.fb_governance_snapshot(p_actor uuid) returns jsonb
language sql stable set search_path='' as $$
with recursive me as (select * from public.fb_profiles where id=p_actor and active and auth_user_id is not null),
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
  'pending','[]'::jsonb
);
$$;


create or replace function public.fb_admin_people_snapshot(p_actor uuid, p_user uuid default null)
returns jsonb language plpgsql stable set search_path = '' as $$
declare result jsonb;
begin
  if not exists (select 1 from public.fb_profiles where id=p_actor and active and role='admin' and deleted_at is null and auth_user_id is not null) then
    raise exception 'Administrator access is required';
  end if;
  if p_user is not null and not exists (select 1 from public.fb_profiles where id=p_user and deleted_at is null) then
    raise exception 'Person is no longer available';
  end if;
  select jsonb_build_object(
    'revision', c.governance_revision,
    'users', coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.fb_profiles p where p.deleted_at is null), '[]'::jsonb),
    'groups', c.groups,
    'teams', c.teams,
    'curricula', c.curricula,
    'pending', '[]'::jsonb,
    'progress', coalesce((select jsonb_agg(to_jsonb(p) order by p.content_id,p.version) from public.fb_progress p where p_user is not null and p.user_id=p_user), '[]'::jsonb)
  ) into result from public.fb_config c where c.id;
  return result;
end;
$$;
revoke all on function public.fb_admin_people_snapshot(uuid,uuid) from public, anon, authenticated;
grant execute on function public.fb_admin_people_snapshot(uuid,uuid) to service_role;

create or replace function public.fb_delete_users(p_actor uuid,p_expected integer,p_ids jsonb,p_owner text) returns jsonb
language plpgsql set search_path='' as $$
declare cfg public.fb_config; u public.fb_profiles; uid uuid; results jsonb:='[]'; changed boolean:=false;
begin
 select * into cfg from public.fb_config where id for update;
 if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin' and auth_user_id is not null and deleted_at is null) then raise exception 'Administrator access is required'; end if;
 if cfg.governance_revision<>p_expected then raise exception 'Revision conflict'; end if;
 for uid in select value::uuid from jsonb_array_elements_text(p_ids) loop
  begin
   select * into u from public.fb_profiles where id=uid for update;
   if not found then raise exception 'Account not found'; end if;
   if u.deleted_at is not null then results:=results||jsonb_build_array(jsonb_build_object('id',uid,'status','unchanged')); continue; end if;
   if uid=p_actor then raise exception 'You cannot delete your own account'; end if;
   if lower(u.email)=lower(p_owner) then raise exception 'The installation owner cannot be deleted'; end if;
   if exists(select 1 from jsonb_array_elements(cfg.teams) t where t->>'managerId'=uid::text) then raise exception 'Reassign this person''s managed teams first'; end if;
   if u.role='admin' and not exists(select 1 from public.fb_profiles where id<>uid and active and role='admin' and auth_user_id is not null) then raise exception 'Keep an active administrator'; end if;
   insert into public.fb_deleted_items(entity,id,name,email,revision,deleted_by,snapshot) values('user',uid,u.name,u.email,1,p_actor,to_jsonb(u));
   update public.fb_deleted_items set claimed_at=now(),claim=gen_random_uuid() where entity='user' and id=uid;
   update public.fb_profiles set active=false,deleted_at=now(),groups='[]',team_id=null,group_joined_at='{}',effective_group_joined_at='{}' where id=uid;
   update public.fb_mcp_grants set enabled=false where user_id=uid;
   insert into public.fb_audit(actor,source,action,entity_id) values(p_actor,'web','delete_user',uid::text);
   results:=results||jsonb_build_array(jsonb_build_object('id',uid,'status','changed')); changed:=true;
  exception when raise_exception then results:=results||jsonb_build_array(jsonb_build_object('id',uid,'status','failed','message',sqlerrm)); end;
 end loop;
 if changed then update public.fb_config set governance_revision=governance_revision+1 where id; end if;
 return results;
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
  -- Linked identities cascade through the roster; never-signed-in people have no Auth account.
  if exists(select 1 from public.fb_profiles where id=p_id and auth_user_id is not null) then raise exception 'Delete the Auth account before finalizing'; end if;
  delete from public.fb_profiles where id=p_id and auth_user_id is null and deleted_at is not null;
  if exists(select 1 from public.fb_profiles where id=p_id) then raise exception 'Person is not pending deletion'; end if;
  update public.fb_deleted_items set deleted_by='00000000-0000-0000-0000-000000000000' where deleted_by=p_id;
  update public.fb_audit set actor='00000000-0000-0000-0000-000000000000',snapshot=null where actor=p_id;
  delete from public.fb_audit where entity_id=p_id::text;
 end if;
 -- Historical full governance snapshots can contain the erased user's identity or content references.
 update public.fb_audit set snapshot=null where snapshot is not null and (snapshot::text like '%'||p_id::text||'%' or (d.email is not null and lower(snapshot::text) like '%'||lower(d.email)||'%'));
 delete from public.fb_deleted_items where entity=p_entity and id=p_id and claim=p_claim;
end $$;
-- Enable this function as the Custom Access Token Hook in Supabase Auth.
-- OAuth tokens for approved Fieldbook clients are bound to this MCP endpoint.
create or replace function public.fb_access_token_hook(event jsonb)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare claims jsonb; client text; resource text;
begin
  claims := event->'claims';
  client := coalesce(event->>'client_id',claims->>'client_id');
  if client is not null and exists(select 1 from public.fb_mcp_grants g join public.fb_profiles p on p.id=g.user_id where p.auth_user_id=(event->>'user_id')::uuid and p.active and p.deleted_at is null and g.client_id=client and g.enabled) then
    select c.resource into resource from public.fb_oauth_config c where id=true;
    if resource is not null then claims := jsonb_set(claims,'{aud}',to_jsonb(resource)); end if;
  end if;
  return jsonb_build_object('claims',claims);
end $$;
revoke all on function public.fb_access_token_hook from public,anon,authenticated;
grant execute on function public.fb_access_token_hook to supabase_auth_admin;
-- All live preregistration reads/writes now use fb_profiles; remove the redundant store.
drop table public.fb_pending_profiles;
commit;
