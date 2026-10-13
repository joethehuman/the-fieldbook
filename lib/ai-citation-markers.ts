// Accept only complete, matching delimiter pairs. Providers can use either
// form, but the source ID still has to match Fieldbook's verified metadata.
export const citationMarkerPattern = String.raw`(?:\[S\d+\]|【S\d+】)`;

export function* citationMarkers(text: string) {
  for (const match of text.matchAll(new RegExp(citationMarkerPattern, "g"))) {
    yield { id: match[0].slice(1, -1), text: match[0] };
  }
}
