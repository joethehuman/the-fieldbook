-- Keep People independent of installation-wide learning history.
-- This invoker function is callable only by the server's service role.
set local lock_timeout = '5s';

create function public.fb_admin_people_snapshot(p_actor uuid, p_user uuid default null)
returns jsonb language plpgsql stable set search_path = '' as $$
declare result jsonb;
begin
  if not exists (select 1 from public.fb_profiles where id=p_actor and active and role='admin' and deleted_at is null) then
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
    'pending', coalesce((select jsonb_agg(to_jsonb(p) order by p.email) from public.fb_pending_profiles p), '[]'::jsonb),
    'progress', coalesce((select jsonb_agg(to_jsonb(p) order by p.content_id,p.version) from public.fb_progress p where p_user is not null and p.user_id=p_user), '[]'::jsonb)
  ) into result from public.fb_config c where c.id;
  return result;
end;
$$;
revoke all on function public.fb_admin_people_snapshot(uuid,uuid) from public, anon, authenticated;
grant execute on function public.fb_admin_people_snapshot(uuid,uuid) to service_role;

-- The existing compound keys begin with user_id or guest_key.
-- Content deletion and content-scoped reads need the reverse lookup too.
create index fb_progress_content_id_idx on public.fb_progress(content_id);
create index fb_feedback_content_id_idx on public.fb_feedback(content_id);
