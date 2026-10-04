import type { ReactNode } from "react";
import { cardArtStructure } from "@/lib/card-art-composition";

type Point = readonly [number, number];
type Segment =
  | readonly [number, number]
  | readonly [number, number, number, number, number, number];
type Curve = { start: Point; segments: readonly Segment[] };
const series = (n: number, draw: (i: number) => ReactNode) =>
  Array.from({ length: n }, (_, i) => draw(i));
const point = (x: number, y: number) => `${+x.toFixed(3)} ${+y.toFixed(3)}`;

/** Trace the same geometry in either direction. Bands close between two exact
 * translated contours, so their edges cannot drift away from the linework. */
function trace(curve: Curve, shift: Point = [0, 0], reverse = false) {
  const p = (x: number, y: number) => point(x + shift[0], y + shift[1]);
  const ends: Point[] = [
    curve.start,
    ...curve.segments.map((s) => [s[s.length - 2], s[s.length - 1]] as Point),
  ];
  if (!reverse)
    return (
      `M${p(...curve.start)}` +
      curve.segments
        .map((s) =>
          s.length === 2
            ? `L${p(s[0], s[1])}`
            : `C${p(s[0], s[1])} ${p(s[2], s[3])} ${p(s[4], s[5])}`,
        )
        .join("")
    );
  return (
    `M${p(...ends[ends.length - 1])}` +
    [...curve.segments]
      .reverse()
      .map((s, j) => {
        const end = ends[curve.segments.length - 1 - j];
        return s.length === 2
          ? `L${p(...end)}`
          : `C${p(s[2], s[3])} ${p(s[0], s[1])} ${p(...end)}`;
      })
      .join("")
  );
}
const between = (curve: Curve, a: Point, b: Point) =>
  trace(curve, a) + trace(curve, b, true).replace(/^M/, "L") + "Z";
const ellipse = (cx: number, cy: number, rx: number, ry: number) =>
  `M${point(cx - rx, cy)} A${rx} ${ry} 0 1 0 ${point(cx + rx, cy)} A${rx} ${ry} 0 1 0 ${point(cx - rx, cy)} Z`;
function roundedFrame(cx: number, cy: number, w: number, h: number, r: number) {
  return `M${point(cx - w + r, cy - h)} H${cx + w - r} A${r} ${r} 0 0 1 ${point(cx + w, cy - h + r)} V${cy + h - r} A${r} ${r} 0 0 1 ${point(cx + w - r, cy + h)} H${cx - w + r} A${r} ${r} 0 0 1 ${point(cx - w, cy + h - r)} V${cy - h + r} A${r} ${r} 0 0 1 ${point(cx - w + r, cy - h)} Z`;
}
const polar = (cx: number, cy: number, r: number, angle: number) =>
  point(
    cx + Math.cos((angle * Math.PI) / 180) * r,
    cy + Math.sin((angle * Math.PI) / 180) * r,
  );
const arc = (cx: number, cy: number, r: number, a: number, b: number) =>
  `M${polar(cx, cy, r, a)} A${r} ${r} 0 ${b - a > 180 ? 1 : 0} 1 ${polar(cx, cy, r, b)}`;
const annularSector = (
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  a: number,
  b: number,
) =>
  `${arc(cx, cy, outer, a, b)} L${polar(cx, cy, inner, b)} A${inner} ${inner} 0 ${b - a > 180 ? 1 : 0} 0 ${polar(cx, cy, inner, a)} Z`;

/** A restrained refinement of V3's thirty recipes. Filled regions share their
 * boundaries with visible contours; there are no independent decorative layers.
 * The three existing structural axes and ten-family recipe order remain fixed. */
export function CardArtworkV5({
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
  const x = [408, 438, 468][placement],
    y = [128, 156, 112][placement];
  const count = [7, 10, 13][rhythm];
  const fine = { fill: "none", stroke: line, strokeWidth: 2, opacity: 0.68 };
  const accent = {
    fill: "none",
    stroke: detail,
    strokeWidth: 3.6,
    opacity: 0.88,
  };
  const field = { fill: detail, opacity: 0.14 };
  const ink = (i: number, n = count) =>
    i === Math.floor(n * 0.55) ? accent : fine;
  const highlight = (n: number) => Math.max(1, Math.floor(n * 0.55));
  // A single filled interval and one accent contour keep the hierarchy quiet.
  const closedBank = (
    n: number,
    shape: (i: number) => string,
    fillCore = false,
  ) => (
    <g>
      {fillCore && <path d={shape(0)} {...field} />}
      <path
        d={`${shape(highlight(n))} ${shape(highlight(n) - 1)}`}
        {...field}
        fillRule="evenodd"
      />
      {series(n, (i) => (
        <path key={i} d={shape(i)} {...ink(i, n)} />
      ))}
    </g>
  );
  const openBank = (curve: Curve, shifts: Point[]) => {
    const k = highlight(shifts.length);
    return (
      <g>
        <path d={between(curve, shifts[k - 1], shifts[k])} {...field} />
        {shifts.map((shift, i) => (
          <path
            key={i}
            d={trace(curve, shift)}
            {...ink(i, shifts.length)}
            strokeLinejoin="round"
          />
        ))}
      </g>
    );
  };

  switch (family) {
    case 0: {
      if (recipe === 1) {
        const n = [5, 7, 9][rhythm],
          outer = [70, 84, 100][proportion];
        const bank = (cx: number, cy: number, r: number) =>
          closedBank(
            n,
            (i) =>
              ellipse(
                cx,
                cy,
                16 + (i * (r - 16)) / (n - 1),
                16 + (i * (r - 16)) / (n - 1),
              ),
            true,
          );
        return (
          <g>
            {bank(x - 42, y + 78, outer)}
            {bank(x + 65, y - 76, outer * 0.68)}
          </g>
        );
      }
      const radius = [112, 138, 162][proportion],
        gap = radius / (count - 2);
      const ratio = recipe === 2 ? [0.38, 0.55, 0.72][proportion] : 1;
      return closedBank(
        count,
        (i) => ellipse(x, y, 28 + i * gap, (28 + i * gap) * ratio),
        true,
      );
    }
    case 1: {
      const bend = [68, 112, 150][proportion],
        gap = [27, 20, 15][rhythm];
      const start = x - 130 - (recipe === 1 ? bend * 0.7 : 0);
      const curve: Curve = {
        start: [0, -60],
        segments: [
          recipe === 0
            ? [-bend, 60, bend, 220, 0, 360]
            : recipe === 1
              ? [bend * 1.35, 80, bend * 1.35, 200, 0, 360]
              : [-bend, 60, -bend * 0.7, 260, bend, 360],
        ],
      };
      return openBank(
        curve,
        Array.from({ length: count + 3 }, (_, i) => [start + i * gap, 0]),
      );
    }
    case 2: {
      const n = [6, 8, 10][rhythm],
        step = [24, 18, 14][rhythm];
      if (recipe === 2) {
        const aspect = [0.72, 1, 1.28][proportion];
        return closedBank(
          n + 2,
          (i) => {
            const r = 28 + i * step;
            return `M${point(x, y - r * aspect)} L${point(x + r, y)} L${point(x, y + r * aspect)} L${point(x - r, y)} Z`;
          },
          true,
        );
      }
      const w = recipe === 1 ? [22, 30, 40][proportion] : 32;
      const h =
        recipe === 1
          ? [92, 74, 58][proportion]
          : 32 * [0.72, 1, 1.28][proportion];
      const r = recipe === 1 ? w : [6, 12, 18][proportion];
      const cx = recipe === 1 ? x - 24 : x,
        cy = recipe === 1 ? y + 58 : y;
      // Offset the width, height and radius by the same amount. The centers of
      // all four corner arcs stay fixed, including the core's filled boundary.
      return closedBank(
        n,
        (i) => roundedFrame(cx, cy, w + i * step, h + i * step, r + i * step),
        true,
      );
    }
    case 3: {
      const gap = [32, 24, 18][rhythm],
        lean = [120, 175, 230][proportion];
      const curve: Curve =
        recipe === 1
          ? {
              start: [0, -45],
              segments: [
                [lean, 150],
                [0, 345],
              ],
            }
          : recipe === 2
            ? {
                start: [0, -55],
                segments: [
                  [lean * 0.25, 90],
                  [lean * 0.72, 190],
                  [lean, 355],
                ],
              }
            : { start: [0, -55], segments: [[lean, 355]] };
      return openBank(
        curve,
        Array.from({ length: count + 2 }, (_, i) => [x - 165 + i * gap, 0]),
      );
    }
    case 4: {
      const gap = [25, 19, 14][rhythm];
      // All endpoints lie beyond the card. The third recipe is one continuous
      // corner bank, replacing the visually split pair of half-circle banks.
      const cx = recipe === 2 ? 620 : x + 20;
      const cy = recipe === 0 ? 320 : -20;
      const a = recipe === 0 ? 180 : recipe === 1 ? 0 : 90;
      const b = recipe === 0 ? 360 : 180;
      const first = (recipe === 2 ? 125 : 40) + proportion * 30;
      const k = highlight(count),
        radius = (i: number) => first + i * gap;
      return (
        <g>
          <path
            d={annularSector(cx, cy, radius(k - 1), radius(k), a, b)}
            {...field}
          />
          {series(count, (i) => (
            <path key={i} d={arc(cx, cy, radius(i), a, b)} {...ink(i)} />
          ))}
        </g>
      );
    }
    case 5: {
      const a = [32, 60, 88][proportion],
        gap = [33, 25, 19][rhythm];
      const curve: Curve =
        recipe === 1
          ? {
              start: [0, -60],
              segments: [
                [-a, 10, a, 90, 0, 150],
                [-a, 210, -a, 290, 0, 360],
              ],
            }
          : {
              start: [-265, 0],
              segments: [
                [-155, -a, -110, a, -20, 0],
                [70, -a, 115, -a, 225, 0],
                [335, a, 380, a, 470, 0],
                [560, -a, 605, -a, 735, 0],
              ],
            };
      const shifts: Point[] = Array.from({ length: count + 3 }, (_, i) =>
        recipe === 1 ? [x - 118 + i * gap, 0] : [0, y - 185 + i * gap],
      );
      return (
        <g transform={recipe === 2 ? `rotate(-24 ${x} ${y})` : undefined}>
          {openBank(curve, shifts)}
        </g>
      );
    }
    case 6: {
      const gap = [30, 23, 17][rhythm],
        peak = [75, 108, 144][proportion];
      const w = [72, 90, 112][proportion],
        h = [64, 80, 100][proportion];
      if (recipe === 2) {
        const slope = [0.68, 0.88, 1.08][proportion];
        return closedBank(
          count,
          (i) => {
            const r = 30 + i * gap;
            return `M${point(x, y - r)} L${point(x + r * slope, y + r * 0.58)} H${x - r * slope} Z`;
          },
          true,
        );
      }
      const curve: Curve =
        recipe === 0
          ? {
              start: [-250, ((peak + 28) * (x + 250)) / (x - 230)],
              segments: [
                [x, 0],
                [x + 138, peak],
                [850, -70],
              ],
            }
          : {
              start: [-350, h * 2],
              segments: [
                [x - w, h * 2],
                [x - w, h],
                [x, h],
                [x, 0],
                [x + w, 0],
                [x + w, -h],
                [1050, -h],
              ],
            };
      return openBank(
        curve,
        Array.from({ length: count + 2 }, (_, i) => {
          const offset = -165 + i * gap;
          return [recipe === 1 ? offset : 0, y + offset];
        }),
      );
    }
    case 7: {
      if (recipe === 0) {
        const scale = [0.82, 1, 1.12][proportion];
        const circles = [
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
            {circles.slice(0, [6, 8, 10][rhythm]).map(([cx, cy, r], i) => (
              <g key={i}>
                {i % 3 === 0 && (
                  <circle cx={cx} cy={cy} r={r * scale} {...field} />
                )}
                <circle cx={cx} cy={cy} r={r * scale} {...ink(i)} />
                {i === 0 && (
                  <circle cx={cx} cy={cy} r={r * scale * 0.68} {...fine} />
                )}
              </g>
            ))}
          </g>
        );
      }
      if (recipe === 1) {
        const pitch = [38, 30, 25][rhythm],
          cols = [7, 9, 11][rhythm],
          rows = [8, 10, 12][rhythm];
        return (
          <g>
            {series(cols * rows, (i) => {
              const col = i % cols,
                row = Math.floor(i / cols),
                cx = x - 78 + col * pitch,
                cy = -20 + row * pitch;
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
        .map(([dx, dy, r]) => [x - 36 + dx * spread, y + dy * spread, r]);
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
                [bx, by, br] = nodes[b],
                length = Math.hypot(bx - ax, by - ay),
                ux = (bx - ax) / length,
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
              {i === 1 && <circle cx={cx} cy={cy} r={r} {...field} />}
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
      const n = [5, 7, 9][rhythm],
        pitch = [55, 42, 32][rhythm];
      const bend = [32, 80, 125][proportion],
        lean = [120, 200, 280][proportion];
      const curve: Curve =
        recipe === 0
          ? { start: [0, -60], segments: [[-bend, 70, bend, 220, 0, 360]] }
          : recipe === 1
            ? {
                start: [-200, 0],
                segments: [[x, bend * 0.7, 640, bend * 0.4, 850, -20]],
              }
            : { start: [lean * 0.65, -60], segments: [[-lean * 0.35, 360]] };
      return (
        <g>
          {series(n, (i) => {
            const offset =
              recipe === 1
                ? y - 140 + i * pitch
                : x - (recipe === 2 ? 180 : 100) + i * pitch;
            const width = pitch * (i % 3 === 1 ? 0.58 : 0.28);
            const first: Point = recipe === 1 ? [0, offset] : [offset, 0];
            const last: Point =
              recipe === 1 ? [0, offset + width] : [offset + width, 0];
            return (
              <g key={i}>
                <path
                  d={between(curve, first, last)}
                  fill={i % 3 === 1 ? detail : line}
                  opacity={i % 3 === 1 ? 0.38 : 0.27}
                />
                <path d={trace(curve, first)} {...fine} opacity="0.5" />
                <path d={trace(curve, last)} {...fine} opacity="0.5" />
              </g>
            );
          })}
        </g>
      );
    }
    default: {
      const cx = recipe === 0 ? x + 65 : x,
        cy = recipe === 0 ? y : recipe === 1 ? -28 : 328;
      const start = recipe === 0 ? 112 : recipe === 1 ? 10 : 194;
      const sweep = [98, 128, 158][proportion],
        n = [12, 18, 24][rhythm],
        inside = [38, 55, 72][proportion];
      const step = sweep / (n - 1),
        k = highlight(n),
        a = start + (k - 1) * step,
        b = start + (k + 1) * step;
      return (
        <g>
          <path d={annularSector(cx, cy, inside, 900, a, b)} {...field} />
          {series(n, (i) => (
            <path
              key={i}
              d={`M${polar(cx, cy, inside, start + i * step)} L${polar(cx, cy, 900, start + i * step)}`}
              {...ink(i, n)}
            />
          ))}
          <path d={arc(cx, cy, inside, start, start + sweep)} {...accent} />
        </g>
      );
    }
  }
}
