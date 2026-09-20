# Before the first public release

This is a release gate, not a claim that these tasks are already complete.

- [ ] Choose a license, add `LICENSE`, and review dependency/asset licenses. Update README publication status.
- [x] Consolidate the current demo, production implementation, and guides into `main`. Recheck the exact candidate commit before publishing any release.
- [ ] Audit tracked files and history for secrets, personal information and installation-specific configuration. Keep operational notes and policy drafts outside the released repository.
- [ ] Establish a private vulnerability-reporting channel and add `SECURITY.md` with the actual supported versions/contact.
- [ ] Complete a fresh installation using only the public guides and new accounts. Record provider/runtime versions and any missing steps.
- [ ] Verify authorization with a separate learner, media access, draft/publication behavior, progress, MCP revocation and backup restoration.
- [ ] Verify the documented ChatGPT MCP setup; keep untested clients explicitly unverified.
- [ ] Follow [the release process](releases.md): finalize the changelog, exact release commit, known limitations, and migration/recovery instructions before creating the first pre-release.
- [ ] Confirm that the public demo contains dummy data and cannot access the production backend.

Keep infrastructure credentials, operator contacts, branding and privacy policies installation-specific. A small project does not need a plugin marketplace, separate MCP repository, or a mandatory agent skill to launch.
