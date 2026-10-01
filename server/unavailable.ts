import { NextResponse } from "next/server";
import { unavailableCopy } from "@/lib/unavailable";
import { errorResponse, ServiceError } from "./errors";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]!);
}

function documentResponse(title: string, content: string, status: number) {
  return new NextResponse(
    `<!doctype html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${title} | Fieldbook</title>
</head><body><main style="max-width:24rem;margin:10vh auto;padding:1.5rem;font-family:system-ui,sans-serif;line-height:1.5;overflow-wrap:anywhere">
<p>Fieldbook</p><h1>${title}</h1>${content}</main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

// Terminal admission failure: never hand a denied request back to a prerendered
// route or its segment-prefetch cache. Only fixed, generic copy is serialized.
// Next's client router falls back to this safe document after a rejected RSC fetch.
export function unavailableResponse() {
  return documentResponse(
    unavailableCopy.title,
    `<p>${unavailableCopy.description}</p><a href="/">${unavailableCopy.back}</a>`,
    404,
  );
}

// Admission must fail closed, but a provider outage remains recoverable. A
// native GET form retries the exact local destination without needing scripts.
export function admissionUnavailableResponse(url: URL, service: "auth" | "database") {
  const logged = errorResponse(new ServiceError("Access verification is unavailable.", service), "workspace-admission");
  const requestId = logged.headers.get("X-Request-Id")!;
  const fields = [...url.searchParams].map(([name, value]) =>
    `<input type="hidden" name="${escapeHtml(name)}" value="${escapeHtml(value)}">`,
  ).join("");
  const response = documentResponse(
    "Unable to load this page",
    `<p role="alert">Access verification is unavailable. Please try again shortly.</p>
<p>Reference: ${requestId}</p><form method="get" action="${escapeHtml(url.pathname)}">${fields}<button type="submit">Try again</button></form>`,
    503,
  );
  response.headers.set("X-Request-Id", requestId);
  return response;
}
