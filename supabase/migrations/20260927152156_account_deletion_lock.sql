begin;
alter table public.fb_deleted_items add column auth_locked boolean not null default false;
create or replace function public.fb_delete_users(p_actor uuid,p_expected integer,p_ids jsonb,p_owner text) returns jsonb
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
   update public.fb_deleted_items set claimed_at=now(),claim=gen_random_uuid() where entity='user' and id=uid;
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

create or replace function public.fb_restore_deleted(p_actor uuid,p_entity text,p_id uuid,p_expected integer) returns text
language plpgsql set search_path='' as $$
declare d public.fb_deleted_items;
begin
 perform 1 from public.fb_config where id for update;
 if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin') then raise exception 'Administrator access is required'; end if;
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

create or replace function public.fb_claim_deletions(p_secret text) returns setof public.fb_deleted_items
language plpgsql set search_path='' as $$
begin
 if not exists(select 1 from public.fb_cleanup_config where secret=p_secret) then raise exception 'Invalid worker credential'; end if;
 perform 1 from public.fb_config where id for update;
 update public.fb_cleanup_config set last_run=now() where id;
 return query update public.fb_deleted_items set purging=(purge_after<=now()),claimed_at=now(),claim=gen_random_uuid(),error=null
 where (entity,id) in (select entity,id from public.fb_deleted_items where (purge_after<=now() or (entity='user' and not auth_locked)) and (claimed_at is null or claimed_at<now()-interval '15 minutes') order by purge_after limit 20 for update skip locked) returning *;
end $$;

commit;
