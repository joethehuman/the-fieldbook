import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import postcss from "postcss";

const files = (dir, ext) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) =>
      entry.isDirectory()
        ? files(path.join(dir, entry.name), ext)
        : entry.name.endsWith(ext)
          ? [path.join(dir, entry.name)]
          : [],
    );
const violations = [];
const report = (file, source, node, message) =>
  violations.push(
    `${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${message}`,
  );
const rawControls = new Set([
  "button",
  "input",
  "select",
  "textarea",
  "label",
  "fieldset",
  "table",
  "thead",
  "tbody",
  "tr",
  "th",
  "td",
]);
for (const file of [
  ...files("app", ".tsx"),
  ...files("components", ".tsx"),
  ...files("demo/app", ".tsx"),
]) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const primitive = file.startsWith("components/ui/");
  const richTile = file === "components/patterns/content-action.tsx";
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText(source);
      if (
        tag === "Table" &&
        !primitive &&
        !file.startsWith("components/patterns/") &&
        !["components/Markdown.tsx", "demo/app/ui/page.tsx"].includes(file)
      )
        report(
          file,
          source,
          node,
          "Use DataTable with a declared column layout for application data.",
        );

      if (!primitive && rawControls.has(tag) && !(richTile && tag === "button"))
        report(file, source, node, `Use the shared ${tag} component.`);
      for (const attr of node.attributes.properties) {
        if (!ts.isJsxAttribute(attr)) continue;
        if (attr.name.text === "style" && !primitive) {
          // Only the shared, validated installation theme may set runtime UI colors.
          const text = attr.initializer?.getText(source) || "";
          if (!(
            ((file === "components/patterns/workspace-frame.tsx" &&
              text === "{brandThemeStyle(accent)}") ||
              (file === "components/patterns/branded-account.tsx" &&
                text === "{brandThemeStyle(branding.accent)}") ||
              // Card art derives two decorative CSS variables from the validated palette.
              (file === "components/patterns/card-artwork.tsx" &&
                text.includes('"--card-base": surface') &&
                text.includes('"--card-highlight": highlight'))) &&
            !/(width|height|margin|padding|background|color)\s*:/.test(text)
          ))
            report(
              file,
              source,
              attr,
              "Static layout and presentation belong to shared components/tokens.",
            );
        }
        if (attr.name.text === "className") {
          const text = attr.initializer?.getText(source) || "";
          if (
            /(?:#[0-9a-f]{3,8}\b|(?:bg|text|border|ring)-(?:blue|gray|zinc|slate|red|green|white|black)(?:-|\b))/i.test(
              text,
            )
          )
            report(file, source, attr, "Use semantic theme colors.");
          if (
            /["'](?:primary|secondary|text-button|topic-tabs|ui-button)["']/.test(
              text,
            )
          )
            report(
              file,
              source,
              attr,
              "Retired styling hook; use a shared variant.",
            );
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
for (const file of ["styles/globals.css", ...files("styles", ".css")]) {
  const root = postcss.parse(fs.readFileSync(file, "utf8"), { from: file });
  root.walkDecls((decl) => {
    if (decl.important)
      violations.push(
        `${file}:${decl.source.start.line}: Do not override shared components with !important.`,
      );
    if (
      !["styles/tokens.css", "styles/artwork.css"].includes(file) &&
      /#[0-9a-f]{3,8}\b/i.test(decl.value)
    )
      violations.push(
        `${file}:${decl.source.start.line}: Literal interface colors belong in tokens.css.`,
      );
  });
  if (file === "styles/layout.css")
    root.walkRules((rule) => {
      if (
        /(?:^|[\s>+,])(?:button|input|select|textarea|label)\b/.test(
          rule.selector,
        )
      )
        violations.push(
          `${file}:${rule.source.start.line}: Layout rules must not restyle native controls.`,
        );
    });
}
if (fs.existsSync("app/design-system.css"))
  violations.push("The retired override sheet must not be reintroduced.");
if (violations.length) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    "UI rules passed: shared controls, semantic colors, owned styling, no legacy overrides.",
  );
