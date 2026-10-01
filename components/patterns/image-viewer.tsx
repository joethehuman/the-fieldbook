"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";

export function ImageViewer({
  image,
  onClose,
}: {
  image: { src: string; alt: string } | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={!!image}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent size="media" aria-describedby={undefined}>
        <div className="flex min-w-0 items-start justify-between gap-3">
          <DialogTitle className="min-w-0 line-clamp-2 break-words">
            {image?.alt || "Image"}
          </DialogTitle>
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              <X aria-hidden="true" />
              Close
            </Button>
          </DialogClose>
        </div>
        <div className="flex min-h-0 min-w-0 items-center justify-center">
          {image && (
            <img
              className="size-full object-contain"
              src={image.src}
              alt={image.alt}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
