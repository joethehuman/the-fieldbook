"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import {
  externalLinkLabelError,
  externalLinkUrlError,
  maxExternalLinks,
  maxExternalLinkLabelLength,
  maxExternalLinkUrlLength,
  type ExternalLink,
} from "@/lib/external-links";
import { TextField } from "./patterns/text-field";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { ActionGroup } from "./ui/action-group";
import { FieldDescription, FieldGroup } from "./ui/field";

export function ExternalLinksSettings({
  links,
  disabled,
  showErrors,
  onChange,
}: {
  links: ExternalLink[];
  disabled: boolean;
  showErrors: boolean;
  onChange: (links: ExternalLink[]) => void;
}) {
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const addButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focusId === null) return;
    if (focusId)
      document.getElementById(`external-link-${focusId}-label`)?.focus();
    else addButton.current?.focus();
    setFocusId(null);
  }, [focusId, links]);
  const touch = (key: string) =>
    setTouched((current) => new Set(current).add(key));
  const update = (id: string, patch: Partial<ExternalLink>) =>
    onChange(
      links.map((link) => (link.id === id ? { ...link, ...patch } : link)),
    );
  const move = (index: number, destination: number) => {
    const next = [...links];
    next.splice(destination, 0, next.splice(index, 1)[0]);
    onChange(next);
    setAnnouncement(`Link moved to position ${destination + 1}.`);
  };
  return (
    <div className="grid min-w-0 gap-4">
      <FieldDescription id="external-links-tip">
        Tip: use short, clear labels like Product docs or Learning portal. Links
        appear in this order and open in a new tab.
      </FieldDescription>
      {links.map((link, index) => {
        const prefix = `external-link-${link.id}`;
        const name = link.label.trim() || `link ${index + 1}`;
        return (
          <Card
            key={link.id}
            aria-labelledby={`${prefix}-heading`}
            className="grid gap-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 id={`${prefix}-heading`} className="text-sm font-semibold">
                Link {index + 1}
              </h4>
              <ActionGroup>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled || index === 0}
                  aria-label={`Move ${name} up`}
                  onClick={() => move(index, index - 1)}
                >
                  <ArrowUp aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled || index === links.length - 1}
                  aria-label={`Move ${name} down`}
                  onClick={() => move(index, index + 1)}
                >
                  <ArrowDown aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={disabled}
                  aria-label={`Remove ${name}`}
                  onClick={() => {
                    const next = links.filter((entry) => entry.id !== link.id);
                    onChange(next);
                    setFocusId(
                      next[Math.min(index, next.length - 1)]?.id || "",
                    );
                    setAnnouncement(
                      "Link removed. Save settings to apply the change.",
                    );
                  }}
                >
                  <Trash2 aria-hidden="true" />
                </Button>
              </ActionGroup>
            </div>
            <FieldGroup disabled={disabled} className="grid gap-4">
              <TextField
                id={`${prefix}-label`}
                label="Label"
                required
                maxLength={maxExternalLinkLabelLength}
                value={link.label}
                placeholder="Product docs"
                description="Up to 40 characters."
                error={
                  showErrors || touched.has(`${link.id}-label`)
                    ? externalLinkLabelError(link.label)
                    : undefined
                }
                onBlur={() => touch(`${link.id}-label`)}
                onInvalid={() => touch(`${link.id}-label`)}
                onChange={(event) =>
                  update(link.id, { label: event.target.value })
                }
              />
              <TextField
                id={`${prefix}-url`}
                label="URL"
                type="url"
                required
                maxLength={maxExternalLinkUrlLength}
                value={link.url}
                placeholder="https://example.com/docs"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                aria-describedby="external-links-tip"
                error={
                  showErrors || touched.has(`${link.id}-url`)
                    ? externalLinkUrlError(link.url)
                    : undefined
                }
                onBlur={() => touch(`${link.id}-url`)}
                onInvalid={() => touch(`${link.id}-url`)}
                onChange={(event) =>
                  update(link.id, { url: event.target.value })
                }
              />
            </FieldGroup>
          </Card>
        );
      })}
      <ActionGroup>
        <Button
          ref={addButton}
          type="button"
          variant="outline"
          disabled={disabled || links.length >= maxExternalLinks}
          aria-describedby="external-links-count"
          onClick={() => {
            if (links.length >= maxExternalLinks) return;
            const id = crypto.randomUUID();
            onChange([...links, { id, label: "", url: "" }]);
            setFocusId(id);
          }}
        >
          <Plus aria-hidden="true" /> Add link
        </Button>
        <FieldDescription id="external-links-count">
          {links.length} of {maxExternalLinks} links
          {links.length === maxExternalLinks ? " — limit reached." : "."}
        </FieldDescription>
      </ActionGroup>
      <span className="sr-only" role="status">
        {announcement}
      </span>
    </div>
  );
}
