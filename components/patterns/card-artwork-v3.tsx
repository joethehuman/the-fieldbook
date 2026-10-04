import type { ReactNode } from "react";
import { cardArtStructure } from "@/lib/card-art-composition";

const series = (count: number, draw: (index: number) => ReactNode) =>
  Array.from({ length: count }, (_, index) => draw(index));
const point = (x: number, y: number) => `${x.toFixed(2)} ${y.toFixed(2)}`;

/**
 * Version 3 is intentionally independent of the frozen V1/V2 recipes.
 * Each family interprets three bounded structural choices. Rhythm couples count
 * and spacing; proportion changes shape; placement moves the whole relationship.
 * The focal geometry stays inside the center crop of an 18rem by 11.25rem card.
 */
export function CardArtworkV3({
  seed,
  line,
  detail,
}: {
  seed: number;
  line: string;
  detail: string;
}) {
  const { family, recipe, rhythm, proportion, placement } =
    cardArtStructure(seed);
  const x = [408, 438, 468][placement];
  const y = [128, 156, 112][placement];
  const count = [7, 10, 13][rhythm];
  const fine = { fill: "none", stroke: line, strokeWidth: 2, opacity: 0.68 };
  const accent = {
    fill: "none",
    stroke: detail,
    strokeWidth: 3.6,
    opacity: 0.88,
  };
  const ink = (i: number) => (i % 5 === 1 ? accent : fine);
  const layer = { fill: detail, opacity: 0.16 };
  const radius = [112, 138, 162][proportion];

  switch (family) {
    case 0: {
      // A single center, coupled orbit, or elongated orbital system.
      if (recipe === 1) {
        const outer = [70, 84, 100][proportion];
        const bank = (cx: number, cy: number, size: number) => (
          <g>
            <circle cx={cx} cy={cy} r={size * 0.45} {...layer} />
            {series([5, 7, 9][rhythm], (i) => (
              <circle
                key={i}
                cx={cx}
                cy={cy}
                r={16 + (i * (size - 16)) / ([5, 7, 9][rhythm] - 1)}
                {...ink(i)}
              />
            ))}
          </g>
        );
        return (
          <g>
            {bank(x - 42, y + 78, outer)}
            {bank(x + 65, y - 76, outer * 0.68)}
          </g>
        );
      }
      const rx = recipe === 2 ? radius * 1.18 : radius;
      const ratio = recipe === 2 ? [0.38, 0.55, 0.72][proportion] : 1;
      const gap = radius / (count - 2);
      return (
        <g>
          <ellipse
            cx={x}
            cy={y}
            rx={rx * 0.46}
            ry={rx * 0.46 * ratio}
            {...layer}
          />
          <ellipse
            cx={x}
            cy={y}
            rx={rx * 0.76}
            ry={rx * 0.76 * ratio}
            fill="none"
            stroke={detail}
            strokeWidth={gap * 0.58}
            opacity="0.18"
          />
          {series(count, (i) => (
            <ellipse
              key={i}
              cx={x}
              cy={y}
              rx={28 + i * gap}
              ry={(28 + i * gap) * ratio}
              {...ink(i)}
            />
          ))}
        </g>
      );
    }
    case 1: {
      // Parallel contours share a spine: no converging control points.
      const bend = [68, 112, 150][proportion];
      const gap = [27, 20, 15][rhythm];
      const start = x - 130 - (recipe === 1 ? bend * 0.7 : 0);
      const spine =
        recipe === 0
          ? `M0 -60 C${-bend} 60 ${bend} 220 0 360`
          : recipe === 1
            ? `M0 -60 C${bend * 1.35} 80 ${bend * 1.35} 200 0 360`
            : `M0 -60 C${-bend} 60 ${-bend * 0.7} 260 ${bend} 360`;
      return (
        <g>
          <path
            d={spine}
            transform={`translate(${start + gap * 5} 0)`}
            fill="none"
            stroke={detail}
            strokeWidth={gap * 2.4}
            opacity="0.16"
          />
          {series(count + 3, (i) => (
            <path
              key={i}
              d={spine}
              transform={`translate(${start + i * gap} 0)`}
              {...ink(i)}
            />
          ))}
        </g>
      );
    }
    case 2: {
      // Nested rounded frames, tall portals, and nested diamonds.
      const n = [6, 8, 10][rhythm];
      const step = [24, 18, 14][rhythm];
      const aspect = [0.72, 1, 1.28][proportion];
      const corners = [12, 25, 42][proportion];
      if (recipe === 1) {
        const halfWidth = [22, 30, 40][proportion];
        const halfHeight = [92, 74, 58][proportion];
        const portal = (cx: number, cy: number, offset: number) => (
          <g transform={`translate(${cx} ${cy})`}>
            <rect
              x={-halfWidth}
              y={-halfHeight}
              width={halfWidth * 2}
              height={halfHeight * 2}
              rx={halfWidth}
              {...layer}
            />
            {series(n, (i) => (
              <rect
                key={i}
                x={-halfWidth - i * 12}
                y={-halfHeight - i * step}
                width={halfWidth * 2 + i * 24}
                height={halfHeight * 2 + i * step * 2}
                rx={halfWidth + i * 12}
                {...ink(i + offset)}
              />
            ))}
          </g>
        );
        return portal(x - 24, y + 58, 0);
      }
      if (recipe === 2)
        return (
          <g>
            <path
              d={`M${x} ${y - 62 * aspect} L${x + 62} ${y} L${x} ${y + 62 * aspect} L${x - 62} ${y} Z`}
              {...layer}
            />
            {series(n + 2, (i) => {
              const r = 28 + i * step;
              return (
                <path
                  key={i}
                  d={`M${x} ${y - r * aspect} L${x + r} ${y} L${x} ${y + r * aspect} L${x - r} ${y} Z`}
                  {...ink(i)}
                  strokeLinejoin="round"
                />
              );
            })}
          </g>
        );
      return (
        <g>
          <rect
            x={x - 43}
            y={y - 43 * aspect}
            width="86"
            height={86 * aspect}
            rx={corners}
            {...layer}
          />
          {series(n, (i) => {
            const r = 32 + i * step;
            return (
              <rect
                key={i}
                x={x - r}
                y={y - r * aspect}
                width={r * 2}
                height={r * 2 * aspect}
                rx={Math.min(corners + i * 5, r)}
                {...ink(i)}
              />
            );
          })}
        </g>
      );
    }
    case 3: {
      // Parallel slash, herringbone, and folded parallel bundles.
      const gap = [32, 24, 18][rhythm];
      const lean = [120, 175, 230][proportion];
      if (recipe === 1)
        return (
          <g>
            <path
              d={`M${x - 80} -40 L${x + 70} 150 L${x - 80} 340 L${x + 100} 340 L${x + 250} 150 L${x + 100} -40 Z`}
              {...layer}
            />
            {series(count + 2, (i) => (
              <path
                key={i}
                d={`M${x - 180 + i * gap} -45 L${x - 180 + i * gap + lean} 150 L${x - 180 + i * gap} 345`}
                {...ink(i)}
                strokeLinejoin="round"
              />
            ))}
          </g>
        );
      const slash = (a: number, b: number) =>
        recipe === 2
          ? `M${a} -55 L${a + lean * 0.25} 90 L${a + lean * 0.72} 190 L${b} 355`
          : `M${a} -55 L${b} 355`;
      return (
        <g>
          <path
            d={slash(x, x + lean)}
            fill="none"
            stroke={detail}
            strokeWidth={gap * 2.1}
            opacity="0.18"
          />
          {series(count + 2, (i) => {
            const a = x - 165 + i * gap;
            return <path key={i} d={slash(a, a + lean)} {...ink(i)} />;
          })}
        </g>
      );
    }
    case 4: {
      // Arc banks built from actual shared centers.
      const gap = [25, 19, 14][rhythm];
      const r0 = [40, 70, 100][proportion];
      const cy = recipe === 0 ? 305 : recipe === 1 ? -5 : y;
      const cx = x + 20;
      const arc = (
        r: number,
        start: number,
        end: number,
        centerX = cx,
        centerY = cy,
      ) => {
        const a = (start * Math.PI) / 180,
          b = (end * Math.PI) / 180;
        return `M${point(centerX + Math.cos(a) * r, centerY + Math.sin(a) * r)} A${r} ${r} 0 0 1 ${point(centerX + Math.cos(b) * r, centerY + Math.sin(b) * r)}`;
      };
      const start = recipe === 0 ? 180 : recipe === 1 ? 0 : 98;
      const end = recipe === 0 ? 360 : recipe === 1 ? 180 : 262;
      return (
        <g>
          <path
            d={arc(r0 + gap * 3.5, start, end)}
            fill="none"
            stroke={detail}
            strokeWidth={gap * 1.5}
            opacity="0.2"
          />
          {series(count, (i) => (
            <path key={i} d={arc(r0 + i * gap, start, end)} {...ink(i)} />
          ))}
          {recipe === 2 &&
            series(4, (i) => (
              <path
                key={`echo-${i}`}
                d={arc(30 + i * gap, -82, 82, cx - 10, cy)}
                {...fine}
              />
            ))}
        </g>
      );
    }
    case 5: {
      // Related wavefronts; translation preserves the spacing at crests.
      const amplitude = [32, 60, 88][proportion];
      const gap = [33, 25, 19][rhythm];
      const wave =
        recipe === 1
          ? `M0 -60 C${-amplitude} 10 ${amplitude} 90 0 150 S${-amplitude} 290 0 360`
          : `M-265 0 C-155 ${-amplitude} -110 ${amplitude} -20 0 S115 ${-amplitude} 225 0 S380 ${amplitude} 470 0 S605 ${-amplitude} 735 0`;
      return (
        <g>
          <path
            d={wave}
            transform={
              recipe === 1
                ? `translate(${x + 35} 0)`
                : `translate(0 ${y + 26})${recipe === 2 ? ` rotate(-24 ${x} 0)` : ""}`
            }
            fill="none"
            stroke={detail}
            strokeWidth={gap * 1.5}
            opacity="0.19"
          />
          {series(count + 3, (i) => {
            const offset = recipe === 1 ? x - 118 + i * gap : y - 185 + i * gap;
            return (
              <path
                key={i}
                d={wave}
                transform={
                  recipe === 1
                    ? `translate(${offset} 0)`
                    : `translate(0 ${offset})${recipe === 2 ? ` rotate(-24 ${x} 0)` : ""}`
                }
                {...ink(i)}
              />
            );
          })}
        </g>
      );
    }
    case 6: {
      // Folded peaks, nested stairs, and concentric triangles.
      const gap = [30, 23, 17][rhythm];
      const peak = [75, 108, 144][proportion];
      const stepWidth = [72, 90, 112][proportion];
      const stepHeight = [64, 80, 100][proportion];
      const slope = [0.68, 0.88, 1.08][proportion];
      if (recipe === 2) {
        const triangle = (r: number) =>
          `M${x} ${y - r} L${x + r * slope} ${y + r * 0.58} H${x - r * slope} Z`;
        return (
          <g>
            <path d={triangle(85 + proportion * 20)} {...layer} />
            {series(count, (i) => (
              <path
                key={i}
                d={triangle(30 + i * gap)}
                {...ink(i)}
                strokeLinejoin="round"
              />
            ))}
          </g>
        );
      }
      const ridge = (offset: number) =>
        recipe === 0
          ? `M-100 ${offset + ((peak + 28) * (x + 100)) / (x - 230)} L${x} ${offset} L${x + 138} ${offset + peak} L720 ${offset - 30}`
          : `M-100 ${offset + stepHeight * 2} H${x - stepWidth + offset - y} V${offset + stepHeight} H${x + offset - y} V${offset} H${x + stepWidth + offset - y} V${offset - stepHeight} H820`;
      return (
        <g>
          <path
            d={ridge(y - 5)}
            fill="none"
            stroke={detail}
            strokeWidth={gap * 1.5}
            opacity="0.18"
            strokeLinejoin="round"
          />
          {series(count + 2, (i) => (
            <path
              key={i}
              d={ridge(y - 165 + i * gap)}
              {...ink(i)}
              strokeLinejoin="round"
            />
          ))}
        </g>
      );
    }
    case 7: {
      // Curated circles, a graded dot field, or a connected constellation.
      if (recipe === 0) {
        // Minimum center distances exceed the sum of neighboring radii at all sizes.
        const scale = [0.82, 1, 1.12][proportion];
        const bubbles = [
          [0, 0, 46],
          [86, -50, 30],
          [94, 58, 36],
          [-60, 86, 23],
          [32, 108, 27],
          [-70, -74, 20],
          [152, -12, 19],
          [170, 126, 42],
          [20, -112, 22],
          [-105, 16, 16],
        ];
        return (
          <g transform={`translate(${x} ${y})`}>
            {bubbles.slice(0, [6, 8, 10][rhythm]).map(([cx, cy, r], i) => (
              <g key={i} transform={`translate(${cx} ${cy})`}>
                {i % 3 === 0 && <circle r={r * scale} {...layer} />}
                <circle r={r * scale} {...ink(i)} />
                {i === 0 && <circle r={r * scale * 0.68} {...fine} />}
              </g>
            ))}
          </g>
        );
      }
      if (recipe === 1) {
        const pitch = [38, 30, 25][rhythm];
        const cols = [7, 9, 11][rhythm],
          rows = [8, 10, 12][rhythm];
        return (
          <g>
            {series(cols * rows, (i) => {
              const col = i % cols,
                row = Math.floor(i / cols);
              const cx = x - 78 + col * pitch;
              const cy = -20 + row * pitch;
              const distance = Math.hypot((cx - x - 45) / 140, (cy - y) / 170);
              const r = Math.max(
                2.2,
                pitch *
                  [0.25, 0.32, 0.39][proportion] *
                  Math.max(0.23, 1 - distance * 0.55),
              );
              return (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={col === 2 || row === 4 ? detail : line}
                  opacity={0.34 + Math.max(0, 1 - distance) * 0.35}
                />
              );
            })}
          </g>
        );
      }
      const spread = [0.86, 1, 1.1][proportion];
      const nodes = [
        [-64, -65, 13],
        [0, 0, 30],
        [72, -81, 18],
        [99, 78, 24],
        [-43, 116, 15],
        [165, -12, 12],
        [6, -140, 10],
        [190, 133, 14],
      ]
        .slice(0, [5, 6, 8][rhythm])
        .map(
          ([dx, dy, r]) => [x - 36 + dx * spread, y + dy * spread, r] as const,
        );
      const links = [
        [0, 1],
        [1, 2],
        [1, 3],
        [1, 4],
        [2, 5],
        [0, 6],
        [3, 7],
      ];
      return (
        <g>
          {links
            .filter(([a, b]) => nodes[a] && nodes[b])
            .map(([a, b]) => {
              const [ax, ay, ar] = nodes[a],
                [bx, by, br] = nodes[b];
              const length = Math.hypot(bx - ax, by - ay);
              const ux = (bx - ax) / length,
                uy = (by - ay) / length;
              return (
                <path
                  key={`${a}-${b}`}
                  d={`M${point(ax + ux * (ar + 7), ay + uy * (ar + 7))} L${point(bx - ux * (br + 7), by - uy * (br + 7))}`}
                  {...fine}
                />
              );
            })}
          {nodes.map(([cx, cy, r], i) => (
            <g key={i}>
              {i === 1 && <circle cx={cx} cy={cy} r={r} {...layer} />}
              <circle
                cx={cx}
                cy={cy}
                r={r}
                {...(i === 1 || i === 3 ? accent : fine)}
              />
              {i === 1 && (
                <circle cx={cx} cy={cy} r="8" fill={detail} opacity="0.8" />
              )}
            </g>
          ))}
        </g>
      );
    }
    case 8: {
      // Ribbon systems have a wide voice and a related fine echo.
      const n = [5, 7, 9][rhythm];
      const pitch = [55, 42, 32][rhythm];
      const bend = [32, 80, 125][proportion];
      const lean = [120, 200, 280][proportion];
      const band = (offset: number) =>
        recipe === 0
          ? `M${offset} -60 C${offset - bend} 70 ${offset + bend} 220 ${offset} 360`
          : recipe === 1
            ? `M-100 ${offset} Q${x} ${offset + bend} 735 ${offset - 20}`
            : `M${offset + lean * 0.65} -60 L${offset - lean * 0.35} 360`;
      return (
        <g>
          {series(n, (i) => {
            const offset =
              recipe === 1
                ? y - 140 + i * pitch
                : x - (recipe === 2 ? 180 : 100) + i * pitch;
            return (
              <g key={i}>
                <path
                  d={band(offset)}
                  fill="none"
                  stroke={i % 3 === 1 ? detail : line}
                  strokeWidth={pitch * (i % 3 === 1 ? 0.58 : 0.28)}
                  opacity={i % 3 === 1 ? 0.48 : 0.38}
                />
                <path
                  d={band(offset + pitch * 0.39)}
                  {...fine}
                  opacity="0.55"
                />
              </g>
            );
          })}
        </g>
      );
    }
    default: {
      // Angular spacing, a clear aperture, and a related annular sector.
      const cx = recipe === 0 ? x + 65 : x;
      const cy = recipe === 0 ? y : recipe === 1 ? -28 : 328;
      const start = recipe === 0 ? 112 : recipe === 1 ? 10 : 194;
      const sweep = [98, 128, 158][proportion];
      const n = [12, 18, 24][rhythm];
      const inside = [38, 55, 72][proportion];
      const polar = (r: number, degrees: number) =>
        point(
          cx + Math.cos((degrees * Math.PI) / 180) * r,
          cy + Math.sin((degrees * Math.PI) / 180) * r,
        );
      const a = start + sweep * 0.3,
        b = start + sweep * 0.6;
      return (
        <g>
          <path
            d={`M${polar(inside, a)} L${polar(390, a)} A390 390 0 0 1 ${polar(390, b)} L${polar(inside, b)} A${inside} ${inside} 0 0 0 ${polar(inside, a)} Z`}
            {...layer}
          />
          {series(n, (i) => {
            const degrees = start + (i * sweep) / (n - 1);
            return (
              <path
                key={i}
                d={`M${polar(inside, degrees)} L${polar(560, degrees)}`}
                {...ink(i)}
              />
            );
          })}
          <path
            d={`M${polar(inside, start)} A${inside} ${inside} 0 0 1 ${polar(inside, start + sweep)}`}
            {...accent}
          />
        </g>
      );
    }
  }
}
