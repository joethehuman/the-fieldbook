import type { CSSProperties } from "react";
import type { CardArt, CardPalette } from "@/lib/card-art";
import {
  artComposition,
  resolvedCardArt,
  resolvedCardPalette,
} from "@/lib/card-art";
import type { SiteSettings } from "@/lib/settings";
import { Badge } from "../ui/badge";
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

function geometryV1(seed: number, color1: string, color2: string) {
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

function geometryV2(seed: number, color1: string, color2: string) {
  const slot = artComposition(seed);
  const family = slot % 10;
  const variant = Math.floor(slot / 10);
  const drift = ((seed >>> 12) % 49) - 24;
  const angle = ((seed >>> 20) % 19) - 9;
  const fine = {
    fill: "none",
    stroke: color1,
    strokeWidth: 2.3,
    opacity: 0.76,
  };
  const bold = {
    fill: "none",
    stroke: color2,
    strokeWidth: 4.4,
    opacity: 0.85,
  };
  const stroke = (index: number, every = 4) =>
    index % every === 0 ? bold : fine;
  const ring = (index: number, cx: number, cy: number, radius: number) => (
    <circle key={index} cx={cx} cy={cy} r={radius} {...stroke(index)} />
  );
  let motif;
  switch (family) {
    case 0: // Rings, orbits, and a scatter of bubbles.
      motif =
        variant === 0 ? (
          <>
            <circle cx="515" cy="100" r="160" fill={color2} opacity="0.23" />
            {Array.from({ length: 11 }, (_, i) =>
              ring(i, 505, 150, 28 + i * 19),
            )}
          </>
        ) : variant === 1 ? (
          <>
            <circle cx="600" cy="40" r="160" fill={color2} opacity="0.3" />
            {Array.from({ length: 19 }, (_, i) =>
              ring(
                i,
                330 + ((i * 113) % 320),
                16 + ((i * 71) % 300),
                9 + ((i * 17) % 42),
              ),
            )}
          </>
        ) : (
          <>
            <ellipse
              cx="535"
              cy="155"
              rx="205"
              ry="90"
              fill={color2}
              opacity="0.25"
              transform="rotate(-28 535 155)"
            />
            {Array.from({ length: 10 }, (_, i) => (
              <ellipse
                key={i}
                cx="520"
                cy="155"
                rx={52 + i * 23}
                ry={18 + i * 10}
                transform="rotate(-28 520 155)"
                {...stroke(i)}
              />
            ))}
          </>
        );
      break;
    case 1: // Three different directions of flowing contours.
      motif =
        variant === 0 ? (
          <>
            <path
              d="M390 -40 Q570 135 385 340 H720 V-40 Z"
              fill={color2}
              opacity="0.26"
            />
            {Array.from({ length: 15 }, (_, i) => (
              <path
                key={i}
                d={`M${300 + i * 21} -35 C${215 + i * 20} 85 ${650 - i * 7} 215 ${335 + i * 21} 340`}
                {...stroke(i, 5)}
              />
            ))}
          </>
        ) : variant === 1 ? (
          <>
            <circle cx="570" cy="-45" r="185" fill={color2} opacity="0.22" />
            {Array.from({ length: 12 }, (_, i) => (
              <path
                key={i}
                d={`M${260 + i * 22} -40 Q${355 + i * 18} ${110 + i * 10} ${515 + i * 16} -40`}
                {...stroke(i, 3)}
              />
            ))}
          </>
        ) : (
          <>
            <circle cx="625" cy="315" r="180" fill={color2} opacity="0.25" />
            {Array.from({ length: 13 }, (_, i) => (
              <path
                key={i}
                d={`M${285 + i * 20} 340 Q${360 + i * 15} ${155 - i * 9} ${700 + i * 5} 340`}
                {...stroke(i, 4)}
              />
            ))}
          </>
        );
      break;
    case 2: // Nested frames, window panes, and a diamond lattice.
      motif =
        variant === 0 ? (
          <>
            <rect
              x="425"
              y="-65"
              width="290"
              height="290"
              rx="45"
              fill={color2}
              opacity="0.25"
            />
            {Array.from({ length: 10 }, (_, i) => (
              <rect
                key={i}
                x={440 - i * 17}
                y={125 - i * 17}
                width={45 + i * 34}
                height={45 + i * 34}
                rx={8 + i * 3}
                {...stroke(i, 3)}
              />
            ))}
          </>
        ) : variant === 1 ? (
          <>
            <path d="M380 -60 H690 V360 H380 Z" fill={color2} opacity="0.23" />
            {Array.from({ length: 8 }, (_, i) => (
              <rect
                key={i}
                x={325 + (i % 4) * 91}
                y={-68 + Math.floor(i / 4) * 175}
                width="72"
                height="152"
                rx="34"
                {...stroke(i, 3)}
              />
            ))}
          </>
        ) : (
          <>
            <path
              d="M570 -75 L770 135 L450 370 L250 155 Z"
              fill={color2}
              opacity="0.24"
            />
            {Array.from({ length: 10 }, (_, i) => (
              <path
                key={i}
                d={`M${330 + i * 46} -50 L${165 + i * 46} 330 M${280 + i * 47} -50 L${640 + i * 47} 330`}
                {...stroke(i, 4)}
              />
            ))}
          </>
        );
      break;
    case 3: // Slashes, crossings, and a fan of straight lines.
      motif =
        variant === 0 ? (
          <>
            <path d="M470 -70 H730 V370 H310 Z" fill={color2} opacity="0.25" />
            {Array.from({ length: 15 }, (_, i) => (
              <path
                key={i}
                d={`M${280 + i * 25} -45 L${560 + i * 25} 345`}
                {...stroke(i, 5)}
              />
            ))}
          </>
        ) : variant === 1 ? (
          <>
            <path
              d="M510 -70 L760 130 L490 370 L250 155 Z"
              fill={color2}
              opacity="0.24"
            />
            {Array.from({ length: 10 }, (_, i) => (
              <path
                key={i}
                d={`M${270 + i * 31} -50 L${540 + i * 31} 345 M${700 - i * 31} -45 L${330 - i * 20} 345`}
                {...stroke(i, 4)}
              />
            ))}
          </>
        ) : (
          <>
            <circle cx="670" cy="150" r="200" fill={color2} opacity="0.24" />
            {Array.from({ length: 19 }, (_, i) => (
              <path
                key={i}
                d={`M690 145 L${310 + i * 26} ${-95 + i * 28}`}
                {...stroke(i, 5)}
              />
            ))}
          </>
        );
      break;
    case 4: // Rising, falling, and opposing arcs.
      motif =
        variant === 0 ? (
          <>
            <circle cx="660" cy="325" r="165" fill={color2} opacity="0.31" />
            {Array.from({ length: 12 }, (_, i) => (
              <path
                key={i}
                d={`M${280 + i * 17} 330 A${150 + i * 17} ${150 + i * 17} 0 0 1 690 ${48 - i * 17}`}
                {...stroke(i)}
              />
            ))}
          </>
        ) : variant === 1 ? (
          <>
            <circle cx="650" cy="-45" r="155" fill={color2} opacity="0.29" />
            {Array.from({ length: 12 }, (_, i) => (
              <path
                key={i}
                d={`M${255 + i * 18} -40 A${160 + i * 15} ${160 + i * 15} 0 0 0 690 ${255 + i * 17}`}
                {...stroke(i)}
              />
            ))}
          </>
        ) : (
          <>
            <path d="M450 -60 H710 V350 H450 Z" fill={color2} opacity="0.22" />
            {Array.from({ length: 9 }, (_, i) => (
              <path
                key={i}
                d={`M${315 + i * 29} -60 C${590 + i * 15} 90 ${245 + i * 25} 220 ${580 + i * 30} 355`}
                {...stroke(i, 3)}
              />
            ))}
          </>
        );
      break;
    case 5: // Horizontal waves, vertical waves, and crossings.
      motif =
        variant === 0 ? (
          <>
            <path
              d="M360 -70 Q480 90 690 -70 V370 Q480 235 360 370 Z"
              fill={color2}
              opacity="0.25"
            />
            {Array.from({ length: 13 }, (_, i) => (
              <path
                key={i}
                d={`M295 ${i * 25 - 35} Q430 ${i * 25 + 90} 565 ${i * 25 - 35} T835 ${i * 25 - 35}`}
                {...stroke(i)}
              />
            ))}
          </>
        ) : variant === 1 ? (
          <>
            <path d="M330 -70 H735 V370 H330 Z" fill={color2} opacity="0.2" />
            {Array.from({ length: 14 }, (_, i) => (
              <path
                key={i}
                d={`M${340 + i * 28} -70 Q${250 + i * 25} 80 ${400 + i * 24} 155 T${360 + i * 28} 375`}
                {...stroke(i, 5)}
              />
            ))}
          </>
        ) : (
          <>
            <circle cx="650" cy="155" r="190" fill={color2} opacity="0.22" />
            {Array.from({ length: 10 }, (_, i) => (
              <path
                key={i}
                d={`M270 ${-80 + i * 44} Q460 ${80 + i * 13} 690 ${-20 + i * 35}`}
                {...stroke(i, 3)}
              />
            ))}
          </>
        );
      break;
    case 6: // Peaks, steps, and triangles.
      motif =
        variant === 0 ? (
          <>
            <path
              d="M490 -70 L760 280 V370 L365 -70 Z"
              fill={color2}
              opacity="0.28"
            />
            {Array.from({ length: 11 }, (_, i) => (
              <path
                key={i}
                d={`M${320 - i * 18} ${235 + i * 19} L480 ${-10 - i * 16} L${645 + i * 18} ${235 + i * 19}`}
                {...stroke(i)}
              />
            ))}
          </>
        ) : variant === 1 ? (
          <>
            <path d="M445 -50 H700 V340 H445 Z" fill={color2} opacity="0.24" />
            {Array.from({ length: 11 }, (_, i) => (
              <path
                key={i}
                d={`M${345 + i * 27} -50 V${30 + i * 18} H${565 + i * 19} V350`}
                {...stroke(i, 4)}
              />
            ))}
          </>
        ) : (
          <>
            <path d="M560 -80 L760 330 H360 Z" fill={color2} opacity="0.29" />
            {Array.from({ length: 10 }, (_, i) => (
              <path
                key={i}
                d={`M${550 - i * 15} ${-55 + i * 23} L${385 - i * 14} ${330 + i * 15} H${720 + i * 15} Z`}
                {...stroke(i, 3)}
              />
            ))}
          </>
        );
      break;
    case 7: // Spiral bubbles, a dot grid, and a constellation.
      motif =
        variant === 0 ? (
          <>
            <circle cx="575" cy="135" r="150" fill={color2} opacity="0.26" />
            {Array.from({ length: 14 }, (_, i) =>
              ring(
                i,
                475 + Math.cos(i * 2.4) * i * 16,
                150 + Math.sin(i * 2.4) * i * 13,
                9 + i * 2.7,
              ),
            )}
          </>
        ) : variant === 1 ? (
          <>
            <rect
              x="370"
              y="-30"
              width="360"
              height="360"
              rx="180"
              fill={color2}
              opacity="0.22"
            />
            {Array.from({ length: 56 }, (_, i) =>
              ring(
                i,
                365 + (i % 8) * 48,
                -5 + Math.floor(i / 8) * 48,
                5 + ((i * 7) % 13),
              ),
            )}
          </>
        ) : (
          <>
            <path
              d="M320 90 L450 20 L580 115 L690 45 M385 280 L505 180 L650 245"
              {...bold}
            />
            {Array.from({ length: 16 }, (_, i) =>
              ring(
                i,
                320 + ((i * 71) % 370),
                10 + ((i * 137) % 280),
                4 + ((i * 13) % 19),
              ),
            )}
          </>
        );
      break;
    case 8: // Wide bands with three different orientations.
      motif =
        variant === 0 ? (
          <>
            {Array.from({ length: 9 }, (_, i) => (
              <path
                key={i}
                d={`M${350 + i * 45} -70 V370`}
                stroke={i % 3 === 0 ? color2 : color1}
                strokeWidth={i % 3 === 0 ? 25 : 9}
                opacity={i % 3 === 0 ? 0.38 : 0.55}
              />
            ))}
          </>
        ) : variant === 1 ? (
          <>
            {Array.from({ length: 10 }, (_, i) => (
              <path
                key={i}
                d={`M310 ${-45 + i * 43} Q500 ${65 + i * 43} 740 ${-45 + i * 43}`}
                stroke={i % 3 === 0 ? color2 : color1}
                strokeWidth={i % 3 === 0 ? 17 : 5}
                fill="none"
                opacity="0.62"
              />
            ))}
          </>
        ) : (
          <>
            {Array.from({ length: 10 }, (_, i) => (
              <path
                key={i}
                d={`M${310 + i * 49} -80 L${90 + i * 49} 380`}
                stroke={i % 3 === 0 ? color2 : color1}
                strokeWidth={i % 3 === 0 ? 18 : 5}
                opacity="0.6"
              />
            ))}
          </>
        );
      break;
    default: // Radiating beams from three separate anchors.
      motif =
        variant === 0 ? (
          <>
            <circle cx="705" cy="145" r="185" fill={color2} opacity="0.24" />
            {Array.from({ length: 17 }, (_, i) => (
              <path
                key={i}
                d={`M705 145 L${290 + i * 24} ${-90 + i * 29}`}
                {...stroke(i, 4)}
              />
            ))}
          </>
        ) : variant === 1 ? (
          <>
            <circle cx="485" cy="-65" r="145" fill={color2} opacity="0.28" />
            {Array.from({ length: 17 }, (_, i) => (
              <path
                key={i}
                d={`M485 -65 L${260 + i * 31} 365`}
                {...stroke(i, 4)}
              />
            ))}
          </>
        ) : (
          <>
            <circle cx="515" cy="345" r="165" fill={color2} opacity="0.27" />
            {Array.from({ length: 17 }, (_, i) => (
              <path
                key={i}
                d={`M515 345 L${255 + i * 34} -65`}
                {...stroke(i, 4)}
              />
            ))}
          </>
        );
  }
  return (
    <g transform={`translate(${drift} 0) rotate(${angle} 485 150)`}>{motif}</g>
  );
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
  relevance,
}: {
  id: string;
  title: string;
  kind: "brief" | "course" | "curriculum";
  category?: string;
  art?: CardArt;
  legacyCover?: string;
  settings?: Pick<SiteSettings, "accent" | "cardPalette">;
  palette?: CardPalette;
  relevance?: "For you" | "Past due";
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
  const learning = kind !== "brief";
  const learningHeader = (
    <div className="card-artwork-learning-header">
      <div className="flex items-start justify-between gap-2">
        <span className="card-artwork-type">
          {kind === "course" ? "Course" : "Curriculum"}
        </span>
        {relevance && (
          <Badge
            variant={relevance === "Past due" ? "destructive-soft" : "default"}
          >
            {relevance}
          </Badge>
        )}
      </div>
      {kind === "course" && category && (
        <span className="card-artwork-category">{category}</span>
      )}
    </div>
  );
  const generated = (
    <>
      <svg
        className="card-artwork-geometry"
        viewBox="0 0 600 300"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        {resolved.version === 1
          ? geometryV1(resolved.seed, line, detail)
          : geometryV2(resolved.seed, line, detail)}
      </svg>
      <div className="card-artwork-wash" aria-hidden="true" />
      <div className="card-artwork-copy">
        {learning ? (
          learningHeader
        ) : (
          <span className="card-artwork-type">
            Update{category ? ` · ${category}` : ""}
          </span>
        )}
        <strong>{resolved.shortTitle || title}</strong>
      </div>
    </>
  );
  return (
    <div
      className="card-artwork"
      data-art-composition={
        resolved.version === 2 ? artComposition(resolved.seed) : undefined
      }
      data-tone={dark ? "dark" : "light"}
      data-kind={kind}
      style={
        {
          "--card-base": surface,
          "--card-highlight": highlight,
        } as CSSProperties
      }
    >
      {resolved.source === "upload" && resolved.imageUrl ? (
        <CardImage
          src={resolved.imageUrl}
          fallback={generated}
          overlay={
            learning ? (
              <div className="card-artwork-upload-header">{learningHeader}</div>
            ) : undefined
          }
        />
      ) : (
        generated
      )}
    </div>
  );
}
