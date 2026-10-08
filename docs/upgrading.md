# Upgrade a Fieldbook installation

Choose the release you want to run. Read its release information for configuration changes, database migrations and any required deployment order. Preserve your installation's environment settings and custom source changes.

## Application updates

Bring the selected release into the branch Vercel deploys from your own repository. From your local copy, replace the placeholders with the release tag and your deployment branch:

```sh
git fetch https://github.com/joethehuman/the-fieldbook.git tag RELEASE_TAG
git switch YOUR_DEPLOYMENT_BRANCH
git merge RELEASE_TAG
git push origin YOUR_DEPLOYMENT_BRANCH
```

Resolve any conflicts with your custom changes before pushing.

A push to the configured production branch starts Vercel's deployment. Afterward, check the changed behavior in your installation and note the deployed release or commit. A separate preview is available if you want to try the update first.

If the release has no new database migrations, no database command is needed. Fresh installations apply the SQL files shipped with the selected source version, beginning with `20261006061752_initial_install.sql`. Existing installations apply only their pending migrations.

## Releases with database changes

New SQL files in `supabase/migrations/` are applied separately from application deployment. Follow the release's compatibility and deployment order. Use a maintenance window only if the change requires one. Choose backups or a rehearsal according to the change and the data you need to protect.

From a local copy of the target release, use the pinned CLI without installing it globally:

```sh
npx --yes supabase@2.119.0 --agent no --output-format text login --no-browser
npx --yes supabase@2.119.0 --agent no --output-format text link --project-ref YOUR_PROJECT_REF
npx --yes supabase@2.119.0 --agent no --output-format text db push --linked --dry-run
npx --yes supabase@2.119.0 --agent no --output-format text db push --linked
```

Confirm the project reference and pending migrations before applying them. An application build does not migrate the database. Never run `supabase db reset --linked` or the fresh-install setup command against an installation with data. Stop and read the error if a migration fails.

After the update, check the affected features and existing records. Keep the deployed version and migration record available for the next update.

## Rollback

The prior application deployment can be restored if it remains compatible with the current database. Rolling back code does not reverse migrations, provider settings or later data writes. An incompatible database change may need a forward fix or a chosen recovery point; restoring older data can lose newer records and uploads.

For first-time setup, follow [installation](installation.md).
