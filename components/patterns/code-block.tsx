"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, CodeXml, Copy } from "lucide-react";
import { Button } from "../ui/button";
import { Tooltip } from "../ui/tooltip";
import { Alert } from "../ui/alert";
import { codeLanguageLabel } from "@/lib/code-languages";
import { useCodeHighlight } from "./use-code-highlight";

export function CodeBlockHeader({
  code,
  children,
}: {
  code: string;
  children: ReactNode;
}) {
  const [status, setStatus] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setStatus("");
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [code]);
  async function copy() {
    if (timer.current) clearTimeout(timer.current);
    try {
      await navigator.clipboard.writeText(code);
      setStatus("Copied");
      timer.current = setTimeout(() => setStatus(""), 2000);
    } catch {
      setStatus("Copy failed. Select the code and copy it manually.");
    }
  }
  return (
    <>
      <div className="code-block-header">
        <div className="code-block-language">
          <CodeXml aria-hidden="true" />
          {children}
        </div>
        <Tooltip content={status === "Copied" ? "Copied" : "Copy code"}>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Copy code"
            onClick={() => void copy()}
          >
            {status === "Copied" ? (
              <Check aria-hidden="true" />
            ) : (
              <Copy aria-hidden="true" />
            )}
          </Button>
        </Tooltip>
        <span className="sr-only" role="status">
          {status === "Copied" ? "Code copied" : ""}
        </span>
      </div>
      {status && status !== "Copied" && (
        <Alert
          className="code-block-copy-error"
          role="alert"
          onDismiss={() => setStatus("")}
        >
          {status}
        </Alert>
      )}
    </>
  );
}

export function CodeBlock({
  code,
  language,
}: {
  code: string;
  language: string;
}) {
  const highlighted = useCodeHighlight(code, language);
  return (
    <div className="code-block" data-language={highlighted.language || "text"}>
      <CodeBlockHeader code={code}>
        <span>{codeLanguageLabel(highlighted.language)}</span>
      </CodeBlockHeader>
      <div
        className="code-block-scroll"
        tabIndex={0}
        role="region"
        aria-label={`${codeLanguageLabel(highlighted.language)} code`}
      >
        <pre>
          {highlighted.html === null ? (
            <code>{code}</code>
          ) : (
            <code dangerouslySetInnerHTML={{ __html: highlighted.html }} />
          )}
        </pre>
      </div>
    </div>
  );
}
