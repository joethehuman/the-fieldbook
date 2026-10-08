"use client";

import { useEffect, useState } from "react";
import type { CodeHighlight } from "@/lib/code-highlighting";
import { normalizeCodeLanguage } from "@/lib/code-languages";

/** Load grammars only on pages with code; debounce detection while an author types. */
export function useCodeHighlight(code: string, language: string, delay = 0) {
  const [result, setResult] = useState<
    (CodeHighlight & { code: string; requested: string }) | null
  >(null);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void import("@/lib/code-highlighting")
        .then(({ highlightCode }) => {
          if (!cancelled)
            setResult({
              ...highlightCode(code, language),
              code,
              requested: language,
            });
        })
        .catch(() => {
          /* Plain code remains readable if a grammar chunk cannot load. */
        });
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, language, delay]);
  const current = result?.code === code && result.requested === language;
  return {
    language:
      result?.requested === language
        ? result.language
        : normalizeCodeLanguage(language),
    html: current ? result.html : null,
  };
}
