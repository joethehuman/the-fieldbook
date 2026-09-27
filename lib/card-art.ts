import type { SiteSettings } from "./settings";
import type { Content } from "./types";

export const CARD_ART_VERSION = 1;
export type CardArt = {
  source: "generated" | "upload";
  shortTitle: string;
  version: 1;
  seed: number;
  imageUrl?: string;
};
export type CardPalette = { base: string; accent1: string; accent2: string };
export type CardPaletteSetting =
  | { mode: "follow" }
  | { mode: "preset"; preset: keyof typeof cardPalettePresets }
  | { mode: "custom"; colors: CardPalette };

export const cardPalettePresets = {
  coastal: { base: "#dceef0", accent1: "#167b84", accent2: "#e5a35c" },
  orchard: { base: "#e8efdd", accent1: "#5a8060", accent2: "#d18c5d" },
  dusk: { base: "#ebe6f3", accent1: "#705c9b", accent2: "#c18aa6" },
  ember: { base: "#f7e9df", accent1: "#af664d", accent2: "#e0aa55" },
  glacier: { base: "#e1ecf7", accent1: "#466e9f", accent2: "#74b8c3" },
  slate: { base: "#e8ecee", accent1: "#526b75", accent2: "#a3a668" },
  bloom: { base: "#f4e7eb", accent1: "#a65778", accent2: "#d69b76" },
  citron: { base: "#f1efdc", accent1: "#787c49", accent2: "#b48b5b" },
} as const satisfies Record<string, CardPalette>;

export function graphemeCount(value: string): number {
  return [
    ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
      value,
    ),
  ].length;
}
export function shortTitleFallback(value: string): string {
  const segments = [
    ...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(
      value.trim(),
    ),
  ];
  return segments
    .slice(0, 40)
    .map((part) => part.segment)
    .join("")
    .trim();
}
export function stableArtSeed(id: string): number {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}
export function nextArtSeed(seed: number): number {
  return (Math.imul(seed ^ 0x9e3779b9, 1664525) + 1013904223) >>> 0;
}
export function resolvedCardArt(
  id: string,
  title: string,
  art?: CardArt,
  legacyCover?: string,
): CardArt {
  return (
    art || {
      source: legacyCover ? "upload" : "generated",
      shortTitle: shortTitleFallback(title),
      version: CARD_ART_VERSION,
      seed: stableArtSeed(id),
      imageUrl: legacyCover,
    }
  );
}
function hexToRgb(hex: string) {
  const safe = /^#[\da-f]{6}$/i.test(hex) ? hex : "#0069ff";
  return [1, 3, 5].map((i) => parseInt(safe.slice(i, i + 2), 16));
}
function mix(a: string, b: string, weight: number): string {
  const x = hexToRgb(a),
    y = hexToRgb(b);
  return `#${x
    .map((value, i) =>
      Math.round(value * (1 - weight) + y[i] * weight)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}
export function resolvedCardPalette(
  settings?: Pick<SiteSettings, "accent" | "cardPalette">,
): CardPalette {
  const choice = settings?.cardPalette;
  if (
    choice?.mode === "custom" &&
    Object.values(choice.colors).every((value) => /^#[0-9a-f]{6}$/i.test(value))
  )
    return choice.colors;
  if (choice?.mode === "preset")
    return cardPalettePresets[choice.preset] || cardPalettePresets.coastal;
  const accent = settings?.accent || "#0069ff";
  return {
    base: mix(accent, "#ffffff", 0.86),
    accent1: mix(accent, "#222222", 0.2),
    accent2: mix(accent, "#ffffff", 0.35),
  };
}
export function isArtworkOnlyUpdate(
  next: Content,
  published: Content,
): boolean {
  if (next.kind !== "brief" || published.kind !== "brief") return false;
  const editorial = (item: Content) =>
    JSON.stringify([
      item.title,
      item.summary,
      item.body,
      item.category,
      item.folder,
      item.groups,
      item.lessons,
      item.questions,
      item.version,
    ]);
  return editorial(next) === editorial(published);
}
