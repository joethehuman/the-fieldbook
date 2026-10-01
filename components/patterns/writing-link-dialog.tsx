"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  activeEditor$,
  cancelLinkEdit$,
  linkDialogState$,
  removeLink$,
  switchFromPreviewToLinkEdit$,
  updateLink$,
  type EditLinkDialog,
} from "@mdxeditor/editor";
import { useCellValue, usePublisher } from "@mdxeditor/gurx";
import { defaultUrlTransform } from "react-markdown";
import { $addUpdateTag, SKIP_SCROLL_INTO_VIEW_TAG } from "lexical";
import { Copy, Link2Off, Pencil } from "lucide-react";
import { normalizeContentLink, contentLinkTarget } from "@/lib/content-links";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { FieldDescription } from "../ui/field";
import { Popover, PopoverAnchor, PopoverContent } from "../ui/popover";
import { FormField } from "./form-field";
import { useWritingInteraction } from "./writing-interaction";

/** Use the editor's supported dialog state/actions, but anchor in viewport space. */
export function WritingLinkDialog() {
  const state = useCellValue(linkDialogState$);
  const editor = useCellValue(activeEditor$);
  const publishState = usePublisher(linkDialogState$);
  const cancel = usePublisher(cancelLinkEdit$);
  const update = usePublisher(updateLink$);
  const edit = usePublisher(switchFromPreviewToLinkEdit$);
  const remove = usePublisher(removeLink$);
  const range = useRef<Range | null>(null);
  const virtualAnchor = useRef<{
    getBoundingClientRect: () => DOMRect;
    contextElement?: Element;
  } | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const [anchorReady, setAnchorReady] = useState(false);
  useWritingInteraction(state.type !== "inactive");

  useLayoutEffect(() => {
    const surface = editor?.getRootElement();
    if (state.type === "inactive" || !surface) {
      range.current = null;
      setAnchorReady(false);
      return;
    }
    const selection = window.getSelection();
    if (
      selection?.rangeCount &&
      surface.contains(selection.anchorNode) &&
      surface.contains(selection.focusNode)
    )
      range.current = selection.getRangeAt(0).cloneRange();
    virtualAnchor.current = {
      contextElement: surface,
      getBoundingClientRect: () => {
        const link = state.linkNodeKey
          ? editor?.getElementByKey(state.linkNodeKey)
          : null;
        if (link?.isConnected) return link.getBoundingClientRect();
        const rect = range.current?.getBoundingClientRect();
        if (rect && (rect.width || rect.height)) return rect;
        return surface.getBoundingClientRect();
      },
    };
    setCopyStatus("");
    setAnchorReady(true);
  }, [editor, state.type, state.linkNodeKey]);

  function dismiss() {
    if (state.type === "edit") cancel();
    publishState({ type: "inactive" });
  }
  const href =
    state.type === "preview"
      ? defaultUrlTransform(normalizeContentLink(state.url))
      : "";
  const target = contentLinkTarget(
    href,
    "article",
    typeof window === "undefined" ? [] : [window.location.origin],
  );
  return (
    <Popover
      open={state.type !== "inactive" && anchorReady}
      onOpenChange={(open) => {
        if (!open) dismiss();
      }}
    >
      <PopoverAnchor virtualRef={virtualAnchor} />
      <PopoverContent
        data-writing-link-dialog="true"
        aria-label={state.type === "edit" ? "Edit link" : "Link preview"}
        className="grid gap-3 p-3"
        side="bottom"
        align="start"
        updatePositionStrategy="always"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={() =>
          editor?.update(() => {
            $addUpdateTag(SKIP_SCROLL_INTO_VIEW_TAG);
            editor.focus();
          })
        }
      >
        {state.type === "edit" && (
          <LinkForm
            key={`${state.linkNodeKey}:${state.initialUrl}`}
            state={state}
            onCancel={cancel}
            onSubmit={(payload) =>
              update({ ...payload, url: normalizeContentLink(payload.url) })
            }
          />
        )}
        {state.type === "preview" && (
          <>
            <a
              className="min-w-0 break-words text-sm underline"
              href={href || undefined}
              target={target}
              rel={target ? "noopener noreferrer" : undefined}
              data-testid="link-dialog-preview"
            >
              {state.url}
              {target && <span className="sr-only"> (opens in a new tab)</span>}
            </a>
            <div
              className="flex flex-wrap gap-1"
              role="group"
              aria-label="Link actions"
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Edit link URL"
                onClick={() => edit()}
              >
                <Pencil aria-hidden="true" />
                Edit
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Copy to clipboard"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(normalizeContentLink(state.url))
                    .then(
                      () => setCopyStatus("Link copied."),
                      () =>
                        setCopyStatus(
                          "Could not copy the link. Select the address to copy it.",
                        ),
                    );
                }}
              >
                <Copy aria-hidden="true" />
                Copy
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Remove link"
                onClick={() => remove()}
              >
                <Link2Off aria-hidden="true" />
                Remove
              </Button>
            </div>
            {copyStatus && (
              <FieldDescription role="status">{copyStatus}</FieldDescription>
            )}
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

function LinkForm({
  state,
  onSubmit,
  onCancel,
}: {
  state: EditLinkDialog;
  onSubmit: (payload: { url: string; text: string; title: string }) => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState(state.url);
  const [text, setText] = useState(state.text);
  const [title, setTitle] = useState(state.title);
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    input.current?.focus({ preventScroll: true });
  }, []);
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSubmit({ url, text, title });
      }}
    >
      <FormField
        label="URL"
        description="Web addresses such as example.com use HTTPS. You can also use a relative path or heading link."
      >
        <Input
          ref={input}
          inputMode="url"
          autoComplete="off"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://example.com"
        />
      </FormField>
      {state.withAnchorText && (
        <FormField label="Anchor text">
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
        </FormField>
      )}
      <FormField label="Link title">
        <Input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </FormField>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" aria-label="Set URL">
          Save
        </Button>
      </div>
    </form>
  );
}
