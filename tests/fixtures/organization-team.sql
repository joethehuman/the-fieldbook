-- Requires the roster, stable-assignment, contributor and flat-group migrations.
-- This independent config guard does not replace assignment or governance RPCs.
-- Rehearse against an isolated backend and coordinate matching code; never mix old writers.
begin;
set local lock_timeout = '5s';
lock table public.fb_config in share row exclusive mode;

create temporary table fb_org_before on commit drop as
 select * from public.fb_config where id;
create temporary table fb_org_people_before on commit drop as select * from public.fb_profiles;
create temporary table fb_org_progress_before on commit drop as select * from public.fb_progress;
create temporary table fb_org_episodes_before on commit drop as select * from public.fb_assignment_episodes;
create temporary table fb_org_coverage_before on commit drop as select user_id,content_id,version from public.fb_assignment_coverage();
create temporary table fb_org_documents_before on commit drop as select * from public.fb_documents;

-- Keep only an explicitly designated, sole existing root. Do not infer intent from names.
do $$
declare cfg public.fb_config; root jsonb; root_id text; root_name text:='Organization'; suffix integer:=2; nodes jsonb;
begin
 select * into cfg from public.fb_config where id for update;
 perform public.fb_validate_nodes(cfg.teams);
 if exists(select 1 from jsonb_array_elements(cfg.teams) t where t ? 'system') then
   raise exception 'Unexpected existing system team; review before applying';
 end if;
 if (select count(*) from jsonb_array_elements(cfg.teams) t where t->>'parentId' is null)=1 then
   select t into root from jsonb_array_elements(cfg.teams) t
    where t->>'parentId' is null and t->>'id'=cfg.settings->>'organizationTeamId';
 end if;
 if root is null then
   root_id:=gen_random_uuid()::text;
   while exists(select 1 from jsonb_array_elements(cfg.teams) t where t->>'id'=root_id) loop root_id:=gen_random_uuid()::text; end loop;
   while exists(select 1 from jsonb_array_elements(cfg.teams) t where lower(trim(t->>'name'))=lower(root_name)) loop
     root_name:='Organization ('||suffix||')'; suffix:=suffix+1;
   end loop;
   root:=jsonb_build_object('id',root_id,'name',root_name);
 else root_id:=root->>'id'; end if;
 root:=root-'parentId'||jsonb_build_object('system','organization');
 select jsonb_build_array(root)||coalesce(jsonb_agg(case when t->>'parentId' is null then t||jsonb_build_object('parentId',root_id) else t end order by position),'[]')
   into nodes from jsonb_array_elements(cfg.teams) with ordinality as existing(t,position) where t->>'id'<>root_id;
 update public.fb_config set teams=nodes,settings=jsonb_set(settings,'{organizationTeamId}',to_jsonb(root_id)),revision=revision+1,governance_revision=governance_revision+1 where id;
end $$;

create function public.fb_organization_team(p_settings jsonb,p_teams jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select t from jsonb_array_elements(p_teams) t
 where t->>'system'='organization' and t->>'id'=p_settings->>'organizationTeamId' and t->>'parentId' is null
 and (select count(*) from jsonb_array_elements(p_teams) n where n->>'system'='organization')=1
 and not exists(select 1 from jsonb_array_elements(p_teams) n where n->>'id'<>t->>'id' and n->>'parentId' is null);
$$;
create function public.fb_validate_organization(p_settings jsonb,p_teams jsonb,p_previous_settings jsonb default null,p_previous_teams jsonb default null) returns void
language plpgsql set search_path='' as $$
declare root jsonb; previous_root jsonb;
begin
 perform public.fb_validate_nodes(p_teams);
 if exists(select 1 from jsonb_array_elements(p_teams) t where t->>'system' is not null and t->>'system'<>'organization') then raise exception 'Invalid system team'; end if;
 root:=public.fb_organization_team(p_settings,p_teams);
 if root is null then raise exception 'Keep the built-in Organization team as the only top-level team'; end if;
 if p_previous_settings is not null then
   previous_root:=public.fb_organization_team(p_previous_settings,p_previous_teams);
   if previous_root is null or root->>'id' is distinct from previous_root->>'id' or root->>'name' is distinct from previous_root->>'name' then
     raise exception 'The Organization team cannot be deleted, renamed or replaced';
   end if;
 end if;
end $$;
create function public.fb_guard_organization() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' then raise exception 'The built-in Organization team cannot be deleted'; end if;
 if tg_op='INSERT' then
   if new.teams<>'[]'::jsonb or new.settings->>'organizationTeamId' is not null then
     raise exception 'New installations start with the built-in Organization team';
   end if;
   new.settings:=jsonb_set(new.settings,'{organizationTeamId}',to_jsonb(gen_random_uuid()::text));
   new.teams:=jsonb_build_array(jsonb_build_object('id',new.settings->>'organizationTeamId','name','Organization','system','organization'));
   perform public.fb_validate_organization(new.settings,new.teams);
 else
   perform public.fb_validate_organization(new.settings,new.teams,old.settings,old.teams);
 end if;
 return new;
end $$;
create trigger fb_guard_organization before insert or update or delete on public.fb_config
 for each row execute function public.fb_guard_organization();

-- Adding an empty system root changes no coverage, clocks, progress or history.
-- A reused root already covered the whole existing hierarchy; a new root has no manager.
do $$ declare cfg public.fb_config; before_cfg public.fb_config; root jsonb; previous_root jsonb; expected_team jsonb; prior jsonb; actual jsonb;
begin
 select * into cfg from public.fb_config where id;
 select * into before_cfg from fb_org_before;
 root:=public.fb_organization_team(cfg.settings,cfg.teams);
 if cfg.groups is distinct from before_cfg.groups or cfg.curricula is distinct from before_cfg.curricula or cfg.settings-'organizationTeamId' is distinct from before_cfg.settings-'organizationTeamId' then raise exception 'Organization upgrade changed learning groups, curricula or unrelated settings'; end if;
 if cfg.revision<>before_cfg.revision+1 or cfg.governance_revision<>before_cfg.governance_revision+1 then raise exception 'Organization upgrade revisions were not advanced once'; end if;
 for prior in select * from jsonb_array_elements(before_cfg.teams) loop
   expected_team:=prior;
   if prior->>'id'=root->>'id' then expected_team:=prior-'parentId'||jsonb_build_object('system','organization');
   elsif prior->>'parentId' is null then expected_team:=prior||jsonb_build_object('parentId',root->>'id'); end if;
   select t into actual from jsonb_array_elements(cfg.teams) t where t->>'id'=prior->>'id';
   if actual is distinct from expected_team then raise exception 'Organization upgrade changed an existing team beyond its root attachment'; end if;
 end loop;
 select t into previous_root from jsonb_array_elements(before_cfg.teams) t where t->>'id'=root->>'id';
 if jsonb_array_length(cfg.teams)<>jsonb_array_length(before_cfg.teams)+(case when previous_root is null then 1 else 0 end) then raise exception 'Organization upgrade changed existing team identities'; end if;
 if previous_root is null and root is distinct from jsonb_build_object('id',root->>'id','name',root->>'name','system','organization') then raise exception 'New Organization root must start without a manager or learning assignments'; end if;
 if exists((select * from fb_org_people_before except select * from public.fb_profiles) union all (select * from public.fb_profiles except select * from fb_org_people_before)) then raise exception 'Organization upgrade changed people'; end if;
 if exists((select * from fb_org_progress_before except select * from public.fb_progress) union all (select * from public.fb_progress except select * from fb_org_progress_before)) then raise exception 'Organization upgrade changed progress'; end if;
 if exists((select * from fb_org_episodes_before except select * from public.fb_assignment_episodes) union all (select * from public.fb_assignment_episodes except select * from fb_org_episodes_before)) then raise exception 'Organization upgrade changed assignment history or deadlines'; end if;
 if exists((select * from fb_org_coverage_before except select user_id,content_id,version from public.fb_assignment_coverage()) union all (select user_id,content_id,version from public.fb_assignment_coverage() except select * from fb_org_coverage_before)) then raise exception 'Organization upgrade changed assigned course versions'; end if;
 if exists((select * from fb_org_documents_before except select * from public.fb_documents) union all (select * from public.fb_documents except select * from fb_org_documents_before)) then raise exception 'Organization upgrade changed content or Update relevance'; end if;
 perform public.fb_validate_organization(settings,teams) from public.fb_config where id;
end $$;
revoke all on function public.fb_organization_team(jsonb,jsonb),public.fb_validate_organization(jsonb,jsonb,jsonb,jsonb),public.fb_guard_organization() from public,anon,authenticated;
grant execute on function public.fb_organization_team(jsonb,jsonb),public.fb_validate_organization(jsonb,jsonb,jsonb,jsonb),public.fb_guard_organization() to service_role;
notify pgrst,'reload schema';
commit;
