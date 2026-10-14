import { createActiveEditorSubscription$, realmPlugin } from "@mdxeditor/editor";
import {
  $addUpdateTag,
  BEFORE_INPUT_COMMAND,
  INPUT_COMMAND,
  CONTROLLED_TEXT_INSERTION_COMMAND,
  INSERT_PARAGRAPH_COMMAND,
  INSERT_LINE_BREAK_COMMAND,
  COMPOSITION_END_COMMAND,
  PASTE_COMMAND,
  UNDO_COMMAND,
  REDO_COMMAND,
  KEY_DOWN_COMMAND,
  COMMAND_PRIORITY_CRITICAL,
  SKIP_SCROLL_INTO_VIEW_TAG,
} from "lexical";
import { createDesktopWritingScroll, readDesktopWritingCaret } from "./desktop-writing-scroll";
import { touchWritingQuery } from "./use-editor-cards-layout";

/** Own desktop keyboard/input reveal through Lexical's supported subscriptions. */
export const writingDesktopScrollPlugin = realmPlugin<{ canvas: boolean }>({
  init(realm, params) {
    if (!params?.canvas) return;
    realm.pub(createActiveEditorSubscription$, editor => {
      if (window.matchMedia(touchWritingQuery).matches) return () => {};
      let scroll: ReturnType<typeof createDesktopWritingScroll> = null;
      let editing = false;
      const unregisterRoot = editor.registerRootListener(surface => {
        scroll?.destroy();
        scroll = surface ? createDesktopWritingScroll(surface, () => editor.isComposing() ? null : readDesktopWritingCaret(surface)) : null;
      });
      function reveal() {
        if (!editor.isEditable() || !scroll?.active()) return false;
        editing = true;
        // The desktop extension places this caret; Lexical's ordinary reveal
        // remains unchanged for pointer selection, menus, and mobile input.
        $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
        return false;
      }
      const commands = [BEFORE_INPUT_COMMAND, INPUT_COMMAND, CONTROLLED_TEXT_INSERTION_COMMAND,
        INSERT_PARAGRAPH_COMMAND, INSERT_LINE_BREAK_COMMAND, COMPOSITION_END_COMMAND,
        PASTE_COMMAND, UNDO_COMMAND, REDO_COMMAND];
      const unregister = commands.map(command => editor.registerCommand(command, reveal, COMMAND_PRIORITY_CRITICAL));
      unregister.push(editor.registerCommand(KEY_DOWN_COMMAND, event => {
        if (event.isComposing || event.shiftKey || !["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(event.key)) return false;
        return reveal();
      }, COMMAND_PRIORITY_CRITICAL));
      unregister.push(editor.registerUpdateListener(() => {
        if (!editing) return;
        editing = false;
        scroll?.schedule();
      }));
      return () => {
        unregisterRoot();
        unregister.forEach(dispose => dispose());
        scroll?.destroy();
      };
    });
  },
});
