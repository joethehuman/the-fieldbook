# Content presentation controls

## Save, leave and recover

Edited Docs, Updates and Courses automatically save as drafts. Wait for **Saved** in the editor header before closing the browser. **Publish** and **Publish changes** explicitly update the published copy; an unchanged published item shows a disabled **Published** button. Uploading a file does not itself save its content reference. Keep the editor open until the upload completes and its reference is saved. Pending uploads block saving and navigation so a returned reference cannot land in a closed editor. Draft saving keeps writing available and preserves edits made while a response is slow. Failed uploads keep the existing text or media reference; choose the file again to retry.

Leaving the editor waits for pending draft saves. If saving fails, the leave confirmation lets you cancel and retain the work or download it before leaving. Browser reload/close uses the browser's own unsaved-change warning; browsers may suppress that warning, and it cannot protect against crashes or forced closure before a save finishes. Untouched new editors do not create records.

If saving fails, the editor stays open and an inline alert offers **Retry saving**, **Download your changes** and **Load saved draft**. The download is a JSON recovery copy on your device; it can contain private draft text and quiz answers, but not media bytes. It does not save or publish anything. Loading a saved draft replaces the current open changes after confirmation; compare versions before choosing it. There is no draft-import button.

**Load saved draft** fetches the current saved state and asks before replacing your open edits. Download first if you need both versions. A revision conflict does not overwrite another author's work. If the connection fails, the last write may have reached the server; if saving succeeded but refreshing failed, the message says so. Review the saved copy before retrying. Multi-item operations can partially succeed; their error reports how many writes were confirmed and refreshes the saved state when possible. Writes are not automatically replayed. If sign-in expires or account access changes, recovery keeps the editor open so you can download your edits before signing in again.

Section creation and learning-group changes save separately from content. Discarding content edits does not undo those saved changes.

## Docs sections

Go to **Manage organization → Organization Settings → Docs navigation** to create and organize top-level sections and their subsections. Each level can contain documents. Use drag or **Move to** to place documents and subsections across sections; reorder siblings in the same hierarchy. A top-level section can become a subsection after its own children have been moved. Review the connected **Unsaved changes** bar, then Save or Discard. Move documents and subsections before deleting a populated section.

Empty sections remain available to administrators and in the editor; readers see only branches with published documents. The Docs sidebar and previous/next links use the same order. Documents directly in a section appear before its subsections. Existing flat sections remain top-level.

In the document editor, **Details → Docs section** has one searchable picker with full paths, such as **Getting started → Installation**. **Create section** accepts a name and optional top-level parent, saves the new section separately, and selects it. The document’s draft autosave keeps its placement; publish when ready for readers. Canceling document edits does not delete a created section. A new document starts without a selected section.

Section IDs and order live in optional `docSections` settings JSON; documents may reference a section ID. Legacy category and folder values remain readable without rewriting documents. Saving a hierarchy with an existing folder deeper than a subsection reports the affected document and path. No database migration or additional dependency is required.

## Generated card artwork

Updates, Courses and Curricula share generated SVG artwork. **Shuffle artwork** selects generator version 6, with thirty recipes across the original ten motif families. Three seed-derived parameters vary each recipe: rhythm couples shape count with spacing; proportion changes dimensions or curvature; placement moves the focal anchor within a bounded area. Each family interprets these parameters within its own constraints. The parameters are part of the generated choice, not additional editor controls.

The geometry uses consistent curves and nested shapes. Line banks have a gentle opacity hierarchy rather than equal visual weight throughout. Broad color shapes have no border strokes; rounded frame dimensions and corner radii grow together; arcs share a center with endpoints outside the card. Waves use moderate curvature, and the diagonal family includes a simple ascending sweep. Faint nested fields add depth to closed shapes without outlined strips. Artwork fades toward the existing title area.

The collection refresh renders all existing generated cards from versions 1–5 with version 6 while preserving each saved seed and short title. Automatic defaults use version 6 with their stable item-ID-derived seed. Results stay deterministic after the refresh. Stored records are not rewritten on read; an artwork edit can save the resolved version. Uploaded images and legacy covers keep their existing behavior. The refresh floor is fixed at version 6, so a future generator version does not automatically redraw these choices. The catalog keeps historical versions only for before/after comparisons. Draft saving and publication keep their existing separate behavior. There is no bulk data rewrite or database migration.

Identity palette settings continue to recolor all generated artwork without changing geometry. Generated/upload modes, the short-title and metadata overlays, card dimensions and Shuffle's recent-design history are unchanged. A legacy course image remains an upload; a failed image uses the fallback associated with its artwork version.

## Course covers

In the course editor, **Details → Card artwork** lets an administrator or contributor upload or replace an image. **Remove image** restores generated artwork. Draft autosave keeps the choice; publish it to change the public card. A saved draft does not replace the published cover.

Accepted formats are JPG, PNG, WebP and GIF. The installation's optional application limit and storage limits apply. Wide images are recommended: covers crop from the center to fill the card. Category, play indicator and duration remain overlaid. A failed image load falls back to generated artwork.

The optional `coverImageUrl` field references existing private `fieldbook-media` storage. Production rejects external cover URLs, unfinished uploads and video files used as covers. Existing short-lived media URLs and published-content access checks apply. Removing or replacing a cover changes the course reference; it does not delete the storage object, which could be used elsewhere. Installation operators remain responsible for storage management.

The browser-local demo displays covers already present in its data but does not upload files. Upload controls are available in the production application through its authorized upload handler.

## Updates

Updates use their published feed date for ordering and the featured first card. Republishing a correction keeps that date; **Details → Publishing → Bring this update to the top** deliberately renews it for Updates and For you. Decorative position numbers have been removed. Other cards stack artwork and text from the top, so different summary lengths do not offset their backgrounds. The six existing background colors repeat for longer lists.

## Upgrade

No database migration or new service is required. Both fields are optional and use existing JSON storage. Old content retains generated artwork. Follow the [upgrade guide](upgrading.md) when updating an installation.

