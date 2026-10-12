# Upgrade a Fieldbook installation

Choose the release you want to run. Read its release information for configuration changes, database migrations and any required deployment order. Preserve your installation's environment settings and custom source changes.

## Application updates

Bring the selected release into your deployment branch. From your local copy, replace the placeholders with the release tag and your deployment branch:

```sh
git fetch https://github.com/joethehuman/the-fieldbook.git tag RELEASE_TAG
git switch YOUR_DEPLOYMENT_BRANCH
git merge RELEASE_TAG
git push origin YOUR_DEPLOYMENT_BRANCH
```

Resolve any conflicts with your custom changes before pushing.

A push to the configured production branch starts Vercel's deployment. On DigitalOcean, use your configured source integration's deployment trigger or deploy the latest commit from App Platform. With the app spec's public `git` source, request a new deployment after pushing; updating the app specification alone can reuse an earlier source revision. Verify the deployment's source commit and `/fieldbook-build.json`, then check the changed behavior in your installation. A separate preview is available if you want to try the update first.

If the release has no new database migrations, no database command is needed. Fresh installations apply the SQL files shipped with the selected source version, beginning with `20261006061752_initial_install.sql`. Existing installations apply only their pending migrations.

## Releases with database changes

New SQL files in `supabase/migrations/` are applied separately from application deployment. Follow the release's compatibility and deployment order. Use a maintenance window only if the change requires one. Choose backups or a rehearsal according to the change and the data you need to protect.

For hosted Supabase, use the pinned CLI from a local copy of the target release without installing it globally:

```sh
npx --yes supabase@2.119.0 --agent no --output-format text login --no-browser
npx --yes supabase@2.119.0 --agent no --output-format text link --project-ref YOUR_PROJECT_REF
npx --yes supabase@2.119.0 --agent no --output-format text db push --linked --dry-run
npx --yes supabase@2.119.0 --agent no --output-format text db push --linked
```

Confirm the project reference and pending migrations before applying them. An application build does not migrate the database. Never run `supabase db reset --linked` or the fresh-install setup command against an installation with data. Stop and read the error if a migration fails.

After the update, check the affected features and existing records. Keep the deployed version and migration record available for the next update.

For the DigitalOcean backend, use the target source checkout's migration command with an authorized private administrator connection. The private environment file supplies `FIELDBOOK_SETUP_DATABASE_URL` and `FIELDBOOK_SETUP_DATABASE_CA`; the update command preserves the installed cleanup URL and does not need `FIELDBOOK_URL`.

```sh
node --env-file=/private/path/database.env scripts/setup-self-hosted.mjs --upgrade --dry-run
node --env-file=/private/path/database.env scripts/setup-self-hosted.mjs --upgrade
```

Review the displayed target and pending filenames before typing `UPGRADE`. The dry run reads state/history without executing pending SQL. The apply operation takes an advisory lock, requires the installed ledger to be an exact prefix of the selected release's migrations, and applies only pending files plus their ledger entries in one transaction. Unknown, missing or out-of-order history is an error to investigate, never permission to reset or repair history blindly. A current installation is a no-op. A failed migration rolls back that update set.

The installer verifies its pinned immutable baseline and refuses unreviewed additions of database HTTP scheduling or nontransactional migrations. A release requiring those operations needs an explicitly reviewed self-hosted procedure. Application writes are not paused by the advisory lock; use a maintenance window if the particular migration requires one. Do not run fresh setup or backend preparation on a database containing data.

The update operation verifies that `fb_cleanup_config.endpoint` and its worker credential remain unchanged and retains the private media bucket. Keep the separate App Platform hourly job configured. Check its next scheduled execution and the affected saved records after the update; a passing dry run proves neither migration execution nor cleanup. Archive the chosen application revision, applied migration versions, app spec and component pins privately for the next update.

## Backend component updates on DigitalOcean

Supabase Auth and Storage maintain their own schema migration ledgers; these are separate from `supabase_migrations.schema_migrations`. Rebuilding Fieldbook does not update those services, and updating their images does not apply Fieldbook migrations. Managed PostgreSQL maintenance and major upgrades are another separate operation.

Review [Supabase's current update guidance](https://supabase.com/docs/guides/self-hosting/updating), its self-hosted release manifest/changelog, and security advisories before changing a pin. Upstream's `update.sh` performs a version-based three-way merge for a **Docker Compose** deployment; it does not deploy this App Platform recipe. Use its release/configuration changes as a review reference. Do not run it against the Fieldbook checkout or replace the app spec with upstream Compose.

1. Compare the recorded upstream snapshot and component versions in the [installation compatibility table](installation.md#pinned-components-and-compatibility) with the proposed upstream release. Review migrations, removed configuration, API/SDK compatibility and deprecations. Preserve the documented CA, roles, Google URLs, asymmetric keys, OAuth hook, Storage/S3/TUS settings and ingress adjustments.
2. Back up the database, private file bytes and essential configuration before an update that could affect them. Use a temporary restore or an existing authorized test installation for risky backend/schema changes. No permanent extra environment is required.
3. Update component tags **and digests** deliberately and keep the accepted set recorded together. Apply required vendor prerequisites first. Auth/Storage may migrate their schemas as they start, so container recreation can itself be a database change. Disable automatic image tracking and never regenerate keys during deployment.
4. Check service readiness, then real affected flows. Auth changes need sign-in/session refresh, preregistration, inactive/deleted accounts and MCP consent/refresh/revocation. Storage changes need ordinary and resumable uploads, private signed reads and deletion. REST/database changes need permissions, publication and saved progress. Inference routing changes need actual forced-tool planning, cited streaming answers, cancellation and controlled route/fallback checks.
5. Restart/redeploy with existing records and confirm durable state and the external cleanup schedule survive. Update the compatibility table only with the versions and checks actually exercised. A green build, container health check or fresh installation alone does not demonstrate an upgrade.

Keep the pinned set current through a short periodic security/deprecation review and promptly assess relevant advisories. Do not upgrade every component merely because a Fieldbook application patch is available. Conversely, an application-only patch does not remediate a vulnerable backend image. Further PostgreSQL majors and independently mixed component sets require a compatibility review.

## Routine health and recovery

Check App Platform service health and failed deployments/jobs after changes, and include database capacity/connections, Spaces availability, credential expiration and upstream advisories in routine operations. Auth `/health`, Storage `/status`, internal REST `:3001/ready`, and `/fieldbook-build.json` are useful first checks. Use the expected deployment revision in the build marker; do not treat it as proof of real authentication or private media. Watch the next scheduled cleanup execution and the **Recently deleted** warning. Keep logs access-controlled and redact tokens, connection strings and signed URLs before sharing diagnostics.

Back up three things together:

- **Database:** Fieldbook tables and migration ledger, Auth accounts/sessions/OAuth state, Storage object metadata/vendor ledgers, roles/grants and extensions. Use Managed PostgreSQL backup/restore plus logical exports when needed. A database restore alone does not restore media bytes.
- **Private files:** all Spaces objects, including the backend's tenant/object layout. Choose and verify an independent copy or versioning/retention arrangement. Do not infer that a database backup or bucket metadata includes these files.
- **Essential configuration:** private app spec, exact application/component revisions and image digests, signing keys/API keys and their expiration dates, service database credentials, CA, Google client settings, canonical URLs/DNS, bucket/tenant IDs, cleanup endpoint/secret/schedule, MCP flags/hook, and AI router configuration/credential scopes. Keep encrypted configuration backups separate from source control.

For recovery, choose matching database and file recovery points, restore to an isolated target where feasible, re-create roles and trusted sources, restore the corresponding configuration, and check ownership/RLS before directing user traffic there. Retain stable signing keys, person mappings and Storage tenant/bucket names. Pause cleanup and writes during reconciliation so restored records and objects are not immediately removed or diverge. Resume the hourly job only after confirming the restored cleanup secret and endpoint, then test a scheduled run. Verify account access, content/progress, private files and optional MCP/AI before cutting over the hostname.

Rehearse recovery in proportion to the data at risk. Record privately which recovery points and services were actually restored and any lost-data window. Do not promise zero data loss or continuous service from backups alone.

## Rollback

The prior application deployment can be restored if it remains compatible with the current database. Rolling back code does not reverse migrations, provider settings or later data writes. An incompatible database change may need a forward fix or a chosen recovery point; restoring older data can lose newer records and uploads. Auth/Storage migrations can also make an older container incompatible: reverting the image tag does not reverse its SQL. Restore a mutually compatible database, files and configuration set, or apply a reviewed forward fix. Cancelled or interrupted resumable uploads may need to restart after a restore.

For first-time setup, follow [installation](installation.md).
