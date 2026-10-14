"use client";

import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultStyleSpecs,
  createHeadingBlockSpec,
  createCodeBlockSpec,
} from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import { codeBlockOptions } from "@blocknote/code-block";
import { CourseVideo } from "./course-video";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { videoSource } from "@/lib/video";
import type { BlockDocument, WritingBlock } from "@/lib/block-document";

const videoEmbed = createReactBlockSpec(
  {
    type: "videoEmbed",
    propSchema: { url: { default: "" }, title: { default: "Video" } },
    content: "none",
  },
  {
    render: function VideoEmbed({ block, editor }) {
      return (
        <div className="writing-media-block" contentEditable={false}>
          {block.props.url && videoSource(block.props.url) ? (
            <CourseVideo url={block.props.url} title={block.props.title} />
          ) : (
            <p>Add a supported video link.</p>
          )}
          {editor.isEditable && (
            <div className="writing-video-fields">
              <Input
                aria-label="Video URL"
                type="url"
                placeholder="YouTube, Vimeo or Loom URL"
                defaultValue={block.props.url}
                onBlur={(event) => {
                  const url = event.target.value.trim();
                  if (!url || videoSource(url))
                    editor.updateBlock(block, { props: { url } });
                  else
                    event.target.setCustomValidity(
                      "Use a supported HTTPS video URL.",
                    );
                }}
                onInput={(event) => event.currentTarget.setCustomValidity("")}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    event.currentTarget.blur();
                  }
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => editor.removeBlocks([block])}
              >
                Remove video
              </Button>
            </div>
          )}
        </div>
      );
    },
    toExternalHTML: function VideoLink({ block }) {
      return (
        <a href={videoSource(block.props.url) ? block.props.url : undefined}>
          {block.props.title}
        </a>
      );
    },
  },
);
const {
  paragraph,
  bulletListItem,
  numberedListItem,
  quote,
  divider,
  table,
  image,
  video,
  checkListItem,
  toggleListItem,
} = defaultBlockSpecs;
/** Preserve imported fence labels, including aliases and unrecognized languages. */
export function createWritingSchema(document: BlockDocument) {
  const languages: Record<string, { name: string; aliases?: string[] }> = {
    ...codeBlockOptions.supportedLanguages,
  };
  const highlighting = new Map<string, string>();
  for (const [key, value] of Object.entries(
    codeBlockOptions.supportedLanguages,
  )) {
    highlighting.set(key, key);
    for (const alias of value.aliases) highlighting.set(alias, key);
  }
  function registerLanguages(document: BlockDocument) {
    function visit(block: WritingBlock) {
      const language = block.props.language;
      if (block.type === "codeBlock" && language && !languages[language]) {
        const known = highlighting.get(language.toLowerCase());
        languages[language] = {
          name: known ? `${languages[known].name} (${language})` : language,
        };
      }
      block.children.forEach(visit);
    }
    document.blocks.forEach(visit);
  }
  registerLanguages(document);
  const codeBlock = createCodeBlockSpec({
    ...codeBlockOptions,
    defaultLanguage: "text",
    supportedLanguages: languages,
  });
  codeBlock.implementation.meta!.highlight = (block) =>
    highlighting.get(block.props.language.toLowerCase()) || "text";
  const renderCode = codeBlock.implementation.render!;
  codeBlock.implementation.render = function (block, editor) {
    const rendered = renderCode.call(this, block, editor);
    const picker = rendered.dom.querySelector("select");
    picker?.setAttribute("aria-label", "Code language");
    picker?.classList.add("writing-code-language");
    return rendered;
  };
  const schema = BlockNoteSchema.create({
    blockSpecs: {
      paragraph,
      heading: createHeadingBlockSpec({
        levels: [1, 2, 3, 4, 5, 6],
        allowToggleHeadings: true,
      }),
      bulletListItem,
      numberedListItem,
      checkListItem,
      toggleListItem,
      quote,
      divider,
      table,
      image,
      video,
      codeBlock,
      videoEmbed: videoEmbed(),
    },
    styleSpecs: {
      bold: defaultStyleSpecs.bold,
      italic: defaultStyleSpecs.italic,
      underline: defaultStyleSpecs.underline,
      strike: defaultStyleSpecs.strike,
      code: defaultStyleSpecs.code,
    },
  });
  return { schema, registerLanguages };
}
