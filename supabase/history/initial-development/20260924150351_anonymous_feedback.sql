-- Allow one feedback record per browser/content without creating an account.
-- The server stores only a hash of its random, HttpOnly browser token.
alter table public.fb_feedback alter column user_id drop not null;
alter table public.fb_feedback add column guest_key text;
alter table public.fb_feedback add constraint fb_feedback_one_author check (
  (user_id is not null) <> (guest_key is not null)
);
alter table public.fb_feedback add constraint fb_feedback_guest_key_format check (
  guest_key is null or guest_key ~ '^[0-9a-f]{64}$'
);
alter table public.fb_feedback add constraint fb_feedback_guest_content_unique
  unique (guest_key, content_id);
revoke all on public.fb_feedback from anon, authenticated;
