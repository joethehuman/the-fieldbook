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

3. Import your fork into Vercel. Set Root Directory to `production` and **Production Branch to `production`**. The directory and branch happen to have the same name but are separate settings. If Vercel initially deploys the default branch during import, do not use that deployment for launch; correct the branch and verify the selected commit before connecting real users.
4. Complete the [installation guide](../production/README.md). Record the release tag, commit, applied migrations, and your configuration privately.

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

Your content and settings remain in your own Supabase project. An upgrade must preserve them, but database migrations can change their structure; backups and release-specific instructions matter.

## Rollback

Keep the previous deployment available. Reverting to old code is safe only when it is compatible with the current database. If it is not, stop writes and follow a tested database/media restore or forward-fix plan. Restoring an older backup can lose changes made since that backup. Do not assume Vercel rollback reverses a migration.

## References

- [Vercel Git deployments and production branches](https://vercel.com/docs/git)
- [GitHub forks and synchronization](https://docs.github.com/en/pull-requests/how-tos/work-with-forks)
- [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)

## Published-search migration

Versions containing `20260921205449_published_search.sql` require that additive migration before the new application is deployed. Rehearse the complete migration transaction and published/private retrieval checks in isolation. See [search operating instructions](search.md) for backfill, rollback compatibility, index maintenance and performance verification.

## Optional guest recommendations

This feature needs no new migration or environment variables. Older public installations start with no guest selection and continue to support public browsing. After deploying the application update, an administrator may choose a group in Organization Settings → Access and save. Group creation is explicit and separate from saving the selection. Review [guest recommendations](guest-recommendations.md) for fallback, sign-in and verification behavior.

## Guarded team deletion

Apply `supabase/migrations/20260923180607_guarded_team_deletion.sql` after the earlier migrations before enabling this version’s server-side team deletion. It replaces `fb_save_governance` while retaining its grants, authorization, revision lock and audit behavior. It changes no existing team or profile data. A delete is accepted only when the stored team has no direct or pending members, child teams or learning-group links; cleanup must be saved separately. Without this migration, existing branch moves still work but team deletion is rejected by the older database guard. Rehearse on an isolated backend before an operator-approved production upgrade.

## Learning-group save repair

Apply `supabase/migrations/20260923230000_scope_pending_group_cleanup.sql` after guarded team deletion and before using group administration on this version. It replaces `fb_save_governance` to update only pending accounts whose group references need cleanup; it does not change existing data when applied. This fixes saves on installations with `safeupdate` enabled. Rehearse the migration and a group save in an isolated backend, then back up and apply it to each production installation before deploying the matching code.
