"use client";

import {
  isValidElement,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { Button } from "./button";
import { cn } from "@/lib/utils";
const variants = cva(
  "grid gap-2 rounded-md border px-4 py-3 text-copy [overflow-wrap:anywhere]",
  {
    variants: {
      variant: {
        default: "border-border bg-muted text-foreground",
        destructive: "border-destructive/25 bg-destructive/5 text-destructive",
        success: "border-success/25 bg-success/5 text-success",
        warning: "border-warning/25 bg-warning/5 text-warning",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

// Compare message content, not React element identities, so unrelated renders
// don't redisplay a dismissed notice. Owners can supply a key for a new attempt.
function messageKey(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(messageKey).join("\n");
  if (isValidElement<{ children?: ReactNode }>(node))
    return messageKey(node.props.children);
  return "";
}

const subscribeHydration = () => () => {};
const clientHydration = () => false;
const serverHydration = () => true;

function frames(element: HTMLElement) {
  const style = getComputedStyle(element);
  const parent = element.parentElement;
  const layout = parent && getComputedStyle(parent);
  const verticalGap =
    layout &&
    (layout.display.includes("grid") ||
      (layout.display.includes("flex") &&
        layout.flexDirection.startsWith("column")))
      ? parseFloat(layout.rowGap) || 0
      : 0;
  // Cancel the parent-owned gap as the notice collapses, including the last
  // frame when it leaves the DOM. Its neighbours then move continuously.
  const margin = element.previousElementSibling ? "marginTop" : "marginBottom";
  const expanded = {
    height: `${element.getBoundingClientRect().height}px`,
    opacity: style.opacity,
    paddingTop: style.paddingTop,
    paddingBottom: style.paddingBottom,
    borderTopWidth: style.borderTopWidth,
    borderBottomWidth: style.borderBottomWidth,
    [margin]: style[margin],
    overflow: "clip",
    minHeight: "0px",
  };
  const collapsed = {
    ...expanded,
    height: "0px",
    opacity: "0",
    paddingTop: "0px",
    paddingBottom: "0px",
    borderTopWidth: "0px",
    borderBottomWidth: "0px",
    [margin]: `${(parseFloat(style[margin]) || 0) - verticalGap}px`,
  };
  return { expanded, collapsed };
}

export function Alert({
  className,
  variant,
  role,
  children,
  dismissible = variant === "destructive" || role === "alert",
  dismissKey,
  onDismiss,
  dismissLabel = "Dismiss message",
  ref: forwardedRef,
  ...props
}: ComponentProps<"div"> &
  VariantProps<typeof variants> & {
    dismissible?: boolean;
    /** Use an attempt ID when a new failure can have the same message. */
    dismissKey?: string | number;
    /** Clear notification copy only; keep restrictions and recovery state separate. */
    onDismiss?: () => void;
    dismissLabel?: string;
  }) {
  const ref = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [closing, setClosing] = useState<string | null>(null);
  const key = `${dismissKey ?? ""}\n${messageKey(children)}`;
  const hydrating = useSyncExternalStore(subscribeHydration, clientHydration, serverHydration);
  const serverKey = useRef(hydrating ? key : null);
  const hidden = dismissible && dismissed === key;
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || hidden || !dismissible) return;
    // Server-rendered notices already occupy their final space. Replaying the
    // opening animation during hydration would collapse and reopen that space.
    const alreadyVisible = serverKey.current === key;
    if (!alreadyVisible) serverKey.current = null;
    if (!alreadyVisible && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const { expanded, collapsed } = frames(element);
      animation.current = element.animate([collapsed, expanded], {
        duration: 200,
        easing: "cubic-bezier(.2,0,0,1)",
      });
    }
    return () => {
      animation.current?.cancel();
      animation.current = null;
    };
  }, [key, hidden, dismissible]);

  function dismiss() {
    const element = ref.current;
    if (!element || closing === key) return;
    const current = frames(element).expanded;
    animation.current?.cancel();
    setClosing(key);
    const focused = element.contains(document.activeElement);
    const finish = () => {
      setDismissed(key);
      setClosing(null);
      if (focused) {
        const target = returnFocus.current;
        if (target?.isConnected && !element.contains(target))
          target.focus({ preventScroll: true });
        else {
          const scope =
            element.closest('[role="dialog"], form, main') ||
            element.parentElement;
          const control = Array.from(
            scope?.querySelectorAll<HTMLElement>(
              'button:not(:disabled), a[href], input:not(:disabled), textarea:not(:disabled), [contenteditable="true"], [tabindex="0"]',
            ) || [],
          ).find(
            (node) =>
              !element.contains(node) &&
              node.getClientRects().length &&
              !node.closest("[hidden], [inert]"),
          );
          control?.focus({ preventScroll: true });
        }
      }
      onDismiss?.();
    };
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }
    const { collapsed } = frames(element);
    animation.current = element.animate([current, collapsed], {
      duration: 200,
      easing: "cubic-bezier(.2,0,0,1)",
      fill: "forwards",
    });
    animation.current.onfinish = finish;
  }

  if (hidden) return null;
  return (
    <div
      ref={(element) => {
        ref.current = element;
        if (typeof forwardedRef === "function") return forwardedRef(element);
        if (forwardedRef) forwardedRef.current = element;
      }}
      data-slot="alert"
      data-state={closing === key ? "closing" : "open"}
      role={role ?? (variant === "destructive" ? "alert" : "status")}
      className={cn(
        variants({ variant }),
        "min-w-0 outline-none",
        className,
        dismissible && "relative pe-12",
      )}
      {...props}
    >
      {children}
      {dismissible && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute end-2 top-2 size-8 p-0 text-current hover:text-current focus-visible:ring-muted-foreground focus-visible:ring-offset-0"
          aria-label={dismissLabel}
          disabled={closing === key}
          onFocus={(event) => {
            if (event.relatedTarget instanceof HTMLElement)
              returnFocus.current = event.relatedTarget;
          }}
          onClick={(event) => {
            event.stopPropagation();
            dismiss();
          }}
        >
          <X aria-hidden="true" className="size-4" />
        </Button>
      )}
    </div>
  );
}
