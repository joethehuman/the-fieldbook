"use client";

import type { ReactNode } from "react";
import { DecoratorNode, type NodeKey, type SerializedLexicalNode } from "lexical";
import { realmPlugin, addLexicalNode$, addExportVisitor$ } from "@mdxeditor/editor";
import { Spinner } from "../ui/spinner";

export function WritingMediaLoading() {
  return <div className="writing-media-loading" role="status"><Spinner className="size-3.5" />Loading…</div>;
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
  decorate() { return <WritingMediaLoading />; }
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
