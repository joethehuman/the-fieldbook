import {
  FilePanel,
  useBlockNoteEditor,
  useDictionary,
  type FilePanelProps,
} from "@blocknote/react";
import type { createWritingSchema } from "./blocknote-schema";

type WritingBlockSchema = ReturnType<
  typeof createWritingSchema
>["schema"]["blockSchema"];

/** Native media panel, with the appropriate entry tab for an embedded video. */
export function WritingFilePanel(props: FilePanelProps) {
  const editor = useBlockNoteEditor<WritingBlockSchema>();
  const dictionary = useDictionary();
  return (
    <FilePanel
      {...props}
      key={props.blockId}
      defaultOpenTab={
        editor.getBlock(props.blockId)?.type === "videoEmbed"
          ? dictionary.file_panel.embed.title
          : undefined
      }
    />
  );
}
