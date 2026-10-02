"use client";
import { ArrowUp, Square } from "lucide-react";
import { Button } from "../ui/button";
import { Field } from "../ui/field";
import { Textarea } from "../ui/textarea";

/** A multiline field with an embedded action; the group owns its focus ring. */
export function MessageComposer({
  id,
  label,
  value,
  onValueChange,
  onSend,
  onStop,
  busy,
  maxLength,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  busy: boolean;
  maxLength?: number;
  placeholder?: string;
}) {
  return (
    <form
      data-slot="message-composer"
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy) onSend();
      }}
    >
      <Field htmlFor={id} className="sr-only">
        {label}
      </Field>
      <div
        data-slot="message-composer-field"
        className="relative rounded-control border border-control-border bg-background transition-colors motion-reduce:transition-none hover:border-control-hover focus-within:border-ring focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background"
      >
        <Textarea
          id={id}
          variant="embedded"
          size="compact"
          rows={2}
          className="block max-h-40 overflow-y-auto pe-14 [field-sizing:content]"
          maxLength={maxLength}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing &&
              event.keyCode !== 229
            ) {
              event.preventDefault();
              if (!event.repeat && !busy) onSend();
            }
          }}
        />
        <Button
          type={busy ? "button" : "submit"}
          variant={busy ? "outline" : "default"}
          size="icon"
          className="absolute bottom-2 right-2 rounded-full"
          aria-label={busy ? "Stop response" : "Ask AI"}
          title={busy ? "Stop response" : "Ask AI"}
          disabled={!busy && !value.trim()}
          onClick={
            busy
              ? (event) => {
                  event.preventDefault();
                  onStop();
                }
              : undefined
          }
        >
          {busy ? (
            <Square aria-hidden="true" />
          ) : (
            <ArrowUp aria-hidden="true" />
          )}
        </Button>
      </div>
    </form>
  );
}
