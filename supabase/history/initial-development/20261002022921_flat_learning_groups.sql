begin;
set local lock_timeout = '5s';

-- This is a coordinated model upgrade. Pause organization/content writes and
-- deploy the matching application after applying it. All coverage changes below
-- are visible together; no transient remove/rejoin can reset a saved deadline.
select id from public.fb_config where id for update;
select set_config('fieldbook.learning_batch','on',true);
create temporary table fb_flat_old_config on commit drop as select * from public.fb_config where id;
create temporary table fb_flat_ancestors on commit drop as
 select g->>'id' as source_id,a.id as target_id
 from fb_flat_old_config c,jsonb_array_elements(c.groups) g,
 public.fb_effective_groups(jsonb_build_array(g->>'id'),c.groups) a;
create temporary table fb_flat_group_order on commit drop as
 select g->>'id' as id,row_number() over(order by (select count(*) from fb_flat_ancestors a where a.source_id=g->>'id'),lower(g->>'name'),g->>'id') as position,g
 from fb_flat_old_config c,jsonb_array_elements(c.groups) g;
create temporary table fb_flat_old_memberships on commit drop as
 select p.id as person_id,g.id as group_id from public.fb_profiles p,fb_flat_old_config c,
 public.fb_member_group_tree(p.groups,p.team_id,c.groups,c.teams) g where p.deleted_at is null;
create temporary table fb_flat_old_coverage on commit drop as
 select user_id,content_id,version from public.fb_assignment_coverage();
create temporary table fb_flat_old_episodes on commit drop as
 select id,user_id,content_id,version,started_at,due_date,catch_up_days,onboarding_end,baseline,ended_at from public.fb_assignment_episodes;
create temporary table fb_flat_old_updates on commit drop as
 select distinct m.person_id,d.id as content_id from fb_flat_old_memberships m,public.fb_documents d
 where d.deleted_at is null and d.published->>'kind'='brief' and coalesce(d.published->'groups','[]') ? m.group_id;
create temporary table fb_flat_guest_groups on commit drop as
 select a.target_id from fb_flat_old_config c,fb_flat_ancestors a where a.source_id=c.settings->>'guestGroupId';
create temporary table fb_flat_old_guest on commit drop as
 select distinct d.id as content_id from public.fb_documents d,fb_flat_guest_groups g
 where d.deleted_at is null and d.published->>'kind' in ('course','brief') and coalesce(d.published->'groups','[]') ? g.target_id;

-- Preserve direct people in each former ancestor. Team-derived people are never
-- copied into individual membership lists: their team source stays live.
update public.fb_profiles p set
 groups=(select coalesce(jsonb_agg(x.id order by o.position),'[]') from (select distinct a.target_id as id from jsonb_array_elements_text(p.groups) d join fb_flat_ancestors a on a.source_id=d) x join fb_flat_group_order o on o.id=x.id),
 group_joined_at=(select coalesce(jsonb_object_agg(x.id,x.joined),'{}') from (
  select a.target_id as id,coalesce(p.effective_group_joined_at->>a.target_id,p.group_joined_at->>a.target_id,min(p.group_joined_at->>d)) as joined
  from jsonb_array_elements_text(p.groups) d join fb_flat_ancestors a on a.source_id=d group by a.target_id
 ) x where x.joined is not null);
-- Recovery snapshots are operator-owned records too. Restoring a person must not
-- discard their formerly inherited individual audiences.
update public.fb_deleted_items p set snapshot=jsonb_set(jsonb_set(p.snapshot,'{groups}',(
 select coalesce(jsonb_agg(x.id order by o.position),'[]') from (select distinct a.target_id as id from jsonb_array_elements_text(coalesce(p.snapshot->'groups','[]')) d join fb_flat_ancestors a on a.source_id=d) x join fb_flat_group_order o on o.id=x.id
 )),'{group_joined_at}',(
 select coalesce(jsonb_object_agg(x.id,x.joined),'{}') from (
  select a.target_id as id,coalesce(p.snapshot->'effective_group_joined_at'->>a.target_id,p.snapshot->'group_joined_at'->>a.target_id,min(p.snapshot->'group_joined_at'->>d)) as joined
  from jsonb_array_elements_text(coalesce(p.snapshot->'groups','[]')) d join fb_flat_ancestors a on a.source_id=d group by a.target_id
 ) x where x.joined is not null
 )) where p.entity='user' and p.snapshot is not null;

-- Group-level legacy scope cannot express a mixture of copied direct/subtree
-- sources. Canonical teamIds now mean subtrees; legacyDirectTeamIds preserve only
-- old direct sources and may be narrowed or explicitly expanded by an admin.
with sources as (
 select a.target_id,g->>'id' as source_id,t as team_id,coalesce(g->>'teamLinkScope','subtree') as scope
 from fb_flat_old_config c,jsonb_array_elements(c.groups) g join fb_flat_ancestors a on a.source_id=g->>'id',jsonb_array_elements_text(coalesce(g->'teamIds','[]')) t
 union all
 select a.target_id,g->>'id',t,'direct' from fb_flat_old_config c,jsonb_array_elements(c.groups) g join fb_flat_ancestors a on a.source_id=g->>'id',jsonb_array_elements_text(coalesce(g->'legacyDirectTeamIds','[]')) t
), links as (
 select target_id,team_id,bool_or(scope='subtree') as subtree from sources group by target_id,team_id
), flat as (
 select o.position,(o.g-'parentId'-'teamLinkScope')||jsonb_build_object(
  'teamIds',(select coalesce(jsonb_agg(l.team_id order by l.team_id),'[]') from links l where l.target_id=o.id and l.subtree),
  'legacyDirectTeamIds',(select coalesce(jsonb_agg(l.team_id order by l.team_id),'[]') from links l where l.target_id=o.id and not l.subtree),
  'learningItems',case when o.id=c.settings->>'guestGroupId' then (
   select coalesce(jsonb_agg(i order by position,subposition),'[]') from (
    select distinct on(i->>'kind',i->>'id') i,p.position,subposition from fb_flat_group_order p join fb_flat_guest_groups a on a.target_id=p.id,
     jsonb_array_elements(coalesce(p.g->'learningItems','[]')) with ordinality item(i,subposition)
    order by i->>'kind',i->>'id',p.position,subposition
   ) unique_items
  ) else coalesce(o.g->'learningItems','[]') end
 ) as g from fb_flat_group_order o,fb_flat_old_config c
)
update public.fb_config set groups=(select coalesce(jsonb_agg(g order by position),'[]') from flat),governance_revision=governance_revision+1 where id;

-- The selected guest audience formerly received its ancestors' recommendations.
-- Retain those existing choices explicitly, without a guest account or automatic
-- future group inheritance. Course plans are synchronized once below.
update public.fb_documents d set
 draft=case when d.draft->>'kind'='brief' and exists(select 1 from fb_flat_guest_groups g where coalesce(d.draft->'groups','[]') ? g.target_id) then jsonb_set(d.draft,'{groups}',(select jsonb_agg(distinct x) from jsonb_array_elements_text(coalesce(d.draft->'groups','[]')||jsonb_build_array(c.settings->>'guestGroupId')) x)) else d.draft end,
 published=case when d.published->>'kind'='brief' and exists(select 1 from fb_flat_guest_groups g where coalesce(d.published->'groups','[]') ? g.target_id) then jsonb_set(d.published,'{groups}',(select jsonb_agg(distinct x) from jsonb_array_elements_text(coalesce(d.published->'groups','[]')||jsonb_build_array(c.settings->>'guestGroupId')) x)) else d.published end,
 revision=d.revision+1
 from fb_flat_old_config c where c.settings->>'guestGroupId' is not null
 and d.draft->>'kind'='brief' and (
  (exists(select 1 from fb_flat_guest_groups g where coalesce(d.draft->'groups','[]') ? g.target_id) and not coalesce(d.draft->'groups','[]') ? (c.settings->>'guestGroupId'))
  or (exists(select 1 from fb_flat_guest_groups g where coalesce(d.published->'groups','[]') ? g.target_id) and not coalesce(d.published->'groups','[]') ? (c.settings->>'guestGroupId'))
 );

create or replace function public.fb_effective_groups(p_direct jsonb,p_nodes jsonb) returns table(id text)
language sql immutable set search_path='' as $$
 select distinct d from jsonb_array_elements_text(p_direct) d where exists(select 1 from jsonb_array_elements(p_nodes) g where g->>'id'=d);
$$;
create or replace function public.fb_member_group_tree(p_direct jsonb,p_team text,p_nodes jsonb,p_teams jsonb) returns table(id text)
language sql immutable set search_path='' as $$
 select * from public.fb_effective_groups(p_direct||(
  select coalesce(jsonb_agg(g->>'id'),'[]') from jsonb_array_elements(p_nodes) g
  where coalesce(g->'legacyDirectTeamIds','[]') ? p_team or exists(
   select 1 from jsonb_array_elements_text(coalesce(g->'teamIds','[]')) t
   where t=p_team or t in(select id from public.fb_team_ancestors(p_team,p_teams))
  )
 ),p_nodes);
$$;
create or replace function public.fb_validate_learning(p_groups jsonb,p_teams jsonb,p_curricula jsonb) returns void
language plpgsql set search_path='' as $$
declare g jsonb; old jsonb;
begin
 perform public.fb_validate_learning_sources(p_groups,p_teams,p_curricula);
 -- Same deletion rule for preserved direct sources as canonical subtree links:
 -- first remove the source in one save, then delete its referenced team.
 if exists(select 1 from public.fb_config c,jsonb_array_elements(c.groups) n,jsonb_array_elements_text(coalesce(n->'legacyDirectTeamIds','[]')) t where not exists(select 1 from jsonb_array_elements(p_teams) x where x->>'id'=t)) then raise exception 'Remove learning-group links before deleting a team'; end if;
 for g in select * from jsonb_array_elements(p_groups) loop
  if g->>'parentId' is not null then raise exception 'Learning groups are independent audiences and cannot have parents'; end if;
  if g->>'teamLinkScope'='direct' then raise exception 'Legacy learning links changed. Reload with the matching application'; end if;
  if jsonb_typeof(coalesce(g->'legacyDirectTeamIds','[]')) is distinct from 'array' then raise exception 'Invalid legacy team links'; end if;
  select n into old from public.fb_config c,jsonb_array_elements(c.groups) n where n->>'id'=g->>'id';
  if jsonb_array_length(coalesce(old->'legacyDirectTeamIds','[]'))>0 and g->'legacyDirectTeamIds' is null then raise exception 'Learning links changed. Reload with the matching application'; end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(g->'legacyDirectTeamIds','[]')) t where not coalesce(old->'legacyDirectTeamIds','[]') ? t) then raise exception 'New team links include all subteams'; end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(g->'legacyDirectTeamIds','[]')||coalesce(g->'teamIds','[]')) t group by t having count(*)>1) then raise exception 'Duplicate team link'; end if;
  if exists(select 1 from jsonb_array_elements_text(coalesce(g->'legacyDirectTeamIds','[]')) t where not exists(select 1 from jsonb_array_elements(p_teams) x where x->>'id'=t)) then raise exception 'Team does not exist'; end if;
 end loop;
end $$;
create function public.fb_groups_are_flat(p_groups jsonb) returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(p_groups)='array' and not exists(select 1 from jsonb_array_elements(p_groups) g where g->>'parentId' is not null or g->>'teamLinkScope'='direct');
$$;
alter table public.fb_config add constraint fb_config_flat_learning_groups check(public.fb_groups_are_flat(groups));
revoke all on function public.fb_groups_are_flat(jsonb) from public,anon,authenticated;
grant execute on function public.fb_groups_are_flat(jsonb) to service_role;

-- Restore episode-aware atomic governance after the contributor upgrade,
-- retaining publisher permissions and explicit contributor team reporting.
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
      select coalesce(jsonb_object_agg(g.id,coalesce(old.effective_group_joined_at->>g.id,stamp)),'{}') into effective_dates from public.fb_member_group_tree(u->'groups',u->>'teamId',p_data->'groups',p_data->'teams') g;
      update public.fb_profiles set hire_date=(u->>'hireDate')::date,onboarding_start=(u->>'onboardingStart')::date,name=u->>'name',role=u->>'role',active=(u->>'active')::boolean,groups=u->'groups',team_id=u->>'teamId',group_joined_at=direct_dates,effective_group_joined_at=effective_dates where id=old.id;
    end loop;
    if not exists(select 1 from public.fb_profiles where active and role='admin' and auth_user_id is not null) then raise exception 'Keep at least one active administrator'; end if;
    for n in select * from jsonb_array_elements(p_data->'teams') loop
      if n->>'managerId' is not null and not exists(select 1 from public.fb_profiles where id=(n->>'managerId')::uuid and active and role in ('manager','admin','contributor')) then raise exception 'Team managers must be active managers, contributors or administrators'; end if;
    end loop;
    update public.fb_config set groups=p_data->'groups',teams=p_data->'teams',curricula=coalesce(p_data->'curricula',cfg.curricula) where id;

  else raise exception 'Unknown governance operation'; end if;
  perform public.fb_sync_learning();
  perform set_config('fieldbook.learning_batch',previous,true);
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
  'users',coalesce((select jsonb_agg(to_jsonb(p)||jsonb_build_object('learning_assignments',public.fb_person_assignments(p.id))) from people p),'[]'),
  'groups',coalesce((select jsonb_agg(n) from cfg,jsonb_array_elements(cfg.groups) n where exists(select 1 from me where role='admin') or n->>'id' in(select id from group_ids)),'[]'),
  'teams',coalesce((select jsonb_agg(n) from team_nodes where n->>'id' in(select id from allowed)),'[]'),
  'progress',coalesce((select jsonb_agg(to_jsonb(p)) from public.fb_progress p where p.user_id in(select id from people)),'[]'),
  'pending','[]'::jsonb
);
$$;


select public.fb_sync_learning();
select set_config('fieldbook.learning_batch','',true);

-- Refuse the entire upgrade if it changes effective learning/relevance or resets
-- any existing episode. More explicit sources may change source_groups only.
do $$ begin
 if exists((select person_id,group_id from fb_flat_old_memberships except select p.id,g.id from public.fb_profiles p,public.fb_config c,public.fb_member_group_tree(p.groups,p.team_id,c.groups,c.teams) g where p.deleted_at is null)
 union all (select p.id,g.id from public.fb_profiles p,public.fb_config c,public.fb_member_group_tree(p.groups,p.team_id,c.groups,c.teams) g where p.deleted_at is null except select person_id,group_id from fb_flat_old_memberships)) then raise exception 'Flat conversion changed effective memberships'; end if;
 if exists((select * from fb_flat_old_coverage except select user_id,content_id,version from public.fb_assignment_coverage())
 union all (select user_id,content_id,version from public.fb_assignment_coverage() except select * from fb_flat_old_coverage)) then raise exception 'Flat conversion changed assigned course versions'; end if;
 if exists((select * from fb_flat_old_episodes except select id,user_id,content_id,version,started_at,due_date,catch_up_days,onboarding_end,baseline,ended_at from public.fb_assignment_episodes)
 union all (select id,user_id,content_id,version,started_at,due_date,catch_up_days,onboarding_end,baseline,ended_at from public.fb_assignment_episodes except select * from fb_flat_old_episodes)) then raise exception 'Flat conversion changed assignment history or deadlines'; end if;
 if exists((select * from fb_flat_old_updates except select distinct p.id,d.id from public.fb_profiles p,public.fb_config c,public.fb_member_group_tree(p.groups,p.team_id,c.groups,c.teams) g,public.fb_documents d where p.deleted_at is null and d.deleted_at is null and d.published->>'kind'='brief' and coalesce(d.published->'groups','[]') ? g.id)
 union all (select distinct p.id,d.id from public.fb_profiles p,public.fb_config c,public.fb_member_group_tree(p.groups,p.team_id,c.groups,c.teams) g,public.fb_documents d where p.deleted_at is null and d.deleted_at is null and d.published->>'kind'='brief' and coalesce(d.published->'groups','[]') ? g.id except select * from fb_flat_old_updates)) then raise exception 'Flat conversion changed Update relevance'; end if;
 if exists((select * from fb_flat_old_guest except select d.id from public.fb_documents d,public.fb_config c where d.deleted_at is null and d.published->>'kind' in ('course','brief') and coalesce(d.published->'groups','[]') ? (c.settings->>'guestGroupId'))
 union all (select d.id from public.fb_documents d,public.fb_config c where d.deleted_at is null and d.published->>'kind' in ('course','brief') and coalesce(d.published->'groups','[]') ? (c.settings->>'guestGroupId') except select * from fb_flat_old_guest)) then raise exception 'Flat conversion changed guest recommendations'; end if;
end $$;
commit;
