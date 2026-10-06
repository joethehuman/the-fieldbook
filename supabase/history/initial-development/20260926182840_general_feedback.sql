-- General account-menu feedback has no content item or version.
-- Existing item feedback and its per-author uniqueness remain unchanged.
alter table public.fb_feedback alter column content_id drop not null;
alter table public.fb_feedback alter column version drop not null;
alter table public.fb_feedback add constraint fb_feedback_content_pair check (
  (content_id is null and version is null) or
  (content_id is not null and version is not null)
);
