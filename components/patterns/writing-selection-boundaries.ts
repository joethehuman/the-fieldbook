import {
  $getSelection, $isRangeSelection, $isElementNode, $isTextNode, $isRootOrShadowRoot, $isParagraphNode,
  COPY_COMMAND, CUT_COMMAND, PASTE_COMMAND, DELETE_CHARACTER_COMMAND,
  DELETE_WORD_COMMAND, DELETE_LINE_COMMAND, REMOVE_TEXT_COMMAND,
  CONTROLLED_TEXT_INSERTION_COMMAND, SELECTION_INSERT_CLIPBOARD_NODES_COMMAND,
  KEY_ENTER_COMMAND, $setSelection,
  COMMAND_PRIORITY_HIGH, type RangeSelection, type LexicalNode,
} from "lexical";
import { $isHeadingNode } from "@lexical/rich-text";
import { realmPlugin, createActiveEditorSubscription$ } from "@mdxeditor/editor";

/** Exclude neighboring blocks when a range contains none of their content. */
export function normalizeWritingSelection(selection: RangeSelection) {
  if (selection.isCollapsed() || !selection.getTextContent().replace(/\n/g, "")) return;
  const backward = selection.isBackward();
  const start = backward ? selection.focus : selection.anchor;
  const end = backward ? selection.anchor : selection.focus;
  const beginAt = (next: LexicalNode | null) => {
    if (!next) return;
    if ($isElementNode(next)) {
      const first = next.getFirstDescendant();
      if ($isTextNode(first)) start.set(first.getKey(), 0, "text");
      else if ($isElementNode(first)) start.set(first.getKey(), 0, "element");
      else start.set(next.getKey(), 0, "element");
    } else {
      const parent = next.getParent();
      if (parent) start.set(parent.getKey(), next.getIndexWithinParent(), "element");
    }
  };
  const normalizeStart = () => {
    let node: LexicalNode = start.getNode();
    if (start.type === "element" && $isElementNode(node)) {
      if ($isRootOrShadowRoot(node)) { beginAt(node.getChildAtIndex(start.offset)); return; }
      if (start.offset !== node.getChildrenSize()) return;
    } else if (start.offset !== node.getTextContentSize()) return;
    while (!$isElementNode(node) || node.isInline()) {
      if (node.getNextSibling()) return;
      const parent = node.getParent();
      if (!parent) return;
      node = parent;
    }
    let next = node.getNextSibling();
    while (!next) {
      const parent = node.getParent();
      if (!parent || $isRootOrShadowRoot(parent)) return;
      node = parent;
      next = node.getNextSibling();
    }
    beginAt(next);
  };
  normalizeStart();
  const finishAt = (previous: LexicalNode | null) => {
    if (!previous) return;
    if ($isElementNode(previous)) {
      const last = previous.getLastDescendant();
      if ($isTextNode(last)) end.set(last.getKey(), last.getTextContentSize(), "text");
      else if ($isElementNode(last)) end.set(last.getKey(), last.getChildrenSize(), "element");
      else end.set(previous.getKey(), previous.getChildrenSize(), "element");
    } else {
      const parent = previous.getParent();
      if (parent) end.set(parent.getKey(), previous.getIndexWithinParent() + 1, "element");
    }
  };
  let node: LexicalNode = end.getNode();
  if (end.type === "element" && $isElementNode(node)) {
    const next = node.getChildAtIndex(end.offset);
    if (next && $isRootOrShadowRoot(node)) {
      finishAt(next.getPreviousSibling());
      return;
    }
    if (next) node = next;
    else if (end.offset !== 0) return;
  } else if (end.offset !== 0) return;
  // Only a first-child path is a block-start boundary, including links and marks.
  while (!$isElementNode(node) || node.isInline()) {
    if (node.getPreviousSibling()) return;
    const parent = node.getParent();
    if (!parent) return;
    node = parent;
  }
  let previous = node.getPreviousSibling();
  while (!previous) {
    const parent = node.getParent();
    if (!parent || $isRootOrShadowRoot(parent)) return;
    node = parent;
    previous = node.getPreviousSibling();
  }
  finishAt(previous);
}

function blockStyle(node: LexicalNode) {
  return $isHeadingNode(node) ? node.getTag() : node.getType();
}

export const writingSelectionBoundariesPlugin = realmPlugin({
  init(realm) {
    realm.pub(createActiveEditorSubscription$, (editor) => {
      const normalize = () => {
        let selection = $getSelection();
        // Native caret/selection changes can precede Lexical's selectionchange
        // update. Use the visible range before typing, deletion or clipboard work.
        const surface = editor.getRootElement();
        const dom = surface?.ownerDocument.getSelection();
        const active = surface?.ownerDocument.activeElement;
        if ($isRangeSelection(selection) && !editor.isComposing() && surface && dom?.rangeCount &&
          active instanceof HTMLElement && active.closest('[contenteditable="true"]') === surface) {
          const range = dom.getRangeAt(0);
          if (surface.contains(range.startContainer) && surface.contains(range.endContainer)) {
            const current = selection.clone();
            try {
              current.applyDOMRange(range);
              if (dom.anchorNode !== range.startContainer || dom.anchorOffset !== range.startOffset) {
                const { key, offset, type } = current.anchor;
                current.anchor.set(current.focus.key, current.focus.offset, current.focus.type);
                current.focus.set(key, offset, type);
              }
              $setSelection(current);
              selection = current;
            } catch { /* A DOM range already replaced by a commit has no live target. */ }
          }
        }
        if ($isRangeSelection(selection)) normalizeWritingSelection(selection);
        return false; // Keep Lexical's standard clipboard, deletion and typing behavior.
      };
      const cleanup = [
        COPY_COMMAND, CUT_COMMAND, PASTE_COMMAND, DELETE_CHARACTER_COMMAND,
        DELETE_WORD_COMMAND, DELETE_LINE_COMMAND, REMOVE_TEXT_COMMAND,
        CONTROLLED_TEXT_INSERTION_COMMAND, KEY_ENTER_COMMAND,
      ].map((command) => editor.registerCommand(command, normalize, COMMAND_PRIORITY_HIGH));
      cleanup.push(editor.registerCommand(SELECTION_INSERT_CLIPBOARD_NODES_COMMAND, ({ nodes, selection }) => {
        // Older/native copies can contain an unselected, empty trailing styled block.
        // Keep meaningful blocks, blank paragraphs and empty list markers.
        const artifact = (node: LexicalNode | undefined) => $isElementNode(node) &&
          ["heading", "quote"].includes(node.getType()) && node.isEmpty();
        while (nodes.length > 1 && artifact(nodes[0])) nodes.shift();
        while (nodes.length > 1 && artifact(nodes.at(-1))) nodes.pop();
        if (!$isRangeSelection(selection)) return false;
        normalizeWritingSelection(selection);
        const last = nodes.at(-1);
        if (!last || !["paragraph", "heading", "quote", "list"].includes(last.getType())) return false;
        if (!selection.isCollapsed()) selection.removeText();
        const point = selection.anchor;
        const block = point.getNode().getTopLevelElement();
        if (!block || !["paragraph", "heading"].includes(block.getType()) || blockStyle(block) === blockStyle(last)) return false;
        // Splitting off untouched suffix text keeps it out of a pasted heading.
        // Inserting at the previous block's end then leaves that suffix as a sibling.
        const tail = selection.clone();
        const descendant = block.getLastDescendant();
        if ($isTextNode(descendant)) tail.focus.set(descendant.getKey(), descendant.getTextContentSize(), "text");
        else tail.focus.set(block.getKey(), block.getChildrenSize(), "element");
        if (!tail.getTextContent()) return false;
        const suffix = selection.insertParagraph();
        if (!suffix) return false;
        const incomingKeys = new Set(nodes.map((node) => node.getKey()));
        block.selectEnd();
        const insertion = $getSelection();
        insertion?.insertNodes(nodes);
        // Lexical may leave its temporary split paragraph after a pasted list.
        // Remove only that newly created gap, never a clipboard or existing blank line.
        const gap = suffix.getPreviousSibling();
        if ($isParagraphNode(gap) && gap.isEmpty() && gap.getKey() !== block.getKey() && !incomingKeys.has(gap.getKey())) gap.remove();
        return true;
      }, COMMAND_PRIORITY_HIGH));
      return () => cleanup.forEach((unregister) => unregister());
    });
  },
});
