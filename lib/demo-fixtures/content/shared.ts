import type { Content } from "../../types";
import { CARD_ART_VERSION, stableArtSeed, type CardArt } from "../../card-art";

export const D = {
  firstWeek: "hooli-doc-new-hire-first-week-guide",
  coaching: "hooli-doc-manager-essentials",
  gut: "hooli-doc-gavin-s-guide-to-gut-health",
  security: "hooli-doc-security-basics-and-incident-reporting",
  ai: "hooli-doc-responsible-ai-use",
  data: "hooli-doc-customer-data-handling",
  systems: "hooli-doc-finding-your-way-around-hooli-systems",
  discount: "hooli-doc-how-we-make-decisions-at-hooli",
  meetings: "hooli-doc-meetings-and-decision-notes",
  compression: "hooli-doc-middle-out-approved-product-explanation",
  availability: "hooli-doc-product-status-and-customer-claims",
  launch: "hooli-doc-release-readiness-checklist",
  discovery: "hooli-doc-first-customer-conversation",
  crm: "hooli-doc-using-hooliforce-crm",
  fields: "hooli-doc-hooliforce-faq-is-this-field-required",
  box: "hooli-doc-box-field-guide",
  forecast: "hooli-doc-forecasting",
  finance: "hooli-doc-finance",
  handoff: "hooli-doc-customer-handoff",
  landscape: "hooli-doc-competitive-landscape",
  piedPiper: "hooli-doc-pied-piper",
  yaoNet: "hooli-doc-yaonet",
  endframe: "hooli-doc-endframe",
  values: "hooli-doc-values",
  executive: "hooli-doc-executive-briefing",
} as const;

export const docLink = (key: keyof typeof D, label: string) =>
  `[${label}](#docs/${D[key]})`;
export const courseLink = (id: number, label: string) =>
  `[${label}](#courses/course-${id})`;

export function sampleContent(
  id: string,
  kind: Content["kind"],
  title: string,
  summary: string,
): Content {
  return {
    id,
    kind,
    title,
    summary,
    body: "",
    category: "",
    folder: "",
    status: "published",
    version: 1,
    createdAt: "2026-09-28T12:00:00.000Z",
    updatedAt: "2026-09-28T12:00:00.000Z",
    duration: 5,
    groups: [],
    lessons: [],
    questions: [],
  };
}
export function article(
  id: string,
  title: string,
  summary: string,
  body: string,
): Content {
  return {
    ...sampleContent(id, "doc", title, summary),
    body: body.trim(),
    duration: Math.max(2, Math.ceil(body.split(/\s+/).length / 200)),
  };
}
export function artwork(id: string, shortTitle: string): CardArt {
  return {
    source: "generated" as const,
    shortTitle,
    version: CARD_ART_VERSION,
    seed: stableArtSeed(id),
  };
}
