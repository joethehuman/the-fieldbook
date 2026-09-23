# Writing Docs and Updates

Docs and Updates have separate **Save draft** and **Publish** actions. Saving a draft keeps the editor open and leaves the published copy unchanged. **Publish changes** replaces the published copy with the current work. **Preview draft** shows the working copy using the same Markdown renderer as readers. Unpublish remains a separate, confirmed action in the content list; it preserves the draft.

The editor shows unsaved work and save results. Cmd/Ctrl+S saves a draft, never publishes. There is no automatic draft saving. Navigation warns about unsaved work; uploads block saving and navigation until they finish. Failed saves retain the open work. If another author changed the document or the outcome of a save is uncertain, use **Review saved copy** and **Download draft** before reapplying changes. Those tools are in **More writing actions** and are also shown beside recovery errors.

The visual editor supports headings, emphasis, lists, quotes, links, tables, code blocks and images. Uploaded MP4/WebM media displays inline and remains an ordinary media link in storage. Markdown source is available for precise edits and unsupported constructs, including footnotes. Unsupported imports fall back to source and preserve the original text. Image resizing is intentionally unavailable because it would introduce HTML dimensions that the reader does not support.

Docs settings choose a navigation section. Update settings choose a category and relevant learning groups. Groups personalize recommendations, never content access. Settings collapse on narrow screens. Course and privacy authoring retain their existing Markdown editors.

## Implementation and extension

`WritingEditor` is a shared presentation pattern. It does not save, publish, authorize or upload on its own. Its owner supplies a Markdown value, change callback, busy state and the existing authorized upload handler. MDXEditor 4.2.5 provides the Lexical editing engine; the toolbar uses Fieldbook controls and MDXEditor's contextual block selector. The scoped stylesheet maps nested editor UI to Fieldbook tokens. This does not replace the shared component library.

The engine is dynamically imported with server rendering disabled inside a client component, as required by MDXEditor. Reading remains server-rendered Markdown. Keep editor plugins and Lexical imports within this lazy boundary. Root and server manifests must resolve the same editor, state and Lexical versions.

Import normalization must not mark an untouched document dirty or rewrite it when only its title changes. The compatibility guard compares Markdown syntax trees before accepting normalized imports. Unknown or incompatible content must retain its original source, never silently become an empty document. Runtime editor failures also fall back to source. The video adapter preserves the reader's existing `/api/media/*.mp4` and `.webm` link format. It does not execute MDX/JSX.

The demo upgrades existing browser work to separate draft and published snapshots without resetting profiles or content. It cannot reconstruct a historical publication already overwritten by an older demo save. The server already stores separate snapshots; this interface change requires no database migration.

Run the authoring suite after both builds. It covers existing-content round trips, formatting/undo, source fallback, repeated draft saves, publishing, unpublishing, failure recovery and pending uploads. Tests use synthetic server responses; they are not proof of hosted authentication or Storage behavior.
