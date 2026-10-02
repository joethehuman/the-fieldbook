-- Combined successor for flat Groups, typed Team/Group course sources and Organization.
-- Apply after the direct-assignment, built-in-root and root-membership migrations.
-- This supports both fresh filename order and previously upgraded installations.
-- Coordinate the matching application; older writers cannot preserve these contracts.
begin;
set local lock_timeout = '5s';
select id from public.fb_config where id for update;
create temporary table fb_combined_config_before on commit drop as select * from public.fb_config where id;
create temporary table fb_combined_people_before on commit drop as select * from public.fb_profiles;
create temporary table fb_combined_progress_before on commit drop as select * from public.fb_progress;
create temporary table fb_combined_episodes_before on commit drop as select * from public.fb_assignment_episodes;
create temporary table fb_combined_documents_before on commit drop as select * from public.fb_documents;
create temporary table fb_combined_coverage_before on commit drop as select * from public.fb_assignment_coverage();
create or replace function public.fb_effective_groups(p_direct jsonb,p_nodes jsonb) returns table(id text)
language sql immutable set search_path='' as $$
 select distinct d from jsonb_array_elements_text(p_direct) d where exists(select 1 from jsonb_array_elements(p_nodes) g where g->>'id'=d);
$$;
create or replace function public.fb_reporting_team_id(p_team text,p_teams jsonb) returns text
language sql immutable set search_path='' as $$
 select coalesce(nullif(p_team,''),(select t->>'id' from jsonb_array_elements(p_teams) t where t->>'system'='organization'));
$$;
create or replace function public.fb_team_ancestors(p_team text,p_teams jsonb) returns table(id text)
language sql immutable set search_path='' as $$
 with recursive branch(id) as (
  select public.fb_reporting_team_id(p_team,p_teams) where public.fb_reporting_team_id(p_team,p_teams) is not null
  union select t->>'parentId' from branch b,jsonb_array_elements(p_teams) t where t->>'id'=b.id and t->>'parentId' is not null
 ) select id from branch;
$$;
create or replace function public.fb_member_group_tree(p_direct jsonb,p_team text,p_nodes jsonb,p_teams jsonb) returns table(id text)
language sql immutable set search_path='' as $$
 select * from public.fb_effective_groups(p_direct||(
  select coalesce(jsonb_agg(g->>'id'),'[]') from jsonb_array_elements(p_nodes) g
  where coalesce(g->'legacyDirectTeamIds','[]') ? public.fb_reporting_team_id(p_team,p_teams) or exists(
   select 1 from jsonb_array_elements_text(coalesce(g->'teamIds','[]')) t
   where t=public.fb_reporting_team_id(p_team,p_teams) or t in(select id from public.fb_team_ancestors(p_team,p_teams))
  )
 ),p_nodes);
$$;
create or replace function public.fb_validate_learning(p_groups jsonb,p_teams jsonb,p_curricula jsonb) returns void
language plpgsql set search_path='' as $$
declare g jsonb; old jsonb; a jsonb; i jsonb; old_items jsonb; nodes jsonb; kind text;
begin
 perform public.fb_validate_learning_sources(p_groups,p_teams,p_curricula);
 perform public.fb_validate_organization((select settings from public.fb_config where id),p_teams,(select settings from public.fb_config where id),(select teams from public.fb_config where id));
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
 foreach kind in array array['group','team'] loop
  nodes:=case when kind='group' then p_groups else p_teams end;
  for a in select * from jsonb_array_elements(nodes) loop
   if jsonb_typeof(coalesce(a->'learningItems','[]'))<>'array' or jsonb_array_length(coalesce(a->'learningItems','[]'))>1000 then raise exception 'Invalid learning plan'; end if;
   if exists(select 1 from jsonb_array_elements(coalesce(a->'learningItems','[]')) item group by item->>'kind',item->>'id' having count(*)>1) then raise exception 'Duplicate learning item'; end if;
   select coalesce(n->'learningItems','[]') into old_items from public.fb_config c,jsonb_array_elements(case when kind='group' then c.groups else c.teams end) n where n->>'id'=a->>'id';
   for i in select * from jsonb_array_elements(coalesce(a->'learningItems','[]')) loop
    if i->>'kind'='course' then
     if not exists(select 1 from public.fb_documents d where d.id::text=i->>'id' and d.draft->>'kind'='course' and ((d.deleted_at is null and d.published is not null) or coalesce(old_items,'[]') @> jsonb_build_array(i))) then raise exception 'Choose a published course'; end if;
    elsif i->>'kind'='curriculum' then
     if not exists(select 1 from jsonb_array_elements(p_curricula) c where c->>'id'=i->>'id' and c->>'status'='published') then raise exception 'Choose a published curriculum'; end if;
    else raise exception 'Invalid learning item'; end if;
   end loop;
  end loop;
 end loop;
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
  select p.* from public.fb_profiles p,me where p.deleted_at is null and (p.id=me.id or me.role='admin' or (me.role in ('manager','contributor') and p.active and public.fb_reporting_team_id(p.team_id,(select teams from cfg)) in(select id from allowed)))
), group_ids as (
  select distinct g.id from people p,cfg,public.fb_member_groups(p.groups,p.team_id,cfg.groups) g
)
select jsonb_build_object(
  'revision',(select governance_revision from cfg),
  'users',coalesce((select jsonb_agg(to_jsonb(p)||public.fb_profile_learning(p)) from people p),'[]'),
  'groups',coalesce((select jsonb_agg(n) from cfg,jsonb_array_elements(cfg.groups) n where exists(select 1 from me where role='admin') or n->>'id' in(select id from group_ids)),'[]'),
  'teams',coalesce((select jsonb_agg(n) from team_nodes where n->>'id' in(select id from allowed)),'[]'),
  'progress',coalesce((select jsonb_agg(to_jsonb(p)) from public.fb_progress p where p.user_id in(select id from people)),'[]'),
  'pending','[]'::jsonb
);
$$;

-- Validate the installed contracts without rewriting any content or obligation.
select public.fb_validate_learning(groups,teams,curricula) from public.fb_config where id;
update public.fb_config set governance_revision=governance_revision+1 where id;
do $$ declare before_cfg public.fb_config; after_cfg public.fb_config;
begin
 select * into before_cfg from fb_combined_config_before;
 select * into after_cfg from public.fb_config where id;
 if to_jsonb(after_cfg)-'governance_revision' is distinct from to_jsonb(before_cfg)-'governance_revision' or after_cfg.governance_revision<>before_cfg.governance_revision+1 then raise exception 'Combined upgrade changed configuration beyond its governance revision'; end if;
 if exists((select * from fb_combined_people_before except select * from public.fb_profiles) union all (select * from public.fb_profiles except select * from fb_combined_people_before)) then raise exception 'Combined upgrade changed people'; end if;
 if exists((select * from fb_combined_progress_before except select * from public.fb_progress) union all (select * from public.fb_progress except select * from fb_combined_progress_before)) then raise exception 'Combined upgrade changed progress'; end if;
 if exists((select * from fb_combined_episodes_before except select * from public.fb_assignment_episodes) union all (select * from public.fb_assignment_episodes except select * from fb_combined_episodes_before)) then raise exception 'Combined upgrade changed assignment history or deadlines'; end if;
 if exists((select * from fb_combined_documents_before except select * from public.fb_documents) union all (select * from public.fb_documents except select * from fb_combined_documents_before)) then raise exception 'Combined upgrade changed content'; end if;
 if exists((select * from fb_combined_coverage_before except select * from public.fb_assignment_coverage()) union all (select * from public.fb_assignment_coverage() except select * from fb_combined_coverage_before)) then raise exception 'Combined upgrade changed effective learning coverage'; end if;
end $$;
revoke all on function public.fb_effective_groups(jsonb,jsonb),public.fb_reporting_team_id(text,jsonb),public.fb_team_ancestors(text,jsonb),public.fb_member_group_tree(jsonb,text,jsonb,jsonb),public.fb_validate_learning(jsonb,jsonb,jsonb),public.fb_governance_snapshot(uuid) from public,anon,authenticated;
grant execute on function public.fb_effective_groups(jsonb,jsonb),public.fb_reporting_team_id(text,jsonb),public.fb_team_ancestors(text,jsonb),public.fb_member_group_tree(jsonb,text,jsonb,jsonb),public.fb_validate_learning(jsonb,jsonb,jsonb),public.fb_governance_snapshot(uuid) to service_role;
notify pgrst,'reload schema';
commit;
