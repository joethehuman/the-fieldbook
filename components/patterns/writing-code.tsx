"use client";

import { useEffect, useRef, useState } from "react";
import { useCellValue } from "@mdxeditor/gurx";
import {
  readOnly$,
  useCodeBlockEditorContext,
  type CodeBlockEditorProps,
} from "@mdxeditor/editor";
import { Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView, keymap, drawSelection } from "@codemirror/view";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import {
  $createParagraphNode,
  $getNodeByKey,
  $setSelection,
  REDO_COMMAND,
  UNDO_COMMAND,
} from "lexical";
import {
  codeLanguages,
  codeLanguageLabel,
  normalizeCodeLanguage,
} from "@/lib/code-languages";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "../ui/select";
import { CodeBlockHeader } from "./code-block";
import { WritingBlockActions, blockActions } from "./writing-block-actions";
import { useCodeHighlight } from "./use-code-highlight";
import { useWritingInteraction } from "./writing-interaction";

// The reader and CodeMirror use the same color classes and theme variables.
const colors = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.keyword, class: "hljs-keyword" },
    { tag: [tags.string, tags.regexp], class: "hljs-string" },
    { tag: [tags.number, tags.bool, tags.null], class: "hljs-number" },
    { tag: tags.comment, class: "hljs-comment" },
    {
      tag: [tags.function(tags.variableName), tags.className, tags.typeName],
      class: "hljs-title",
    },
    { tag: [tags.tagName, tags.attributeName], class: "hljs-attr" },
    { tag: [tags.meta, tags.annotation], class: "hljs-meta" },
  ]),
);

export function WritingCodeEditor({
  code,
  language,
  focusEmitter,
  nodeKey,
}: CodeBlockEditorProps) {
  const { setCode, setLanguage, parentEditor, lexicalNode } =
    useCodeBlockEditorContext();
  const readOnly = useCellValue(readOnly$);
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const current = useRef({ code, setCode });
  current.current = { code, setCode };
  const syntax = useRef(new Compartment());
  const editable = useRef(new Compartment());
  const highlighted = useCodeHighlight(code, language, 250);
  const [pickerOpen, setPickerOpen] = useState(false);
  useWritingInteraction(pickerOpen);
  const selected = normalizeCodeLanguage(language);
  const known =
    !selected ||
    selected === "text" ||
    codeLanguages.some(([key]) => key === selected);

  useEffect(() => {
    if (!host.current) return;
    function leave(direction: "before" | "after", editor: EditorView) {
      const cursor = editor.state.selection.main;
      const edge = direction === "before" ? 0 : editor.state.doc.length;
      if (!cursor.empty || cursor.head !== edge) return false;
      parentEditor.update(() => {
        const node = $getNodeByKey(nodeKey);
        if (!node) return;
        // Lexical leaves native selection alone while CodeMirror owns focus.
        // Return focus before committing the chosen sibling caret.
        parentEditor.getRootElement()?.focus({ preventScroll: true });
        if (direction === "before") node.selectPrevious();
        else if (node.getNextSibling()) node.selectNext();
        else {
          const paragraph = $createParagraphNode();
          node.insertAfter(paragraph);
          paragraph.selectStart();
        }
      }, { discrete: true });
      return true;
    }
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: current.current.code,
        extensions: [
          syntax.current.of([]),
          editable.current.of([]),
          colors,
          drawSelection(),
          EditorView.contentAttributes.of({
            "aria-label": "Code block",
            "aria-multiline": "true",
            spellcheck: "false",
          }),
          keymap.of([
            {
              key: "Mod-z",
              run: () => parentEditor.dispatchCommand(UNDO_COMMAND, undefined),
            },
            {
              key: "Mod-Shift-z",
              run: () => parentEditor.dispatchCommand(REDO_COMMAND, undefined),
            },
            {
              key: "Mod-y",
              run: () => parentEditor.dispatchCommand(REDO_COMMAND, undefined),
            },
            { key: "ArrowUp", run: (editor) => leave("before", editor) },
            { key: "ArrowDown", run: (editor) => leave("after", editor) },
            indentWithTab,
            ...defaultKeymap,
          ]),
          EditorView.domEventHandlers({
            focus: () => {
              parentEditor.update(() => $setSelection(null));
            },
            keydown: (event) => {
              event.stopPropagation();
              return false;
            },
            paste: (event) => {
              event.stopPropagation();
              return false;
            },
          }),
          EditorView.updateListener.of((update) => {
            if (
              update.docChanged &&
              !update.transactions.some((transaction) =>
                transaction.annotation(Transaction.remote),
              )
            )
              current.current.setCode(update.state.doc.toString());
          }),
        ],
      }),
    });
    view.current = editor;
    return () => {
      editor.destroy();
      view.current = null;
    };
  }, [parentEditor, nodeKey]);
  useEffect(() => {
    focusEmitter.subscribe(() => view.current?.focus());
  }, [focusEmitter]);

  useEffect(() => {
    const editor = view.current;
    if (editor && editor.state.doc.toString() !== code) {
      // Draft recovery and Lexical undo change props. Reflect them without writing them back.
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: code },
        annotations: Transaction.remote.of(true),
      });
    }
  }, [code]);
  useEffect(() => {
    view.current?.dispatch({
      effects: editable.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorView.contentAttributes.of({ "aria-readonly": String(readOnly) }),
      ]),
    });
  }, [readOnly]);
  useEffect(() => {
    let cancelled = false;
    const editor = view.current;
    if (!editor) return;
    const language = highlighted.language;
    if (!language || language === "text" || !known) {
      editor.dispatch({ effects: syntax.current.reconfigure([]) });
      return;
    }
    void import("@codemirror/language-data")
      .then(async ({ languages }) => {
        const definition = languages.find(
          (item) =>
            item.name.toLowerCase() === language ||
            item.alias.includes(language),
        );
        const support = await definition?.load();
        if (!cancelled)
          editor.dispatch({
            effects: syntax.current.reconfigure(support?.extension || []),
          });
      })
      .catch(() => {
        /* Keep editable plain text when a language chunk cannot load. */
      });
    return () => {
      cancelled = true;
    };
  }, [highlighted.language, known]);

  return (
    <div className="writing-code-block" contentEditable={false}>
      <WritingBlockActions
        label="Code block"
        disabled={readOnly}
        {...blockActions(parentEditor, lexicalNode.getKey())}
      />
      <div
        className="code-block"
        data-language={highlighted.language || "text"}
      >
        <CodeBlockHeader code={code}>
          <Select
            value={selected || "auto"}
            onValueChange={(value) =>
              setLanguage(value === "auto" ? "" : value)
            }
            disabled={readOnly}
            onOpenChange={setPickerOpen}
          >
            <SelectTrigger
              aria-label="Code language"
              className="code-language-picker"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Auto-detect</SelectItem>
              <SelectItem value="text">Plain text</SelectItem>
              {codeLanguages.map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
              {!known && <SelectItem value={selected}>{language}</SelectItem>}
            </SelectContent>
          </Select>
          {!selected && highlighted.language && (
            <span className="code-detected-language">
              {codeLanguageLabel(highlighted.language)}
            </span>
          )}
        </CodeBlockHeader>
        <div ref={host} className="writing-code" />
      </div>
    </div>
  );
}
