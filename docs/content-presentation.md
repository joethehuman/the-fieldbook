# Content presentation controls

## Save, leave and recover

Content changes are saved only when you choose **Save draft** or **Save & publish**. Uploading a file does not save its content reference. Keep the editor open until the upload finishes, then save. While an upload or save is pending, editing, saving and in-app navigation are blocked so the returned reference cannot land in a removed lesson or closed editor. Failed uploads keep the existing text or media reference; choose the file again to retry.

Leaving edited content asks whether to discard it. **Cancel** keeps the editor and its changes. Save first if you want to keep them. Browser reload/close uses the browser's own unsaved-change warning; browsers may suppress that warning, and it cannot protect against crashes or forced closure. There is no automatic draft backup.

If saving fails, the editor stays open. **Download draft** saves the current content as a JSON recovery copy on your device; it can contain private draft text and quiz answers. It does not download the media files or publish anything. Use the copy to compare and manually reapply edits; there is no draft-import button.

**Review saved copy** fetches the current state and asks before replacing your open edits. Download first if you need both versions. A revision conflict does not overwrite another author's work. If the connection fails, the last write may have reached the server; if saving succeeded but refreshing failed, the message says so. Review the saved copy before retrying. Multi-item operations can partially succeed; their error reports how many writes were confirmed and refreshes the saved state when possible. Writes are not automatically replayed. If sign-in expires or account access changes, recovery keeps the editor open so you can download your edits before signing in again.

Section creation and learning-group changes save separately from content. Discarding content edits does not undo those saved changes.

## Docs sections

Go to **Manage organization → Organization Settings → Docs navigation** to create and organize top-level sections and their subsections. Each level can contain documents. Use the placement control to move a subsection to another parent or promote it. A top-level section can become a subsection after its own children have been moved. Use the up/down buttons to reorder siblings, then **Save settings**. Move documents and subsections before deleting a populated section.

Empty sections remain available to administrators and in the editor; readers see only branches with published documents. The Docs sidebar, overview and previous/next links use the same order. Documents directly in a section appear before its subsections. Existing flat sections remain top-level.

In the document editor, **Organization → Section** has one searchable picker with full paths, such as **Getting started → Installation**. **Create section** accepts a name and optional top-level parent, saves the new section separately, and selects it. Save the document to keep its placement. Canceling document edits does not delete a created section. A new document starts without a selected section.

Section IDs and order live in optional `docSections` settings JSON; documents may reference a section ID. Legacy category and folder values remain readable without rewriting documents. Saving a hierarchy with an existing folder deeper than a subsection reports the affected document and path. No database migration or additional dependency is required.

## Course covers

In the course editor, **Course details → Course cover** lets an admin upload or replace an image. **Remove cover** restores generated artwork. Save the course to keep the choice; publish it to change the public card. A saved draft does not replace the published cover.

Accepted formats are JPG, PNG, WebP and GIF. The upload limit is 50 MB or the installation's lower configured limit. Wide images are recommended: covers crop from the center to fill the card. Category, play indicator and duration remain overlaid. A failed image load falls back to generated artwork.

The optional `coverImageUrl` field references existing private `fieldbook-media` storage. Production rejects external cover URLs, unfinished uploads and video files used as covers. Existing short-lived media URLs and published-content access checks apply. Removing or replacing a cover changes the course reference; it does not delete the storage object, which could be used elsewhere. Installation operators remain responsible for storage management.

The browser-local demo displays covers already present in its data but does not upload files. Upload controls are available in the production application through its authorized upload handler.

## Updates

Updates retain their most-recently-updated ordering and featured first card. Decorative position numbers have been removed. Other cards stack artwork and text from the top, so different summary lengths do not offset their backgrounds. The six existing background colors repeat for longer lists.

## Upgrade

No database migration or new service is required. Both fields are optional and use existing JSON storage. Old content retains generated artwork. Follow the [upgrade guide](upgrading.md) when updating an installation.
