"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  useBlockNoteEditor,
  useComponentsContext,
  useEditorChange,
  usePortalElement,
} from "@blocknote/react";
import { Check, ChevronDown, CodeXml } from "lucide-react";
import { useShadCNComponentsContext } from "@blocknote/shadcn";
import type { createWritingSchema } from "./blocknote-schema";

type WritingSchema = ReturnType<typeof createWritingSchema>;
type Languages = WritingSchema["languages"];

function LanguageMenu({
  blockId,
  languages,
  disabled,
}: {
  blockId: string;
  languages: Languages;
  disabled: boolean;
}) {
  const editor = useBlockNoteEditor<WritingSchema["schema"]["blockSchema"]>();
  const { Menu } = useComponentsContext()!.Generic;
  const {
    Button: { Button },
  } = useShadCNComponentsContext()!;
  const portalElement = usePortalElement();
  const [keyboard, setKeyboard] = useState(false);
  const block = editor.getBlock(blockId);
  if (block?.type !== "codeBlock") return null;
  const language = block.props.language;
  return (
    <>
      <CodeXml size={16} aria-hidden="true" />
      <Menu.Root
        portalElement={portalElement}
        preventFocusOnOpen={!keyboard}
        onOpenChange={(open) => {
          if (!open) editor.focus();
        }}
      >
        <Menu.Trigger>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Code language"
            className="writing-code-language"
            disabled={disabled || !editor.isEditable}
            onPointerDown={() => setKeyboard(false)}
            onMouseDown={(event) => event.preventDefault()}
            onKeyDown={(event) => {
              if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key))
                setKeyboard(true);
            }}
          >
            {languages[language]?.name || language}
            <ChevronDown size={16} aria-hidden="true" />
          </Button>
        </Menu.Trigger>
        <Menu.Dropdown className="writing-code-language-menu">
          <Menu.Label>Language</Menu.Label>
          {Object.entries(languages).map(([value, { name }]) => (
            <Menu.Item
              key={value}
              disabled={disabled}
              onClick={() => {
                if (disabled || !editor.isEditable) return;
                editor.updateBlock(blockId, { props: { language: value } });
                editor.focus();
              }}
            >
              <span className="writing-code-menu-check" aria-hidden="true">
                {value === language && <Check size={16} />}
              </span>
              {name}
              {value === language && <span className="sr-only"> (selected)</span>}
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu.Root>
    </>
  );
}

/** Portal chrome into the native renderer's non-editable header. The native
 * code/contentDOM, node view measurements and trailing node stay untouched. */
export function WritingCodeHeaders({
  languages,
  disabled = false,
}: {
  languages: Languages;
  disabled?: boolean;
}) {
  const editor = useBlockNoteEditor<WritingSchema["schema"]["blockSchema"]>();
  const [hosts, setHosts] = useState<HTMLElement[]>([]);
  const [, refresh] = useState(0);
  useEditorChange(() => refresh((revision) => revision + 1), editor);
  useEffect(() => {
    let observer: MutationObserver | undefined;
    function attach() {
      observer?.disconnect();
      const element = editor.domElement;
      if (!element) return;
      const root: HTMLElement = element;
      function sync() {
        const next = Array.from(
          root.querySelectorAll<HTMLElement>("[data-writing-code-header]"),
        );
        setHosts((previous) =>
          previous.length === next.length &&
          previous.every((host, index) => host === next[index])
            ? previous
            : next,
        );
      }
      // Native block prop changes replace their render DOM. Observe only mount
      // changes; React header mutations never require an editor transaction.
      observer = new MutationObserver((records) => {
        const headerChanged = records.some((record) =>
          [...record.addedNodes, ...record.removedNodes].some(
            (node) =>
              node instanceof Element &&
              (node.matches("[data-writing-code-header]") ||
                node.querySelector("[data-writing-code-header]")),
          ),
        );
        if (headerChanged) sync();
      });
      observer.observe(root, { childList: true, subtree: true });
      sync();
    }
    const unmount = editor.onUnmount(() => observer?.disconnect());
    const mount = editor.onMount(attach);
    attach();
    return () => {
      observer?.disconnect();
      mount();
      unmount();
    };
  }, [editor]);
  return hosts.map((host) =>
    createPortal(
      <LanguageMenu
        blockId={host.dataset.writingCodeHeader!}
        languages={languages}
        disabled={disabled}
      />,
      host,
      host.dataset.writingCodeHeader,
    ),
  );
}
