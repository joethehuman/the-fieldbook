"use client";
import type { ReactNode } from "react";
import {
  $isElementNode,
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
import { videoSource } from "@/lib/video";

type VideoData = SerializedLexicalNode & {
  url: string;
  label: string;
  title?: string | null;
};

/** Stored as the same ordinary media link understood by Fieldbook's reader. */
class WritingVideoNode extends DecoratorNode<ReactNode> {
  constructor(
    public __url: string,
    public __label: string,
    public __title?: string | null,
    key?: NodeKey,
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
    );
  }
  static importJSON(value: VideoData) {
    return new WritingVideoNode(value.url, value.label, value.title);
  }
  exportJSON(): VideoData {
    return {
      ...super.exportJSON(),
      type: "fieldbook-video",
      version: 1,
      url: this.__url,
      label: this.__label,
      title: this.__title,
    };
  }
  createDOM() {
    return document.createElement("span");
  }
  updateDOM() {
    return false;
  }
  isInline() {
    return true;
  }
  getTextContent() {
    return this.__label;
  }
  decorate() {
    const source = videoSource(this.__url);
    return (
      source?.type === "embed" ? <iframe src={source.url} title={this.__label} allowFullScreen loading="lazy" /> : <video
        controls
        preload="metadata"
        src={this.__url}
        aria-label={this.__label}
      />
    );
  }
}

export const writingVideoPlugin = realmPlugin({
  init(realm) {
    realm.pub(addLexicalNode$, WritingVideoNode);
    realm.pub(addImportVisitor$, {
      priority: 100,
      testNode: (node) =>
        node.type === "link" &&
        (/^\/api\/media\/.+\.(mp4|webm)(?:\?|$)/i.test(node.url) ||
          !!videoSource(node.url) && node.children.some((child) => child.type === "text" && child.value === "Video")) &&
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
        actions.appendToParent(mdastParent, {
          type: "link",
          url: video.__url,
          title: video.__title,
          children: [{ type: "text", value: video.__label }],
        });
      },
    });
  },
});
