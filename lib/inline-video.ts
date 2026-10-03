import { videoSource } from "./video";

/** Explicit embeds and uploaded video links; ordinary reference links stay links. */
export function isInlineVideo(url: string, label: string) {
  return (
    !!videoSource(url) && (label === "Video" || url.startsWith("/api/media/"))
  );
}
