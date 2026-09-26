export function videoSource(
  raw: string,
): { type: "embed" | "file"; url: string } | null {
  if (/^\/api\/media\/[a-f0-9-]{36}\.(mp4|webm)$/.test(raw))
    return { type: "file", url: raw };
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return null;
    const host = u.hostname.replace(/^www\./, "");
    if (["youtube.com", "youtube-nocookie.com", "youtu.be"].includes(host)) {
      const id =
        host === "youtu.be"
          ? u.pathname.slice(1)
          : u.searchParams.get("v") ||
            u.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1];
      return id && /^[\w-]{11}$/.test(id)
        ? { type: "embed", url: `https://www.youtube-nocookie.com/embed/${id}` }
        : null;
    }
    if (["vimeo.com", "player.vimeo.com"].includes(host)) {
      const id = u.pathname.match(/(?:^\/|\/video\/)(\d+)(?:\/|$)/)?.[1];
      const hash =
        u.searchParams.get("h") || u.pathname.match(/^\/\d+\/([a-f\d]+)/)?.[1];
      return id
        ? {
            type: "embed",
            url: `https://player.vimeo.com/video/${id}${hash && /^[a-f\d]+$/.test(hash) ? `?h=${hash}` : ""}`,
          }
        : null;
    }
    if (["loom.com", "www.loom.com"].includes(u.hostname)) {
      const id = u.pathname.match(/^\/(?:share|embed)\/([a-f\d]{32})(?:\/|$)/i)?.[1];
      return id ? { type: "embed", url: `https://www.loom.com/embed/${id}` } : null;
    }
    return /\.(mp4|webm)$/i.test(u.pathname)
      ? { type: "file", url: u.href }
      : null;
  } catch {
    return null;
  }
}
