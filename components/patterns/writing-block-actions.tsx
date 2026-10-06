"use client";

import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  $createParagraphNode,
  $getNodeByKey,
  HISTORY_PUSH_TAG,
  type LexicalEditor,
} from "lexical";
import { Button } from "../ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useWritingInteraction } from "./writing-interaction";

export function blockActions(editor: LexicalEditor, nodeKey: string) {
  return {
    onRemove: () =>
      editor.update(
        () => {
          const node = $getNodeByKey(nodeKey);
          if (!node) return;
          node.selectPrevious();
          node.remove();
        },
        { tag: HISTORY_PUSH_TAG },
      ),
    onParagraph: (direction: "before" | "after") =>
      editor.update(
        () => {
          const node = $getNodeByKey(nodeKey)?.getTopLevelElementOrThrow();
          if (!node) return;
          const paragraph = $createParagraphNode();
          if (direction === "before") node.insertBefore(paragraph);
          else node.insertAfter(paragraph);
          paragraph.select();
        },
        { tag: HISTORY_PUSH_TAG },
      ),
  };
}

/** One quiet, keyboard-accessible action menu for every non-text block. */
export function WritingBlockActions({
  label,
  disabled,
  onEdit,
  onRemove,
  onParagraph,
}: {
  label: string;
  disabled?: boolean;
  onEdit?: () => void;
  onRemove: () => void;
  onParagraph?: (direction: "before" | "after") => void;
}) {
  const [open, setOpen] = useState(false);
  const acted = useRef(false);
  function run(action: () => void) {
    acted.current = true;
    action();
  }
  useWritingInteraction(open);
  return (
    <span className="writing-block-actions" contentEditable={false}>
      <DropdownMenu
        open={open}
        onOpenChange={(next) => {
          if (next) acted.current = false;
          setOpen(next);
        }}
        modal={false}
      >
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`${label} actions`}
            disabled={disabled}
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          onCloseAutoFocus={(event) => {
            if (acted.current) event.preventDefault();
          }}
        >
          {onEdit && (
            <DropdownMenuItem onSelect={() => run(onEdit)}>
              <Pencil className="size-4" />
              Edit {label.toLowerCase()}
            </DropdownMenuItem>
          )}
          {onParagraph && (
            <>
              <DropdownMenuItem
                onSelect={() => run(() => onParagraph("before"))}
              >
                <ArrowUp className="size-4" />
                Write before {label.toLowerCase()}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => run(() => onParagraph("after"))}
              >
                <ArrowDown className="size-4" />
                Write after {label.toLowerCase()}
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem onSelect={() => run(onRemove)}>
            <Trash2 className="size-4" />
            Remove {label.toLowerCase()}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}
