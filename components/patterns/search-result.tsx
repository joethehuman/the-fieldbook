import { searchLabels, type SearchResult as Result } from "@/lib/search";
import { ContentAction } from "./content-action";
import { Skeleton } from "../ui/skeleton";
import Link from "next/link";
import { ReaderPending } from "@/components/reader/ReaderPending";

export function SearchResultSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="grid gap-3 rounded-lg border border-border p-4"
    >
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  );
}
export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const escaped = terms
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!escaped.length) return <>{text}</>;
  const expression = new RegExp(`(${escaped.join("|")})`, "gi");
  return (
    <>
      {text.split(expression).map((part, i) =>
        i % 2 ? (
          <mark
            key={i}
            className="rounded-sm bg-accent text-accent-foreground font-semibold"
          >
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}
export function SearchResultCard({
  result,
  href,
  onOpen,
  clientNavigation = false,
}: {
  result: Result;
  href?: string;
  onOpen?: () => void;
  clientNavigation?: boolean;
}) {
  return (
    <ContentAction
      asChild
      className="grid gap-1 break-words p-4 hover:bg-muted hover:no-underline hover:shadow-none focus-visible:bg-muted"
    >
      {clientNavigation ? (
        <Link href={href || result.href} prefetch={false} onClick={onOpen}>
          <ResultBody result={result} />
          <ReaderPending />
        </Link>
      ) : (
        <a
          href={href || result.href}
          onClick={
            onOpen
              ? (e) => {
                  if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                    e.preventDefault();
                    onOpen();
                  }
                }
              : undefined
          }
        >
          <ResultBody result={result} />
        </a>
      )}
    </ContentAction>
  );
}
function ResultBody({ result }: { result: Result }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>{searchLabels[result.kind]}</span>
        {result.contentDate && (
          <span>
            · Content updated{" "}
            {new Date(result.contentDate).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            })}
          </span>
        )}
      </div>
      <h2 className="text-lg font-semibold">
        <Highlight text={result.title} terms={result.highlights} />
      </h2>
      {result.lessonTitle && (
        <p className="text-sm font-medium">
          Lesson:{" "}
          <Highlight text={result.lessonTitle} terms={result.highlights} />
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        <Highlight text={result.excerpt} terms={result.highlights} />
      </p>
    </>
  );
}
