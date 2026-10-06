# Upgrade a Fieldbook installation

An installation runs a specific Git commit and its matching database schema. Upstream changes do not update your deployment or Supabase project automatically. Choose an available release tag or an exact reviewed commit, and record what you deploy. Keep a production branch under your control so you can review an update before Vercel deploys it.

## Before changing production

1. Read the target release notes and the changes since your installed commit. Identify new migrations in supabase/migrations/ and any configuration or provider changes. Do not infer required steps from a version number alone.
2. Back up the **database and private Storage files separately**. Record the current deployment commit, environment configuration, and migrations already applied. Test a restore in an isolated project before depending on those backups.
3. Bring the selected target commit into a separate update branch. Resolve conflicts with your custom changes and review the resulting diff. Install locked dependencies and run checks relevant to the changed behavior.
4. Rehearse the upgrade with a separate Supabase project and deployment. Never give a preview the production backend secrets or point its deletion worker at the production app. Verify sign-in, content, progress, media, and any optional MCP or AI features you use.

## Apply and verify

For an installation created with the fresh-install baseline, link the Supabase CLI to the correct project, review `supabase db push --dry-run`, and apply only the pending migrations with `supabase db push` at the stage required by the release. Never run `supabase db reset --linked` on an installation with data. A Vercel build does not update its database.

If a migration changes tables or functions used by the running app, stop writes or use a maintenance window until compatible code is deployed. Read the migration and release notes for its required deployment order. Deploy the reviewed code to your production branch after the required schema is ready.

Check the exact deployed commit and test owner and learner sign-in, draft/publication access, learner progress, uploads, and the admin tasks your installation uses. Verify the deletion worker's endpoint and first scheduled run if that feature changed. Record the new commit and applied migrations privately.

## Rollback

Keep the prior deployment available. Rolling back code does **not** reverse SQL migrations, provider settings, or content written after the change. Use the old code only if it remains compatible with the new schema. Otherwise stop writes and use a tested restore or forward fix. Restoring an older backup can lose later data, including Auth and media changes.

For first-time setup, follow [installation](installation.md). Storage file-size limits are operator settings and may need adjustment after an upgrade; see [upload limits](installation.md#media-and-upload-limits).
