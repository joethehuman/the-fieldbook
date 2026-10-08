"use client";

import { Alert } from "../ui/alert";
import { useEffect, useRef, useState } from "react";
import { useCellValue, usePublisher } from "@mdxeditor/gurx";
import {
  activeEditor$,
  rootEditor$,
  readOnly$,
  imageDialogState$,
  imageUploadHandler$,
  openEditImageDialog$,
  closeImageDialog$,
  saveImage$,
} from "@mdxeditor/editor";
import { $getNodeByKey } from "lexical";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Field, FieldDescription } from "../ui/field";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { WritingBlockActions, blockActions } from "./writing-block-actions";
import { useWritingInteraction } from "./writing-interaction";

type ImageTools = {
  nodeKey: string;
  imageSource: string;
  initialImagePath: string | null;
  title: string;
  alt: string;
  width?: number | "inherit";
  height?: number | "inherit";
};
export function WritingImageToolbar(props: Partial<ImageTools>) {
  const active = useCellValue(activeEditor$);
  const root = useCellValue(rootEditor$);
  let editor = active;
  root?.getEditorState().read(() => {
    if (props.nodeKey && $getNodeByKey(props.nodeKey)) editor = root;
  });
  const activate = usePublisher(activeEditor$);
  const disabled = useCellValue(readOnly$);
  const edit = usePublisher(openEditImageDialog$);
  if (!editor || !props.nodeKey) return null;
  return (
    <WritingBlockActions
      label="Image"
      disabled={disabled}
      {...blockActions(editor, props.nodeKey)}
      onEdit={() => {
        activate(editor);
        edit({
          nodeKey: props.nodeKey!,
          initialValues: {
            src: props.initialImagePath ?? props.imageSource,
            altText: props.alt || "",
            title: props.title || "",
            width: typeof props.width === "number" ? props.width : undefined,
            height: typeof props.height === "number" ? props.height : undefined,
          },
        });
      }}
    />
  );
}

export function WritingImageDialog() {
  const state = useCellValue(imageDialogState$);
  const upload = useCellValue(imageUploadHandler$);
  const readOnly = useCellValue(readOnly$);
  const close = usePublisher(closeImageDialog$);
  const save = usePublisher(saveImage$);
  const [src, setSrc] = useState("");
  const [alt, setAlt] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  useWritingInteraction(state.type !== "inactive");
  useEffect(() => {
    if (state.type === "inactive") return;
    setSrc(state.type === "editing" ? state.initialValues.src || "" : "");
    setAlt(state.type === "editing" ? state.initialValues.altText || "" : "");
    setTitle(state.type === "editing" ? state.initialValues.title || "" : "");
    setError("");
  }, [state]);
  return (
    <Dialog
      open={state.type !== "inactive"}
      onOpenChange={(open) => {
        if (!open && !busy) close();
      }}
    >
      <DialogContent
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onInteractOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogTitle>
          {state.type === "editing" ? "Image settings" : "Add image"}
        </DialogTitle>
        <DialogDescription>
          Choose the image and describe it for readers using assistive
          technology.
        </DialogDescription>
        <Field>
          Image URL
          <Input
            value={src}
            disabled={busy || readOnly}
            onChange={(event) => setSrc(event.target.value)}
          />
        </Field>
        {upload && (
          <>
            <Input
              ref={file}
              type="file"
              accept="image/*"
              hidden
              onChange={async (event) => {
                const chosen = event.target.files?.[0];
                event.target.value = "";
                if (!chosen) return;
                setBusy(true);
                setError("");
                try {
                  setSrc(await upload(chosen));
                } catch (err) {
                  setError((err as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={busy || readOnly}
              onClick={() => file.current?.click()}
            >
              {busy ? "Uploading…" : "Replace from device"}
            </Button>
          </>
        )}
        <Field>
          Alternative text
          <Input
            value={alt}
            disabled={busy || readOnly}
            onChange={(event) => setAlt(event.target.value)}
          />
          <FieldDescription>
            Describe what matters in this image.
          </FieldDescription>
        </Field>
        <Field>
          Title (optional)
          <Input
            value={title}
            disabled={busy || readOnly}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        {error && (
          <Alert variant="destructive" onDismiss={() => setError("")}>{error}</Alert>
        )}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => close()}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy || readOnly || !src.trim()}
            onClick={() => {
              if (!/^(https?:\/\/|\/[^/]|data:image\/)/i.test(src.trim())) {
                setError("Use an image URL or upload a file.");
                return;
              }
              save({ src: src.trim(), altText: alt, title });
            }}
          >
            Save image
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
