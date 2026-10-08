"use client";

import { Download } from "lucide-react";
import { Button } from "../ui/button";

export function MarkdownDownloadButton({
  value,
  name,
  disabled = false,
}: {
  value: string;
  name: string;
  disabled?: boolean;
}) {
  function download() {
    const url = URL.createObjectURL(
      new Blob([value], { type: "text/markdown;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${
      name
        .trim()
        .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
        .slice(0, 120) || "Content"
    }.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="justify-start font-normal"
      disabled={disabled}
      onClick={download}
    >
      <Download aria-hidden="true" />
      Download Markdown
    </Button>
  );
}
