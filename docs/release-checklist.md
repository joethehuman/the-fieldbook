# Before the first public release

This is a release gate, not a claim that these tasks are already complete.

- [ ] Choose a license, add `LICENSE`, and review dependency/asset licenses. Update README publication status.
- [ ] Review and merge the intended implementation into the default branch. Ensure it contains these guides; deploying an older branch may deploy only the original demo.
- [ ] Audit tracked files and history for secrets, personal information and installation-specific configuration. Keep operational notes and policy drafts outside the released repository.
- [ ] Establish a private vulnerability-reporting channel and add `SECURITY.md` with the actual supported versions/contact.
- [ ] Complete a fresh installation using only the public guides and new accounts. Record provider/runtime versions and any missing steps.
- [ ] Verify authorization with a separate learner, media access, draft/publication behavior, progress, MCP revocation and backup restoration.
- [ ] Test Claude end to end before describing its integration as verified.
- [ ] Finish the maintainer instance's canonical-domain migration and reconnect its AI clients.
- [ ] Add a short changelog, tag the first pre-release, and document known limitations and migration steps.
- [ ] Confirm that the public demo contains dummy data and cannot access the production backend.

Keep infrastructure credentials, operator contacts, branding and privacy policies installation-specific. A small project does not need a plugin marketplace, separate MCP repository, or a mandatory agent skill to launch.
