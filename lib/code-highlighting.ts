import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import sql from "highlight.js/lib/languages/sql";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import yaml from "highlight.js/lib/languages/yaml";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import java from "highlight.js/lib/languages/java";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import { normalizeCodeLanguage } from "./code-languages";

const highlighter = hljs.newInstance();
for (const [name, grammar] of Object.entries({
  javascript,
  typescript,
  python,
  sql,
  bash,
  json,
  yaml,
  xml,
  css,
  java,
  c,
  cpp,
  csharp,
  go,
  rust,
}))
  highlighter.registerLanguage(name, grammar);

const detectionLanguages = highlighter.listLanguages();
export type CodeHighlight = { language: string; html: string };

function escapeCode(code: string) {
  return code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

/** Guess only unlabeled blocks; preserve unsupported labels and explicit plain text. */
export function highlightCode(
  code: string,
  requestedLanguage = "",
): CodeHighlight {
  let language = normalizeCodeLanguage(requestedLanguage);
  // Keep large pasted files usable. Formatting and copying never truncate the source.
  if (code.length > 100_000) return { language, html: escapeCode(code) };
  if (!language && code.trim()) {
    const guess = highlighter.highlightAuto(
      code.slice(0, 10_000),
      detectionLanguages,
    );
    const second = guess.secondBest;
    // Related grammars often tie (JS/TS, C/C++). Those ties are not a reliable label.
    if (
      guess.language &&
      guess.relevance >= 5 &&
      (!second || guess.relevance > second.relevance)
    )
      language = guess.language;
  }
  if (!language || language === "text" || !highlighter.getLanguage(language))
    return { language, html: escapeCode(code) };
  return {
    language,
    html: highlighter.highlight(code, { language, ignoreIllegals: true }).value,
  };
}
