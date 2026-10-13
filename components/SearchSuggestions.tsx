"use client";
import type { MouseEvent, KeyboardEvent } from "react";
import { BookOpen, GraduationCap, Newspaper } from "lucide-react";
import type {
  SearchSuggestion,
  SearchBrowsePath,
} from "@/lib/search-suggestions";
import { NavigationButton } from "./patterns/navigation-button";
import { IntentLink } from "./patterns/intent-link";
import { Button } from "./ui/button";

const icons = { doc: BookOpen, course: GraduationCap, brief: Newspaper };
const browse = [
  { href: "/docs" as const, label: "Docs", icon: BookOpen },
  { href: "/courses" as const, label: "Courses", icon: GraduationCap },
  { href: "/updates" as const, label: "Updates", icon: Newspaper },
];
function ordinaryClick(event: MouseEvent<HTMLAnchorElement>) {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}
function moveFocus(event: KeyboardEvent<HTMLElement>) {
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const links = Array.from(event.currentTarget.querySelectorAll("a"));
  const index = links.indexOf(document.activeElement as HTMLAnchorElement);
  if (index < 0) return;
  event.preventDefault();
  links[
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? links.length - 1
        : Math.max(
            0,
            Math.min(
              links.length - 1,
              index + (event.key === "ArrowDown" ? 1 : -1),
            ),
          )
  ].focus();
}
export function SearchSuggestions({
  items,
  loading,
  error,
  clientNavigation,
  onOpen,
  onBrowse,
}: {
  items: SearchSuggestion[];
  loading: boolean;
  error: boolean;
  clientNavigation: boolean;
  onOpen: (item: SearchSuggestion) => void;
  onBrowse?: (href: SearchBrowsePath) => void;
}) {
  const Link = clientNavigation ? IntentLink : "a";
  const href = (path: string) =>
    clientNavigation ? path : `/#${path.slice(1)}`;
  return (
    <section
      aria-label="Search suggestions"
      onKeyDown={moveFocus}
      className="grid gap-3 p-4"
    >
      {items.length > 0 ? (
        <div className="grid gap-2">
          <h2 className="text-label font-medium text-muted-foreground">
            Suggested
          </h2>
          <ul className="grid gap-1" aria-label="Suggested content">
            {items.map((item) => {
              const Icon = icons[item.kind];
              return (
                <li key={item.contentId} className="min-w-0">
                  <NavigationButton asChild className="h-auto gap-3 px-3 py-2">
                    <Link
                      href={href(item.href)}
                      data-fieldbook-local-navigation={
                        clientNavigation ? "true" : undefined
                      }
                      onClick={(event) => {
                        if (ordinaryClick(event)) {
                          event.preventDefault();
                          onOpen(item);
                        }
                      }}
                    >
                      <Icon
                        aria-hidden="true"
                        className="text-muted-foreground"
                      />
                      <span className="grid min-w-0 gap-0.5">
                        <span className="line-clamp-2 break-words text-copy font-medium">
                          {item.title}
                        </span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {item.detail}
                        </span>
                      </span>
                    </Link>
                  </NavigationButton>
                </li>
              );
            })}
          </ul>
        </div>
      ) : loading || error ? (
        <p role="status" className="text-sm text-muted-foreground">
          {loading
            ? "Loading suggestions…"
            : "Suggestions couldn’t load. You can still search."}
        </p>
      ) : null}
      <nav
        aria-label="Browse content"
        className={
          items.length ? "grid gap-2 border-t border-border pt-3" : "grid gap-2"
        }
      >
        <h2 className="text-label font-medium text-muted-foreground">Browse</h2>
        <div className="flex flex-wrap gap-1">
          {browse.map((item) => (
            <Button asChild variant="ghost" key={item.href}>
              <Link
                href={href(item.href)}
                data-fieldbook-local-navigation={
                  clientNavigation && onBrowse ? "true" : undefined
                }
                onClick={
                  onBrowse
                    ? (event) => {
                        if (ordinaryClick(event)) {
                          event.preventDefault();
                          onBrowse(item.href);
                        }
                      }
                    : undefined
                }
              >
                <item.icon
                  aria-hidden="true"
                  className="text-muted-foreground"
                />
                {item.label}
              </Link>
            </Button>
          ))}
        </div>
      </nav>
    </section>
  );
}
