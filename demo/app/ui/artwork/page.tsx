"use client";

import { useState } from "react";

import { CardArtwork } from "@/components/patterns/card-artwork";
import { LearningCard } from "@/components/patterns/learning-card";
import {
  PageHeader,
  ReadingPage,
  SectionHeader,
} from "@/components/patterns/layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, FieldGroup } from "@/components/ui/field";
import { SelectField } from "@/components/ui/select";
import {
  CARD_ART_VERSION,
  cardPalettePresets,
  resolvedCardPalette,
  stableArtSeed,
  type CardPalette,
} from "@/lib/card-art";

const families = [
  "Rings and orbits",
  "Flowing contours",
  "Nested frames",
  "Diagonal lines",
  "Arcs",
  "Waves",
  "Peaks and steps",
  "Bubbles and constellations",
  "Wide bands",
  "Radiating beams",
];
const recipes = [
  ["Concentric rings", "Paired circles", "Elliptical rings"],
  ["Flowing current", "Broad bend", "Sweeping contour"],
  ["Nested frames", "Tall portals", "Nested diamonds"],
  ["Diagonal lines", "Chevron", "Ascending lines"],
  ["Rising arcs", "Falling arcs", "Corner arcs"],
  ["Horizontal waves", "Vertical waves", "Angled waves"],
  ["Peaks", "Steps", "Triangles"],
  ["Circle cluster", "Graded dots", "Connected constellation"],
  ["Flowing bands", "Horizontal bands", "Diagonal bands"],
  ["Side beams", "Upper beams", "Lower beams"],
];

const palettes: Record<string, CardPalette> = {
  follow: resolvedCardPalette({
    accent: "#0069ff",
    cardPalette: { mode: "follow" },
  }),
  coastal: cardPalettePresets.coastal,
  dusk: cardPalettePresets.dusk,
  ember: cardPalettePresets.ember,
  green: { base: "#ddece4", accent1: "#327755", accent2: "#9ac7a2" },
};

type Tone = "light" | "dark";

// Both versions use the same recipe, numeric seed, tone and palette.
function sampleSeed(slot: number, set: string, tone: Tone) {
  const hash = stableArtSeed(`artwork-review:${set}:${slot}`) % 4_200_000_000;
  let seed = hash - (hash % 30) + slot;
  while (((seed >>> 8) % 3 !== 0 ? "dark" : "light") !== tone) seed += 30;
  return seed;
}

function Comparison({
  slot,
  seed,
  palette,
  title,
  category,
  fullCard = false,
  label,
  baseline = 5,
}: {
  slot: number;
  seed: number;
  palette: CardPalette;
  title: string;
  category: string;
  fullCard?: boolean;
  label: string;
  baseline?: 2 | 3 | 5;
}) {
  return (
    <section
      className="grid w-full min-w-0 max-w-2xl gap-3"
      aria-label={label}
      data-review-slot={slot}
      data-review-seed={seed}
    >
      <div className="grid gap-1">
        <h3 className="text-sm font-semibold">{label}</h3>
        <p className="text-xs text-muted-foreground">
          Recipe {Math.floor(slot / 10) + 1} · Seed {seed} ·{" "}
          {(seed >>> 8) % 3 !== 0 ? "Dark" : "Light"}
        </p>
      </div>
      <div className="grid min-w-0 items-start gap-4 sm:grid-cols-2">
        {([baseline, CARD_ART_VERSION] as const).map((version, index) => {
          const artwork = (
            <CardArtwork
              id={`artwork-review-${slot}`}
              title={title}
              kind="course"
              category={category}
              palette={palette}
              art={{
                source: "generated",
                shortTitle: title,
                version,
                seed,
              }}
            />
          );
          return (
            <div
              key={index}
              className="grid min-w-0 gap-2"
              data-review-version={version}
            >
              <p className="text-xs text-muted-foreground">
                {index === 0
                  ? baseline === 2
                    ? "Original collection"
                    : baseline === 3
                      ? "First pass"
                      : "Previous refinement"
                  : "Refined motifs"}
              </p>
              {fullCard ? (
                <LearningCard
                  artwork={artwork}
                  title={title}
                  metadata="3 lessons · Knowledge check"
                  description="Build confidence through practical ideas and a clear next step."
                  status={{ percent: 0, complete: false, started: false }}
                  action="Start course"
                  onClick={() => {}}
                />
              ) : (
                <Card className="overflow-hidden p-0 sm:p-0">{artwork}</Card>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export default function ArtworkReviewPage() {
  const [baseline, setBaseline] = useState("5");
  const [family, setFamily] = useState("all");
  const [paletteKey, setPaletteKey] = useState("coastal");
  const [seedSet, setSeedSet] = useState("a");
  const [tone, setTone] = useState("mixed");
  const [text, setText] = useState("standard");
  const [presentation, setPresentation] = useState("artwork");
  const palette = palettes[paletteKey];
  const title =
    text === "long"
      ? "A stronger foundation for every customer"
      : "Make room for better questions";
  const category =
    text === "long"
      ? "Build the essentials for customer conversations and product confidence"
      : "Build the essentials";
  const slots = Array.from({ length: 30 }, (_, index) => index)
    .filter((slot) => family === "all" || slot % 10 === Number(family))
    .sort((a, b) => (a % 10) - (b % 10) || a - b);

  return (
    <ReadingPage className="max-w-7xl">
      <PageHeader>
        <span className="eyebrow">Fieldbook component library</span>
        <h1>Refining the motifs</h1>
        <p>
          The original ten families, with softer depth, quieter linework and
          unoutlined color shapes. Compare identical seeds, short titles,
          metadata, palettes and card sizes.
        </p>
        <Button variant="outline" asChild>
          <a href="/ui">Back to interface reference</a>
        </Button>
      </PageHeader>

      <section className="grid gap-4" aria-label="Constellation example">
        <SectionHeader
          title={<h2>The constellation example</h2>}
          description="A reconstruction of the weak recipe in the supplied card. Its original seed and exact palette are unknown; this pair uses one fixed dark seed and a custom green palette. The complete course card shows the unchanged surrounding content."
        />
        <div className="max-w-2xl">
          <Comparison
            slot={27}
            seed={sampleSeed(27, "example", "dark")}
            palette={palettes.green}
            title="Choose a problem worth solving"
            category="Build the essentials"
            fullCard
            baseline={2}
            label="Constellation · reconstructed example"
          />
        </div>
      </section>

      <section className="grid gap-6" aria-label="Composition library">
        <SectionHeader
          title={<h2>Explore the collection</h2>}
          description="Thirty compositions across the original ten families. Five seed sets sample rhythm, proportion and placement. The refinement concentrates on depth, clean spacing, and room for the existing short title."
        />
        <Card>
          <FieldGroup className="sm:grid-cols-2 lg:grid-cols-3">
            <Field>
              Motif family
              <SelectField value={family} onValueChange={setFamily}>
                <option value="all">All ten families</option>
                {families.map((name, index) => (
                  <option key={name} value={index}>
                    {name}
                  </option>
                ))}
              </SelectField>
            </Field>
            <Field>
              Identity palette
              <SelectField value={paletteKey} onValueChange={setPaletteKey}>
                <option value="follow">Follow accent · blue</option>
                <option value="coastal">Coastal</option>
                <option value="dusk">Dusk</option>
                <option value="ember">Ember</option>
                <option value="green">Custom green</option>
              </SelectField>
            </Field>
            <Field>
              Seed set
              <SelectField value={seedSet} onValueChange={setSeedSet}>
                <option value="a">Set A</option>
                <option value="b">Set B</option>
                <option value="c">Set C</option>
                <option value="d">Set D</option>
                <option value="e">Set E</option>
              </SelectField>
            </Field>
            <Field>
              Treatment
              <SelectField value={tone} onValueChange={setTone}>
                <option value="mixed">Mixed · light and dark</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </SelectField>
            </Field>
            <Field>
              Overlay text
              <SelectField value={text} onValueChange={setText}>
                <option value="standard">Standard</option>
                <option value="long">Long headline and metadata</option>
              </SelectField>
            </Field>
            <Field>
              Card context
              <SelectField value={presentation} onValueChange={setPresentation}>
                <option value="artwork">Artwork</option>
                <option value="full">Complete course cards</option>
              </SelectField>
            </Field>
            <Field>
              Compare with
              <SelectField value={baseline} onValueChange={setBaseline}>
                <option value="5">Previous refinement</option>
                <option value="3">First pass</option>
                <option value="2">Original collection</option>
              </SelectField>
            </Field>
          </FieldGroup>
        </Card>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {slots.length} before/after pairs · Artwork retains its shared 180px
          height. Pairs stack on phones. These controls only affect this
          catalog.
        </p>
        <div className="grid min-w-0 gap-8 xl:grid-cols-2">
          {slots.map((slot) => (
            <Comparison
              key={slot}
              slot={slot}
              seed={sampleSeed(
                slot,
                seedSet,
                tone === "mixed"
                  ? (slot + Math.floor(slot / 10)) % 2 === 0
                    ? "light"
                    : "dark"
                  : (tone as Tone),
              )}
              palette={palette}
              title={title}
              category={category}
              fullCard={presentation === "full"}
              baseline={Number(baseline) as 2 | 3 | 5}
              label={`${families[slot % 10]} · ${recipes[slot % 10][Math.floor(slot / 10)]}`}
            />
          ))}
        </div>
      </section>
    </ReadingPage>
  );
}
