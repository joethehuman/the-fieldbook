"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "../ui/button";
import { Textarea } from "../ui/textarea";
import { CardFooter } from "../ui/card";
import { Field } from "../ui/field";
import { Alert } from "../ui/alert";
import { Popover, PopoverAnchor, PopoverContent } from "../ui/popover";
import { cn } from "@/lib/utils";

type Rating = "up" | "down";
const desktopQuery = "(min-width: 640px)";
function subscribeViewport(callback: () => void) {
  const query = window.matchMedia(desktopQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

/** The caller owns persistence. Ratings save immediately; Send saves the optional comment. */
export function ContentFeedback({
  saved,
  onSave,
  disabled = false,
  expanded = false,
}: {
  saved?: { rating: Rating; comment?: string };
  onSave: (
    rating: Rating,
    comment: string,
    submissionId: string,
  ) => void | string | Promise<void | string>;
  disabled?: boolean;
  expanded?: boolean;
}) {
  const desktop = useSyncExternalStore(
    subscribeViewport,
    () => window.matchMedia(desktopQuery).matches,
    () => false,
  );
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<Rating | undefined>(saved?.rating);
  const [comment, setComment] = useState(saved?.comment || "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const busy = useRef(false);
  const submissionId = useRef<string | null>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const id = useId();

  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !desktop) textarea.current?.focus();
    if (!open && wasOpen.current) trigger.current?.focus();
    wasOpen.current = open;
  }, [open, desktop]);

  function reset() {
    submissionId.current = null;
    setRating(undefined);
    setComment("");
    setError("");
  }
  function close() {
    setOpen(false);
    reset();
  }
  async function persist(next: Rating, text: string, finish: boolean) {
    if (busy.current || disabled) return;
    busy.current = true;
    setPending(true);
    setError("");
    setStatus("");
    try {
      submissionId.current ||= crypto.randomUUID();
      const savedId = await onSave(next, text.trim(), submissionId.current);
      if (savedId) submissionId.current = savedId;
      setStatus(
        finish
          ? "Feedback saved."
          : "Rating saved. You can add an optional comment.",
      );
      if (finish) {
        if (expanded) reset();
        else close();
      }
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
  function choices(inPanel: boolean) {
    return (["up", "down"] as const).map((value) => (
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
        aria-expanded={inPanel ? undefined : open}
        aria-controls={inPanel ? undefined : `${id}-panel`}
        disabled={disabled || pending}
        onClick={(event) => {
          if (!inPanel) trigger.current = event.currentTarget;
          setRating(value);
          setOpen(true);
          void persist(value, comment, false);
        }}
      >
        {value === "up" ? (
          <ThumbsUp aria-hidden="true" />
        ) : (
          <ThumbsDown aria-hidden="true" />
        )}
      </Button>
    ));
  }
  const panel = (
    <form
      id={`${id}-panel`}
      aria-label={expanded ? "Course feedback" : "Did you find this useful?"}
      aria-busy={pending}
      className={cn(
        "flex min-w-0 flex-col",
        desktop &&
          !expanded &&
          "max-h-[min(calc(100dvh-1.5rem),var(--radix-popover-content-available-height))]",
      )}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !desktop && !expanded) {
          event.preventDefault();
          if (!busy.current) close();
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (rating) void persist(rating, comment, true);
      }}
    >
      <div
        data-slot="feedback-fields"
        className="min-h-0 overflow-y-auto overscroll-y-contain"
      >
        <div className="flex flex-wrap items-center gap-2 px-3 py-2">
          <span className="min-w-0 flex-1 text-copy leading-snug text-muted-foreground">
            Did you find this useful?
          </span>
          <div
            className="flex shrink-0 items-center gap-1"
            role="group"
            aria-label="Rate this content"
          >
            {choices(true)}
          </div>
        </div>
        <div className="grid gap-3 px-3 pb-3">
          <Field className="sr-only" htmlFor={`${id}-comment`}>
            Your feedback (optional)
          </Field>
          <Textarea
            ref={textarea}
            id={`${id}-comment`}
            rows={4}
            maxLength={2000}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Your feedback…"
            aria-describedby={`${id}-help`}
          />
          <p
            id={`${id}-help`}
            className="text-right text-xs text-muted-foreground"
          >
            Optional · up to 2,000 characters
          </p>
          {error && (
            <Alert variant="destructive" role="alert" onDismiss={() => setError("")}>
              {error}
            </Alert>
          )}
        </div>
      </div>
      <CardFooter className="shrink-0 justify-end px-3">
        {!desktop && !expanded && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            className="mr-auto"
            onClick={close}
          >
            Close
          </Button>
        )}
        <Button
          type="submit"
          size="sm"
          loading={pending}
          disabled={!rating || disabled}
        >
          Send
        </Button>
      </CardFooter>
    </form>
  );
  if (expanded)
    return (
      <section aria-label="Content feedback" className="w-full min-w-0">
        <div className="rounded-lg border border-border bg-background">
          {panel}
        </div>
        <p role="status" className="mt-2 text-copy text-muted-foreground">
          {status}
        </p>
      </section>
    );
  return (
    <section
      aria-label="Content feedback"
      className="flex min-w-0 flex-col items-center"
    >
      <Popover
        open={desktop && open}
        onOpenChange={(next) => {
          if (busy.current) return;
          if (next) setOpen(true);
          else close();
        }}
      >
        <PopoverAnchor asChild>
          <div
            className={cn(
              "flex w-full max-w-full min-w-0 items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 shadow-sm sm:w-fit",
              !desktop && open && "hidden",
            )}
          >
            <Button
              type="button"
              variant="ghost"
              className="h-auto min-h-9 min-w-0 flex-1 justify-start whitespace-normal rounded-full py-1.5 text-left leading-snug font-normal text-muted-foreground sm:flex-initial"
              disabled={disabled}
              aria-expanded={open}
              aria-controls={`${id}-panel`}
              onClick={(event) => {
                trigger.current = event.currentTarget;
                setOpen(true);
              }}
            >
              Did you find this useful?
            </Button>
            <div
              className="flex shrink-0 gap-1"
              role="group"
              aria-label="Rate this content"
            >
              {choices(false)}
            </div>
          </div>
        </PopoverAnchor>
        {desktop && (
          <PopoverContent
            side="top"
            className="overflow-hidden p-0 pe-0 [scrollbar-gutter:auto]"
            aria-label="Did you find this useful?"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              textarea.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              trigger.current?.focus();
            }}
          >
            {panel}
          </PopoverContent>
        )}
      </Popover>
      {!desktop && open && (
        <div className="w-full rounded-lg border border-border bg-background shadow-sm">
          {panel}
        </div>
      )}
      <p role="status" className="sr-only">
        {status}
      </p>
    </section>
  );
}
