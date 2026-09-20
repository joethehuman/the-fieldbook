# Content presentation controls

## Docs section order

Go to **Manage organization → Organization Settings → Docs navigation**. Use **Move up** and **Move down**, then **Save settings**. The saved order applies to both the Docs sidebar and overview. Editing an article no longer changes its section position.

Sections come from document categories. Before an order is saved, sections sort alphabetically. New or renamed categories not yet in the saved order appear after saved sections, alphabetically. Sections without visible documents are omitted for readers. Draft categories can be arranged by admins before publication. Article and nested-folder order are unchanged.

The order is stored as optional `docCategoryOrder` in the existing settings JSON and uses the existing administrator authorization and settings-revision check.

## Course covers

In the course editor, **Course details → Course cover** lets an admin upload or replace an image. **Remove cover** restores generated artwork. Save the course to keep the choice; publish it to change the public card. A saved draft does not replace the published cover.

Accepted formats are JPG, PNG, WebP and GIF. The upload limit is 50 MB or the installation's lower configured limit. Wide images are recommended: covers crop from the center to fill the card. Category, play indicator and duration remain overlaid. A failed image load falls back to generated artwork.

The optional `coverImageUrl` field references existing private `fieldbook-media` storage. Production rejects external cover URLs, unfinished uploads and video files used as covers. Existing short-lived media URLs and published-content access checks apply. Removing or replacing a cover changes the course reference; it does not delete the storage object, which could be used elsewhere. Installation operators remain responsible for storage management.

The browser-local demo displays covers already present in its data but does not upload files. Upload controls are available in the production application through its authorized upload handler.

## Updates

Updates retain their most-recently-updated ordering and featured first card. Decorative position numbers have been removed. Other cards stack artwork and text from the top, so different summary lengths do not offset their backgrounds. The six existing background colors repeat for longer lists.

## Upgrade

No database migration or new service is required. Both fields are optional and use existing JSON storage. Old content retains generated artwork. Deploying the branch is a separate operator decision.

## Verification on the implementation branch

- Demo and production builds passed, including TypeScript checks.
- Docs ordering tests passed. All eight production tests passed, including cover authorization, media readiness/type validation, revision conflicts, draft isolation, publication and removal.
- The full shared suite passed 21 of 22 tests. The pre-existing `direct and inherited assignments deduplicate courses and use earliest deadline` assertion still expects 2026-09-22 while unchanged code returns 2026-10-04. This branch does not modify assignment behavior.
- Headless Chrome checked keyboard reordering, save/reload persistence, matching Docs sidebar/overview, desktop/mobile Update layouts, cover display/fallback, and removing a cover through the course editor. No browser JavaScript errors occurred.
- An isolated browser harness exercised the upload controls with a simulated upload callback: upload, replacement, failed replacement preserving the previous cover, removal, and rejection of video files. This is not a live Supabase upload test.
- Local checks used the available Node 24.19.0 and pnpm 11.25.0 runtime; the repository targets Node 22 and pnpm 10.17.1. Release-runtime CI and real storage upload/playback remain external checks.
- No production deployment or database changes were performed.
