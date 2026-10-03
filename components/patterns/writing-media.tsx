"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { CourseVideo } from "./course-video";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Field } from "../ui/field";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../ui/dialog";
import { videoSource } from "@/lib/video";

/** Playback remains interactive; editing actions appear on hover or keyboard focus. */
export function WritingMediaVideo({
  url,
  label = "Video",
  disabled,
  onChange,
  onRemove,
  onParagraph,
}: {
  url: string;
  label?: string;
  disabled?: boolean;
  onChange: (url: string) => void;
  onRemove: () => void;
  onParagraph?: (direction: "before" | "after") => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(url);
  const [error, setError] = useState("");
  return (
    <span className="writing-media-block" contentEditable={false}>
      <CourseVideo key={url} url={url} title={label} allowTheater={false} />
      <span
        className="writing-media-actions"
        role="group"
        aria-label="Video editing controls"
      >
        {onParagraph && (
          <>
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="Write before video"
              disabled={disabled}
              onClick={() => onParagraph("before")}
            >
              <ArrowUp />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="outline"
              aria-label="Write after video"
              disabled={disabled}
              onClick={() => onParagraph("after")}
            >
              <ArrowDown />
            </Button>
          </>
        )}
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Edit video"
          disabled={disabled}
          onClick={() => {
            setDraft(url);
            setError("");
            setEditing(true);
          }}
        >
          <Pencil />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="outline"
          aria-label="Remove video"
          disabled={disabled}
          onClick={onRemove}
        >
          <Trash2 />
        </Button>
      </span>
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogTitle>Edit video</DialogTitle>
          <DialogDescription>
            Replace the video link. Your surrounding lesson content stays in
            place.
          </DialogDescription>
          <Field>
            Video URL
            <Input
              aria-label="Video URL"
              type="url"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </Field>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditing(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={disabled}
              onClick={() => {
                if (!videoSource(draft.trim())) {
                  setError(
                    "Use a supported HTTPS YouTube, Vimeo, Loom, MP4, or WebM URL.",
                  );
                  return;
                }
                onChange(draft.trim());
                setEditing(false);
              }}
            >
              Save video
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </span>
  );
}
