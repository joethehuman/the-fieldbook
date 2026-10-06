begin;
set local lock_timeout = '5s';

-- Existing team links retain their old reach until reviewed in the group UI.
update public.fb_config set groups=(select coalesce(jsonb_agg(g||jsonb_build_object('teamLinkScope',case when jsonb_array_length(coalesce(g->'teamIds','[]'))>0 then 'direct' else 'subtree' end)),'[]') from jsonb_array_elements(groups) g) where id;

create function public.fb_team_ancestors(p_team text,p_teams jsonb) returns table(id text)
language sql immutable set search_path='' as $$
 with recursive branch(id) as (
  select p_team where p_team is not null
  union select t->>'parentId' from branch b,jsonb_array_elements(p_teams) t where t->>'id'=b.id and t->>'parentId' is not null
 ) select id from branch;
$$;
create function public.fb_member_group_tree(p_direct jsonb,p_team text,p_nodes jsonb,p_teams jsonb) returns table(id text)
language sql immutable set search_path='' as $$
 select * from public.fb_effective_groups(p_direct || (
  select coalesce(jsonb_agg(g->>'id'),'[]') from jsonb_array_elements(p_nodes) g
  where exists(select 1 from jsonb_array_elements_text(coalesce(g->'teamIds','[]')) t
   where t=p_team or (coalesce(g->>'teamLinkScope','subtree')='subtree' and t in(select id from public.fb_team_ancestors(p_team,p_teams))))
 ),p_nodes);
$$;
create or replace function public.fb_member_groups(p_direct jsonb,p_team text,p_nodes jsonb) returns table(id text)
language sql stable set search_path='' as $$
 select * from public.fb_member_group_tree(p_direct,p_team,p_nodes,(select teams from public.fb_config where id));
$$;

-- A legacy link may be narrowed without broadening its reach. New links always
-- include descendants; old clients must not silently drop the migration marker.
alter function public.fb_validate_learning(jsonb,jsonb,jsonb) rename to fb_validate_learning_sources;
create function public.fb_validate_learning(p_groups jsonb,p_teams jsonb,p_curricula jsonb) returns void
language plpgsql set search_path='' as $$
declare g jsonb; old jsonb;
begin
 perform public.fb_validate_learning_sources(p_groups,p_teams,p_curricula);
 for g in select * from jsonb_array_elements(p_groups) loop
  select n into old from public.fb_config c,jsonb_array_elements(c.groups) n where n->>'id'=g->>'id';
  if old->>'teamLinkScope'='direct' and g->>'teamLinkScope' is null then raise exception 'Learning links changed. Reload with the matching application'; end if;
  if g->>'teamLinkScope'='direct' and (old->>'teamLinkScope' is distinct from 'direct' or exists(select 1 from jsonb_array_elements_text(coalesce(g->'teamIds','[]')) t where not coalesce(old->'teamIds','[]') ? t)) then raise exception 'New team links include all subteams. Review expansion first'; end if;
  if g->>'teamLinkScope' is not null and g->>'teamLinkScope' not in ('direct','subtree') then raise exception 'Invalid team link scope'; end if;
 end loop;
end $$;

create table public.fb_assignment_episodes (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.fb_profiles(id) on delete cascade,
 content_id uuid not null references public.fb_documents(id) on delete cascade,
 version integer not null check(version>0),
 started_at timestamptz not null,
 due_date date not null,
 catch_up_days integer not null check(catch_up_days between 1 and 365),
 onboarding_end date,
 source_groups jsonb not null check(jsonb_typeof(source_groups)='array'),
 baseline boolean not null default false,
 ended_at timestamptz
);
create unique index fb_assignment_active_key on public.fb_assignment_episodes(user_id,content_id,version) where ended_at is null;
create index fb_assignment_course_active on public.fb_assignment_episodes(content_id,user_id) where ended_at is null;
create index fb_assignment_person_history on public.fb_assignment_episodes(user_id,started_at desc);
create index fb_assignment_course_history on public.fb_assignment_episodes(content_id);
alter table public.fb_assignment_episodes enable row level security;
revoke all on public.fb_assignment_episodes from public,anon,authenticated;
grant select,insert,update,delete on public.fb_assignment_episodes to service_role;

create function public.fb_assignment_coverage(p_user uuid default null,p_content uuid default null)
returns table(user_id uuid,content_id uuid,version integer,source_groups jsonb,baseline_at timestamptz)
language sql stable set search_path='' as $$
 with cfg as (select * from public.fb_config where id),
 memberships as materialized (
  select p.id,p.group_joined_at,p.effective_group_joined_at,g.id as group_id
  from public.fb_profiles p,cfg,public.fb_member_group_tree(p.groups,p.team_id,cfg.groups,cfg.teams) g
  where p.deleted_at is null and (p_user is null or p.id=p_user)
 ), rules as (
  select d.id,(d.published->>'version')::integer as version,r
  from public.fb_documents d,jsonb_array_elements(coalesce(d.published->'assignments','[]')) r
  where d.deleted_at is null and d.published->>'kind'='course' and (p_content is null or d.id=p_content)
 )
 select m.id,r.id,r.version,jsonb_agg(distinct m.group_id order by m.group_id),
  min(greatest(coalesce((m.effective_group_joined_at->>m.group_id)::timestamptz,(m.group_joined_at->>m.group_id)::timestamptz,(r.r->>'assignedAt')::timestamptz), (r.r->>'assignedAt')::timestamptz))
 from memberships m join rules r on r.r->>'groupId'=m.group_id
 group by m.id,r.id,r.version;
$$;
create function public.fb_assignment_due(p_at timestamptz,p_start date,p_onboarding integer,p_catch integer)
returns date language sql immutable set search_path='' as $$
 select greatest((p_at at time zone 'UTC')::date+p_catch,p_start+p_onboarding);
$$;
create function public.fb_reconcile_assignments(p_user uuid default null,p_content uuid default null,p_baseline boolean default false)
returns void language plpgsql set search_path='' as $$
declare cfg public.fb_config; stamp timestamptz:=clock_timestamp();
begin
 select * into cfg from public.fb_config where id for update;
 update public.fb_assignment_episodes e set ended_at=stamp
 where ended_at is null and (p_user is null or e.user_id=p_user) and (p_content is null or e.content_id=p_content)
 and not exists(select 1 from public.fb_assignment_coverage(p_user,p_content) c where c.user_id=e.user_id and c.content_id=e.content_id and c.version=e.version);
 insert into public.fb_assignment_episodes(user_id,content_id,version,started_at,due_date,catch_up_days,onboarding_end,source_groups,baseline)
 select c.user_id,c.content_id,c.version,
  case when p_baseline then coalesce(c.baseline_at,stamp) else stamp end,
  public.fb_assignment_due(case when p_baseline then coalesce(c.baseline_at,stamp) else stamp end,coalesce(p.hire_date,p.onboarding_start),p.onboarding_days,coalesce((cfg.settings->>'catchUpDays')::integer,30)),
  coalesce((cfg.settings->>'catchUpDays')::integer,30),coalesce(p.hire_date,p.onboarding_start)+p.onboarding_days,c.source_groups,p_baseline
 from public.fb_assignment_coverage(p_user,p_content) c join public.fb_profiles p on p.id=c.user_id
 on conflict(user_id,content_id,version) where ended_at is null do update set source_groups=excluded.source_groups
 where public.fb_assignment_episodes.source_groups is distinct from excluded.source_groups;
end $$;

-- Keep source reconciliation and obligation reconciliation in one transaction.
alter function public.fb_sync_learning() rename to fb_sync_learning_sources;
create function public.fb_sync_learning() returns void language plpgsql set search_path='' as $$
declare previous text:=coalesce(current_setting('fieldbook.learning_batch',true),''); stamp text:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
 perform set_config('fieldbook.learning_batch','on',true);
 perform public.fb_sync_learning_sources();
 update public.fb_profiles p set effective_group_joined_at=(
  select coalesce(jsonb_object_agg(g.id,coalesce(p.effective_group_joined_at->>g.id,stamp)),'{}')
  from public.fb_config c,public.fb_member_group_tree(p.groups,p.team_id,c.groups,c.teams) g
 ) where p.deleted_at is null;
 perform set_config('fieldbook.learning_batch',previous,true);
 perform public.fb_reconcile_assignments();
end $$;

create function public.fb_assignment_person_changed() returns trigger language plpgsql set search_path='' as $$
begin
 if coalesce(current_setting('fieldbook.learning_batch',true),'')<>'on' then perform public.fb_reconcile_assignments(new.id); end if;
 return new;
end $$;
create trigger fb_assignment_person_changed after insert or update of groups,team_id,hire_date,onboarding_start,deleted_at on public.fb_profiles
for each row execute function public.fb_assignment_person_changed();
create function public.fb_assignment_course_changed() returns trigger language plpgsql set search_path='' as $$
begin
 if coalesce(current_setting('fieldbook.learning_batch',true),'')<>'on' then perform public.fb_reconcile_assignments(null,new.id); end if;
 return new;
end $$;
create trigger fb_assignment_course_changed after insert or update of published,deleted_at on public.fb_documents
for each row execute function public.fb_assignment_course_changed();

-- Current effective records become a documented baseline; this changes no deadlines.
select public.fb_reconcile_assignments(null,null,true);

create function public.fb_person_assignments(p_user uuid) returns jsonb language sql stable set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('episodeId',id,'contentId',content_id,'version',version,
  'assignedAt',to_char(started_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'dueDate',due_date,'catchUpDays',catch_up_days,'onboardingEnd',onboarding_end,'sourceGroups',source_groups,'baseline',baseline) order by content_id),'[]')
 from public.fb_assignment_episodes where user_id=p_user and ended_at is null;
$$;

create function public.fb_review_deadlines(p_actor uuid,p_apply boolean default false,p_token text default null)
returns jsonb language plpgsql set search_path='' as $$
declare cfg public.fb_config; clocks jsonb; courses jsonb; token text; review jsonb; previous text;
begin
 select * into cfg from public.fb_config where id for update;
 if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin' and auth_user_id is not null and deleted_at is null) then raise exception 'Administrator access is required'; end if;
 -- Serialize the short apply against learner progress so newly completed courses
 -- cannot have their deadline changed halfway through the reviewed transaction.
 if p_apply then lock table public.fb_progress in share mode; end if;
 token:=md5(cfg.revision::text||':'||cfg.governance_revision::text||':'||cfg.settings::text||
  coalesce((select string_agg(id::text||coalesce(coalesce(hire_date,onboarding_start)::text,'')||coalesce(onboarding_days,0)::text||active::text,',' order by id) from public.fb_profiles),'')||
  coalesce((select string_agg(id::text||started_at::text||due_date::text||source_groups::text,',' order by id) from public.fb_assignment_episodes where ended_at is null),'')||
  coalesce((select string_agg(user_id::text||content_id::text||version::text||revision::text,',' order by user_id,content_id,version) from public.fb_progress),''));
 select coalesce(jsonb_agg(jsonb_build_object('personId',id,'name',name,'before',coalesce(hire_date,onboarding_start)+onboarding_days,'after',coalesce(hire_date,onboarding_start)+(cfg.settings->>'onboardingDays')::integer) order by name,id),'[]') into clocks
 from public.fb_profiles where active and deleted_at is null and coalesce(hire_date,onboarding_start) is not null and onboarding_days is distinct from (cfg.settings->>'onboardingDays')::integer;
 select coalesce(jsonb_agg(jsonb_build_object('personId',p.id,'name',p.name,'contentId',d.id,'title',d.published->>'title','before',e.due_date,'after',public.fb_assignment_due(e.started_at,coalesce(p.hire_date,p.onboarding_start),(cfg.settings->>'onboardingDays')::integer,(cfg.settings->>'catchUpDays')::integer)) order by p.name,d.published->>'title',e.id),'[]') into courses
 from public.fb_assignment_episodes e join public.fb_profiles p on p.id=e.user_id join public.fb_documents d on d.id=e.content_id
 where e.ended_at is null and p.active and p.deleted_at is null
 and e.due_date is distinct from public.fb_assignment_due(e.started_at,coalesce(p.hire_date,p.onboarding_start),(cfg.settings->>'onboardingDays')::integer,(cfg.settings->>'catchUpDays')::integer)
 and not exists(select 1 from public.fb_progress r where r.user_id=e.user_id and r.content_id=e.content_id and r.version=e.version and r.passed
   and not exists(select 1 from jsonb_array_elements(coalesce(d.published->'lessons','[]')) l where not r.lessons ? (l->>'id')));
 review:=jsonb_build_object('token',token,'clocks',clocks,'courses',courses,'onboardingDays',(cfg.settings->>'onboardingDays')::integer,'catchUpDays',(cfg.settings->>'catchUpDays')::integer);
 if not p_apply then return review; end if;
 if p_token is distinct from token then raise exception 'People, assignments or settings changed. Review deadlines again'; end if;
 previous:=coalesce(current_setting('fieldbook.learning_batch',true),'');
 perform set_config('fieldbook.learning_batch','on',true);
 update public.fb_profiles set onboarding_days=(cfg.settings->>'onboardingDays')::integer where active and deleted_at is null and coalesce(hire_date,onboarding_start) is not null;
 update public.fb_assignment_episodes e set due_date=public.fb_assignment_due(e.started_at,coalesce(p.hire_date,p.onboarding_start),p.onboarding_days,(cfg.settings->>'catchUpDays')::integer),catch_up_days=(cfg.settings->>'catchUpDays')::integer,onboarding_end=coalesce(p.hire_date,p.onboarding_start)+p.onboarding_days
 from public.fb_profiles p,public.fb_documents d where e.user_id=p.id and e.content_id=d.id and e.ended_at is null and p.active and p.deleted_at is null
 and not exists(select 1 from public.fb_progress r where r.user_id=e.user_id and r.content_id=e.content_id and r.version=e.version and r.passed
   and not exists(select 1 from jsonb_array_elements(coalesce(d.published->'lessons','[]')) l where not r.lessons ? (l->>'id')));
 perform set_config('fieldbook.learning_batch',previous,true);
 update public.fb_config set governance_revision=governance_revision+1 where id;
 insert into public.fb_audit(actor,source,action,entity_id,snapshot) values(p_actor,'web','recalculate_deadlines','governance',review-'courses'-'clocks'||jsonb_build_object('clockCount',jsonb_array_length(clocks),'courseCount',jsonb_array_length(courses)));
 return review;
end $$;
create or replace function public.fb_save_governance(p_actor uuid,p_expected integer,p_operation text,p_data jsonb)
returns jsonb language plpgsql set search_path='' as $$
declare previous text:=coalesce(current_setting('fieldbook.learning_batch',true),''); cfg public.fb_config; u jsonb; n jsonb; old public.fb_profiles; direct_dates jsonb; effective_dates jsonb; stamp text;
begin
  select * into cfg from public.fb_config where id for update;
  if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin' and auth_user_id is not null and deleted_at is null) then raise exception 'Administrator access is required'; end if;
  if cfg.governance_revision<>p_expected then raise exception 'Revision conflict'; end if;
  perform set_config('fieldbook.learning_batch','on',true);
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
      select coalesce(jsonb_object_agg(g.id,coalesce(old.effective_group_joined_at->>g.id,stamp)),'{}') into effective_dates from public.fb_member_group_tree(u->'groups',u->>'teamId',p_data->'groups',p_data->'teams') g;
      update public.fb_profiles set hire_date=(u->>'hireDate')::date,onboarding_start=(u->>'onboardingStart')::date,name=u->>'name',role=u->>'role',active=(u->>'active')::boolean,groups=u->'groups',team_id=u->>'teamId',group_joined_at=direct_dates,effective_group_joined_at=effective_dates where id=old.id;
    end loop;
    if not exists(select 1 from public.fb_profiles where active and role='admin' and auth_user_id is not null) then raise exception 'Keep at least one active administrator'; end if;
    for n in select * from jsonb_array_elements(p_data->'teams') loop
      if n->>'managerId' is not null and not exists(select 1 from public.fb_profiles where id=(n->>'managerId')::uuid and active and role in ('manager','admin')) then raise exception 'Team managers must be active managers or administrators'; end if;
    end loop;
    update public.fb_config set groups=p_data->'groups',teams=p_data->'teams',curricula=coalesce(p_data->'curricula',cfg.curricula) where id;

  else raise exception 'Unknown governance operation'; end if;
  perform public.fb_sync_learning();
  perform set_config('fieldbook.learning_batch',previous,true);
  update public.fb_config set governance_revision=governance_revision+1 where id;
  insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','governance_'||p_operation,'governance',cfg.governance_revision+1,p_data);
  return jsonb_build_object('revision',cfg.governance_revision+1);
end $$;

drop function public.fb_register_profile(uuid,text,text,boolean);
create function public.fb_register_profile(p_id uuid,p_email text,p_name text,p_owner boolean)
returns jsonb language plpgsql set search_path='' as $$
declare cfg public.fb_config; result public.fb_profiles; preregistered boolean:=false;
begin
  select * into cfg from public.fb_config where id for update;
  select * into result from public.fb_profiles where auth_user_id=p_id;
  if found then return to_jsonb(result)||jsonb_build_object('learning_assignments',public.fb_person_assignments(result.id)); end if;
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
  return to_jsonb(result)||jsonb_build_object('learning_assignments',public.fb_person_assignments(result.id));
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
  'users',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('learning_assignments',public.fb_person_assignments(p.id))) from people p),'[]'),
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
    'users', coalesce((select jsonb_agg(to_jsonb(p)||case when p.id=p_user then jsonb_build_object('learning_assignments',public.fb_person_assignments(p.id)) else '{}'::jsonb end order by p.id) from public.fb_profiles p where p.deleted_at is null), '[]'::jsonb),
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


-- Restrict helpers and writes to the server's service role; API handlers also check the actor.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('fb_validate_learning','fb_validate_learning_sources','fb_team_ancestors','fb_member_group_tree','fb_member_groups','fb_assignment_coverage','fb_assignment_due','fb_reconcile_assignments','fb_sync_learning','fb_sync_learning_sources','fb_assignment_person_changed','fb_assignment_course_changed','fb_person_assignments','fb_review_deadlines') loop
  execute 'revoke all on function '||f.signature||' from public,anon,authenticated';
  execute 'grant execute on function '||f.signature||' to service_role';
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
