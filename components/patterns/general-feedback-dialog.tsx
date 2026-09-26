"use client";

import { useRef, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { CardFooter } from "../ui/card";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";
import { Field } from "../ui/field";
import { Textarea } from "../ui/textarea";
import { cn } from "@/lib/utils";

type Rating = "up" | "down";

export function GeneralFeedbackDialog({
  open,
  onOpenChange,
  onSave,
  returnFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (rating: Rating, comment: string) => Promise<void>;
  returnFocus: () => void;
}) {
  const [rating, setRating] = useState<Rating>();
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const busy = useRef(false);

  function setOpen(next: boolean) {
    if (busy.current && !next) return;
    if (!next) {
      setRating(undefined);
      setComment("");
      setError("");
    }
    onOpenChange(next);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rating || busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    try {
      await onSave(rating, comment.trim());
      busy.current = false;
      setOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not save feedback. Try again.",
      );
    } finally {
      busy.current = false;
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="max-w-md gap-0 p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          textarea.current?.focus();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          returnFocus();
        }}
        onInteractOutside={(event) => {
          if (pending) event.preventDefault();
        }}
        onEscapeKeyDown={(event) => {
          event.stopPropagation();
          if (pending) event.preventDefault();
        }}
      >
        <DialogTitle className="sr-only">Share feedback</DialogTitle>
        <form onSubmit={submit} aria-busy={pending}>
          <div className="flex flex-wrap items-center gap-2 px-3 py-2">
            <span className="min-w-0 flex-1 text-copy leading-snug text-muted-foreground">
              How is Fieldbook working for you?
            </span>
            <div
              className="flex shrink-0 items-center gap-1"
              role="group"
              aria-label="Rate Fieldbook"
            >
              {(["up", "down"] as const).map((value) => (
                <Button
                  key={value}
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "rounded-full text-muted-foreground",
                    rating === value &&
                      "bg-selected text-selected-foreground hover:bg-selected hover:text-selected-foreground",
                  )}
                  aria-label={value === "up" ? "Useful" : "Not useful"}
                  aria-pressed={rating === value}
                  disabled={pending}
                  onClick={() => setRating(value)}
                >
                  {value === "up" ? (
                    <ThumbsUp aria-hidden="true" />
                  ) : (
                    <ThumbsDown aria-hidden="true" />
                  )}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 px-3 pb-3">
            <Field className="sr-only" htmlFor="general-feedback-comment">
              Your feedback (optional)
            </Field>
            <Textarea
              ref={textarea}
              id="general-feedback-comment"
              rows={4}
              maxLength={2000}
              value={comment}
              onChange={(event) => setComment(event.target.value)}
              placeholder="Your feedback…"
              aria-describedby="general-feedback-help"
            />
            <p
              id="general-feedback-help"
              className="text-right text-xs text-muted-foreground"
            >
              Optional · up to 2,000 characters
            </p>
            {error && (
              <Alert variant="destructive" role="alert">
                {error}
              </Alert>
            )}
          </div>
          <CardFooter className="justify-end px-3">
            <Button
              type="submit"
              size="sm"
              loading={pending}
              disabled={!rating}
            >
              Send
            </Button>
          </CardFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
