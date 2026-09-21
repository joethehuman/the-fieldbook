# Content presentation controls

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
