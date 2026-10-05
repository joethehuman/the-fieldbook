"use client";
import { Input } from "./ui/input";
import { SelectField } from "./ui/select";
import { FormField } from "./patterns/form-field";
import { CardArtwork } from "./patterns/card-artwork";
import {
  cardPalettePresets,
  resolvedCardPalette,
  type CardPalette,
  type CardPaletteSetting,
} from "@/lib/card-art";
import type { SiteSettings } from "@/lib/settings";

const labels: Record<keyof typeof cardPalettePresets, string> = {
  coastal: "Coastal",
  orchard: "Orchard",
  dusk: "Dusk",
  ember: "Ember",
  glacier: "Glacier",
  slate: "Slate",
  bloom: "Bloom",
  citron: "Citron",
};
export function CardPaletteSettings({
  settings,
  onChange,
}: {
  settings: SiteSettings;
  onChange: (palette: CardPaletteSetting) => void;
}) {
  const selected = settings.cardPalette || { mode: "follow" as const };
  const value =
    selected.mode === "preset" ? `preset:${selected.preset}` : selected.mode;
  const colors =
    selected.mode === "custom"
      ? selected.colors
      : resolvedCardPalette(settings);
  function setColor(key: keyof CardPalette, hex: string) {
    onChange({ mode: "custom", colors: { ...colors, [key]: hex } });
  }
  return (
    <section
      className="grid gap-5 border-t border-border pt-6"
      aria-label="Card artwork palette"
    >
      <div className="grid gap-1">
        <h4>Card artwork</h4>
        <p className="text-sm text-muted-foreground">
          Choose colors for generated covers across Updates, Courses and
          Curricula. Uploaded images keep their own colors.
        </p>
      </div>
      <div className="grid min-w-0 gap-4">
        <div className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:items-end">
            <FormField label="Palette mode">
              <SelectField
                value={value}
                onValueChange={(next) => {
                  if (next === "follow") onChange({ mode: "follow" });
                  else if (next === "custom")
                    onChange({ mode: "custom", colors });
                  else
                    onChange({
                      mode: "preset",
                      preset: next.slice(7) as keyof typeof cardPalettePresets,
                    });
                }}
              >
                <option value="follow">Follow installation accent</option>
                {Object.entries(labels).map(([key, label]) => (
                  <option key={key} value={`preset:${key}`}>
                    {label}
                  </option>
                ))}
                <option value="custom">Custom three colors</option>
              </SelectField>
            </FormField>
            <p className="text-sm text-muted-foreground">
              {selected.mode === "follow"
                ? "Uses the accent color above. Changing it recolors generated covers without changing their patterns."
                : selected.mode === "preset"
                  ? "A coordinated set of colors. Changing the preset recolors every generated cover."
                  : "Choose a canvas color and two colors for the artwork. Text contrast adjusts automatically."}
            </p>
          </div>
          {selected.mode === "custom" ? (
            <div className="grid gap-4 sm:grid-cols-3">
              {(
                [
                  ["base", "Primary / canvas"],
                  ["accent1", "Accent 1 / lines"],
                  ["accent2", "Accent 2 / highlights"],
                ] as const
              ).map(([key, label]) => (
                <FormField key={key} label={label}>
                  <div className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-2">
                    <Input
                      type="color"
                      aria-label={`Choose ${label}`}
                      value={
                        /^#[0-9a-f]{6}$/i.test(colors[key])
                          ? colors[key]
                          : "#0069ff"
                      }
                      onChange={(event) => setColor(key, event.target.value)}
                    />
                    <Input
                      type="text"
                      aria-label={`${label} hex value`}
                      required
                      pattern="#[0-9a-fA-F]{6}"
                      maxLength={7}
                      spellCheck={false}
                      value={colors[key]}
                      onChange={(event) => setColor(key, event.target.value)}
                    />
                  </div>
                </FormField>
              ))}
            </div>
          ) : (
            <div className="flex gap-2" aria-label="Selected palette colors">
              {(
                [
                  ["Primary", colors.base],
                  ["Accent 1", colors.accent1],
                  ["Accent 2", colors.accent2],
                ] as const
              ).map(([label, color]) => (
                <Input
                  key={label}
                  type="color"
                  value={color}
                  disabled
                  aria-label={`${label}: ${color}`}
                  title={`${label}: ${color}`}
                />
              ))}
            </div>
          )}
        </div>
        <div className="grid min-w-0 content-start gap-4 rounded-lg bg-surface p-4">
          <div className="grid gap-1">
            <h5>Live preview</h5>
            <p className="text-sm text-muted-foreground">
              These colors apply to generated covers after you save settings.
            </p>
          </div>
          <div
            className="grid min-w-0 gap-3 sm:grid-cols-2"
            aria-label="Palette preview"
          >
            <div className="overflow-hidden rounded-md border border-border sm:col-span-2">
              <CardArtwork
                id="palette-preview-course"
                title="From API key to first request"
                kind="course"
                category="Platform basics"
                art={{
                  source: "generated",
                  shortTitle: "Your first API call",
                  version: 2,
                  seed: 289,
                }}
                settings={settings}
              />
            </div>
            <div className="overflow-hidden rounded-md border border-border">
              <CardArtwork
                id="palette-preview-update"
                title="September release"
                kind="brief"
                category="Product news"
                art={{
                  source: "generated",
                  shortTitle: "Project setup, simplified",
                  version: 2,
                  seed: 0,
                }}
                settings={settings}
              />
            </div>
            <div className="overflow-hidden rounded-md border border-border">
              <CardArtwork
                id="palette-preview-curriculum"
                title="New builder onboarding"
                kind="curriculum"
                art={{
                  source: "generated",
                  shortTitle: "Start building",
                  version: 2,
                  seed: 291,
                }}
                settings={settings}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
