# Required learning: opinionated MVP

## Current implementation

Required learning is group-only. The application retains group rule storage, authorization, audit history, and individual progress administration, while retiring individual course assignments and course-specific deadline controls.

Organization settings define onboarding/catch-up windows (90/30 days by default). People and pre-registered accounts have an optional onboarding start date. Existing users have none. Only an explicit New user default starts onboarding for self-registration; pre-registered accounts retain their selected stage and start date. Changing the default does not update existing people.

Groups define required courses and recommended order. Parent foundations come first, courses remain unlocked, and overlapping requirements count once. The learner library remains available independently of requirements. New users see Get up to speed; existing users see Stay current, with a recommended next course and an on-track/needs-attention status distinct from completion percentage.

See [learning-model.md](learning-model.md) for the current behavior and examples. This describes the code, not a verified deployment state.

## Timing

A person's requirement starts at the later of the course's group requirement date and the person's effective membership date. Their target is the later of requirement start + catch-up days and onboarding start + onboarding days. Multiple group sources use the earliest continuing requirement. Joining a new role later gets the catch-up window; prior valid completions remain valid. New course versions restart the catch-up clock. Updating ordinary content without a version increase does not.

The workspace settings are live policies: changing a window recalculates targets. Publishing by itself does not require a course. Removing a requirement does not erase progress. Admin completion/reset controls remain, scoped to the current published course version and audited.

## Installation and upgrade

Apply `supabase/migrations/202609200003_required_learning.sql` after existing migrations, in a transaction. It stores onboarding dates for current/pending people, retires direct requirements and old custom deadlines with an audit snapshot, preserves progress, and updates service-only governance functions. Apply and verify on an isolated development or preview database before an authorized production upgrade. This documentation does not authorize changing a production database.

## Deliberate exclusions

No individual assignments, per-course deadlines, monthly calendar cycles, locked prerequisites, automated reminders, or separate enrollment workflow. Required learning is based on groups; reporting hierarchy is based on teams; browsing remains unrestricted by either.
