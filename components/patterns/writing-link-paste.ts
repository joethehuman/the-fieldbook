import {
  createActiveEditorSubscription$,
  realmPlugin,
} from "@mdxeditor/editor";
import { TOGGLE_LINK_COMMAND } from "@lexical/link";
import {
  $addUpdateTag,
  $getSelection,
  $isElementNode,
  $isRangeSelection,
  $isTextNode,
  COMMAND_PRIORITY_LOW,
  HISTORY_PUSH_TAG,
  PASTE_COMMAND,
} from "lexical";
import { normalizeContentLink } from "@/lib/content-links";

/** Wrap selected prose without replacing its text or changing manual link editing. */
export const writingLinkPastePlugin = realmPlugin({
  init(realm) {
    realm.pub(createActiveEditorSubscription$, (editor) =>
      editor.registerCommand(
        PASTE_COMMAND,
        (event) => {
          const selection = $getSelection();
          if (
            !editor.isEditable() ||
            !$isRangeSelection(selection) ||
            selection.isCollapsed()
          )
            return false;
          if (
            !(event instanceof ClipboardEvent) ||
            !event.clipboardData ||
            event.clipboardData.files.length
          )
            return false;

          const value = event.clipboardData.getData("text/plain").trim();
          const url = normalizeContentLink(value);
          if (!/^https?:\/\//i.test(url) || /\s/.test(url)) return false;
          try {
            if (!new URL(url).hostname) return false;
          } catch {
            return false;
          }

          // Leave code and media selections to normal paste.
          if (
            selection
              .getNodes()
              .some((node) =>
                $isTextNode(node)
                  ? !node.isSimpleText() || node.hasFormat("code")
                  : !$isElementNode(node),
              )
          )
            return false;
          $addUpdateTag(HISTORY_PUSH_TAG);
          editor.dispatchCommand(TOGGLE_LINK_COMMAND, url);
          event.preventDefault();
          return true;
        },
        COMMAND_PRIORITY_LOW,
      ),
    );
  },
});
