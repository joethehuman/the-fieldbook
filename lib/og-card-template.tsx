import type { CSSProperties } from "react";
import { ogCardSize, type OgCardIdentity } from "./og-card";

const paper = "#f8f7f3";
const positioned = (style: CSSProperties): CSSProperties => ({
  display: "flex",
  position: "absolute",
  ...style,
});

/** Pure layout, shared with the static demo. No settings, network or code evaluation. */
export function InstallationOgCard({ identity }: { identity: OgCardIdentity }) {
  const { name, domain, accent } = identity;
  const fontSize = name.length <= 14 ? 110 : name.length <= 28 ? 80 : 60;
  return (
    <div
      style={{
        ...ogCardSize,
        display: "flex",
        position: "relative",
        background: paper,
        color: "#171717",
        fontFamily: "Geist",
        overflow: "hidden",
      }}
    >
      <div
        style={positioned({
          left: 0,
          top: 0,
          width: 12,
          height: 630,
          background: accent,
        })}
      />
      <div
        style={positioned({
          left: 72,
          top: 68,
          fontSize: 25,
          color: "#62615e",
          alignItems: "center",
          gap: 14,
        })}
      >
        <span>Updates</span>
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#62615e",
            opacity: 0.4,
          }}
        />
        <span>Courses</span>
        <div
          style={{
            width: 7,
            height: 7,
            borderRadius: "50%",
            background: "#62615e",
            opacity: 0.4,
          }}
        />
        <span>Docs</span>
      </div>
      <div
        style={positioned({
          left: 72,
          top: 216,
          width: 780,
          maxHeight: 260,
          fontSize,
          fontWeight: 500,
          letterSpacing: -fontSize * 0.05,
          lineHeight: 1.05,
          wordBreak: "break-word",
          overflow: "hidden",
        })}
      >
        {name}
      </div>
      {[
        { left: 962, top: 151, opacity: 0.16 },
        { left: 927, top: 178, opacity: 0.45 },
        { left: 892, top: 205, opacity: 1 },
      ].map((page, index) => (
        <div
          key={index}
          style={positioned({
            ...page,
            width: 180,
            height: 276,
            borderRadius: 3,
            border: `2px solid ${accent}`,
            background: index ? paper : "transparent",
          })}
        >
          {index === 2 &&
            [34, 56, 78, 100].map((top) => (
              <div
                key={top}
                style={positioned({
                  left: 23,
                  top,
                  width: 111,
                  height: 2,
                  background: accent,
                  opacity: 0.5,
                })}
              />
            ))}
        </div>
      ))}
      <div
        style={positioned({
          left: 72,
          right: 72,
          top: 511,
          height: 1,
          background: "#171717",
          opacity: 0.18,
        })}
      />
      <div
        style={positioned({
          left: 72,
          top: 531,
          width: 1056,
          fontSize: 28,
          color: "#545450",
          letterSpacing: -0.3,
        })}
      >
        {domain}
      </div>
    </div>
  );
}
