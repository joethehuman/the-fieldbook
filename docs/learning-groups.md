# Learning groups and curricula

## Administration

Learning groups replaces the separate Groups and Required courses tabs. Create a group, then manage its Members, Learning and Updates views. Members can be selected individually or through live team links. A selected team includes its direct members; select child teams explicitly. Existing nested groups remain supported.

Search the course library to add individual courses or published curricula. Reorder group items with drag handles, keyboard up/down on a handle, or the move buttons. The same controls order courses inside a curriculum. The curriculum builder is separate from the course builder. Course editors link to Learning groups; Update editors select audience groups directly. These are shared saved relationships, not independent copies.

A curriculum is published when it is ready for the library and group use. Saving edits to a published playlist affects its linked groups; the editor shows how many. Unlink it before returning it to draft. Curriculum and group deletion dialogs describe their impact. Completion history is retained.

## Storage and upgrade

Apply `supabase/migrations/202609200004_learning_groups.sql` after all previous migrations, including `202609200002_assignments.sql` and `202609200003_required_learning.sql`. It is an additive, one-time transaction. It adds `fb_config.curricula`, imports existing group assignments into ordered `learningItems`, and stores `teamIds` on groups. Existing content groups/assignment rules remain the materialized result used for progress and reporting. `requiredCourseIds` remains an internal ordering field for compatibility, not user-facing terminology.

Group plans are authoritative for course assignments. A revision-checked governance save updates memberships, curricula, expanded course lists and affected content metadata in one database transaction. Existing assignment timestamps survive whenever that group's course assignment remains active. No learner progress or course versions are rewritten. Update audience changes preserve both the published body and unrelated draft edits. Governance and audience writes retain admin authorization and audit records. Public browsing does not depend on group membership.

Course assignment changes through ordinary content/MCP writes are rejected with instructions to use Learning groups. Content editing, publication and Update targeting remain available through the existing content API. Docs have no audience tags. The existing `category` field backs the user-facing Channel label for courses; no category-data conversion is needed.

1. Back up the installation and record the current code and migration versions.
2. Apply the migration to an isolated Supabase preview, never a preview pointing at the production backend. The migration can also be exercised by the local PGlite integration test with synthetic data.
3. Deploy the candidate code to that preview and exercise admin saves, Google sign-in, manager scope, progress and course publication. A passing build does not establish provider behavior.
4. After the operator approves the upgrade, use a maintenance window: pause writes, apply the migration, deploy the matching code, reload old clients, and verify before reopening writes. Old governance clients do not understand curriculum fields; do not run mixed writers.
5. Prefer a forward fix. A code rollback does not reverse group plans, new links or the migration. A full pre-upgrade database restore loses later changes and must be planned separately.

No new environment variables or dependencies are required. If the migration is missing, governance writes fail with a setup message instead of silently dropping curriculum changes. The fresh browser demo includes a sample playlist and targeted updates; existing browser-local data remains intact and acquires the expanded model when saved. Reset demo only when intentionally replacing saved demo work.
