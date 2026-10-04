import type { ReactNode } from "react";
import { expandedArtStructure } from "@/lib/card-art-library";

const repeat = (n: number, draw: (i: number) => ReactNode) =>
  Array.from({ length: n }, (_, i) => draw(i));
const xy = (x: number, y: number) => `${+x.toFixed(2)} ${+y.toFixed(2)}`;
const polygon = (points: number[][]) =>
  points.map(([x, y]) => xy(x, y)).join(" ");
const lerp = (a: number[], b: number[], t: number) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
];
const arc = (cx: number, cy: number, r: number, start: number, end: number) => {
  const p = (a: number) =>
    xy(
      cx + Math.cos((a * Math.PI) / 180) * r,
      cy + Math.sin((a * Math.PI) / 180) * r,
    );
  return `M${p(start)} A${r} ${r} 0 ${end - start > 180 ? 1 : 0} 1 ${p(end)}`;
};

/** A finite composition library, not an unrestricted shape mixer. Each recipe
 * owns its pairings and empty space. Related curves/centers generate the field,
 * main linework and companion, so changing a seed preserves those relationships.
 */
export function CardArtworkV4({
  seed,
  line,
  detail,
}: {
  seed: number;
  line: string;
  detail: string;
}) {
  const { family, recipe, rhythm, proportion, placement, relationship } =
    expandedArtStructure(seed);
  const x = [418, 455, 429, 480, 400][placement];
  const y = [86, 150, 228, 38, 174][placement];
  const t = proportion / 4;
  const n = [5, 7, 9, 11, 13][rhythm];
  const size = 108 + t * 62;
  const fine = { fill: "none", stroke: line, strokeWidth: 1.7, opacity: 0.72 };
  const accent = {
    fill: "none",
    stroke: detail,
    strokeWidth: 3,
    opacity: 0.82,
  };
  const field = { fill: detail, opacity: relationship === 0 ? 0.09 : 0.22 };
  const plane = { fill: line, opacity: relationship === 0 ? 0.07 : 0.17 };
  const ink = (i: number, total = n) =>
    i === Math.floor(total * 0.55) ? accent : fine;
  const ribbon = (d: string, width: number) => (
    <path
      d={d}
      fill="none"
      stroke={relationship === 2 ? line : detail}
      strokeWidth={width}
      opacity={relationship === 0 ? 0.08 : 0.2}
    />
  );
  const circleBank = (cx: number, cy: number, outer: number, count: number) => (
    <g>
      <circle
        cx={cx}
        cy={cy}
        r={outer * (relationship === 2 ? 0.7 : 0.34)}
        {...field}
      />
      {repeat(count, (i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={18 + ((outer - 18) * i) / (count - 1)}
          {...ink(i, count)}
        />
      ))}
    </g>
  );
  const lens = (cx: number, cy: number, rx: number, ry: number) =>
    `M${cx - rx} ${cy} Q${cx} ${cy - ry * 2} ${cx + rx} ${cy} Q${cx} ${cy + ry * 2} ${cx - rx} ${cy} Z`;

  switch (family) {
    case 0: {
      if (recipe === 0)
        return (
          <g>
            <circle cx={x + 16} cy={y - 10} r={size * 0.46} {...field} />
            {repeat(n, (i) => (
              <circle
                key={i}
                cx={x + (n - 1 - i) * (1 + t * 1.8)}
                cy={y - (n - 1 - i) * 1.5}
                r={28 + (i * size) / (n - 1)}
                {...ink(i)}
              />
            ))}
            {relationship === 2 && (
              <path d={arc(x, y, size + 43, 205, 332)} {...accent} />
            )}
          </g>
        );
      if (recipe === 1)
        return (
          <g>
            {circleBank(
              x - 28,
              Math.max(135, Math.min(230, y + 30)),
              65 + t * 35,
              Math.ceil(n * 0.7),
            )}
            {circleBank(
              Math.min(495, x + 75),
              Math.max(135, Math.min(230, y + 30)) - 145,
              43 + t * 21,
              Math.ceil(n * 0.55),
            )}
            {relationship === 2 && (
              <path
                d={arc(
                  x - 28,
                  Math.max(135, Math.min(230, y + 30)),
                  82 + t * 35,
                  205,
                  260,
                )}
                {...fine}
              />
            )}
          </g>
        );
      if (recipe === 2)
        return (
          <g transform={`rotate(${-32 + proportion * 8} ${x} ${y})`}>
            <ellipse cx={x} cy={y} rx={size} ry={size * 0.38} {...plane} />
            {repeat(n, (i) => (
              <ellipse
                key={i}
                cx={x}
                cy={y}
                rx={35 + (i * size) / (n - 1)}
                ry={18 + (i * size * (0.28 + t * 0.2)) / (n - 1)}
                {...ink(i)}
              />
            ))}
            {relationship === 2 && (
              <ellipse
                cx={x + 40}
                cy={y - 20}
                rx={size * 0.58}
                ry={size * 0.22}
                transform={`rotate(62 ${x + 40} ${y - 20})`}
                {...accent}
                opacity="0.5"
              />
            )}
          </g>
        );
      return (
        <g>
          {ribbon(arc(x + 24, y, size * 0.83, 48, 316), size * 0.2)}
          {repeat(n, (i) => (
            <path
              key={i}
              d={arc(
                x + 24,
                y,
                45 + (i * size) / (n - 1),
                48 + proportion * 6,
                316,
              )}
              {...ink(i)}
            />
          ))}
          {relationship !== 0 && (
            <circle cx={x + 37} cy={y + 7} r={13 + t * 12} {...field} />
          )}
        </g>
      );
    }
    case 1: {
      const bend = 55 + t * 90;
      const gap = 210 / (n + 2);
      if (recipe === 1) {
        const contour = (r: number) =>
          `M${x - r * 0.55} ${y - r} C${x + r * 0.8} ${y - r * 1.1} ${x + r * 1.3} ${y + r * 0.45} ${x + r * 0.25} ${y + r * 0.8} C${x - r} ${y + r * 1.25} ${x - r * 1.2} ${y - r * 0.65} ${x - r * 0.55} ${y - r} Z`;
        return (
          <g>
            <path d={contour(size * 0.64)} {...field} />
            {repeat(n, (i) => (
              <path
                key={i}
                d={contour(25 + (i * size) / (n - 1))}
                {...ink(i)}
              />
            ))}
          </g>
        );
      }
      if (recipe === 2)
        return (
          <g>
            {repeat(n, (i) => (
              <g key={i}>
                <path
                  d={`M${x - 148 - i * gap} -50 C${x - 34 - i * gap} 60 ${x - 34 - i * gap} 240 ${x - 148 - i * gap} 350`}
                  {...ink(i)}
                />
                <path
                  d={`M${x + 128 + i * gap} -50 C${x - 3 + i * gap} 60 ${x - 3 + i * gap} 240 ${x + 128 + i * gap} 350`}
                  {...ink(n - 1 - i)}
                />
              </g>
            ))}
            {ribbon(
              `M${x + 147} -50 C${x + 16} 60 ${x + 16} 240 ${x + 147} 350`,
              gap * 1.25,
            )}
          </g>
        );
      const spine =
        recipe === 0
          ? `M0 -60 C${-bend} 60 ${bend} 220 0 360`
          : `M-320 -95 C-145 -95 -170 150 10 150 S175 55 260 210`;
      return (
        <g>
          <g
            transform={
              recipe === 0
                ? `translate(${x - 90} 0)`
                : `translate(${x - 20} ${y - 132})`
            }
          >
            {ribbon(spine, gap * 2.4)}
            {repeat(n + 3, (i) => (
              <path
                key={i}
                d={spine}
                transform={
                  recipe === 0
                    ? `translate(${(i - 3) * gap} 0)`
                    : `translate(0 ${(i - 4) * gap})`
                }
                {...ink(i)}
              />
            ))}
          </g>
        </g>
      );
    }
    case 2: {
      const aspect = 0.62 + t * 0.85;
      const frames = (
        cx: number,
        cy: number,
        width: number,
        height: number,
        count: number,
      ) => (
        <g>
          <rect
            x={cx - width * 0.22}
            y={cy - height * 0.22}
            width={width * 0.44}
            height={height * 0.44}
            rx={width * 0.2}
            {...field}
          />
          {repeat(count, (i) => {
            const scale = 0.28 + (i * 0.72) / (count - 1);
            return (
              <rect
                key={i}
                x={cx - (width * scale) / 2}
                y={cy - (height * scale) / 2}
                width={width * scale}
                height={height * scale}
                rx={Math.min(width * scale * 0.5, 16 + i * 8 + proportion * 3)}
                {...ink(i, count)}
              />
            );
          })}
        </g>
      );
      if (recipe === 0) return frames(x, y, size * 2, size * aspect * 2, n);
      if (recipe === 1)
        return (
          <g>
            {frames(
              x - 38,
              Math.max(130, Math.min(230, y + 45)),
              112 + t * 38,
              245,
              Math.ceil(n * 0.7),
            )}
            {frames(
              Math.min(510, x + 100),
              Math.max(130, Math.min(230, y + 45)) - 152,
              84 + t * 30,
              155,
              Math.ceil(n * 0.55),
            )}
          </g>
        );
      if (recipe === 2)
        return (
          <g transform={`rotate(${35 + t * 18} ${x} ${y})`}>
            {frames(x, y, size * 1.65, size * 1.65, n)}
          </g>
        );
      const corner = (r: number) =>
        `M${x - r} -90 V${y + r - 48} Q${x - r} ${y + r} ${x - r + 48} ${y + r} H730`;
      return (
        <g>
          {ribbon(corner(70), 30 + t * 20)}
          {repeat(n, (i) => (
            <path key={i} d={corner(25 + (i * 170) / (n - 1))} {...ink(i)} />
          ))}
        </g>
      );
    }
    case 3: {
      const lean = 120 + t * 150;
      const gap = 255 / (n + 1);
      if (recipe === 3)
        return (
          <g transform={`rotate(${-20 + proportion * 7} ${x} ${y})`}>
            <rect x={x - 116} y={y - 116} width="232" height="232" {...plane} />
            <svg
              x={x - 116}
              y={y - 116}
              width="232"
              height="232"
              viewBox="0 0 232 232"
              overflow="hidden"
            >
              {repeat(n + 10, (i) => (
                <path
                  key={i}
                  d={`M${-260 + i * gap} -20 L${-50 + i * gap} 252`}
                  {...ink(i)}
                />
              ))}
            </svg>
            <path
              d={`M${x - 116} ${y + 116} V${y - 116} H${x + 116}`}
              {...accent}
            />
          </g>
        );
      const slash = (a: number) =>
        recipe === 0
          ? `M${a} -50 L${a + lean} 350`
          : recipe === 1
            ? `M${a} -50 L${a + lean} ${y} L${a} 350`
            : `M${a} -50 L${a + lean * 0.2} 60 Q${a + lean * 0.25} 110 ${a + lean * 0.65} 150 T${a + lean} 350`;
      return (
        <g>
          {ribbon(slash(x - 80), gap * (relationship === 2 ? 2.5 : 1.4))}
          {repeat(n + 3, (i) => (
            <path key={i} d={slash(x - 185 + i * gap)} {...ink(i)} />
          ))}
        </g>
      );
    }
    case 4: {
      if (recipe === 3)
        return (
          <g>
            {repeat(3, (j) => (
              <g key={j}>
                {ribbon(
                  arc(x - 70 + j * 94, y + 130 - j * 105, 56, 180, 270),
                  15,
                )}
                {repeat(Math.ceil(n * 0.6), (i) => (
                  <path
                    key={i}
                    d={arc(
                      x - 70 + j * 94,
                      y + 130 - j * 105,
                      20 + (i * 70) / (Math.ceil(n * 0.6) - 1),
                      180,
                      270,
                    )}
                    {...ink(i)}
                  />
                ))}
              </g>
            ))}
          </g>
        );
      const cx = recipe === 2 ? x + 32 : x + 40;
      const cy = recipe === 0 ? 320 : recipe === 1 ? -20 : y;
      const start = recipe === 0 ? 180 : recipe === 1 ? 0 : 95;
      const end = recipe === 0 ? 360 : recipe === 1 ? 180 : 265;
      return (
        <g>
          {ribbon(arc(cx, cy, size * 0.83, start, end), size * 0.22)}
          {repeat(n, (i) => (
            <path
              key={i}
              d={arc(cx, cy, 35 + (i * size * 1.4) / (n - 1), start, end)}
              {...ink(i)}
            />
          ))}
          {recipe === 2 &&
            repeat(Math.ceil(n * 0.55), (i) => (
              <path
                key={`counter-${i}`}
                d={arc(cx - 12, cy, 22 + i * 22, -85, 85)}
                {...ink(i)}
              />
            ))}
        </g>
      );
    }
    case 5: {
      const amplitude = 36 + t * 58;
      const gap = 290 / (n + 2);
      const wave = (offset: number, sign = 1) =>
        `M-270 ${offset} C-125 ${offset - amplitude * sign} -90 ${offset + amplitude * sign} 50 ${offset} S260 ${offset - amplitude * sign} 400 ${offset} S610 ${offset + amplitude * sign} 820 ${offset}`;
      if (recipe === 1)
        return (
          <g transform={`translate(${x - 150} -130) rotate(90 150 150)`}>
            {ribbon(wave(150), gap * 2.2)}
            {repeat(n + 3, (i) => (
              <path key={i} d={wave(-70 + i * gap)} {...ink(i)} />
            ))}
          </g>
        );
      if (recipe === 2)
        return (
          <g>
            {repeat(Math.ceil(n * 0.65), (i) => (
              <g key={i}>
                <path d={wave(y - 70 - i * gap, 0.6)} {...ink(i)} />
                <path d={wave(y + 70 + i * gap, -0.6)} {...ink(i)} />
              </g>
            ))}
            {ribbon(wave(y + 110, -0.6), gap * 1.7)}
          </g>
        );
      if (recipe === 3)
        return (
          <g transform={`rotate(${-22 + proportion * 5} ${x} ${y})`}>
            {ribbon(wave(y), 115)}
            {repeat(n, (i) => (
              <path
                key={i}
                d={wave(y - 52 + (i * 104) / (n - 1))}
                {...ink(i)}
              />
            ))}
            {relationship === 2 && <path d={wave(y + 81)} {...fine} />}
          </g>
        );
      return (
        <g>
          {ribbon(wave(y + 20), gap * 2.3)}
          {repeat(n + 3, (i) => (
            <path key={i} d={wave(y - 170 + i * gap)} {...ink(i)} />
          ))}
        </g>
      );
    }
    case 6: {
      const rise = 70 + t * 90;
      const pitch = 210 / (n - 1);
      if (recipe === 2) {
        const triangle = (r: number) =>
          `M${x} ${y - r} L${x + r * (0.7 + t * 0.6)} ${y + r * 0.58} H${x - r * (0.7 + t * 0.6)} Z`;
        return (
          <g>
            <path d={triangle(size * 0.8)} {...field} />
            {repeat(n, (i) => (
              <path
                key={i}
                d={triangle(24 + (i * size * 1.12) / (n - 1))}
                {...ink(i)}
              />
            ))}
          </g>
        );
      }
      if (recipe === 1) {
        const stair = (offset: number) =>
          `M-100 ${y + offset + rise * 2} H${x - rise + offset} V${y + offset + rise} H${x + offset} V${y + offset} H${x + rise + offset} V${y + offset - rise} H790`;
        return (
          <g>
            {ribbon(stair(0), 34)}
            {repeat(n, (i) => (
              <path key={i} d={stair(-100 + i * pitch)} {...ink(i)} />
            ))}
          </g>
        );
      }
      const ridge = (offset: number) =>
        `M-100 ${y + offset + rise * 2.8} L${x - 40} ${y + offset} L${x + 100} ${y + offset + rise} L750 ${y + offset - 50}`;
      if (recipe === 3)
        return (
          <g>
            {repeat(4, (i) => (
              <path
                key={`layer-${i}`}
                d={`${ridge(-160 + i * 70)} L750 ${y + 400} H-100 Z`}
                fill={i % 2 ? detail : line}
                opacity="0.09"
              />
            ))}
            {repeat(Math.ceil(n * 0.75), (i) => (
              <path key={i} d={ridge(-140 + i * 48)} {...ink(i)} />
            ))}
          </g>
        );
      return (
        <g>
          {ribbon(ridge(0), 35)}
          {repeat(n, (i) => (
            <path key={i} d={ridge(-150 + i * pitch)} {...ink(i)} />
          ))}
        </g>
      );
    }
    case 7: {
      if (recipe === 1) {
        const pitch = [43, 37, 32, 28, 25][rhythm];
        return (
          <g>
            {repeat(90, (i) => {
              const col = i % 9,
                row = Math.floor(i / 9);
              const cx = x - 90 + col * pitch,
                cy = -25 + row * pitch;
              const d = Math.hypot((cx - x - 10) / 165, (cy - y) / 195);
              const r = Math.max(
                2,
                pitch * (0.22 + t * 0.17) * Math.max(0.2, 1 - d * 0.5),
              );
              return (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={
                    relationship === 2 && (row + col) % 5 === 0
                      ? "none"
                      : col === 3
                        ? detail
                        : line
                  }
                  stroke={line}
                  strokeWidth={0.8}
                  opacity={0.25 + Math.max(0, 1 - d) * 0.42}
                />
              );
            })}
          </g>
        );
      }
      if (recipe === 3) {
        const count = 5 + Math.floor(rhythm / 2),
          r = 86 + t * 47;
        const cx = Math.min(460, x + 12),
          cy = Math.max(115, Math.min(195, y));
        const start = 105 + (placement % 3) * 12,
          step = 205 / (count - 1);
        return (
          <g>
            {ribbon(arc(cx, cy, r + 27, start, start + 205), 15)}
            {repeat(count, (i) => {
              const angle = ((start + i * step) * Math.PI) / 180;
              const px = cx + Math.cos(angle) * r,
                py = cy + Math.sin(angle) * r;
              return (
                <g key={i}>
                  {i < count - 1 && (
                    <path
                      d={arc(
                        cx,
                        cy,
                        r,
                        start + i * step + 10,
                        start + (i + 1) * step - 10,
                      )}
                      {...fine}
                    />
                  )}
                  <circle
                    cx={px}
                    cy={py}
                    r={i === 2 ? 17 : 7 + (i % 3) * 3}
                    {...(i === 2 ? accent : fine)}
                  />
                  {i === 2 && <circle cx={px} cy={py} r="5" {...field} />}
                </g>
              );
            })}
          </g>
        );
      }
      const nodes =
        recipe === 0
          ? [
              [0, 0, 44],
              [85, -61, 28],
              [91, 60, 31],
              [-58, 91, 22],
              [23, 116, 24],
              [-79, -65, 17],
              [158, 6, 21],
              [166, 127, 35],
              [8, -116, 18],
            ]
          : [
              [0, 0, 27],
              [-66, -67, 12],
              [75, -73, 18],
              [97, 81, 22],
              [-38, 111, 13],
              [166, -8, 12],
              [6, -140, 10],
            ];
      const shown = nodes.slice(
        0,
        5 + Math.floor(rhythm / 2) + (relationship === 2 ? 1 : 0),
      );
      const cx = x - 24,
        cy = Math.max(90, Math.min(180, y));
      const scale = 0.8 + t * 0.23;
      return (
        <g>
          {recipe === 2 &&
            [
              [0, 1],
              [0, 2],
              [0, 3],
              [0, 4],
              [2, 5],
              [1, 6],
            ]
              .filter(([a, b]) => shown[a] && shown[b])
              .map(([a, b]) => {
                const [ax, ay, ar] = shown[a],
                  [bx, by, br] = shown[b];
                const length = Math.hypot(bx - ax, by - ay),
                  ux = (bx - ax) / length,
                  uy = (by - ay) / length;
                return (
                  <path
                    key={`${a}-${b}`}
                    d={`M${xy(cx + ax + ux * (ar + 7), cy + ay + uy * (ar + 7))} L${xy(cx + bx - ux * (br + 7), cy + by - uy * (br + 7))}`}
                    {...fine}
                  />
                );
              })}
          {shown.map(([dx, dy, r], i) => (
            <g key={i}>
              {(i === 0 || (relationship === 1 && i % 3 === 0)) && (
                <circle cx={cx + dx} cy={cy + dy} r={r * scale} {...field} />
              )}
              <circle
                cx={cx + dx}
                cy={cy + dy}
                r={r * scale}
                {...ink(i, shown.length)}
              />
              {i === 0 && (
                <circle
                  cx={cx + dx}
                  cy={cy + dy}
                  r={recipe === 2 ? 6 : r * 0.66}
                  {...(recipe === 2 ? field : fine)}
                />
              )}
            </g>
          ))}
        </g>
      );
    }
    case 8: {
      const count = 4 + Math.floor(rhythm / 2),
        pitch = 260 / count;
      const bend = 30 + t * 100;
      const band = (a: number) =>
        recipe === 0
          ? `M${a} -60 C${a - bend} 70 ${a + bend} 230 ${a} 360`
          : recipe === 1
            ? `M-100 ${a} Q${x} ${a + bend} 750 ${a - 20}`
            : recipe === 2
              ? `M${a + bend} -60 L${a - bend * 0.7} 360`
              : `M${a} -70 V${y - 60} A${x + 140 - a} ${x + 140 - a} 0 0 0 ${x + 140} ${y - 60 + x + 140 - a} H750`;
      return (
        <g>
          {repeat(count + 1, (i) => {
            const a = recipe === 1 ? y - 150 + i * pitch : x - 165 + i * pitch;
            return (
              <g key={i}>
                <path
                  d={band(a)}
                  fill="none"
                  stroke={i % 3 === 1 ? detail : line}
                  strokeWidth={pitch * (i % 3 === 1 ? 0.63 : 0.3)}
                  opacity={relationship === 0 ? 0.22 : 0.38}
                />
                <path d={band(a + pitch * 0.4)} {...fine} />
              </g>
            );
          })}
        </g>
      );
    }
    case 9: {
      const count = 10 + rhythm * 3;
      const fan = (
        cx: number,
        cy: number,
        start: number,
        sweep: number,
        outer = 450,
      ) => {
        const inner = 36 + t * 48;
        const p = (r: number, a: number) =>
          xy(
            cx + Math.cos((a * Math.PI) / 180) * r,
            cy + Math.sin((a * Math.PI) / 180) * r,
          );
        return (
          <g>
            <path
              d={`M${p(inner, start + sweep * 0.38)} L${p(outer, start + sweep * 0.38)} A${outer} ${outer} 0 0 1 ${p(outer, start + sweep * 0.62)} L${p(inner, start + sweep * 0.62)} Z`}
              {...field}
            />
            {repeat(count, (i) => {
              const a = start + (i * sweep) / (count - 1);
              return (
                <path
                  key={i}
                  d={
                    recipe === 3
                      ? `M${p(inner, a)} L${p(inner + 55, a)} M${p(inner + 74, a)} L${p(outer, a)}`
                      : `M${p(inner, a)} L${p(outer, a)}`
                  }
                  {...ink(i, count)}
                />
              );
            })}
            <path d={arc(cx, cy, inner, start, start + sweep)} {...accent} />
            {recipe === 3 && (
              <path
                d={arc(cx, cy, inner + 65, start, start + sweep)}
                {...fine}
              />
            )}
          </g>
        );
      };
      if (recipe === 2)
        return (
          <g>
            {fan(x + 55, -5, 80, 95, 145 + t * 10)}
            {fan(x - 10, 305, 245, 100, 145 + t * 10)}
          </g>
        );
      if (recipe === 1)
        return fan(x, placement % 2 ? -25 : 325, placement % 2 ? 12 : 192, 155);
      return fan(x + 35, y, 100 + proportion * 7, 110 + t * 48);
    }
    case 10: {
      const rx = 105 + t * 65,
        ry = 58 + t * 36;
      const bank = (
        cx: number,
        cy: number,
        width: number,
        height: number,
        count: number,
      ) => (
        <g>
          <path d={lens(cx, cy, width * 0.66, height * 0.66)} {...field} />
          {repeat(count, (i) => (
            <path
              key={i}
              d={lens(
                cx,
                cy,
                width * (0.24 + (i * 0.76) / (count - 1)),
                height * (0.24 + (i * 0.76) / (count - 1)),
              )}
              {...ink(i, count)}
            />
          ))}
        </g>
      );
      if (recipe === 0)
        return (
          <g transform={`rotate(${-35 + proportion * 12} ${x} ${y})`}>
            {bank(x, y, rx, ry, n)}
          </g>
        );
      if (recipe === 1)
        return (
          <g transform={`rotate(-35 ${x} ${y})`}>
            {repeat(3, (i) => (
              <g key={i}>
                {bank(
                  x - 110 + i * 108,
                  y,
                  49,
                  90 + t * 35,
                  Math.ceil(n * 0.5),
                )}
              </g>
            ))}
          </g>
        );
      if (recipe === 2)
        return (
          <g>
            {bank(x - 64, y + 55, 55 + t * 15, 125, Math.ceil(n * 0.65))}
            {bank(x + 85, y - 60, 50, 100, Math.ceil(n * 0.55))}
          </g>
        );
      return (
        <g>
          {repeat(3, (i) => (
            <g key={i}>
              {bank(
                x - 25 + i * 24,
                y - 95 + i * 99,
                105 - i * 13 + t * 20,
                37,
                Math.ceil(n * 0.6),
              )}
            </g>
          ))}
        </g>
      );
    }
    case 11: {
      // Two strands. At crossings one yields a gap; no backdrop-colored eraser.
      const amplitude = 38 + t * 44;
      const period = recipe === 2 ? 285 : 175 + t * 40;
      const count = recipe === 3 ? 3 : 4;
      const path = (strand: number, offset: number) => {
        let d = "",
          connected = false;
        for (let a = -220; a <= 520; a += 3) {
          const phase = ((a + 20) / period) * Math.PI * 2;
          const wave =
            recipe === 3
              ? (Math.asin(Math.sin(phase)) * 2) / Math.PI
              : Math.sin(phase);
          const crossing = Math.round((a + 20) / (period / 2));
          const under = ((crossing % 2) + 2) % 2 === strand;
          if (Math.abs(wave) < 0.24 && under) {
            connected = false;
            continue;
          }
          const px = x + (strand === 0 ? 1 : -1) * amplitude * wave + offset;
          d += `${connected ? "L" : "M"}${xy(px, a)}`;
          connected = true;
        }
        return d;
      };
      return (
        <g
          transform={
            recipe === 1
              ? `rotate(-62 ${x} ${y})`
              : recipe === 2
                ? `rotate(26 ${x} ${y})`
                : undefined
          }
        >
          {repeat(2, (strand) => (
            <g key={strand}>
              <path
                d={path(strand, 0)}
                fill="none"
                stroke={strand ? detail : line}
                strokeWidth="23"
                opacity={relationship === 0 ? 0.12 : 0.24}
              />
              {repeat(count, (i) => (
                <path
                  key={i}
                  d={path(strand, (i - (count - 1) / 2) * 6)}
                  {...(strand ? accent : fine)}
                  strokeWidth="1.5"
                />
              ))}
            </g>
          ))}
        </g>
      );
    }
    case 12: {
      const cell = [112, 100, 88, 78, 70][rhythm];
      const h = cell / 2;
      const rows = 5,
        cols = 4;
      return (
        <g transform={`translate(${x - cell * 1.25} ${y - cell * 2.1})`}>
          {repeat(rows * cols, (i) => {
            const col = i % cols,
              row = Math.floor(i / cols);
            if (recipe === 1 && col + row < 2) return null;
            const turn = (row + col + proportion) % 2;
            return (
              <svg
                key={i}
                x={col * cell}
                y={row * cell}
                width={cell}
                height={cell}
                viewBox={`0 0 ${cell} ${cell}`}
                overflow="hidden"
              >
                {recipe === 2 ? (
                  <g>
                    {(col + row) % 2 === 0 ? (
                      <path
                        d={`M0 0 H${cell} A${cell} ${cell} 0 0 1 0 ${cell} Z`}
                        {...(turn ? field : plane)}
                      />
                    ) : (
                      <circle cx={h} cy={h} r={h * 0.58} {...fine} />
                    )}
                    {relationship === 2 && (
                      <path
                        d={`M0 ${cell} L${cell} 0`}
                        {...fine}
                        opacity="0.2"
                      />
                    )}
                  </g>
                ) : recipe === 3 ? (
                  <g>
                    <path
                      d={`M0 ${cell} V${h} A${h} ${h} 0 0 1 ${cell} ${h} V${cell}`}
                      {...fine}
                    />
                    <path
                      d={`M${h * 0.35} ${cell} V${h} A${h * 0.65} ${h * 0.65} 0 0 1 ${cell - h * 0.35} ${h} V${cell}`}
                      {...accent}
                      strokeWidth="2"
                    />
                    {row % 2 === 0 && (
                      <path
                        d={`M${h * 0.7} ${cell} V${h} A${h * 0.3} ${h * 0.3} 0 0 1 ${cell - h * 0.7} ${h} V${cell} Z`}
                        {...field}
                      />
                    )}
                  </g>
                ) : (
                  <g transform={turn ? `rotate(90 ${h} ${h})` : undefined}>
                    {ribbon(
                      `M0 ${h} A${h} ${h} 0 0 0 ${h} 0 M${cell} ${h} A${h} ${h} 0 0 0 ${h} ${cell}`,
                      9 + t * 10,
                    )}
                    {repeat(3, (j) => {
                      const r = h + (j - 1) * (6 + t * 3);
                      return (
                        <g key={j}>
                          <path
                            d={arc(0, 0, r, 0, 90)}
                            {...(j === 1 ? accent : fine)}
                            strokeWidth={j === 1 ? 2 : 1.4}
                          />
                          <path
                            d={arc(cell, cell, r, 180, 270)}
                            {...(j === 1 ? accent : fine)}
                            strokeWidth={j === 1 ? 2 : 1.4}
                          />
                        </g>
                      );
                    })}
                  </g>
                )}
              </svg>
            );
          })}
        </g>
      );
    }
    default: {
      const facet = (points: number[][], index: number) => (
        <g>
          <polygon points={polygon(points)} {...(index % 2 ? field : plane)} />
          <polyline
            points={polygon(points.slice(0, 3))}
            {...(index % 2 ? accent : fine)}
          />
          {relationship !== 0 &&
            repeat(Math.ceil(n * 0.55), (i) => {
              const f = (i + 1) / (Math.ceil(n * 0.55) + 1);
              const a = lerp(points[0], points[1], f),
                b = lerp(points.at(-1)!, points[2], f);
              return (
                <path
                  key={i}
                  d={`M${xy(a[0], a[1])} L${xy(b[0], b[1])}`}
                  {...fine}
                  opacity="0.3"
                />
              );
            })}
        </g>
      );
      if (recipe === 0)
        return (
          <g transform={`translate(${x} ${y}) rotate(${-22 + proportion * 9})`}>
            {facet(
              [
                [-110, -170],
                [32, -120],
                [55, 120],
                [-75, 155],
              ],
              0,
            )}
            {facet(
              [
                [32, -120],
                [146, -164],
                [155, 74],
                [55, 120],
              ],
              1,
            )}
            {facet(
              [
                [55, 120],
                [155, 74],
                [115, 170],
                [-75, 155],
              ],
              2,
            )}
          </g>
        );
      if (recipe === 1)
        return (
          <g transform={`translate(${x - 80} ${y + 120})`}>
            {repeat(4, (i) => (
              <g
                key={i}
                transform={`translate(${i * (49 + t * 12)} ${-i * 75})`}
              >
                {facet(
                  [
                    [0, 0],
                    [61, -30],
                    [61, -100],
                    [0, -70],
                  ],
                  i,
                )}
                <path d="M0 -70 L-28 -92 L33 -122 L61 -100" {...fine} />
              </g>
            ))}
          </g>
        );
      if (recipe === 2)
        return (
          <g
            transform={`translate(${x - 60} ${y}) rotate(${-16 + proportion * 7})`}
          >
            {facet(
              [
                [-55, -148],
                [70, -108],
                [40, 30],
                [-90, -4],
              ],
              0,
            )}
            {facet(
              [
                [94, -100],
                [192, -135],
                [155, 6],
                [62, 42],
              ],
              1,
            )}
            {facet(
              [
                [-80, 22],
                [43, 56],
                [143, 22],
                [78, 160],
              ],
              2,
            )}
          </g>
        );
      const anchor = [x + 70, y + 80];
      return (
        <g>
          {repeat(7 + rhythm, (i) => {
            const angle =
              ((-175 + (i * (100 + t * 38)) / (7 + rhythm)) * Math.PI) / 180;
            const next =
              angle + (((100 + t * 38) / (7 + rhythm)) * Math.PI) / 180;
            const outer = 235 + (i % 2) * 25;
            const a = [
              anchor[0] + Math.cos(angle) * 36,
              anchor[1] + Math.sin(angle) * 36,
            ];
            const b = [
              anchor[0] + Math.cos(angle) * outer,
              anchor[1] + Math.sin(angle) * outer,
            ];
            const c = [
              anchor[0] + Math.cos(next) * outer,
              anchor[1] + Math.sin(next) * outer,
            ];
            const d = [
              anchor[0] + Math.cos(next) * 36,
              anchor[1] + Math.sin(next) * 36,
            ];
            return (
              <g key={i}>
                <polygon
                  points={polygon([a, b, c, d])}
                  fill={i % 2 ? detail : line}
                  opacity={i % 2 ? 0.24 : 0.13}
                />
                <path
                  d={`M${xy(a[0], a[1])} L${xy(b[0], b[1])} L${xy(c[0], c[1])}`}
                  {...fine}
                />
              </g>
            );
          })}
        </g>
      );
    }
  }
}
