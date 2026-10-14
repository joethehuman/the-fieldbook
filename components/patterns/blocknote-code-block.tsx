"use client";

import { createCodeBlockSpec, type CodeBlockOptions } from "@blocknote/core";
import { createReactBlockSpec, usePortalElement } from "@blocknote/react";
import { useShadCNComponentsContext } from "@blocknote/shadcn";
import { CodeXml } from "lucide-react";

/** Change the presentation while retaining BlockNote's code schema and behavior. */
export function createWritingCodeBlock(options: CodeBlockOptions) {
  const native = createCodeBlockSpec(options);
  const spec = createReactBlockSpec(
    native.config,
    {
      meta: native.implementation.meta,
      parse: native.implementation.parse,
      parseContent: native.implementation.parseContent,
      render: function WritingCodeBlock({ block, editor, contentRef }) {
        const {
          Select: {
            Select,
            SelectContent,
            SelectItem,
            SelectTrigger,
            SelectValue,
          },
        } = useShadCNComponentsContext()!;
        const portalElement = usePortalElement();
        return (
          <>
            <div className="writing-code-header" contentEditable={false}>
              <CodeXml size={16} aria-hidden="true" />
              <Select
                value={block.props.language}
                disabled={!editor.isEditable}
                onValueChange={(language) => {
                  if (language)
                    editor.updateBlock(block, { props: { language } });
                }}
              >
                <SelectTrigger
                  aria-label="Code language"
                  className="writing-code-language"
                >
                  <SelectValue>
                    {options.supportedLanguages?.[block.props.language]?.name ||
                      block.props.language}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent
                  className="writing-code-language-menu"
                  container={portalElement}
                  align="start"
                  alignItemWithTrigger={false}
                >
                  {Object.entries(options.supportedLanguages || {}).map(
                    ([value, { name }]) => (
                      <SelectItem key={value} value={value}>
                        {name}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <pre className="writing-code-content">
              <code ref={contentRef} />
            </pre>
          </>
        );
      },
    },
    native.extensions,
  )();
  // Clipboard HTML stays the native <pre><code> representation, without UI.
  spec.implementation.toExternalHTML = native.implementation.toExternalHTML;
  return spec;
}
