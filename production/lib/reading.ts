import "server-only";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { db } from "./db";
import { readAll } from "./read-all";
import { orderedDocCategories, type DocLink } from "@/lib/docs-navigation";
import { actor } from "./auth";
import { canRead, getContent } from "./content";
import { brandingFromSettings } from "@/lib/branding";
import { HttpError } from "./errors";
import { env } from "./env";
import { contentPath, resolveSection } from "@/lib/navigation";
import { defaultSettings, publicSettings } from "@/lib/settings";
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
    let user;
    try {
      user = await actor(undefined, true);
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
    // Authorization above precedes every catalog read. Project only published
    // navigation fields; never serialize draft titles, bodies or group metadata.
    let documents: DocLink[] = [];
    if (kind === "doc") {
      const rows = await readAll((from, to) =>
        db()
          .from("fb_documents")
          .select(
            "id,updated_at,title:published->>title,category:published->>category,folder:published->>folder,sectionId:published->>sectionId,kind:published->>kind,status:published->>status",
            { count: "exact" },
          )
          .not("published", "is", null)
          .order("id")
          .range(from, to),
      );
      documents = rows
        .sort(
          (a, b) =>
            b.updated_at.localeCompare(a.updated_at) ||
            a.id.localeCompare(b.id),
        )
        .filter((row) => row.kind === "doc" && row.status === "published")
        .map((row) => ({
          id: row.id,
          title: row.title,
          category: row.category,
          folder: row.folder || "",
          sectionId: row.sectionId || undefined,
          kind: "doc",
          status: "published",
        }));
    }
    const branding = brandingFromSettings(config.settings);
    const visibleSettings = publicSettings(config.settings, documents);
    const data: ReadingState["data"] = {
      schema: 1,
      settings: {
        ...defaultSettings,
        name: branding.name,
        docCategoryOrder: orderedDocCategories(
          documents,
          visibleSettings.docCategoryOrder || [],
          visibleSettings.docSections || [],
        ),
        docSections: visibleSettings.docSections || [],
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
        access: branding.access,
      },
      content: [item],
      publishedContent: [item],
      users: [user || guest],
      groups: [],
      progress: {},
    };
    return { item, branding, data, documents, section: view };
  },
);
export function readingMetadata(
  value: NonNullable<Awaited<ReturnType<typeof reading>>>,
): Metadata {
  const { item, branding } = value;
  const title = `${item.title} | ${branding.name}`;
  const description = item.summary.trim() || `${item.title} — ${branding.name}`;
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
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    ...(branding.access === "private"
      ? { robots: { index: false, follow: false } }
      : {}),
  };
}
