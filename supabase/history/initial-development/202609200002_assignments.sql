-- Assignment-only changes preserve unpublished course edits. All writes are admin-only and audited.
alter table public.fb_progress add column revision integer not null default 1;
create function public.fb_progress_revision() returns trigger language plpgsql set search_path='' as $$
begin new.revision := old.revision + 1; return new; end $$;
create trigger fb_progress_revision before update on public.fb_progress for each row execute function public.fb_progress_revision();
revoke all on function public.fb_progress_revision from public,anon,authenticated;
create or replace function public.fb_assignment_guard() returns trigger language plpgsql set search_path='' as $$
declare cfg public.fb_config; payload jsonb; rules jsonb; rule jsonb; prior jsonb; gid text; uid text; stamp text; field text;
begin
  select * into cfg from public.fb_config where id for update;
  stamp:=to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  foreach field in array array['draft','published'] loop
    payload:=case when field='draft' then new.draft else new.published end;
    if payload is null then continue; end if;
    rules:='[]';
    for rule in select * from jsonb_array_elements(coalesce(payload->'assignments',(select coalesce(jsonb_agg(jsonb_build_object('groupId',g,'due',jsonb_build_object('type','none'))),'[]') from jsonb_array_elements_text(coalesce(payload->'groups','[]')) g))) loop
      gid:=rule->>'groupId'; uid:=rule->>'userId';
      if (gid is null) = (uid is null) then raise exception 'Choose exactly one assignment recipient'; end if;
      if payload->>'kind'<>'course' then raise exception 'Only courses can be assigned'; end if;
      if gid is not null and not exists(select 1 from jsonb_array_elements(cfg.groups) g where g->>'id'=gid) then raise exception 'Assignment group does not exist'; end if;
      if uid is not null and not exists(select 1 from public.fb_profiles where id::text=uid) then raise exception 'Assignment user does not exist'; end if;
      if exists(select 1 from jsonb_array_elements(rules) r where (gid is not null and r->>'groupId'=gid) or (uid is not null and r->>'userId'=uid)) then raise exception 'Duplicate assignment'; end if;
      if rule->'due'->>'type' not in ('none','date','days') or rule->'due'->>'type' is null then raise exception 'Invalid deadline'; end if;
      if rule->'due'->>'type'='days' and not ((rule->'due'->>'days')::integer between 1 and 3650) then raise exception 'Invalid deadline'; end if;
      if rule->'due'->>'type'='date' then perform (rule->'due'->>'date')::date; end if;
      prior:=null;
      if TG_OP='UPDATE' then select r into prior from jsonb_array_elements(coalesce(old.published->'assignments','[]')) r where (gid is not null and r->>'groupId'=gid) or (uid is not null and r->>'userId'=uid); end if;
      rules:=rules||jsonb_build_array(rule||jsonb_build_object('assignedAt',coalesce(prior->>'assignedAt',stamp)));
    end loop;
    payload:=payload||jsonb_build_object('assignments',rules,'groups',(select coalesce(jsonb_agg(r->>'groupId'),'[]') from jsonb_array_elements(rules) r where r->>'groupId' is not null));
    if field='draft' then new.draft:=payload; else new.published:=payload; end if;
  end loop;
  return new;
end $$;

create function public.fb_manage_learning(p_actor uuid,p_data jsonb) returns jsonb language plpgsql set search_path='' as $$
declare d public.fb_documents; p public.fb_progress; before_p jsonb; op text:=p_data->>'operation';
 cid uuid:=(p_data->>'contentId')::uuid; uid uuid:=(p_data->>'userId')::uuid; gid text:=p_data->>'groupId';
 rules jsonb; draft_rules jsonb; rule jsonb; group_ids jsonb;
begin
 perform 1 from public.fb_config where id for update;
 if not exists(select 1 from public.fb_profiles where id=p_actor and active and role='admin') then raise exception 'Administrator access is required'; end if;
 select * into d from public.fb_documents where id=cid for update;
 if not found or d.published is null or d.published->>'kind'<>'course' then raise exception 'Publish the course before managing assignments'; end if;
 if d.revision<>(p_data->>'expected')::integer then raise exception 'Course changed. Reload before saving'; end if;
 if (uid is null) = (gid is null) then raise exception 'Choose exactly one recipient'; end if;
 if uid is not null and not exists(select 1 from public.fb_profiles where id=uid) then raise exception 'Person does not exist'; end if;
 if op in ('assign','unassign') then
   if gid is not null and not exists(select 1 from public.fb_config c,jsonb_array_elements(c.groups) g where g->>'id'=gid) then raise exception 'Group does not exist'; end if;
   select coalesce(jsonb_agg(r),'[]') into rules from jsonb_array_elements(coalesce(d.published->'assignments','[]')) r where not ((gid is not null and r->>'groupId'=gid) or (uid is not null and r->>'userId'=uid::text)) is true;
   select coalesce(jsonb_agg(r),'[]') into draft_rules from jsonb_array_elements(coalesce(d.draft->'assignments','[]')) r where not ((gid is not null and r->>'groupId'=gid) or (uid is not null and r->>'userId'=uid::text)) is true;
   if op='assign' then
     rule:=jsonb_strip_nulls(jsonb_build_object('groupId',gid,'userId',uid,'due',p_data->'due'));
     rules:=rules||jsonb_build_array(rule); draft_rules:=draft_rules||jsonb_build_array(rule);
   end if;
   update public.fb_documents set published=jsonb_set(published,'{assignments}',rules),draft=jsonb_set(draft,'{assignments}',draft_rules),revision=revision+1,updated_at=now() where id=cid returning * into d;
   insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','assignment_'||op,cid::text,d.revision,p_data);
 elsif op in ('complete','reset') then
   if uid is null or (d.published->>'version')::integer<>(p_data->>'version')::integer then raise exception 'Course version changed. Reload before saving'; end if;
   -- Insert a placeholder so concurrent first writes and resets share a row lock.
   insert into public.fb_progress(user_id,content_id,version,revision) values(uid,cid,(p_data->>'version')::integer,0) on conflict do nothing;
   select * into p from public.fb_progress where user_id=uid and content_id=cid and version=(p_data->>'version')::integer for update;
   if p.revision is distinct from (p_data->>'progressExpected')::integer then raise exception 'Progress changed. Reload before saving'; end if;
   before_p:=to_jsonb(p);
   update public.fb_progress set lessons=case when op='complete' then (select coalesce(jsonb_agg(l->>'id'),'[]') from jsonb_array_elements(d.published->'lessons') l) else '[]'::jsonb end,
     passed=(op='complete'), attempts=case when op='reset' then '[]'::jsonb else attempts end
     where user_id=uid and content_id=cid and version=p.version returning * into p;
   insert into public.fb_audit(actor,source,action,entity_id,revision,snapshot) values(p_actor,'web','progress_'||op,cid::text,p.revision,jsonb_build_object('before',before_p,'after',to_jsonb(p)));
 else raise exception 'Unknown learning operation'; end if;
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.fb_manage_learning from public,anon,authenticated;
grant execute on function public.fb_manage_learning to service_role;
