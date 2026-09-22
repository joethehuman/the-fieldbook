import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { actor } from "./auth";
import { canRead, getContent } from "./content";
import { brandingFromSettings } from "@/lib/branding";
import { HttpError } from "./errors";
import { env } from "./env";
import { contentPath, resolveSection } from "@/lib/navigation";
import { defaultSettings } from "@/lib/settings";
import { guest } from "./snapshot";
import type { ReadingState } from "@/lib/reading";

// React cache deduplicates page + metadata only within this server request.
// No persistent data, full-route or user cache is used.
export const reading = cache(
  async (section: string, id: string | undefined, destination: string) => {
    const view = resolveSection(section);
    if (!view) notFound();
    if (!id || section === "curricula" || view === "admin" || view === "team")
      return null;
    let item, config;
    try {
      const user = await actor(undefined, true);
      config = await canRead(user);
      if (
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          id,
        )
      )
        notFound();
      item = await getContent(id, user);
    } catch (error) {
      if (
        error instanceof HttpError &&
        (error.status === 401 || error.status === 403)
      )
        redirect(`/auth/sign-in?next=${encodeURIComponent(destination)}`);
      if (error instanceof HttpError && error.status === 404) notFound();
      throw error;
    }
    const kind =
      view === "learn" ? "course" : view === "docs" ? "doc" : "brief";
    if (item.kind !== kind) notFound();
    const branding = brandingFromSettings(config.settings);
    if (branding.logoUrl)
      branding.logoUrl = `/api/branding/logo?v=${encodeURIComponent(branding.logoUrl.split("/").pop()!)}`;
    const data: ReadingState["data"] = {
      schema: 1,
      settings: {
        ...defaultSettings,
        name: branding.name,
        tagline: config.settings.tagline || "",
        accent: config.settings.accent || defaultSettings.accent,
        privacy: config.settings.privacy
          ? {
              published: config.settings.privacy.published,
              publishedAt: config.settings.privacy.publishedAt,
              draft: {
                mode: "hosted",
                operatorName: "",
                contactEmail: "",
                body: "",
                url: "",
              },
            }
          : undefined,
        logoUrl: branding.logoUrl,
        access: branding.access,
      },
      content: [item],
      publishedContent: [item],
      users: [guest],
      groups: [],
      progress: {},
    };
    return { item, branding, data, section: view };
  },
);
export function readingMetadata(
  value: NonNullable<Awaited<ReturnType<typeof reading>>>,
): Metadata {
  const { item, branding } = value;
  const title = `${item.title} | ${branding.name}`;
  const description = item.summary.trim() || `${item.title} — ${branding.name}`;
  // The public logo endpoint checks current branding on every request. Do not
  // advertise private media through share images or signed Storage URLs.
  const images = branding.logoUrl
    ? [{ url: branding.logoUrl, alt: branding.name }]
    : [];
  return {
    metadataBase: new URL(env().origin),
    title,
    description,
    alternates: { canonical: contentPath(item.kind, item.id) },
    openGraph: {
      title,
      description,
      siteName: branding.name,
      type: item.kind === "course" ? "website" : "article",
      url: contentPath(item.kind, item.id),
      images,
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: images.map((image) => image.url),
    },
    ...(branding.access === "private"
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}
