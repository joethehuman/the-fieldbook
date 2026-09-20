# Learning model

This describes the current application implementation. Production installations need the required-learning migration described in [required-learning.md](required-learning.md); this document does not verify a particular installation's deployment state.

## Required courses

- Required learning belongs to groups. Individual course assignments and per-course deadline controls have been retired.
- A person can belong to multiple groups. Membership includes ancestors, so parent-group requirements apply to members of nested groups.
- Each required course appears once even when several group requirements apply. Recommended order places parent-group foundations first and then follows each group's course order; courses remain unlocked.
- Publishing adds a course to the library. It becomes required only when selected for a group. Group membership does not limit access to the published catalog; organization access settings still apply.
- Removing a requirement does not erase progress. Administrators can still mark an individual person's current course version complete or reset their progress; those actions are not individual assignments.

## Completion windows

- Organization settings supply an onboarding window (90 days by default) and a catch-up window (30 days by default).
- A requirement starts at the later of its group requirement date and the person's effective membership date. Where several group sources qualify, the earliest continuing requirement applies.
- An existing user's target is the requirement start plus the catch-up window. For a person with an onboarding start date, use the later of that catch-up target and the onboarding target. Calendar calculations use UTC dates.
- For example, a requirement starting September 20 has an October 20 target with a 30-day catch-up window. If that person's onboarding target is November 30, November 30 applies instead. A newly added requirement starting November 20 gets until December 20, even if onboarding ends sooner.
- Changing the organization windows recalculates targets. Publishing a new course version starts a new catch-up window and requires completion of that version. Ordinary content edits without a version increase do not restart the window.
- Older demo records without membership timestamps use the available assignment/content timestamp as their baseline; that fallback does not establish a historical enrollment date.

## Progress and reporting

- Currentness includes all currently published required courses, including those due later.
- Reviewing or retaking a course does not erase an earlier pass. Attempts are recorded against the course version; failed retakes preserve completion.
- A person has one reporting team. Managers can oversee multiple teams and report only on their explicitly managed teams and descendants. Team membership does not assign courses or grant management permissions.

The existing storage types and earlier migrations retain legacy fields for upgrade compatibility. Their presence does not make individual assignments or custom course deadlines supported features. Current tests exercise `learningTarget` for completion targets and the database after the required-learning migration.
