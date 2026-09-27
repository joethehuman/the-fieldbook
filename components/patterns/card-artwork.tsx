import type { CSSProperties } from "react";
import type { CardArt, CardPalette } from "@/lib/card-art";
import { resolvedCardArt, resolvedCardPalette } from "@/lib/card-art";
import type { SiteSettings } from "@/lib/settings";
import { CardImage } from "./card-image";

function geometry(seed: number, color1: string, color2: string) {
  const family = seed % 8;
  const shift = ((seed >>> 8) % 95) - 42;
  const turn = ((seed >>> 17) % 50) - 25;
  const gap = 13 + ((seed >>> 23) % 13);
  const common = {
    fill: "none",
    stroke: color1,
    strokeWidth: 2,
    opacity: 0.52,
  };
  const accent = {
    fill: "none",
    stroke: color2,
    strokeWidth: 5,
    opacity: 0.65,
  };
  switch (family) {
    case 0:
      return (
        <g transform={`translate(${shift} 0) rotate(${turn} 430 145)`}>
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
  const backgroundPair = (
    [
      [colors.base, colors.accent2],
      [colors.accent2, colors.base],
      [colors.base, colors.accent1],
      [colors.accent1, colors.base],
    ] as const
  )[resolved.seed % 4];
  const generated = (
    <>
      <svg
        className="card-artwork-geometry"
        viewBox="0 0 600 300"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        {geometry(resolved.seed, colors.accent1, colors.accent2)}
      </svg>
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
      style={
        {
          "--card-base": backgroundPair[0],
          "--card-highlight": backgroundPair[1],
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
