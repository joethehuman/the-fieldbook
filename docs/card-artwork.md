# Card artwork

Updates, Courses and Curricula share a code-driven artwork generator. It renders SVG lines and shapes without an AI service, image API, or per-card raster files. The generated artwork is part of the card interface, not an Open Graph sharing image.

## Authoring

In the Update or Course editor, or in the Curriculum manager, open **Card artwork**. Enter a short title of at most 40 displayed characters for generated art. It can differ from the full title, which remains ordinary card text below the art with the description. **Shuffle artwork** changes the local preview; save the item to keep the new design. Draft changes to Updates and Courses do not change their published cards until they are published.

In an installed Fieldbook, an administrator may upload a JPG, PNG, WebP, or GIF image of up to 50 MB. A custom image replaces only the art area. It uses the existing private media upload path and must be ready before the item can be saved. The browser-local demo saves generated artwork; it does not upload files. Switching back to Generated restores the short title and selected design. Removing or replacing a card image does not delete older media files. Existing Course covers remain valid card images and video posters; a later generated card choice does not remove that poster.

## Installation palette

**Administration → Organization settings → Identity → Card artwork** offers **Follow installation accent** (the default), eight presets, and **Custom three colors**. Custom colors are Primary / canvas, Accent 1 / lines, and Accent 2 / highlights, each a six-digit hex color. Follow accent derives all three colors from the saved installation accent. Changing the palette recolors generated art across the installation while preserving each card's composition. Uploaded images retain their own colors. The generator derives light and dark backgrounds from the palette and places a soft contrast fade behind short titles.

## Compatibility

Each generated item stores a seed and generator version. Older items without artwork settings receive a stable design based on their ID and a shortened title; they do not need a data rewrite. The server validates saved artwork and palette fields. No database migration is required because content, curricula, and settings already use JSON fields. The admin MCP continues to accept older payloads without artwork fields. Private image access follows the installation's existing authentication and publication rules.
