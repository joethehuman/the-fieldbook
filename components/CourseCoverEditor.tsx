import { Input } from "@/components/ui/input";
import { FieldDescription } from "@/components/ui/field";
import { useRef, useState } from "react";
import { Button } from "./ui/button";
import { ActionGroup } from "./ui/action-group";
import type { UploadMedia } from "./MarkdownEditor";

export default function CourseCoverEditor({
  url,
  onUpload,
  onChange,
  onBusyChange,
  disabled,
}: {
  url?: string;
  onUpload?: UploadMedia;
  onChange: (url: string) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  return (
    <div className="course-cover-editor">
      <h4>Course cover</h4>
      {url && (
        <img className="cover-preview" src={url} alt="Course cover preview" />
      )}
      <FieldDescription>
        Use the generated artwork or upload your own image. Wide images work
        best; they are cropped to fill the card.
      </FieldDescription>
      <ActionGroup>
        {onUpload && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || uploading}
            onClick={() => input.current?.click()}
          >
            {uploading ? "Uploading…" : url ? "Replace cover" : "Upload cover"}
          </Button>
        )}
        {url && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled || uploading}
            onClick={() => {
              onChange("");
              setNotice(
                "Generated artwork restored. Save the course to apply it.",
              );
            }}
          >
            Remove cover
          </Button>
        )}
      </ActionGroup>
      {onUpload ? (
        <>
          <FieldDescription>
            JPG, PNG, WebP, or GIF, up to 50 MB (your installation may set a
            lower limit). Save the course to apply changes.
          </FieldDescription>
          <Input
            ref={input}
            hidden
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            aria-label="Upload course cover"
            disabled={disabled || uploading}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (
                ![
                  "image/jpeg",
                  "image/png",
                  "image/webp",
                  "image/gif",
                ].includes(file.type) ||
                file.size > 52428800 ||
                !file.size
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
                onChange(await onUpload(file));
                setNotice("Cover uploaded. Save the course to apply it.");
              } catch (error) {
                setNotice(
                  error instanceof Error
                    ? error.message
                    : "Upload failed. Please try again.",
                );
              } finally {
                setUploading(false);
                onBusyChange?.(false);
              }
            }}
          />
        </>
      ) : (
        <FieldDescription>
          Cover uploads are available in an installed Fieldbook. The demo uses
          generated artwork.
        </FieldDescription>
      )}
      <p role="status">{notice}</p>
    </div>
  );
}
