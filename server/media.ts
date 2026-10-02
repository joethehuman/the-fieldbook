import "server-only";
import { canPublish } from "@/lib/permissions";
import type { User } from "@/lib/types";
import { HttpError } from "./errors";
import { canRead } from "./content";
import { mediaData } from "./media-data";
import { storage } from "./storage";

export async function signedMediaUrl(file: string, user: User | null) {
  if (!/^[a-f0-9-]{36}\.(png|jpg|webp|gif|mp4|webm)$/.test(file))
    throw new HttpError(404, "Media not found.");
  const config = await canRead(user);
  const path = await mediaData().findReadyPath(file.split(".")[0]);
  if (!path || path.split("/").pop() !== file)
    throw new HttpError(404, "Media not found.");
  const reference = `/api/media/${file}`;
  if (
    !canPublish(user) &&
    !(await mediaData().hasPublishedDocumentReference(reference)) &&
    !config?.curricula?.some(
      (curriculum: {
        status: string;
        cardArt?: { source?: string; imageUrl?: string };
      }) =>
        curriculum.status === "published" &&
        curriculum.cardArt?.source === "upload" &&
        curriculum.cardArt.imageUrl === reference,
    )
  )
    throw new HttpError(404, "Media not found.");
  return storage().signedReadUrl(path, 300);
}
