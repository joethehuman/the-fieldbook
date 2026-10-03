# Versions and upgrades

## What stays fixed, and what updates automatically?

A deployment runs a snapshot of Fieldbook's code. A Git tag names that snapshot; a GitHub Release attaches notes and installation/upgrade information to it. Publishing a new release does not update another operator's fork or database.

Vercel watches the repository and production branch you connect. Changes merged into **that branch** can deploy automatically. A branch is not a version lock by itself: it stays on the selected release only until you change it. Avoid automatic upstream synchronization into your production branch.

Recommended arrangement:

```text
Fieldbook releases → you choose an update → your repository's production branch → your Vercel site
```

Do not connect your live installation directly to the maintainer's development branch if you want control over upgrades. Merely changing a package.json version number does not select an older application or stop deployments.

## First installation from a release

There are no published releases yet. The commands below illustrate the procedure for a future `v0.1.0` release; do not run them until that tag exists. Choose an actual release from GitHub and read its requirements first.

1. Fork The Fieldbook into your own GitHub account. A fork preserves the shared history so you can bring in later updates.
2. Clone your fork to your computer. Replace `YOUR-ACCOUNT` with your account:

```sh
git clone https://github.com/YOUR-ACCOUNT/the-fieldbook.git
cd the-fieldbook
git remote add upstream https://github.com/joethehuman/the-fieldbook.git
git fetch upstream --tags
git switch -c production v0.1.0
git push -u origin production
```

This creates your deployment branch at the selected release, even if your fork's default branch contains newer development work. Never move an existing production branch backwards with a forced push to follow these instructions; these commands are for a new installation.

3. Import your fork into Vercel. Leave Root Directory empty (repository root) and set **Production Branch to `production`**. Root Directory and Production Branch are separate settings. If Vercel initially deploys the default branch during import, do not use that deployment for launch; correct the branch and verify the selected commit before connecting real users.
4. Complete the [installation guide](installation.md). Record the release tag, commit, applied migrations, and your configuration privately.

Downloading a release ZIP is also a code snapshot, but it loses the convenient Git history used to merge later updates. Forking is the documented path.

## Upgrade an existing installation

Example only: replace `v0.2.0` with a real target release. Read all intervening release notes; during `0.x`, changes may require manual steps.

1. Back up the database **and storage files separately**. Record your current deployment, configuration, and migration list. Test restores before depending on them.
2. Bring the target release into an update branch, not directly into production:

```sh
git fetch origin
git fetch upstream --tags
git switch -c upgrade-v0.2.0 origin/production
git merge --no-ff v0.2.0
```

If you have customized the code, Git may report conflicts. Resolve and review them before continuing; do not force-reset your customizations. Run `pnpm install --frozen-lockfile`, tests, and both builds, then push the update branch and open a pull request into **your** `production` branch.

3. Test against an isolated Supabase project. Vercel previews must not receive your production backend secrets. Without a test backend, a build passing does not establish that login, content, or migrations work.
4. Apply only the new database migrations, in the order and at the stage described by the release notes. Supabase SQL-editor execution is not automatically tracked by the CLI. Keep one migration ledger; never replay the initial schema over an existing installation.
5. Follow the release's deployment order. If schema changes are incompatible with the old code, use a maintenance window instead of allowing old and new code to write concurrently. A Vercel code deployment does not automatically apply these SQL files.
6. Merge the reviewed update into your `production` branch. Vercel deploys it. Verify login, content editing/publication, learner progress, uploads, and MCP; record the installed release and migrations.

If the target version introduces recoverable deletion, apply all five recovery/cleanup migrations before deploying its server code. After that code is live, configure the worker endpoint in the same Supabase project and verify its first request. Follow [deletion worker setup](bulk-actions.md#install-or-upgrade-the-cleanup-worker); a scheduled job with no endpoint does not perform permanent deletion. Do not point a preview database at the production app.

Your content and settings remain in your own Supabase project. An upgrade must preserve them, but database migrations can change their structure; backups and release-specific instructions matter.

## Rollback

Keep the previous deployment available. Reverting to old code is safe only when it is compatible with the current database. If it is not, stop writes and follow a tested database/media restore or forward-fix plan. Restoring an older backup can lose changes made since that backup. Do not assume Vercel rollback reverses a migration.

## Provider-limited uploads

This upload update needs no database migration and does not automatically raise storage limits. The historical initial migration and existing installations may still have an explicit 50 MB `fieldbook-media` bucket limit. Follow [Configure upload limits](installation.md#configure-upload-limits) to deliberately set Supabase's global and private-bucket limits and review any `FIELDBOOK_UPLOAD_MAX_BYTES` override. Keep current MIME restrictions, privacy and ownership checks. An account upgrade alone does not change these settings.

Rehearse a representative larger upload, interruption/retry, provider rejection and draft preservation with an isolated backend before production rollout. Large files use signed chunked TUS transfers; file bytes bypass the application host. Install the locked dependencies before building. Code rollback does not lower operator storage settings or delete uploaded media; older code again rejects files above its old application ceiling.

## Stable roster and hire-date upgrade

`20261001222227_roster_people.sql` requires all earlier migrations, including `admin_people_reads`. It evolves `fb_profiles` into a roster with an optional unique `auth_user_id`, preserving existing person IDs and attaching their current Auth IDs. Progress, feedback and MCP grants reference the person. Legacy preregistrations become roster people with new stable IDs; the redundant `fb_pending_profiles` table is removed. Team/group relationships, documents and existing learning history are preserved. Recorded legacy onboarding starts retain the current onboarding window as their applied baseline; hire dates are left unknown. Review conflicting normalized emails and orphan person references before applying: the transaction rejects conflicts rather than merging accounts.

This is a coordinated code/database upgrade. Back up, rehearse in isolation, stop old application and cleanup-worker writes, apply the migration, then deploy the matching code and resume the worker. Do not run older application or worker versions against newly activated roster identities. Code-only rollback is unsupported after this migration; use a tested restore with writes stopped or a forward fix. Auth changes after the backup need their own recovery review.

Verify existing sign-in and owner access, first activation of a preregistered manager, descendant reporting scope, unchanged progress/feedback/grants, inactive-account rejection, restore and permanent deletion for both signed-in and preregistered people. The People stage must expire using its applied window even when due dates are off. No new environment variables are required. The migration does not enable CSV import, change team-link subtree behavior or freeze catch-up deadlines.

## References

- [Vercel Git deployments and production branches](https://vercel.com/docs/git)
- [GitHub forks and synchronization](https://docs.github.com/en/pull-requests/how-tos/work-with-forks)
- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)

## Published-search migration

Versions containing `20260921205449_published_search.sql` require that additive migration before the new application is deployed. Rehearse the complete migration transaction and published/private retrieval checks in isolation. See [search operating instructions](search.md) for backfill, rollback compatibility, index maintenance and performance verification.

## Optional guest recommendations

The optional guest selection uses the existing settings JSON and needs no additional environment variables or service. Older public installations start with no guest selection. After deploying the matching application, an administrator may choose a group in Organization Settings → Access and save; group creation is explicit and separate. An upgrade to flat learning groups still requires the migration below, which preserves the selected guest group’s former ancestor recommendations. Review [guest recommendations](guest-recommendations.md) for fallback, sign-in and verification behavior.

## Guarded team deletion

Apply `supabase/migrations/20260923180607_guarded_team_deletion.sql` after the earlier migrations before enabling this version’s server-side team deletion. It replaces `fb_save_governance` while retaining its grants, authorization, revision lock and audit behavior. It changes no existing team or profile data. A delete is accepted only when the stored team has no direct or pending members, child teams or learning-group links; cleanup must be saved separately. Without this migration, existing branch moves still work but team deletion is rejected by the older database guard. Rehearse on an isolated backend before an operator-approved production upgrade.

## Learning-group save repair

Apply `supabase/migrations/20260923230000_scope_pending_group_cleanup.sql` after guarded team deletion and before using group administration on this version. It replaces `fb_save_governance` to update only pending accounts whose group references need cleanup; it does not change existing data when applied. This fixes saves on installations with `safeupdate` enabled. Rehearse the migration and a group save in an isolated backend, then back up and apply it to each production installation before deploying the matching code.

## Stable assignment upgrade

`20261001232329_stable_assignment_episodes.sql` requires the roster migration and every earlier migration. Back up and rehearse on isolated non-production, comparing current derived targets with the backfilled baseline and preserving progress, content and identity links. Pause old writers/cleanup, apply the migration, deploy matching code and reload clients before resuming writes. This version adds private episode storage and changes registration’s internal RPC result to include saved assignments; old code cannot provide its deadline/legacy-link review controls. Prefer a forward fix; a code rollback does not undo episodes or explicit subtree/recalculation changes. A restore must account for later writes.

Schema application preserves the reach of every existing direct team link. In the flat-group UI, open **Learning groups → People → Add Members**, check **Include subteams** for the specific older link, and review the added course coverage before applying. Group links do not grant manager access. New team links include descendants. In Organization Settings → Due dates, save defaults first; **Review existing deadlines** is a separate, explicit operation. It previews active onboarding clocks and unfinished obligations, keeps assignment start dates fixed, excludes completed courses, and rejects stale reviews. A migration alone never expands a direct-only link or recalculates deadlines.

Verify overlap/source removal/rejoin, day 83/84/90 boundaries, old overdue work after onboarding, new course versions, pending activation, descendant moves and scoped manager reads. Verify date changes remain future-only until reviewed recalculation; turning deadlines off/on preserves targets and completion. New episode tables/functions are service-only; browser sessions cannot query them directly.

## Flat learning-group upgrade

`20261002022921_flat_learning_groups.sql` is a separate, required migration for this application version, including installations whose groups already have no parents. Teams retain their hierarchy; learning groups become independent audiences. Apply every missing earlier migration first. The relevant final order is:

1. `20261001222227_roster_people.sql`
2. `20261001232329_stable_assignment_episodes.sql`
3. `20261001234401_contributor_permissions.sql`
4. `20261002022921_flat_learning_groups.sql`
5. `20261002064454_team_group_course_assignments.sql`
6. `20261002135103_builtin_organization_team.sql`
7. `20261002184642_organization_membership.sql`
8. `20261002210106_combined_assignment_organization.sql`
9. `20261002214011_combined_governance_safeguards.sql`

These are immutable migrations. Check the installation’s ledger, apply missing predecessors, and do not edit or replay an applied file. If contributor permissions were applied before stable assignment episodes, keep that recorded application and apply the missing episode migration followed by the flat migration while writes remain paused. If typed Team/Group assignments are already applied, preserve them and apply only the missing flat, root, membership, combined and safeguard migrations. The final database retains episode-aware atomic governance, typed Team/Group sources, flat group membership, the protected Organization root, optional-team fallback and contributor publishing permissions. Keep users out of the entire upgrade interval: intermediate definitions can omit Team assignments from reporting or weaken team-deletion checks. Apply the missing sequence atomically when possible; pausing writes alone does not protect reads from that intermediate state.

The conversion runs in one locked transaction. Each former ancestor group receives explicit individual memberships and team-link sources from its descendants. Subtree links remain dynamic, including future subteams; older direct-only links become separate preserved sources and are never expanded automatically. Group, team and person IDs remain stable. Current effective group membership, assigned course versions, assignment episode IDs/history/start dates/deadlines, saved progress, hire/onboarding clocks and Update relevance are preserved. The configured guest group receives its previous ancestor learning and Update relevance explicitly. Saved group order retains the previous ancestor-first recommendation priority.

After conversion, groups no longer propagate membership, learning or relevance to one another. Removing a person or team link from a former child group does not remove the explicit source now held by its former ancestor; manage each audience independently. A linked team branch still responds to future roster and hierarchy changes. No automatic all-people group or CSV import is introduced.

The migration compares current effective membership, course-version coverage, assignment history/deadlines, Update relevance and guest recommendations before and after conversion, and aborts the transaction if any differ. It does not recalculate deadlines or rewrite progress. Resolve a failed rehearsal against the actual data before proceeding; do not remove the preservation checks to force application.

Use a coordinated maintenance rollout:

1. Back up the database and media, record the applied migrations, and rehearse the full missing-migration sequence against an isolated backend. Include nested groups, overlapping courses/curricula, mixed direct/subtree team links, guest recommendations and preregistered people. Compare learning order, current membership, assignments, deadlines and progress before and after.
2. Pause application, administrator/MCP and cleanup-worker writes. Keep users out of the upgrade interval; old code cannot safely manage the converted model.
3. Apply the required migrations, deploy the matching application, and reload previously open clients before reopening writes. A code deployment alone does not perform conversion. Do not mix old and new governance writers.
4. Verify sign-in, contributor publishing and team reporting, manager descendant/sibling boundaries, People clock stages, assignment overlap/removal/rejoin, group learning order and guest recommendations. Verify the People table’s direct-team and membership-source columns against known team branches. A legacy direct-only link must remain direct until its individually reviewed expansion; continuous assignments must retain their dates.
5. Reopen writes and resume the matching cleanup worker only after those checks pass. Record the installed code and migration versions privately.

The browser-local demo performs its equivalent one-time conversion when saved data loads. A demo check or local integration test does not establish that a hosted database upgrade, authentication or concurrent operators work. Rehearse those against the isolated installation.

Code-only rollback to the hierarchy model is unsupported after conversion. Prefer a forward fix, or stop writes and use a tested database/media restore with the matching earlier code. A restore can lose changes made after the backup and requires review of subsequent Auth changes. Old applied migration files remain unchanged, and no new environment variables are required.

## Built-in Organization reporting team

`20261002135103_builtin_organization_team.sql` requires the roster, stable-assignment, Contributor and flat-group migrations. Rehearse in isolation, stop older application writers, apply this migration, then deploy the matching code. Older clients cannot submit a hierarchy without the system root. Code-only rollback to those writers is unsupported; use a tested restore or forward fix.

The migration preserves an explicitly designated sole top-level team, including its ID, historical name, manager and direct members. Otherwise it creates a neutral Organization team with no manager and attaches only the former top-level teams. Saved optional direct-team fields remain blank. The Organization-membership migration derives their effective place at Organization for roster, reporting and learning coverage. Existing teams, group links, content, progress, course-version coverage and assignment episodes/deadlines are preserved. Both configuration revision counters advance once to invalidate open editors. A database guard protects the root ID/name, prevents deleting or moving it, and validates one connected team hierarchy. Normal teams can still be renamed, moved and managed.

Use **Teams → Organization** to configure its manager and direct members. Appointing that manager explicitly grants the whole reporting branch and follows the usual consequence review. Verify root management, ordinary team creation/moves, direct-member reporting and denied root replacement. The migration adds independent helpers/trigger and does not replace governance or assignment RPC bodies; reconcile other pending migration histories before applying them.

## Combined team/group assignments and Organization

Apply all missing migrations through `20261002214011_combined_governance_safeguards.sql` before deploying this application. The immutable typed-source migration must precede the combined successor, including on an installation where flat groups, the built-in root or Organization membership were already applied. The combined successor restores the flat-group, Team-source, reporting-fallback and root-validation rules. The final safeguard migration restores the authoritative governance writer, including rejection of deleting a team that still has assigned learning. Both retain explicit service-only grants. Coordinate the missing migrations as one maintenance operation with application reads and writes paused until the final contract is installed.

Preflight legacy Team plans before the typed-source migration: if a team has nonempty `requiredCourseIds` but no `learningItems`, stop and normalize that metadata in a separately reviewed preservation step. The historical migration derives its expanded course list from `learningItems` and cannot recover an omitted plan afterward. The matching application normalizes browser-local legacy Team plans while preserving their courses.

Rehearse both fresh migration order and the installation’s actual ledger order, including typed assignments preceding flat conversion with nonempty Team plans. Compare current unique course coverage, episode IDs/start dates/deadlines/policy, completion, people identities, Team/Group plans and unrelated content before and after. The combined successor and final safeguard verify these records are unchanged and advance only the governance revision to invalidate open reviews. Confirm current grants, pending/active manager scope, Organization fallback, legacy direct-only links, source changes and assigned-team deletion rejection before resuming application writes. Never edit or replay an applied conversion. Guests remain outside the reporting hierarchy and use the selected guest learning group.

## Expanded MCP contract and permissions

Before deploying this MCP version, apply these additive migrations in order to the isolated preview database, rehearse the role/report behavior, then apply them to production:

1. `20261002222314_mcp_catalog.sql`
2. `20261002222344_mcp_connection_capabilities.sql`
3. `20261002222355_mcp_scoped_reports.sql`

They add service-only catalog/report functions and explicit connection permissions. They preserve content, saved assignments/deadlines, progress and existing shared functions. Existing administrator grants receive exactly their old permissions; any unexpected legacy non-administrator grant is disabled. Their defaults support the old administrator-only consent writer during a rolling deployment. Code rollback leaves additive functions/columns in place; do not replay or remove applied migrations.

The endpoint and client registration remain unchanged. Approve added permissions in Connections on the same connection. For ChatGPT developer-mode apps, refresh its tool definitions and start a new chat; old chats may retain the previous tools. Named reports and media transfers do not become authorized merely because the server now advertises them. Verify revocation, role downgrade, administrator-promotion reapproval and managed-team removal as well as content/report/upload behavior. See [MCP setup](mcp-setup.md).

## Shared Progress report upgrade

Apply `20261002232135_progress_report.sql` after all preceding migrations, including `20261002222355_mcp_scoped_reports.sql`, before deploying the matching server application. It adds the service-only `fb_progress_report` function and does not alter existing functions, roster data, saved assignments, deadlines or progress. It reuses the current explicit reporting-scope helpers. Browser and authenticated database clients cannot execute it directly.

Rehearse against an isolated backend and verify current role/branch boundaries, pending roster people, current-version completion and due-date settings. A code rollback leaves this additive function unused and preserves the previous reporting reads. Do not replay the migration: keep its application in your migration ledger.
