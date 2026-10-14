"use client";

import {
  BlockNoteSchema,
  defaultBlockSpecs,
  defaultStyleSpecs,
  createHeadingBlockSpec,
  createCodeBlockSpec,
} from "@blocknote/core";
import {
  createReactBlockSpec,
  ResizableFileBlockWrapper,
} from "@blocknote/react";
import { en } from "@blocknote/core/locales";
import { codeBlockOptions } from "@blocknote/code-block";
import { CourseVideo } from "./course-video";
import { Video } from "lucide-react";
import type { ComponentProps } from "react";
import { videoSource } from "@/lib/video";
import type { BlockDocument, WritingBlock } from "@/lib/block-document";

export const writingDictionary = {
  ...en,
  formatting_toolbar: {
    ...en.formatting_toolbar,
    file_replace: {
      ...en.formatting_toolbar.file_replace,
      tooltip: {
        ...en.formatting_toolbar.file_replace.tooltip,
        videoEmbed: "Replace video",
      },
    },
  },
  file_blocks: {
    ...en.file_blocks,
    add_button_text: {
      ...en.file_blocks.add_button_text,
      videoEmbed: "Add video",
    },
  },
  file_panel: {
    ...en.file_panel,
    embed: {
      ...en.file_panel.embed,
      embed_button: {
        ...en.file_panel.embed.embed_button,
        videoEmbed: "Embed video",
      },
    },
  },
};

const videoEmbed = createReactBlockSpec(
  {
    type: "videoEmbed",
    propSchema: {
      ...defaultBlockSpecs.video.config.propSchema,
      title: { default: "Video" },
    },
    content: "none",
  },
  {
    meta: { fileBlockAccept: ["video/*"] },
    render: function VideoEmbed(props) {
      const { block } = props;
      // The public helper is typed to `file`, although it supports custom file
      // blocks. This schema supplies the native video's complete file props.
      const fileProps = props as unknown as ComponentProps<
        typeof ResizableFileBlockWrapper
      >;
      return (
        <ResizableFileBlockWrapper
          {...fileProps}
          buttonIcon={<Video size={24} />}
        >
          <div className="bn-visual-media-wrapper" contentEditable={false}>
            <CourseVideo url={block.props.url} title={block.props.title} />
          </div>
        </ResizableFileBlockWrapper>
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
  const languages: Record<string, { name: string; aliases?: string[] }> =
    Object.assign(Object.create(null), codeBlockOptions.supportedLanguages);
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
      if (
        block.type === "codeBlock" &&
        language &&
        !Object.hasOwn(languages, language)
      ) {
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
  const nativeRender = codeBlock.implementation.render!;
  codeBlock.implementation.render = function (block, editor) {
    const rendered = nativeRender.call(this, block, editor);
    // Label and style the native select; keep its DOM, listeners and contentDOM.
    const select = rendered.dom.querySelector("select");
    select?.setAttribute("aria-label", "Code language");
    select?.classList.add("writing-code-language");
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
      textColor: defaultStyleSpecs.textColor,
      backgroundColor: defaultStyleSpecs.backgroundColor,
    },
  });
  return { schema, registerLanguages };
}
