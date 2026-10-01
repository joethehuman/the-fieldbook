# Content presentation controls

## Save, leave and recover

Edited Docs, Updates and Courses automatically save as drafts. Wait for **Saved** in the editor header before closing the browser. **Publish** and **Publish changes** explicitly update the published copy; an unchanged published item shows a disabled **Published** button. Uploading a file does not itself save its content reference. Keep the editor open until the upload completes and its reference is saved. Pending uploads block saving and navigation so a returned reference cannot land in a closed editor. Draft saving keeps writing available and preserves edits made while a response is slow. Failed uploads keep the existing text or media reference; choose the file again to retry.

Leaving the editor waits for pending draft saves. If saving fails, the leave confirmation lets you cancel and retain the work or download it before leaving. Browser reload/close uses the browser's own unsaved-change warning; browsers may suppress that warning, and it cannot protect against crashes or forced closure before a save finishes. Untouched new editors do not create records.

Recovery tools are under **Details → Draft recovery** and appear directly beside a save failure. If saving fails, the editor stays open. **Download draft** saves the current content as a JSON recovery copy on your device; it can contain private draft text and quiz answers. It does not download the media files or publish anything. Use the copy to compare and manually reapply edits; there is no draft-import button.

**Review saved copy** fetches the current state and asks before replacing your open edits. Download first if you need both versions. A revision conflict does not overwrite another author's work. If the connection fails, the last write may have reached the server; if saving succeeded but refreshing failed, the message says so. Review the saved copy before retrying. Multi-item operations can partially succeed; their error reports how many writes were confirmed and refreshes the saved state when possible. Writes are not automatically replayed. If sign-in expires or account access changes, recovery keeps the editor open so you can download your edits before signing in again.

Section creation and learning-group changes save separately from content. Discarding content edits does not undo those saved changes.

## Docs sections

Go to **Manage organization → Organization Settings → Docs navigation** to create and organize top-level sections and their subsections. Each level can contain documents. Use the placement control to move a subsection to another parent or promote it. A top-level section can become a subsection after its own children have been moved. Use the up/down buttons to reorder siblings, then **Save settings**. Move documents and subsections before deleting a populated section.

Empty sections remain available to administrators and in the editor; readers see only branches with published documents. The Docs sidebar, overview and previous/next links use the same order. Documents directly in a section appear before its subsections. Existing flat sections remain top-level.

In the document editor, **Details → Docs section** has one searchable picker with full paths, such as **Getting started → Installation**. **Create section** accepts a name and optional top-level parent, saves the new section separately, and selects it. The document’s draft autosave keeps its placement; publish when ready for readers. Canceling document edits does not delete a created section. A new document starts without a selected section.

Section IDs and order live in optional `docSections` settings JSON; documents may reference a section ID. Legacy category and folder values remain readable without rewriting documents. Saving a hierarchy with an existing folder deeper than a subsection reports the affected document and path. No database migration or additional dependency is required.

## Course covers

In the course editor, **Details → Card artwork** lets an admin upload or replace an image. **Remove image** restores generated artwork. Draft autosave keeps the choice; publish it to change the public card. A saved draft does not replace the published cover.

Accepted formats are JPG, PNG, WebP and GIF. The upload limit is 50 MB or the installation's lower configured limit. Wide images are recommended: covers crop from the center to fill the card. Category, play indicator and duration remain overlaid. A failed image load falls back to generated artwork.

The optional `coverImageUrl` field references existing private `fieldbook-media` storage. Production rejects external cover URLs, unfinished uploads and video files used as covers. Existing short-lived media URLs and published-content access checks apply. Removing or replacing a cover changes the course reference; it does not delete the storage object, which could be used elsewhere. Installation operators remain responsible for storage management.

The browser-local demo displays covers already present in its data but does not upload files. Upload controls are available in the production application through its authorized upload handler.

## Updates

Updates retain their most-recently-updated ordering and featured first card. Decorative position numbers have been removed. Other cards stack artwork and text from the top, so different summary lengths do not offset their backgrounds. The six existing background colors repeat for longer lists.

## Upgrade

No database migration or new service is required. Both fields are optional and use existing JSON storage. Old content retains generated artwork. Follow the [upgrade guide](upgrading.md) when updating an installation.
