import { artComposition } from "./card-art";

export const cardArtMotifs = [
  "Rings",
  "Contours",
  "Frames",
  "Diagonals",
  "Arcs",
  "Waves",
  "Peaks",
  "Constellations",
  "Bands",
  "Beams",
] as const;

export type CardArtLevel = 0 | 1 | 2;
export type CardArtStructure = {
  family: number;
  recipe: CardArtLevel;
  rhythm: CardArtLevel;
  proportion: CardArtLevel;
  placement: CardArtLevel;
};

/** Fixed integer mixing is part of generator v3's saved-seed contract. Each
 * axis has its own salt so neighboring seeds do not simply step through the
 * same settings or inherit the existing tone bits. Family recipes translate
 * the three bounded levels into their own counts, dimensions and anchors.
 */
function structureLevel(seed: number, salt: number): CardArtLevel {
  let value = (seed ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return (((value ^ (value >>> 16)) >>> 0) % 3) as CardArtLevel;
}

export function cardArtStructure(seed: number): CardArtStructure {
  const slot = artComposition(seed, 3);
  return {
    family: slot % 10,
    recipe: Math.floor(slot / 10) as CardArtLevel,
    rhythm: structureLevel(seed, 0x243f6a88),
    proportion: structureLevel(seed, 0x85a308d3),
    placement: structureLevel(seed, 0x13198a2e),
  };
}
