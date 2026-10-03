-- Restore exact-email recoverable users through reviewed CSV imports.
-- No existing data is rewritten. Preserve the shared governance writer.
begin;
set local lock_timeout = '5s';
create or replace function public.fb_roster_import_fingerprint() returns text
language sql stable security invoker set search_path='' as $$
 select encode(sha256(convert_to(jsonb_build_object(
  'config',(select to_jsonb(c) from public.fb_config c where id),
  'people',coalesce((select jsonb_agg(jsonb_build_object('id',id,'email',email,'name',name,'role',role,'active',active,'groups',groups,'team',team_id,'hire',hire_date,'start',onboarding_start,'days',onboarding_days,'auth',auth_user_id,'deleted',deleted_at) order by id) from public.fb_profiles),'[]'),
  'published',coalesce((select jsonb_agg(jsonb_build_object('id',id,'published',published,'deleted',deleted_at) order by id) from public.fb_documents where published is not null),'[]'),
  'deleted',coalesce((select jsonb_agg(jsonb_build_object('id',id,'email',email,'purgeAfter',purge_after,'purging',purging,'authLocked',auth_locked) order by id) from public.fb_deleted_items where entity='user'),'[]')
 )::text,'UTF8')),'hex')
$$;
revoke all on function public.fb_roster_import_fingerprint() from public,anon,authenticated;
grant execute on function public.fb_roster_import_fingerprint() to service_role;

create or replace function public.fb_roster_import(p_actor uuid,p_file_hash text,p_run uuid default null,p_data jsonb default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg public.fb_config; run public.fb_roster_import_runs; u jsonb; old public.fb_profiles; deleted public.fb_deleted_items; n jsonb;
 added integer:=0; changed integer:=0; teams_added integer:=0; teams_changed integer:=0;
 saved jsonb; outcome jsonb; previous text:=coalesce(current_setting('fieldbook.learning_batch',true),'');
begin
 perform set_config('lock_timeout','5s',true);
 select * into cfg from public.fb_config where id for update;
 if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin' and auth_user_id is not null and deleted_at is null) then raise exception 'Administrator access is required'; end if;
 if p_file_hash is null or p_file_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid import file'; end if;
 if p_run is null then
  if p_data is not null then raise exception 'Review the file before importing'; end if;
  -- Expire abandoned reviews; committed compact receipts remain available for safe retries.
  delete from public.fb_roster_import_runs where result is null and reviewed_at < now()-interval '1 day';
  insert into public.fb_roster_import_runs(actor,file_hash,baseline) values(p_actor,p_file_hash,public.fb_roster_import_fingerprint()) returning * into run;
 else
  select * into run from public.fb_roster_import_runs where id=p_run for update;
  if not found or run.actor is distinct from p_actor or run.file_hash<>p_file_hash then raise exception 'Import review does not match this file or administrator'; end if;
  -- Permission and exact file/actor are checked before returning a committed receipt.
  if run.result is not null then return jsonb_build_object('id',run.id,'result',run.result); end if;
  lock table public.fb_profiles in share row exclusive mode;
  lock table public.fb_documents in share mode;
  lock table public.fb_deleted_items in share row exclusive mode;
  if run.reviewed_at < now()-interval '1 day' or run.review_day<>(now() at time zone 'UTC')::date or run.baseline<>public.fb_roster_import_fingerprint() then raise exception 'The organization changed. Review the file again before importing'; end if;
  if p_data is not null then
   if jsonb_typeof(p_data->'users') is distinct from 'array' or jsonb_typeof(p_data->'teams') is distinct from 'array' then raise exception 'Invalid import proposal'; end if;
   perform set_config('fieldbook.learning_batch','on',true);
   for n in select * from jsonb_array_elements(p_data->'teams') loop
    if not exists(select 1 from jsonb_array_elements(cfg.teams) t where t->>'id'=n->>'id') then teams_added:=teams_added+1;
    elsif exists(select 1 from jsonb_array_elements(cfg.teams) t where t->>'id'=n->>'id' and t is distinct from n) then teams_changed:=teams_changed+1; end if;
   end loop;
   for u in select * from jsonb_array_elements(p_data->'users') loop
    select * into old from public.fb_profiles where id=(u->>'id')::uuid;
    if not found then
     if u->>'role' not in ('learner','manager') or not (u->>'active')::boolean or u->'groups'<>'[]'::jsonb or u->>'onboardingStart' is not null then raise exception 'Invalid new import person'; end if;
     if exists(select 1 from public.fb_profiles where lower(trim(email))=lower(trim(u->>'email'))) or exists(select 1 from public.fb_deleted_items where entity='user' and lower(trim(email))=lower(trim(u->>'email'))) then raise exception 'A person already uses that email or is pending deletion'; end if;
     insert into public.fb_profiles(id,email,name,role,hire_date) values((u->>'id')::uuid,lower(trim(u->>'email')),u->>'name',u->>'role',(u->>'hireDate')::date);
     added:=added+1;
    elsif old.deleted_at is not null then
     select * into deleted from public.fb_deleted_items where entity='user' and id=old.id for update;
     if not found or deleted.email is null or lower(trim(deleted.email))<>lower(trim(old.email)) or not deleted.auth_locked or deleted.purging or deleted.purge_after<=clock_timestamp() then
      raise exception 'This deleted user is not ready for restoration or its recovery window has ended';
     end if;
     if u->>'email' is distinct from old.email or (u->>'active')::boolean is distinct from true or u->'groups' is distinct from '[]'::jsonb or (u->>'onboardingStart')::date is distinct from old.onboarding_start then
      raise exception 'Restoration cannot change login identity, direct groups or recorded start';
     end if;
     if u->>'role' is distinct from 'learner' and not (u->>'role'='manager' and exists(select 1 from jsonb_array_elements(p_data->'teams') t where t->>'managerId'=old.id::text)) then
      raise exception 'Restoration only grants learner access or explicitly assigned manager access';
     end if;
     -- The service clears any provider ban before this transaction. The profile
     -- remains denied until the complete roster writer below activates it.
     -- Never resurrect snapshot roles, memberships or disabled MCP consent.
     update public.fb_profiles set deleted_at=null,active=false,role='learner',groups='[]',team_id=null,group_joined_at='{}',effective_group_joined_at='{}' where id=old.id;
     delete from public.fb_deleted_items where entity='user' and id=old.id;
     changed:=changed+1;
    else
     if u->>'email' is distinct from old.email or (u->>'active')::boolean is distinct from old.active or u->'groups' is distinct from old.groups or (u->>'onboardingStart')::date is distinct from old.onboarding_start then raise exception 'Import cannot change login identity, activity, direct groups or recorded start'; end if;
     if u->>'role' is distinct from old.role and not (old.role='learner' and u->>'role'='manager' and exists(select 1 from jsonb_array_elements(p_data->'teams') t where t->>'managerId'=old.id::text)) then raise exception 'Import cannot remove or replace existing access'; end if;
     if u->>'name' is distinct from old.name or u->>'teamId' is distinct from old.team_id or (u->>'hireDate')::date is distinct from old.hire_date or u->>'role' is distinct from old.role then
      if not old.active or old.deleted_at is not null then raise exception 'Inactive or deleted people cannot be changed by import'; end if;
      changed:=changed+1;
     end if;
    end if;
   end loop;
   -- Reuse the current protected Organization, membership and assignment writer.
   -- It validates the complete roster under this same config lock and reconciles once.
   if added+changed+teams_added+teams_changed>0 then
    saved:=public.fb_save_governance(p_actor,cfg.governance_revision,'save',jsonb_build_object('users',p_data->'users','teams',p_data->'teams','groups',cfg.groups,'curricula',cfg.curricula));
   else saved:=jsonb_build_object('revision',cfg.governance_revision); end if;
   perform set_config('fieldbook.learning_batch',previous,true);
   outcome:=jsonb_build_object('peopleAdded',added,'peopleUpdated',changed,'teamsAdded',teams_added,'teamsUpdated',teams_changed,'revision',(saved->>'revision')::integer,'completedAt',now());
   if added+changed+teams_added+teams_changed>0 then
    -- Replace only this transaction's full-governance audit snapshot with its compact receipt.
    update public.fb_audit set action='roster_import',entity_id=run.id::text,snapshot=outcome where actor=p_actor and action='governance_save' and revision=(saved->>'revision')::integer;
   end if;
   update public.fb_roster_import_runs set result=outcome where id=run.id;
   return jsonb_build_object('id',run.id,'result',outcome);
  end if;
 end if;
 return jsonb_build_object('id',run.id,'day',run.review_day,'baseline',run.baseline);
end $$;
revoke all on function public.fb_roster_import(uuid,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.fb_roster_import(uuid,text,uuid,jsonb) to service_role;
notify pgrst,'reload schema';
commit;
