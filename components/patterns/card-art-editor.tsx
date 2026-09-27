"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldDescription } from "@/components/ui/field";
import { ActionGroup } from "@/components/ui/action-group";
import { FormField } from "./form-field";
import { SelectField } from "@/components/ui/select";
import { CardArtwork } from "./card-artwork";
import type { SiteSettings } from "@/lib/settings";
import type { CardArt } from "@/lib/card-art";
import { graphemeCount, nextArtSeed, resolvedCardArt } from "@/lib/card-art";
import type { UploadMedia } from "@/components/MarkdownEditor";

export function CardArtEditor({
  id,
  title,
  kind,
  category,
  art,
  legacyCover,
  settings,
  onChange,
  onUpload,
  disabled,
  onBusyChange,
}: {
  id: string;
  title: string;
  kind: "brief" | "course" | "curriculum";
  category?: string;
  art?: CardArt;
  legacyCover?: string;
  settings?: SiteSettings;
  onChange: (art: CardArt) => void;
  onUpload?: UploadMedia;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const current = resolvedCardArt(id, title, art, legacyCover);
  const generated = current.source === "generated";
  return (
    <section className="grid gap-3" aria-label="Card artwork editor">
      <h3>Card artwork</h3>
      <FieldDescription>
        Generated designs use your Identity artwork palette. Shuffle previews a
        new design; save this item to keep it. A custom image replaces only the
        artwork above the card text.
      </FieldDescription>
      <div className="card-artwork-preview">
        <CardArtwork
          id={id}
          title={title}
          kind={kind}
          category={category}
          art={current}
          settings={settings}
        />
      </div>
      <FormField label="Artwork source">
        <SelectField
          value={current.source}
          disabled={
            disabled ||
            uploading ||
            (!onUpload && current.source === "generated")
          }
          onValueChange={(source) => {
            if (source === "generated")
              onChange({ ...current, source: "generated" });
            else if (current.imageUrl)
              onChange({ ...current, source: "upload" });
            else fileInput.current?.click();
          }}
        >
          <option value="generated">Generated</option>
          <option value="upload" disabled={!onUpload}>
            Upload image
          </option>
        </SelectField>
      </FormField>
      <FormField
        label="Short title"
        description={`Up to 40 characters. Shown within two lines on generated artwork (${graphemeCount(current.shortTitle)}/40).`}
      >
        <Input
          value={current.shortTitle}
          disabled={disabled || uploading}
          required={generated}
          aria-invalid={graphemeCount(current.shortTitle) > 40}
          onChange={(event) => {
            if (graphemeCount(event.target.value) <= 40)
              onChange({ ...current, shortTitle: event.target.value });
          }}
        />
      </FormField>
      <ActionGroup>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || uploading}
          onClick={() => {
            onChange({
              ...current,
              source: "generated",
              seed: nextArtSeed(current.seed),
            });
            setNotice("New design previewed. Save to keep it.");
          }}
        >
          Shuffle artwork
        </Button>
        {onUpload && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || uploading}
            onClick={() => fileInput.current?.click()}
          >
            {uploading
              ? "Uploading…"
              : current.imageUrl
                ? "Replace image"
                : "Upload image"}
          </Button>
        )}
        {current.imageUrl && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || uploading}
            onClick={() => {
              onChange({
                ...current,
                source: "generated",
                imageUrl: undefined,
              });
              setNotice("Image removed from the card. Save to apply.");
            }}
          >
            Remove image
          </Button>
        )}
      </ActionGroup>
      <Input
        ref={fileInput}
        hidden
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        aria-label="Upload card artwork"
        disabled={disabled || uploading || !onUpload}
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file || !onUpload) return;
          if (
            !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
              file.type,
            ) ||
            !file.size ||
            file.size > 52428800
          ) {
            setNotice(
              "Choose a JPG, PNG, WebP, or GIF image of at most 50 MB.",
            );
            return;
          }
          setUploading(true);
          onBusyChange?.(true);
          setNotice("");
          try {
            const imageUrl = await onUpload(file);
            onChange({ ...current, source: "upload", imageUrl });
            setNotice("Image uploaded. Save this item to apply it.");
          } catch (error) {
            setNotice(
              error instanceof Error
                ? error.message
                : "Upload failed. Try again.",
            );
          } finally {
            setUploading(false);
            onBusyChange?.(false);
          }
        }}
      />
      <FieldDescription>
        {onUpload
          ? "JPG, PNG, WebP or GIF, up to 50 MB. Wide images crop to fill the card."
          : "Custom image uploads are available in an installed Fieldbook. This demo saves generated artwork."}
      </FieldDescription>
      <p role="status" className="text-sm text-muted-foreground">
        {notice}
      </p>
    </section>
  );
}
