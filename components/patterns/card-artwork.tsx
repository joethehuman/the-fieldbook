import type { CSSProperties } from "react";
import type { CardArt, CardPalette } from "@/lib/card-art";
import { resolvedCardArt, resolvedCardPalette } from "@/lib/card-art";
import type { SiteSettings } from "@/lib/settings";
import { CardImage } from "./card-image";

function mix(a: string, b: string, weight: number) {
  return `#${[1, 3, 5]
    .map((index) =>
      Math.round(
        parseInt(a.slice(index, index + 2), 16) * (1 - weight) +
          parseInt(b.slice(index, index + 2), 16) * weight,
      )
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

function geometry(seed: number, color1: string, color2: string) {
  const family = seed % 8;
  const shift = ((seed >>> 8) % 95) - 42;
  const turn = ((seed >>> 17) % 50) - 25;
  const gap = 13 + ((seed >>> 23) % 13);
  const common = {
    fill: "none",
    stroke: color1,
    strokeWidth: 2.5,
    opacity: 0.72,
  };
  const accent = {
    fill: "none",
    stroke: color2,
    strokeWidth: 4,
    opacity: 0.82,
  };
  switch (family) {
    case 0:
      return (
        <g transform={`translate(${shift} 0) rotate(${turn} 430 145)`}>
          <circle cx="610" cy="12" r="126" fill={color2} opacity="0.58" />
          {Array.from({ length: 12 }, (_, i) => (
            <ellipse
              key={i}
              cx="460"
              cy="150"
              rx={45 + i * gap}
              ry={25 + i * gap * 0.7}
              {...(i % 4 === 0 ? accent : common)}
            />
          ))}
        </g>
      );
    case 1:
      return (
        <g transform={`translate(${shift} 0) rotate(${turn} 450 150)`}>
          <path
            d="M410 -70 C280 80 570 178 438 370 L780 370 L780 -70 Z"
            fill={color2}
            opacity="0.28"
          />
          {Array.from({ length: 15 }, (_, i) => (
            <path
              key={i}
              d={`M${260 + i * gap} -30 C${170 + i * gap} 95 ${600 - i * gap} 190 ${320 + i * gap} 330`}
              {...(i % 5 === 0 ? accent : common)}
            />
          ))}
        </g>
      );
    case 2:
      return (
        <g transform={`translate(${shift} 0) rotate(${turn} 420 150)`}>
          <rect
            x="405"
            y="-68"
            width="300"
            height="300"
            rx="48"
            fill={color2}
            opacity="0.26"
          />
          {Array.from({ length: 10 }, (_, i) => (
            <rect
              key={i}
              x={365 - i * gap}
              y={80 - i * gap}
              width={90 + i * gap * 2}
              height={90 + i * gap * 2}
              rx={9 + i * 3}
              {...(i % 3 === 0 ? accent : common)}
            />
          ))}
        </g>
      );
    case 3:
      return (
        <g transform={`translate(${shift} 0) rotate(${turn} 420 145)`}>
          <path d="M490 -70 H750 V370 H300 Z" fill={color2} opacity="0.24" />
          {Array.from({ length: 16 }, (_, i) => (
            <path
              key={i}
              d={`M${250 + i * gap} -15 L${590 + i * gap} 315`}
              {...(i % 6 === 0 ? accent : common)}
            />
          ))}
        </g>
      );
    case 4:
      return (
        <g transform={`translate(${shift} 0) rotate(${turn} 440 150)`}>
          <circle cx="620" cy="315" r="178" fill={color2} opacity="0.34" />
          {Array.from({ length: 11 }, (_, i) => (
            <path
              key={i}
              d={`M${260 + i * gap} 300 A${105 + i * gap} ${105 + i * gap} 0 0 1 610 ${60 - i * gap}`}
              {...(i % 4 === 0 ? accent : common)}
            />
          ))}
        </g>
      );
    case 5:
      return (
        <g transform={`translate(${shift} 0) rotate(${turn} 430 150)`}>
          <path
            d="M340 -80 Q470 55 650 -80 V380 Q480 255 340 380 Z"
            fill={color2}
            opacity="0.23"
          />
          {Array.from({ length: 12 }, (_, i) => (
            <path
              key={i}
              d={`M310 ${i * gap - 50} Q420 ${120 + i * gap} 540 ${i * gap - 50} T770 ${i * gap - 50}`}
              {...(i % 4 === 0 ? accent : common)}
            />
          ))}
        </g>
      );
    case 6:
      return (
        <g transform={`translate(${shift} 0) rotate(${turn} 430 150)`}>
          <path
            d="M475 -80 L780 280 L780 380 L375 -80 Z"
            fill={color2}
            opacity="0.25"
          />
          {Array.from({ length: 11 }, (_, i) => (
            <path
              key={i}
              d={`M${320 - i * gap} ${240 + i * gap} L${480} ${10 - i * gap} L${640 + i * gap} ${240 + i * gap}`}
              {...(i % 4 === 0 ? accent : common)}
            />
          ))}
        </g>
      );
    default:
      return (
        <g transform={`translate(${shift} 0) rotate(${turn} 435 150)`}>
          <circle cx="550" cy="125" r="145" fill={color2} opacity="0.26" />
          {Array.from({ length: 13 }, (_, i) => (
            <circle
              key={i}
              cx={430 + Math.cos(i * 2.4) * i * gap}
              cy={145 + Math.sin(i * 2.4) * i * gap}
              r={10 + i * 3}
              {...(i % 4 === 0 ? accent : common)}
            />
          ))}
        </g>
      );
  }
}

export function CardArtwork({
  id,
  title,
  kind,
  category,
  art,
  legacyCover,
  settings,
  palette,
}: {
  id: string;
  title: string;
  kind: "brief" | "course" | "curriculum";
  category?: string;
  art?: CardArt;
  legacyCover?: string;
  settings?: Pick<SiteSettings, "accent" | "cardPalette">;
  palette?: CardPalette;
}) {
  const resolved = resolvedCardArt(id, title, art, legacyCover);
  const colors = palette || resolvedCardPalette(settings);
  const dark = (resolved.seed >>> 8) % 3 !== 0;
  const surface = dark
    ? mix(colors.base, "#0b1d2c", 0.72)
    : mix(colors.base, "#ffffff", 0.76);
  const highlight = dark
    ? mix(colors.accent1, "#0b1d2c", 0.56)
    : mix(colors.accent2, "#ffffff", 0.72);
  const line = dark
    ? mix(colors.accent1, "#ffffff", 0.3)
    : mix(colors.accent1, "#152f3d", 0.08);
  const detail = dark
    ? mix(colors.accent2, "#ffffff", 0.08)
    : mix(colors.accent2, "#ffffff", 0.1);
  const generated = (
    <>
      <svg
        className="card-artwork-geometry"
        viewBox="0 0 600 300"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        {geometry(resolved.seed, line, detail)}
      </svg>
      <div className="card-artwork-wash" aria-hidden="true" />
      <div className="card-artwork-copy">
        <span className="card-artwork-type">
          {kind === "brief"
            ? "Update"
            : kind === "course"
              ? "Course"
              : "Curriculum"}
          {category ? ` · ${category}` : ""}
        </span>
        <strong>{resolved.shortTitle || title}</strong>
      </div>
    </>
  );
  return (
    <div
      className="card-artwork"
      data-tone={dark ? "dark" : "light"}
      style={
        {
          "--card-base": surface,
          "--card-highlight": highlight,
        } as CSSProperties
      }
    >
      {resolved.source === "upload" && resolved.imageUrl ? (
        <CardImage src={resolved.imageUrl} fallback={generated} />
      ) : (
        generated
      )}
    </div>
  );
}
