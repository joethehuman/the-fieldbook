# Required learning: opinionated MVP

## Implementation plan

1. Retire individual assignments and course-specific deadline controls. Keep the existing group rule storage, authorization, audit history and progress administration.
2. Add workspace onboarding/catch-up windows (90/30 days by default) and an explicit onboarding start date on people and pre-registered accounts. Existing staff have no onboarding start date. People includes a default stage for new accounts (Existing team or New hire); only an explicit New hire default makes self-registration start an onboarding window. Pre-registered accounts retain their individually chosen stage/start date, and changing the default never updates existing people.
3. Manage required learning by group with recommended course order. Parent foundations come first, courses remain unlocked, and overlapping group requirements count once.
4. Keep the learner channel layout and full library. Show Get up to speed during onboarding, then Stay current, with a recommended next course and on-track/needs-attention status distinct from completion percentage.
5. Build the feature branch and deploy Preview. Apply migration only to the isolated Preview database. Leave production and main unchanged; user performs acceptance testing.

## Timing

A person's requirement starts at the later of the course's group requirement date and the person's effective membership date. Their target is the later of requirement start + catch-up days and onboarding start + onboarding days. Multiple group sources use the earliest continuing requirement. Joining a new role later gets the catch-up window; prior valid completions remain valid. New course versions restart the catch-up clock. Updating ordinary content without a version increase does not.

The workspace settings are live policies: changing a window recalculates targets. Publishing by itself does not require a course. Removing a requirement does not erase progress. Admin completion/reset controls remain, scoped to the current published course version and audited.

## Preview migration

Apply `supabase/migrations/202609200003_required_learning.sql` after existing migrations, in a transaction. It stores onboarding dates for current/pending people, retires direct requirements and old custom deadlines with an audit snapshot, preserves progress, and updates service-only governance functions. No production migration is authorized.

## Deliberate exclusions

No individual assignments, per-course deadlines, monthly calendar cycles, locked prerequisites, automated reminders, or separate enrollment workflow. Required learning is based on groups; reporting hierarchy is based on teams; browsing remains unrestricted by either.
