# Independent installation proof

Use this guide to test whether a person or agent can install, operate, upgrade and recover Fieldbook using only the repository documentation. It is a test plan, not a claim that the current software has passed it. Start with [installation](installation.md), [versions and upgrades](upgrading.md), [MCP setup](mcp-setup.md) and [provider boundaries](providers.md). Record each failure in enough detail for someone else to reproduce it, then correct the public guide or product and repeat the affected step.

## Keep the test independent

Use accounts and projects controlled by the tester: a GitHub repository, Vercel project, Supabase project and Google Cloud OAuth client. Use an isolated test domain or canonical Vercel address. Do not reuse the maintainer's production Supabase project, credentials, OAuth client or media bucket. A writable preview needs its own backend and `FIELDBOOK_PREVIEW_SUPABASE_REF`; never point it at production. Do not put credentials, OAuth codes, account exports or learner information in an issue, agent transcript, screenshot or proof report.

Choose and record one exact commit or release tag. There is no published Fieldbook release yet; until one exists, say **development snapshot** and record the full commit. Record the package-manager and Node versions from that commit. Note any account-plan feature that was unavailable or paid. Do not change code to make the instructions appear to work before recording the failure.

## Evidence sheet

Keep a private proof record with these fields:

| Field | Record |
| --- | --- |
| Source | Commit/tag, repository URL and whether it was a release or development snapshot |
| Runtime | Node, pnpm, Vercel framework/root/production branch, canonical origin |
| Services | Supabase project reference, region and plan; Google OAuth client identifier (never the secret) |
| Database | Ordered filenames applied, method (SQL editor or CLI), ledger and results |
| Media | Private bucket configuration, global/bucket/application limits and test file types/sizes |
| Test identities | Roles and whether each was preregistered or first created at sign-in; use synthetic names |
| Result | Pass/fail/unrun per scenario, time, relevant request/log ID and the exact observation |
| Recovery | Database and object backup method, restore destination and verification |

Do not treat a green build, a completed migration, a READY deployment and a signed-in workflow as interchangeable evidence.

## Fresh setup

1. Follow [first deployment](installation.md#first-deployment) in order. Apply **every** migration in the chosen tree by filename. Record a successful result for each file. SQL-editor application does not populate the CLI migration ledger; choose one ledger and do not replay applied files.
2. Configure the installed app at repository root; `demo/` is optional and must be a separate browser-local deployment. Set required environment variables from [`.env.example`](../.env.example) in the intended Vercel environment. Confirm the deployed app marker and canonical origin.
3. Configure the two different callbacks: Google → Supabase at `/auth/v1/callback`; Supabase → Fieldbook at `/auth/callback`. Verify the correct Google audience/test-user settings. Set the Supabase Site URL and exact redirect allowlist. Verify an owner first sign-in and a second learner sign-in. Check open/closed registration and public/private browsing as configured.
4. Configure the deletion worker endpoint to the full, direct, nonredirecting `https://HOST/api/internal/purge-deleted` URL. Verify an authenticated invocation and the scheduled job in the same backend before relying on permanent deletion.
5. In Admin, create a Doc, Update and Course as drafts. Confirm a learner cannot read the drafts. Publish them deliberately and check an admitted reader. A signed-out reader should see publications only on a public installation; a private one must redirect or deny them.

## Role and learning journeys

Use separate synthetic accounts or preregistered roster entries. Check direct URL/API denial as well as hidden controls.

- **Learner:** published library and own progress work; another person's progress, drafts, Admin APIs and quiz answer keys are denied.
- **Manager:** only explicitly managed teams and descendants appear in My team's progress and exports; sibling teams are denied. Team membership alone grants nothing.
- **Contributor:** Content and Feedback publishing tools work; People, assignments, settings and organization-wide progress are denied. If this contributor also manages a team, the scoped team report works without broader administration.
- **Administrator:** can manage People, teams, flat learning groups, curricula, content, settings and organization progress. Confirm last-administrator and self-deactivation guards.
- **Roster:** preregister a Google email while registration is closed; first verified sign-in attaches the same person ID, memberships and history. Import a small six-column CSV, review a stale proposal and a retry, then confirm no duplicate people or moved deadlines. See [roster import](roster-import.md).
- **Assignments:** assign one published course through two overlapping team/group or curriculum sources. Confirm one effective current-version obligation and saved deadline; removing one source preserves the other. Optional learning does not lower assigned completion. Turn Due dates off and back on without changing stored targets.
- **Course:** complete one lesson-only course and one course with a final quiz. Verify required-pass versus submit-to-complete behavior, saved progress on a second device, and a new version's completion requirement.

## Media, search and AI

Upload a small image and a playable short video. Check publication, private draft denial, video start/seek/replay, signed-link renewal and alternative text. Then test a file above 6 MiB to exercise signed TUS chunks, a storage-limit rejection and an interrupted transfer. Confirm the editor preserves text and never inserts an unverified media URL. Back up and restore actual objects, not only database references. The app has no fixed file cap; [configured limits](installation.md#configure-upload-limits) and the provider decide what succeeds.

Search published Doc and lesson text, including a typo and a private draft term. Verify the draft is absent and results point to published content. If Ask AI is enabled, choose a supported router and primary model in Admin, review the selected provider's data handling and spend settings, then ask a question with and without matching published evidence. Check verified source links, off-state rejection and ordinary Search after an AI failure. Do not call a successful model response proof that every statement is correct.

If MCP is enabled, use a real OAuth client. Call `get_capabilities` first. Test a publisher's draft/revision/publish flow, manager-scoped reports, optional verified file transfer, consent for added capabilities, token expiry and revocation. Confirm an unsupported settings or account operation points to a manual Fieldbook destination. A login token alone must not grant an unapproved tool. See [MCP setup](mcp-setup.md).

## Upgrade and restore

1. Preserve the initial deployment, migration ledger, database backup and separate media copy. Add representative people, assignments, progress, content, feedback and media before upgrading.
2. Rehearse the target version's **missing** migrations in a second isolated project with representative data. Check the release's required order and old-code compatibility. Never replay a migration merely because its timestamp or SQL-editor ledger differs.
3. Upgrade code only after the required database work is applied and verified in the target environment. Check identity, content, reports, assignments, progress, media and cleanup again. Record any step that required undocumented knowledge.
4. Restore the database and media into a third isolated destination. Reconfigure secrets, callbacks, canonical origin and cleanup endpoint for that destination. Check the restored owner, learner progress, draft/published snapshots, private objects and signed reads. Do not point restored worker jobs or OAuth redirects at production.
5. Explain the tested rollback boundary. A Vercel code rollback does not reverse schema or media changes; an older backup can lose later writes or Auth changes.

A final proof report should identify what worked, what failed, exactly which public instructions changed, and what remains untested. Passing this exercise is strong installation evidence; it is not a security certification or a guarantee for every provider plan and browser.
