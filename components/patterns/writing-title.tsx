"use client";

import {
  createContext,
  useContext,
  useLayoutEffect,
  useRef,
  type ComponentProps,
  type ReactNode,
} from "react";
import { Textarea } from "../ui/textarea";

export const WritingTitleContext = createContext<ReactNode>(null);
export const WritingTitleEnterContext = createContext<(() => void) | null>(null);

/** Separate metadata, visually part of the document. Enter continues into its body. */
export function WritingTitle({
  value,
  ...props
}: ComponentProps<typeof Textarea>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const enterBody = useContext(WritingTitleEnterContext);
  useLayoutEffect(() => {
    const title = ref.current;
    if (!title) return;
    const resize = () => {
      title.style.height = "0px";
      title.style.height = `${title.scrollHeight}px`;
    };
    resize();
    const observer = new ResizeObserver((entries) => {
      if (entries.some((entry) => entry.contentRect.width !== width)) {
        width = title.getBoundingClientRect().width;
        resize();
      }
    });
    let width = title.getBoundingClientRect().width;
    observer.observe(title);
    return () => observer.disconnect();
  }, [value]);
  return (
    <Textarea
      {...props}
      ref={(node) => {
        ref.current = node;
        if (typeof props.ref === "function") props.ref(node);
        else if (props.ref) props.ref.current = node;
      }}
      value={value}
      variant="document-title"
      rows={1}
      onKeyDown={(event) => {
        props.onKeyDown?.(event);
        if (
          event.defaultPrevented ||
          event.nativeEvent.isComposing ||
          event.key !== "Enter"
        )
          return;
        event.preventDefault();
        if (enterBody) { enterBody(); return; }
        const body = event.currentTarget
          .closest(".writing-surface")
          ?.querySelector<HTMLElement>(
            '[contenteditable="true"], textarea.writing-source',
          );
        body?.focus();
        if (body?.isContentEditable) {
          const range = document.createRange();
          range.selectNodeContents(body);
          range.collapse(true);
          const selection = window.getSelection();
          selection?.removeAllRanges();
          selection?.addRange(range);
        } else if (body instanceof HTMLTextAreaElement)
          body.setSelectionRange(0, 0);
      }}
    />
  );
}
