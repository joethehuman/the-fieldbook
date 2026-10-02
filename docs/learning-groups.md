# Learning groups and curricula

## Administration

Learning groups replaces the separate Groups and Required courses tabs. The expandable outline shows parent and child groups; select a group to manage its Members, Learning and Updates views. Search the outline beside **Create group**. The creation dialog asks for a name and optional parent; **Add child group** opens it with the current group selected as parent. Move a whole branch after reviewing the inherited learning and Update changes. Members can be selected individually or through live team links. A selected team includes all current and future subteams. Older links retain their direct-only reach until **Include subteams** is reviewed and applied. Adding a new link also reviews expansion of the group’s older links. Each person appears once in the member list, with labels for every direct, linked-team or child-group source. Parent groups include child-group members; a parent's direct members do not automatically join its children.

Search the course library to add individual courses or published curricula. Reorder group items with drag handles, keyboard up/down on a handle, or the move buttons. The same controls order courses inside a curriculum. The curriculum builder is separate from the course builder. Course editors link to Learning groups; Update editors select audience groups directly. These are shared saved relationships, not independent copies.

In Administration, Teams places **Add team** beside its hierarchy search. Curricula places **Create curriculum** beside a search that matches curriculum names and descriptions; bulk selection applies to the current matches.

The Learning and Updates pickers can sort search results by title, creation date or last update to the published copy. The Updates picker can also keep items for this group first. Undated legacy items and curricula without saved dates follow dated results in date sorts. These controls do not change a group's recommended sequence or the order of learners' Updates. Course assignment timestamps already drive completion windows; the unassigned search results have no assignment date to sort by. Group-targeted Updates are relevance tags, not timed learning assignments.

A curriculum is published when it is ready for the library and group use. Saving edits to a published playlist affects its linked groups; the editor shows how many. Unlink it before returning it to draft. Curriculum and group deletion dialogs describe their impact. Completion history is retained.

## Reporting teams

In Administration → Teams, open **Manage team** for a full-width member and hierarchy view. Members shows 25 people per page with name/email search. Direct members is the default; Include subteams adds descendants and identifies each person's direct team. Those rows link to their own team for management. Subteams lists immediate children; parent and Back to teams actions keep navigation explicit.

Add members searches existing active accounts, keeps multiple selections across searches/pages, and reviews additions or moves before applying them together. Each person has one direct reporting team. Remove affects direct membership only: it does not delete or deactivate the account or erase progress. Inactive members remain labeled in the roster; preregistered people appear in People and can join teams before sign-in. Team-linked learning group membership follows links through the entire selected team branch, so moving a person can change assignments while retaining completion history.

Edit team details uses the shared dialog for name, parent and manager. Parent choices exclude the team and descendants. Unsaved changes require confirmation before leaving; saves disable duplicate submission and retain the draft on failure. These operations use the existing administrator-only, revision-checked governance save; no new permission or storage model is introduced.

## Storage and upgrade

Apply `supabase/migrations/202609200004_learning_groups.sql` after all previous migrations, including `202609200002_assignments.sql` and `202609200003_required_learning.sql`. It is an additive, one-time transaction. It adds `fb_config.curricula`, imports existing group assignments into ordered `learningItems`, and stores `teamIds` on groups. Existing content groups/assignment rules remain the materialized result used for progress and reporting. `requiredCourseIds` remains an internal ordering field for compatibility, not user-facing terminology.

Group plans are authoritative for course assignments. A revision-checked governance save updates memberships, curricula, expanded course lists and affected content metadata in one database transaction. A person’s saved course-version assignment date and deadline survive while any assignment source remains active. Consequential group, curriculum, membership and branch changes show a searchable, paginated review of courses and manager reporting access before saving. No learner progress or course versions are rewritten. Update audience changes preserve both the published body and unrelated draft edits. Governance and audience writes retain admin authorization and audit records. Public browsing does not depend on group membership.

Course assignment changes through ordinary content/MCP writes are rejected with instructions to use Learning groups. Content editing, publication and Update targeting remain available through the existing content API. Docs have no audience tags. The existing `category` field backs the user-facing Category label for courses; no category-data conversion is needed.

1. Back up the installation and record the current code and migration versions.
2. Apply the migration to an isolated Supabase preview, never a preview pointing at the production backend. The migration can also be exercised by the local PGlite integration test with synthetic data.
3. Deploy the candidate code to that preview and exercise admin saves, Google sign-in, manager scope, progress and course publication. A passing build does not establish provider behavior.
4. After the operator approves the upgrade, use a maintenance window: pause writes, apply the migration, deploy the matching code, reload old clients, and verify before reopening writes. Old governance clients do not understand curriculum fields; do not run mixed writers.
5. Prefer a forward fix. A code rollback does not reverse group plans, new links or the migration. A full pre-upgrade database restore loses later changes and must be planned separately.

No new environment variables or dependencies are required. If the migration is missing, governance writes fail with a setup message instead of silently dropping curriculum changes. The fresh browser demo includes a sample playlist and targeted updates; existing browser-local data remains intact and acquires the expanded model when saved. Reset demo only when intentionally replacing saved demo work.

## Anonymous visitors

Public installations may select one existing group, or explicitly create one, under Organization Settings → Access → Guest recommendations. It is optional; no selection leaves For you empty while the library remains usable. The same parent inheritance, curriculum expansion and course deduplication apply, without creating memberships, deadlines or reporting entries. See [guest recommendations](guest-recommendations.md).

## Stable assignment upgrade

After the roster migration, apply `20261001232329_stable_assignment_episodes.sql` with matching code. It adds indexed, service-only `fb_assignment_episodes`, with one active episode per person/course/version and historical ended episodes. Profile/course foreign keys cascade during permanent deletion. Existing assigned dates and deadlines are backfilled as a baseline from saved source and membership history; missing older sources cannot be reconstructed. The migration does not expand existing team links or recalculate targets. It stamps legacy groups with direct-only scope until explicit review. New links include subteams.

Roster, learning-plan, publication and recovery writes reconcile episodes inside their transaction. Compact People reads omit course obligations; selected-person and scoped learning/reporting reads include active obligations. Verified first sign-in returns the same roster person and saved assignments. Reload old clients; mixed governance writers are rejected when they omit the legacy-link marker. No new environment variables are required. See [upgrade order and rollback](upgrading.md#stable-assignment-upgrade).
