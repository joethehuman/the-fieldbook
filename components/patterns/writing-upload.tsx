"use client";

import type { ReactNode } from "react";
import { DecoratorNode, type NodeKey, type SerializedLexicalNode } from "lexical";
import { realmPlugin, addLexicalNode$, addExportVisitor$ } from "@mdxeditor/editor";

export function WritingImageLoading() {
  return <div className="writing-image-loading" role="status">Loading…</div>;
}

/** A temporary insertion point, never part of the saved Markdown. */
export class WritingUploadNode extends DecoratorNode<ReactNode> {
  static getType() { return "fieldbook-upload"; }
  static clone(node: WritingUploadNode) { return new WritingUploadNode(node.__key); }
  static importJSON() { return new WritingUploadNode(); }
  constructor(key?: NodeKey) { super(key); }
  exportJSON(): SerializedLexicalNode {
    return { ...super.exportJSON(), type: "fieldbook-upload", version: 1 };
  }
  createDOM() { return document.createElement("div"); }
  updateDOM() { return false; }
  isInline() { return false; }
  decorate() { return <WritingImageLoading />; }
}

export const writingUploadPlugin = realmPlugin({
  init(realm) {
    realm.pub(addLexicalNode$, WritingUploadNode);
    realm.pub(addExportVisitor$, {
      testLexicalNode: (node) => node instanceof WritingUploadNode,
      visitLexicalNode() { /* Upload feedback is editor-only. */ },
    });
  },
});
