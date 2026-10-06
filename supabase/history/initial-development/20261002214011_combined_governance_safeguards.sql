-- Apply after the combined assignment/Organization successor.
-- Flat conversion may follow typed assignments on an existing installation.
-- Restore their governance save safeguards without replacing the final validator.
begin;
set local lock_timeout = '5s';
lock table public.fb_config in share row exclusive mode;
select id from public.fb_config where id for update;
-- Refuse an incomplete rollout rather than restoring saves over an older validator.
do $$ begin
 if strpos(pg_get_functiondef('public.fb_validate_learning(jsonb,jsonb,jsonb)'::regprocedure),'public.fb_validate_organization(')=0 then
  raise exception 'Apply the combined assignment/Organization successor before its governance safeguards';
 end if;
end $$;

create temporary table fb_safeguards_config_before on commit drop as select * from public.fb_config where id;
create temporary table fb_safeguards_people_before on commit drop as select * from public.fb_profiles;
create temporary table fb_safeguards_progress_before on commit drop as select * from public.fb_progress;
create temporary table fb_safeguards_episodes_before on commit drop as select * from public.fb_assignment_episodes;
create temporary table fb_safeguards_documents_before on commit drop as select * from public.fb_documents;
create temporary table fb_safeguards_coverage_before on commit drop as select * from public.fb_assignment_coverage();
-- Fail closed if an operator has omitted the final flat/root prerequisite.
select public.fb_validate_learning(groups,teams,curricula) from public.fb_config where id;
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
      if jsonb_array_length(coalesce(n->'learningItems','[]'))>0 then raise exception 'Remove assigned learning before deleting a team'; end if;
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
-- Invalidate pending governance saves; all saved configuration values remain fixed.
update public.fb_config set governance_revision=governance_revision+1 where id;
do $$ declare before_cfg public.fb_config; after_cfg public.fb_config;
begin
 select * into before_cfg from fb_safeguards_config_before;
 select * into after_cfg from public.fb_config where id;
 if to_jsonb(after_cfg)-'governance_revision' is distinct from to_jsonb(before_cfg)-'governance_revision' or after_cfg.governance_revision<>before_cfg.governance_revision+1 then raise exception 'Governance safeguards upgrade changed configuration beyond its governance revision'; end if;
 if exists((select * from fb_safeguards_people_before except select * from public.fb_profiles) union all (select * from public.fb_profiles except select * from fb_safeguards_people_before)) then raise exception 'Governance safeguards upgrade changed people'; end if;
 if exists((select * from fb_safeguards_progress_before except select * from public.fb_progress) union all (select * from public.fb_progress except select * from fb_safeguards_progress_before)) then raise exception 'Governance safeguards upgrade changed progress'; end if;
 if exists((select * from fb_safeguards_episodes_before except select * from public.fb_assignment_episodes) union all (select * from public.fb_assignment_episodes except select * from fb_safeguards_episodes_before)) then raise exception 'Governance safeguards upgrade changed assignment history or deadlines'; end if;
 if exists((select * from fb_safeguards_documents_before except select * from public.fb_documents) union all (select * from public.fb_documents except select * from fb_safeguards_documents_before)) then raise exception 'Governance safeguards upgrade changed content'; end if;
 if exists((select * from fb_safeguards_coverage_before except select * from public.fb_assignment_coverage()) union all (select * from public.fb_assignment_coverage() except select * from fb_safeguards_coverage_before)) then raise exception 'Governance safeguards upgrade changed effective learning coverage'; end if;
end $$;

revoke all on function public.fb_save_governance(uuid,integer,text,jsonb) from public,anon,authenticated;
grant execute on function public.fb_save_governance(uuid,integer,text,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
