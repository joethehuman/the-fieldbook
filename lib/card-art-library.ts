import { artComposition } from "./card-art";

/** Frozen local V4 prototype: saved-choice compatibility only.
 * Current Shuffle uses the refined V6 collection, not this library. */
export const cardArtLibrary = [
  {
    name: "Rings and orbits",
    recipes: [
      "Eccentric orbit",
      "Twin centers",
      "Orbital crossing",
      "Open halo",
    ],
  },
  {
    name: "Flowing contours",
    recipes: ["River bend", "Contour island", "Two currents", "Folded contour"],
  },
  {
    name: "Nested frames",
    recipes: [
      "Soft window",
      "Offset portals",
      "Diamond chamber",
      "Open corner",
    ],
  },
  {
    name: "Diagonal lines",
    recipes: [
      "Split cadence",
      "Chevron seam",
      "Folded rhythm",
      "Diagonal window",
    ],
  },
  {
    name: "Arcs",
    recipes: ["Rising arc", "Counter-arc", "Paired crescents", "Arc steps"],
  },
  {
    name: "Waves",
    recipes: ["Long tide", "Standing wave", "Meeting tides", "Wave ribbon"],
  },
  {
    name: "Peaks and steps",
    recipes: [
      "Ridgeline",
      "Nested terraces",
      "Triangular orbit",
      "Folded landscape",
    ],
  },
  {
    name: "Bubbles and constellations",
    recipes: [
      "Circle cluster",
      "Graduated field",
      "Connected constellation",
      "Orbital constellation",
    ],
  },
  {
    name: "Wide bands",
    recipes: [
      "Turning ribbons",
      "Broad tide",
      "Sloping bands",
      "Ribbon corner",
    ],
  },
  {
    name: "Radiating beams",
    recipes: ["Open fan", "Horizon fan", "Paired fans", "Stepped rays"],
  },
  {
    name: "Lenses",
    recipes: ["Nested lens", "Leaf rhythm", "Opposing lenses", "Lens stack"],
  },
  {
    name: "Interlaced ribbons",
    recipes: [
      "Braided current",
      "Woven bend",
      "Loop and strand",
      "Folded weave",
    ],
  },
  {
    name: "Connected tiles",
    recipes: [
      "Quarter-turn field",
      "Stepping tiles",
      "Quiet checker",
      "Linked arches",
    ],
  },
  {
    name: "Folded planes",
    recipes: [
      "Folded sheet",
      "Prismatic steps",
      "Floating facets",
      "Pleated fan",
    ],
  },
] as const;

export type ArtworkLevel = 0 | 1 | 2 | 3 | 4;
export type ArtworkRelationship = 0 | 1 | 2;

function word(seed: number, salt: number): number {
  let value = (seed ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (value ^ (value >>> 16)) >>> 0;
}

/** Layout and form choices stay independent of the existing palette/tone bits.
 * Recipes constrain the relationship: open linework, a related filled form,
 * or a quieter companion. These are not arbitrary cross-family overlays.
 */
export function expandedArtStructure(seed: number) {
  const slot = artComposition(seed, 4);
  return {
    family: slot % cardArtLibrary.length,
    recipe: Math.floor(slot / cardArtLibrary.length) as 0 | 1 | 2 | 3,
    rhythm: (word(seed, 0x243f6a88) % 5) as ArtworkLevel,
    proportion: (word(seed, 0x85a308d3) % 5) as ArtworkLevel,
    placement: (word(seed, 0x13198a2e) % 5) as ArtworkLevel,
    relationship: (word(seed, 0x03707344) % 3) as ArtworkRelationship,
  };
}
