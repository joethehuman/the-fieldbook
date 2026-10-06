-- Record when a person enters this installation, independently of hire date,
-- learning clocks and first sign-in. Historical dates are unknown, not backfilled.
set local lock_timeout = '5s';
alter table public.fb_profiles add column added_at timestamptz;
comment on column public.fb_profiles.added_at is
  'Database-owned roster creation time. Null means the historical time is unknown.';

create function public.fb_profile_added_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.added_at := statement_timestamp();
  else
    new.added_at := old.added_at;
  end if;
  return new;
end;
$$;
revoke all on function public.fb_profile_added_at() from public, anon, authenticated;
create trigger fb_profile_added_at
before insert or update on public.fb_profiles
for each row execute function public.fb_profile_added_at();

notify pgrst, 'reload schema';
