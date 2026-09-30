# Maintainer release process

A small manual process is sufficient. There is no automatic release publisher or updater. Publishing code, publishing a GitHub Release, and deploying the maintainer's own site are different actions.

## Supported installation

Release checks cover Vercel, hosted Supabase (PostgreSQL, Auth, Storage, and OAuth server), and Google sign-in. ChatGPT is the exercised MCP client. Other databases, hosts, identity providers, self-hosted Supabase, and unverified MCP clients are not covered by a compatibility promise. Document the actual versions and provider features used in each release's verification, including Supabase OAuth server's provider status.

## Version policy

- Until the first release, keep changes under **Unreleased** in CHANGELOG.md. Existing `0.1.0` strings are development placeholders.
- The first public testing release may be `v0.1.0`, marked **pre-release** in GitHub. It is not published by creating this guide.
- During `0.x`, minor releases can include breaking changes. Describe every required action; no compatibility or maintenance schedule is promised.
- After a stable `1.0.0`, use patch versions for compatible fixes, minor versions for compatible additions, and major versions for incompatible changes. Do not label a breaking change as a compatible update.
- Never move a published tag or silently replace release contents. Publish a corrective release instead.
- No long-term-support or older-version backport commitment is made. Make any version-specific security notice explicit.

## Prepare a release

1. Review and merge the intended code into the default branch through a pull request. Verify its final commit; do not accidentally release an older demo-only branch.
2. For the first publication, choose a license, review dependency and asset licenses, establish a private vulnerability-reporting channel with a SECURITY.md policy, and review tracked files and Git history for credentials or personal data. For every release, verify a clean installation; for later releases, also test an upgrade from the previous release.
3. Review the supported setup instructions against the code. Confirm no credentials, operator-specific content, or runtime configuration are included. Use a fresh, isolated backend for installation checks.
4. Update the version in root `package.json`, `demo/package.json`, and the MCP server metadata in `server/mcp.ts` together. These are application identifiers, not instructions to publish an npm package; keep `private: true`. Refresh the lockfile only if required by actual dependency changes.
5. Move reviewed changes from Unreleased into a dated changelog entry. Include exact new migration filenames, environment changes, deployment order, and rollback limits. Write “No new migrations” explicitly when appropriate.
6. Run the existing CI checks: frozen install, tests, demo build, production build. Verify real auth, separate learner and manager permissions, draft/publication boundaries, progress import, media, and MCP expiry/revocation against the release candidate; builds do not test provider configuration. Confirm the demo uses only synthetic browser-local data. Include UI ownership and browser checks from CI and inspect the affected screenshots.
7. For upgrades, test migration and recovery with representative data in an isolated environment. Do not rewrite a migration shipped in a previous release.
8. Prepare a GitHub Release draft pointing to the reviewed commit. Double-check the tag target, attach the release notes below, and mark early releases as pre-releases. Publish only after the checks pass and the maintainer decides to release.
9. Upgrade the maintainer's installation deliberately. Publishing a tag does not migrate its database or prove its production deployment is healthy.

GitHub's [release interface](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository) supplies the tag and release notes. Operators follow the separate [upgrade guide](upgrading.md); they are not enrolled in automatic upstream updates.

## Release notes template

Copy this into the release draft and replace every placeholder:

```markdown
## Status
Pre-release or stable; intended audience and known limitations.

## Changes
User-visible additions and fixes; call out breaking changes.

## Supported setup and validation
Vercel + hosted Supabase + Google sign-in.
Node/pnpm versions; migration set; actual checks performed.
MCP clients actually tested. Separate unverified behavior.

## Install or upgrade
Source version(s) tested and target tag/commit.
New migrations in order, or “No new migrations.”
Environment/configuration changes, or “None.”
Backup requirements and exact code/database deployment order.

## Recovery
Whether the previous code works with the new schema.
Restore/forward-fix steps and potential data loss.
```
