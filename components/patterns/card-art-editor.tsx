"use client";

import { useRef, useState } from "react";
import type { UploadProgress } from "@/lib/upload-media";
import { MediaUploadStatus } from "./media-upload-status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldDescription } from "@/components/ui/field";
import { ActionGroup } from "@/components/ui/action-group";
import { FormField } from "./form-field";
import { SelectField } from "@/components/ui/select";
import { CardArtwork } from "./card-artwork";
import type { SiteSettings } from "@/lib/settings";
import type { CardArt } from "@/lib/card-art";
import {
  CARD_ART_VERSION,
  graphemeCount,
  randomArtSeed,
  resolvedCardArt,
} from "@/lib/card-art";
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
  saveMode = "manual",
  shortTitleId,
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
  saveMode?: "manual" | "automatic";
  shortTitleId?: string;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const shuffleHistory = useRef<{ id: string; seeds: number[] }>({
    id,
    seeds: [],
  });
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [notice, setNotice] = useState("");
  const current = resolvedCardArt(id, title, art, legacyCover);
  const generated = current.source === "generated";
  return (
    <section className="grid gap-3" aria-label="Card artwork editor">
      <h3 className={saveMode === "automatic" ? "text-sm font-semibold" : undefined}>Card artwork</h3>
      <FieldDescription>
        {saveMode === "automatic"
          ? "Choose generated artwork or upload an image. Changes save as a draft."
          : "Generated designs use your Identity artwork palette. Shuffle explores different designs and avoids recent repeats; save this item to keep the choice. A custom image replaces only the artwork above the card text."}
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
        description={`Can differ from the full title. Up to 40 characters, shown within two lines on generated artwork (${graphemeCount(current.shortTitle)}/40).`}
      >
        <Input
          id={shortTitleId}
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
            if (shuffleHistory.current.id !== id)
              shuffleHistory.current = { id, seeds: [] };
            if (shuffleHistory.current.seeds.at(-1) !== current.seed)
              shuffleHistory.current.seeds.push(current.seed);
            const seed = randomArtSeed(shuffleHistory.current.seeds);
            shuffleHistory.current.seeds = [
              ...shuffleHistory.current.seeds,
              seed,
            ].slice(-25);
            onChange({
              ...current,
              source: "generated",
              version: CARD_ART_VERSION,
              seed,
            });
            setNotice(saveMode === "automatic" ? "Design updated." : "New design previewed. Save to keep it.");
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
              setNotice(saveMode === "automatic" ? "Card image removed." : "Image removed from the card. Save to apply.");
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
            !file.size
          ) {
            setNotice(
              "Choose a non-empty JPG, PNG, WebP, or GIF image.",
            );
            return;
          }
          setUploading(true);
          onBusyChange?.(true);
          setNotice("");
          try {
            const imageUrl = await onUpload(file, setUploadProgress);
            onChange({ ...current, source: "upload", imageUrl });
            setNotice(saveMode === "automatic" ? "Card image updated." : "Image uploaded. Save this item to apply it.");
          } catch (error) {
            setNotice(
              error instanceof Error
                ? error.message
                : "Upload failed. Try again.",
            );
          } finally {
            setUploading(false);
            setUploadProgress(null);
            onBusyChange?.(false);
          }
        }}
      />
      <FieldDescription>
        {onUpload
          ? "JPG, PNG, WebP or GIF. The installation's upload limits apply. Wide images crop to fill the card."
          : "Custom image uploads are available in an installed Fieldbook. This demo saves generated artwork."}
      </FieldDescription>
      <MediaUploadStatus progress={uploadProgress} />
      <p role="status" className="text-sm text-muted-foreground">
        {notice}
      </p>
    </section>
  );
}
