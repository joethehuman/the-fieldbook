# Content presentation controls

## Save, leave and recover

Content changes are saved only when you choose **Save draft** or **Save & publish**. Uploading a file does not save its content reference. Keep the editor open until the upload finishes, then save. While an upload or save is pending, editing, saving and in-app navigation are blocked so the returned reference cannot land in a removed lesson or closed editor. Failed uploads keep the existing text or media reference; choose the file again to retry.

Leaving edited content asks whether to discard it. **Cancel** keeps the editor and its changes. Save first if you want to keep them. Browser reload/close uses the browser's own unsaved-change warning; browsers may suppress that warning, and it cannot protect against crashes or forced closure. There is no automatic draft backup.

If saving fails, the editor stays open. **Download draft** saves the current content as a JSON recovery copy on your device; it can contain private draft text and quiz answers. It does not download the media files or publish anything. Use the copy to compare and manually reapply edits; there is no draft-import button.

**Review saved copy** fetches the current state and asks before replacing your open edits. Download first if you need both versions. A revision conflict does not overwrite another author's work. If the connection fails, the last write may have reached the server; if saving succeeded but refreshing failed, the message says so. Review the saved copy before retrying. Multi-item operations can partially succeed; their error reports how many writes were confirmed and refreshes the saved state when possible. Writes are not automatically replayed. If sign-in expires or account access changes, recovery keeps the editor open so you can download your edits before signing in again.

Section creation and learning-group changes save separately from content. Discarding content edits does not undo those saved changes.

## Docs section order

Go to **Manage organization → Organization Settings → Docs navigation**. Drag a section by its handle, use the arrow buttons, or focus its handle and press the up/down arrow keys. Select **Save settings** to keep the order. The Docs sidebar and overview share that order.

Use **New section name → Create section** to add an empty section, then save settings. Empty sections stay available to administrators and in the content editor, but readers only see sections containing visible published documents. Existing document categories are included automatically; unsaved categories append alphabetically after saved sections.

In the document editor, **Organization → Section** lists all existing sections. **Create new section…** saves a section immediately and selects it; save the document separately to keep its selection. Canceling the document does not delete a created section. The simplified editor no longer exposes folder-path entry. Existing folder data and reader folder navigation are preserved.

The shared section list and order use optional `docCategoryOrder` in the existing settings JSON, with administrator authorization and revision conflict checks. No migration or additional dependency is required.

## Course covers

In the course editor, **Course details → Course cover** lets an admin upload or replace an image. **Remove cover** restores generated artwork. Save the course to keep the choice; publish it to change the public card. A saved draft does not replace the published cover.

Accepted formats are JPG, PNG, WebP and GIF. The upload limit is 50 MB or the installation's lower configured limit. Wide images are recommended: covers crop from the center to fill the card. Category, play indicator and duration remain overlaid. A failed image load falls back to generated artwork.

The optional `coverImageUrl` field references existing private `fieldbook-media` storage. Production rejects external cover URLs, unfinished uploads and video files used as covers. Existing short-lived media URLs and published-content access checks apply. Removing or replacing a cover changes the course reference; it does not delete the storage object, which could be used elsewhere. Installation operators remain responsible for storage management.

The browser-local demo displays covers already present in its data but does not upload files. Upload controls are available in the production application through its authorized upload handler.

## Updates

Updates retain their most-recently-updated ordering and featured first card. Decorative position numbers have been removed. Other cards stack artwork and text from the top, so different summary lengths do not offset their backgrounds. The six existing background colors repeat for longer lists.

## Upgrade

No database migration or new service is required. Both fields are optional and use existing JSON storage. Old content retains generated artwork. Follow the [upgrade guide](upgrading.md) when updating an installation.
