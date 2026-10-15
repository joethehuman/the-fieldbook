# Upgrade a Fieldbook installation

Choose the release you want to run and read its configuration, migration and deployment-order notes. Preserve your environment settings and custom source changes. Application updates, Fieldbook database migrations and upstream backend updates are separate operations.

| Change                 | Vercel with hosted Supabase                           | DigitalOcean recipe                                             |
| ---------------------- | ----------------------------------------------------- | --------------------------------------------------------------- |
| Fieldbook application  | Deploy the selected source through Vercel             | Deploy the selected source through App Platform                 |
| Fieldbook database     | Apply pending migrations with the pinned Supabase CLI | Apply pending migrations with `setup-self-hosted.mjs --upgrade` |
| Auth, REST and Storage | Managed by hosted Supabase                            | Update the pinned component images separately                   |

## Block documents and editor compatibility

The editor stores optional versioned `bodyDocument` blocks within the existing content and privacy-policy draft/published JSON records. The application generates the existing Markdown `body` field from those blocks for search and export, so this format needs no database migration or bulk conversion. Existing Markdown records remain readable. Opening an editor does not convert or publish a record; a substantive edit saves blocks in the draft only.

Keep a database backup before upgrading. Versions that understand only Markdown cannot safely edit block documents: they may discard block IDs, table properties or other structured information. Rollbacks must preserve the structured records, and editing must resume on a compatible application version. MCP and API clients can edit both legacy Markdown and structured documents. When `bodyDocument` is present, update its blocks for prose changes; the application regenerates Markdown. For metadata-only changes, keep the Markdown unchanged: the server retains saved blocks even if the client omits `bodyDocument`. Contradictory Markdown-only prose edits are rejected to preserve the structured content. The reader uses stored blocks when present and Markdown for legacy records. Markdown download preserves supported text and media links but is not a complete backup of the native block document.

## Application updates

Bring the selected release into your deployment branch. From your local copy, replace the placeholders with the release tag and branch:

```sh
git fetch https://github.com/joethehuman/the-fieldbook.git tag RELEASE_TAG
git switch YOUR_DEPLOYMENT_BRANCH
git merge RELEASE_TAG
git push origin YOUR_DEPLOYMENT_BRANCH
```

Resolve conflicts with your custom changes before pushing. A push to Vercel's configured production branch starts its deployment. On App Platform, use your source integration's deployment trigger or request a deployment of the latest source. The example's public `git` source needs an explicit deployment after a push. If updating the app through its API, `update_all_source_versions: true` also fetches new source; the default retains the existing source revisions.

Check the deployed commit in `/fieldbook-build.json` and the affected behavior. A separate preview is available if you want to try an update first.

If the release has no new database migrations, no database command is needed. Existing installations apply only pending files, starting from the released `20261006061752_initial_install.sql` baseline. A build does not migrate the database.

## Fieldbook database migrations

Use the selected release's `supabase/migrations/` and follow its compatibility order. Choose backups and any rehearsal according to the change and your data. A maintenance window is needed only when the migration requires one.

### Hosted Supabase

From a local copy of the target release, use the pinned CLI:

```sh
npx --yes supabase@2.119.0 --agent no --output-format text login --no-browser
npx --yes supabase@2.119.0 --agent no --output-format text link --project-ref YOUR_PROJECT_REF
npx --yes supabase@2.119.0 --agent no --output-format text db push --linked --dry-run
npx --yes supabase@2.119.0 --agent no --output-format text db push --linked
```

Confirm the project reference and pending files before applying. The CLI records applied versions in `supabase_migrations.schema_migrations`. Retain the installed cleanup configuration and hourly job; check the next accepted execution after the update.

### DigitalOcean

The private setup environment supplies `FIELDBOOK_SETUP_DATABASE_URL` and `FIELDBOOK_SETUP_DATABASE_CA`. The update command uses the installed cleanup address and does not need `FIELDBOOK_URL`.

```sh
node --env-file=/private/path/database.env scripts/setup-self-hosted.mjs --upgrade --dry-run
node --env-file=/private/path/database.env scripts/setup-self-hosted.mjs --upgrade
```

Review the target and pending filenames before typing `UPGRADE`. The dry run reads the installation and migration ledger without executing pending SQL. Applying takes an advisory lock and records pending migrations in the same transaction as their SQL. A failed update set rolls back; an installation with no pending files is a no-op.

The installed ledger must be an exact prefix of the selected source's migrations. Missing, unknown or out-of-order history needs investigation. The command verifies the immutable baseline and rejects unreviewed extension, database HTTP scheduling and nontransactional changes; a release needing those operations must supply its own compatible procedure. The lock does not pause application writes.

The update preserves the cleanup endpoint, worker secret and private media bucket. Retain the separate App Platform hourly job and check its next accepted run. Auth and Storage maintain their own vendor migration ledgers; Fieldbook's update command does not update them.

### After applying

Check the changed flows and existing records, and retain the deployed source revision and migration versions for the next update. If a migration fails, investigate the error before retrying. Fresh setup, backend preparation and linked resets are not upgrade commands and must not run against an installation with data.

## Backend component updates on DigitalOcean

Review [Supabase's update guidance](https://supabase.com/docs/guides/self-hosting/updating), its release changes and relevant security advisories. Upstream's `update.sh` merges configuration for Docker Compose deployments; it does not update this App Platform recipe.

1. Compare the proposed versions with the [tested component table](installation.md#pinned-components-and-compatibility). Review vendor migrations, removed settings and compatibility requirements.
2. Choose a database, file and configuration recovery point appropriate to the change. Check any risky transition using an existing test installation or a temporary restore if useful.
3. Update tags and digests deliberately. Preserve database CA settings, service roles, signing keys, Google URLs, token hook, Storage configuration and ingress aliases. Auth and Storage can apply vendor SQL when they start. If that SQL is incompatible with old writers, stop the affected writers before the new version starts; removing public ingress alone does not stop background workers. Pause cleanup or writes when the transition requires it.
4. Check service health and affected flows with existing records. Auth changes affect sign-in, refresh and optional MCP; Storage changes affect private reads and ordinary/resumable uploads; database/REST changes affect permissions, content and progress. Restore any paused job and confirm an accepted scheduled run.

Record the component set you deployed. An application patch does not update backend images, and reverting an image does not undo its vendor SQL. Managed PostgreSQL maintenance and major upgrades are also separate from Fieldbook updates.

If Storage reports a migration checksum mismatch, compare the old/new image migrations and recorded ledger before proceeding. Keep `DB_ALLOW_MIGRATION_REFRESH=false`; clearing the ledger or allowing blanket refresh is not an update procedure.

## Routine operations

Periodically review relevant security advisories and deprecations, credential expiration, deployment/job failures and database capacity. The interval and monitoring arrangements are yours. Backend component updates do not need to accompany every application patch.

Useful checks include:

- The application and `/fieldbook-build.json` for its source revision.
- On App Platform, Auth `/backend/auth/v1/health`, Storage `/backend/storage/v1/status` and internal PostgREST `:3001/ready`.
- **Recently deleted** and the next accepted cleanup job, rather than scheduling history alone.
- A relevant sign-in, saved record or private-file operation after changes affecting it.

Health endpoints show process readiness, not successful user flows. Keep tokens, connection strings and signed URLs out of shared diagnostics.

On Spaces, review abandoned multipart uploads when needed. Expiration of an upload URL prevents further transfer but does not prove partial bytes have been removed. Provider housekeeping and Fieldbook's record/media deletion job cover different things; preserve active transfers when cleaning up partial uploads.

## Backups and recovery

Choose recovery arrangements for these three parts:

| Part          | Include                                                                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database      | Fieldbook records and migration ledger, Auth accounts/sessions/OAuth state, Storage metadata and vendor ledgers                                      |
| Private files | Uploaded object bytes and their exact keys/tenant layout                                                                                             |
| Configuration | Source/component versions, private app spec, signing/API keys, service credentials, CA, Google URLs, bucket settings and cleanup URL/secret/schedule |

Database backups do not include uploaded file bytes. Hosted Supabase's [backup options](https://supabase.com/docs/guides/platform/backups) depend on the plan. On DO, choose [Managed PostgreSQL recovery](https://docs.digitalocean.com/products/databases/postgresql/how-to/restore-from-backups/) or logical exports as appropriate. Deleting a managed cluster also deletes its managed backups.

A [logical database archive](https://www.postgresql.org/docs/17/app-pgdump.html) excludes global roles. Retain installation-owned role attributes, memberships, ownership and grants separately. Restore those roles before the archive; do not blindly replay provider-managed roles. Use a dump client at least as new as the server's major version. Protect configuration backups containing credentials.

For recovery, keep writes, cleanup and backend startup paused while matching the database, files and configuration to a recovery point. Restore migration ledgers with their data, exact private object keys and original signing keys. Fresh preparation or setup is not a restore procedure. Before reopening access, check database ownership/grants, service health, accounts, saved content/progress and private files, plus optional AI/MCP if used. Resume cleanup with the restored endpoint and secret and confirm a scheduled run.

Restoring older Auth state can invalidate refresh credentials: users may need to sign in or reconnect MCP. It can also restore subsequently revoked grants, disabled accounts or older roles. Reapply relevant access changes made after the recovery point. A restart retaining sessions does not establish session continuity across a database restore.

## Rollback

Restore a prior application deployment only if it remains compatible with the current database. Rolling back code does not reverse migrations, settings or later writes. An incompatible change may need a forward fix or a matching database/file/configuration recovery point; older backups can lose later records and uploads. The same limitation applies to Auth/Storage image rollback. Interrupted uploads may need to restart after recovery.

## Changing the hostname

Update DNS, the primary app domain, `FIELDBOOK_URL`, Google callbacks and Auth URLs together. On DO, supply the new literal public backend URL at build and runtime and rebuild Fieldbook. Change `fb_cleanup_config.endpoint` to the new origin's `/api/internal/purge-deleted`, preserve its worker secret, and update the external job's URL. Verify the next scheduled run. The migration command deliberately preserves that configuration.

Browser sessions and MCP connections tied to the former issuer/resource may need sign-in or reconnection. Retain the signing keys and check the affected flows at the new hostname.

For first-time setup, follow [installation](installation.md).
