import type { CSSProperties } from "react";

export const defaultBrandAccent = "#0069ff";

const foreground = [23, 23, 23] as const;

function luminance([red, green, blue]: readonly number[]) {
  const [r, g, b] = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function accessibleLink(accent: string) {
  const channels = [1, 3, 5].map((start) =>
    Number.parseInt(accent.slice(start, start + 2), 16),
  );
  if (1.05 / (luminance(channels) + 0.05) >= 4.5) return accent;

  // Preserve the chosen hue, darkening only as much as white-background text needs.
  let lower = 0;
  let upper = 1;
  for (let i = 0; i < 16; i++) {
    const share = (lower + upper) / 2;
    const mixed = channels.map((channel, index) =>
      Math.round(channel * (1 - share) + foreground[index] * share),
    );
    if (1.05 / (luminance(mixed) + 0.05) >= 4.5) upper = share;
    else lower = share;
  }
  return `#${channels
    .map((channel, index) =>
      Math.round(channel * (1 - upper) + foreground[index] * upper)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export function brandThemeStyle(value?: string): CSSProperties {
  const accent = /^#[0-9a-f]{6}$/i.test(value || "")
    ? value!
    : defaultBrandAccent;
  return {
    "--brand": accent,
    "--link": accessibleLink(accent),
    "--ring": "var(--link)",
    "--selected": "color-mix(in srgb, var(--brand) 12%, var(--background))",
    "--selected-foreground": "var(--link)",
  } as CSSProperties;
}

/** Portaled dialogs render under body, outside the app shell's inherited theme. */
export function syncBrandTheme(value?: string) {
  const theme = brandThemeStyle(value) as Record<string, string>;
  const root = document.documentElement.style;
  const prior = Object.keys(theme).map(
    (name) =>
      [
        name,
        root.getPropertyValue(name),
        root.getPropertyPriority(name),
      ] as const,
  );
  for (const [name, color] of Object.entries(theme))
    root.setProperty(name, color);
  return () => {
    for (const [name, oldValue, priority] of prior) {
      if (oldValue) root.setProperty(name, oldValue, priority);
      else root.removeProperty(name);
    }
  };
}
