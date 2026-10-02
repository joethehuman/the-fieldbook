begin;
set local lock_timeout = '5s';

-- A missing direct team is an effective membership of the built-in root.
-- Do not manufacture people, change saved team fields, or reset existing deadlines.
create function public.fb_reporting_team_id(p_team text,p_teams jsonb) returns text
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
-- Preserve additive learning projections from compatible releases. Refuse an
-- unexpected scope implementation instead of replacing unrelated function work.
do $$
declare definition text; old_predicate text := 'p.team_id in(select id from allowed)';
begin
 select pg_get_functiondef('public.fb_governance_snapshot(uuid)'::regprocedure) into definition;
 if strpos(definition,old_predicate)=0 then
  raise exception 'Reporting scope changed. Reconcile the Organization upgrade with this release';
 end if;
 execute replace(definition,old_predicate,'public.fb_reporting_team_id(p.team_id,(select teams from cfg)) in(select id from allowed)');
end $$;

revoke all on function public.fb_reporting_team_id(text,jsonb) from public,anon,authenticated;
grant execute on function public.fb_reporting_team_id(text,jsonb) to service_role;
-- Reconcile newly gained Organization-linked learning at the time of this change.
-- The episode reconciler retains every continuously assigned deadline and history.
select public.fb_sync_learning();
update public.fb_config set governance_revision=governance_revision+1 where id;
commit;
