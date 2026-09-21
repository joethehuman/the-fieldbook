import { searchLabels, type SearchResult as Result } from "@/lib/search";
import { ContentAction } from "./content-action";
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
}: {
  result: Result;
  href?: string;
  onOpen?: () => void;
}) {
  return (
    <ContentAction asChild className="grid gap-1 break-words p-4">
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
      </a>
    </ContentAction>
  );
}
