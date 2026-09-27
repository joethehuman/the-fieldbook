import test from "node:test";
import assert from "node:assert/strict";
import { brandThemeStyle } from "../lib/brand-theme";

function contrastOnWhite(hex: string) {
  const rgb = [1, 3, 5].map((start) =>
    Number.parseInt(hex.slice(start, start + 2), 16),
  );
  const [r, g, b] = rgb.map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 1.05 / (0.2126 * r + 0.7152 * g + 0.0722 * b + 0.05);
}

test("installation accent drives readable links and shared highlights", () => {
  for (const accent of ["#009908", "#ffffff", "#ffff00", "#0069ff"]) {
    const style = brandThemeStyle(accent) as Record<string, string>;
    assert.equal(style["--brand"], accent);
    assert.ok(contrastOnWhite(style["--link"]) >= 4.5);
    assert.equal(style["--ring"], "var(--link)");
    assert.match(style["--selected"], /var\(--brand\)/);
  }
  const green = brandThemeStyle("#009908") as Record<string, string>;
  assert.match(green["--link"], /^#[0-9a-f]{6}$/i);
  assert.notEqual(green["--link"], "#175cd3");
  assert.equal(
    (brandThemeStyle("invalid") as Record<string, string>)["--brand"],
    "#0069ff",
  );
});
