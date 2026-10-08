"use client";
import type { ReactNode } from "react";
import { useCellValue } from "@mdxeditor/gurx";
import { readOnly$ } from "@mdxeditor/editor";
import { WritingMediaVideo } from "./writing-media";
import { isInlineVideo } from "@/lib/inline-video";
import {
  $isElementNode,
  $getNodeByKey,
  $createParagraphNode,
  type LexicalEditor,
  DecoratorNode,
  type NodeKey,
  type SerializedLexicalNode,
} from "lexical";
import {
  realmPlugin,
  addLexicalNode$,
  addImportVisitor$,
  addExportVisitor$,
} from "@mdxeditor/editor";

type VideoData = SerializedLexicalNode & {
  url: string;
  label: string;
  title?: string | null;
  inline?: boolean;
};

/** Stored as the same ordinary media link understood by Fieldbook's reader. */
class WritingVideoNode extends DecoratorNode<ReactNode> {
  constructor(
    public __url: string,
    public __label: string,
    public __title?: string | null,
    key?: NodeKey,
    public __inline = true,
  ) {
    super(key);
  }
  static getType() {
    return "fieldbook-video";
  }
  static clone(node: WritingVideoNode) {
    return new WritingVideoNode(
      node.__url,
      node.__label,
      node.__title,
      node.__key,
      node.__inline,
    );
  }
  static importJSON(value: VideoData) {
    return new WritingVideoNode(value.url, value.label, value.title, undefined, value.inline ?? true);
  }
  exportJSON(): VideoData {
    return {
      ...super.exportJSON(),
      type: "fieldbook-video",
      version: 1,
      url: this.__url,
      label: this.__label,
      title: this.__title,
      inline: this.__inline,
    };
  }
  createDOM() {
    return document.createElement(this.__inline ? "span" : "div");
  }
  updateDOM() {
    return false;
  }
  isInline() {
    return this.__inline;
  }
  getTextContent() {
    return this.__label;
  }
  setUrl(url: string) {
    const writable = this.getWritable();
    writable.__url = url;
    writable.__label = "Video";
  }
  decorate(editor: LexicalEditor) {
    return <VideoEditor editor={editor} nodeKey={this.__key} url={this.__url} label={this.__label} />;
  }
}

function VideoEditor({ editor, nodeKey, url, label }: { editor: LexicalEditor; nodeKey: NodeKey; url: string; label: string }) {
  const disabled = useCellValue(readOnly$);
  return <WritingMediaVideo url={url} label={label} disabled={disabled}
    onChange={(url) => editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (node instanceof WritingVideoNode) node.setUrl(url);
    })}
    onRemove={() => editor.update(() => {
      const node = $getNodeByKey(nodeKey);
      if (node) { node.selectPrevious(); node.remove(); }
    })}
    onParagraph={(direction) => editor.update(() => {
      const node = $getNodeByKey(nodeKey)?.getTopLevelElementOrThrow();
      if (!node) return;
      const paragraph = $createParagraphNode();
      if (direction === "before") node.insertBefore(paragraph); else node.insertAfter(paragraph);
      paragraph.select();
    })} />;
}

export function $createWritingVideoNode(url: string) {
  return new WritingVideoNode(url, "Video", undefined, undefined, false);
}

export const writingVideoPlugin = realmPlugin({
  init(realm) {
    realm.pub(addLexicalNode$, WritingVideoNode);
    realm.pub(addImportVisitor$, {
      priority: 110,
      testNode: (node) => {
        if (node.type !== "paragraph" || node.children.length !== 1) return false;
        const link = node.children[0];
        return link.type === "link" && link.children.every((child) => child.type === "text") &&
          isInlineVideo(link.url, link.children.map((child) => child.type === "text" ? child.value : "").join(""));
      },
      visitNode({ mdastNode, mdastParent, lexicalParent }) {
        if (mdastNode.type !== "paragraph") return;
        // insertMarkdown uses a lightweight append target instead of an ElementNode.
        if (!("append" in lexicalParent) || typeof lexicalParent.append !== "function") return;
        const link = mdastNode.children[0];
        if (link.type !== "link") return;
        lexicalParent.append(new WritingVideoNode(link.url,
          link.children.map((child) => child.type === "text" ? child.value : "").join(""),
          link.title, undefined, false));
        // Match MDXEditor's trailing writing line for documents ending in other blocks.
        if (mdastParent?.type === "root" && mdastParent.children.at(-1) === mdastNode) {
          lexicalParent.append($createParagraphNode());
        }
      },
    });
    realm.pub(addImportVisitor$, {
      priority: 100,
      testNode: (node) =>
        node.type === "link" &&
        isInlineVideo(node.url, node.children.map((child) => child.type === "text" ? child.value : "").join("")) &&
        node.children.every((child) => child.type === "text"),
      visitNode({ mdastNode, lexicalParent }) {
        if (mdastNode.type !== "link" || !$isElementNode(lexicalParent)) return;
        lexicalParent.append(
          new WritingVideoNode(
            mdastNode.url,
            mdastNode.children
              .map((child) => (child.type === "text" ? child.value : ""))
              .join(""),
            mdastNode.title,
          ),
        );
      },
    });
    realm.pub(addExportVisitor$, {
      testLexicalNode: (node) => node instanceof WritingVideoNode,
      visitLexicalNode({ lexicalNode, mdastParent, actions }) {
        const video = lexicalNode as WritingVideoNode;
        const link = {
          type: "link" as const,
          url: video.__url,
          title: video.__title,
          children: [{ type: "text" as const, value: video.__label }],
        };
        actions.appendToParent(mdastParent, video.isInline() ? link : { type: "paragraph", children: [link] });
      },
    });
  },
});
