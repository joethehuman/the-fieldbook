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
    selected.mode === "custom" ? selected.colors : resolvedCardPalette(settings);
  function setColor(key: keyof CardPalette, hex: string) {
    onChange({ mode: "custom", colors: { ...colors, [key]: hex } });
  }
  return (
    <section className="grid gap-4" aria-label="Card artwork palette">
      <h4>Card artwork palette</h4>
      <p className="text-sm text-muted-foreground">
        This palette colors generated Update, Course and Curriculum artwork
        across the installation. Uploaded images keep their own colors. Follow
        accent uses the saved installation accent above; changing that accent
        recolors all generated cards without reshuffling their designs.
      </p>
      <FormField label="Palette mode">
        <SelectField
          value={value}
          onValueChange={(next) => {
            if (next === "follow") onChange({ mode: "follow" });
            else if (next === "custom") onChange({ mode: "custom", colors });
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
      {selected.mode === "custom" && (
        <div className="grid gap-3 sm:grid-cols-3">
          {(
            [
              ["base", "Primary / card base"],
              ["accent1", "Accent 1 / lines"],
              ["accent2", "Accent 2 / highlights"],
            ] as const
          ).map(([key, label]) => (
            <FormField key={key} label={label}>
              <div className="color-control">
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
      )}
      <div className="grid gap-3 sm:grid-cols-3" aria-label="Palette preview">
        <CardArtwork
          id="palette-preview-update"
          title="What changed"
          kind="brief"
          category="Release notes"
          settings={settings}
        />
        <CardArtwork
          id="palette-preview-course"
          title="Build the basics"
          kind="course"
          category="Product"
          settings={settings}
        />
        <CardArtwork
          id="palette-preview-curriculum"
          title="First steps"
          kind="curriculum"
          settings={settings}
        />
      </div>
    </section>
  );
}
