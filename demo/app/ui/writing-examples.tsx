"use client";
import {
  importMarkdownDocument,
  type BlockDocument,
} from "@/lib/block-document";
import Markdown from "@/components/Markdown";
import { useState } from "react";
import { WritingTitle } from "@/components/patterns/writing-title";
import { WritingEditor } from "@/components/patterns/writing-editor";
import { SectionHeader } from "@/components/patterns/layout";
import { Checkbox } from "@/components/ui/choice";
import { CreatableCombobox } from "@/components/ui/creatable-combobox";
import { FormField } from "@/components/patterns/form-field";
import { Field } from "@/components/ui/field";
import { MediaUploadStatus } from "@/components/patterns/media-upload-status";
import { Alert } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function FailureMessageExamples() {
  const [attempt, setAttempt] = useState(0);
  const [long, setLong] = useState(false);
  const [unrelated, setUnrelated] = useState(0);
  return (
    <Card id="failure-messages" aria-label="Dismissible failure messages">
      <div className="grid gap-4">
        <h3>Dismissible failure messages</h3>
        <p>
          Messages open and close smoothly. Dismissing a message keeps your work
          and retry actions available.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Show failure
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-pressed={long}
            onClick={() => setLong((value) => !value)}
          >
            Long message
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setUnrelated((value) => value + 1)}
          >
            Other action ({unrelated})
          </Button>
        </div>
        {attempt > 0 && (
          <Alert variant="destructive" dismissKey={attempt}>
            {long
              ? "Your changes couldn’t be saved. Try again shortly or contact your administrator. Reference: 00000000-0000-4000-8000-000000000099."
              : "Your changes couldn’t be saved. Try again."}
          </Alert>
        )}
        <p data-alert-neighbour>Your draft stays here.</p>
        {attempt > 0 && (
          <Button
            type="button"
            variant="outline"
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry example
          </Button>
        )}
      </div>
    </Card>
  );
}

const proseTable =
  "| Topic | Details |\n| --- | --- |\n| Example | A few sentences explain the decision and give readers enough context to act. The text wraps within the reading area, so the row grows taller as needed. Readers can follow the explanation without scrolling sideways. |\n| Reference | https://example.com/" +
  "a-long-reference-without-spaces".repeat(5) + " |";

function AuthoredTableExamples() {
  const partial = importMarkdownDocument(proseTable);
  const content = partial.blocks[0].content;
  if (content && !Array.isArray(content)) content.columnWidths = [240, null];
  return (
    <Card id="authored-tables" aria-label="Authored table examples">
      <div className="grid min-w-0 gap-6">
        <h3>Reading tables</h3>
        <p>Long text wraps. Resized columns keep their widths, and wide tables scroll within the reading area.</p>
        <div role="group" aria-label="Wrapping table example" className="markdown min-w-0 max-w-[var(--reading-width)]">
          <h4>Long text and links</h4>
          <Markdown>{proseTable}</Markdown>
        </div>
        <div role="group" aria-label="Compact table example" className="markdown min-w-0 max-w-[var(--reading-width)]">
          <h4>Short content stays compact</h4>
          <Markdown>{"| Name | Status |\n| --- | --- |\n| Guide | Ready |"}</Markdown>
        </div>
        <div role="group" aria-label="Partially resized table example" className="markdown min-w-0 max-w-[var(--reading-width)]">
          <h4>One resized column</h4>
          <Markdown document={partial}>{proseTable}</Markdown>
        </div>
        <div role="group" aria-label="Resized table example" className="markdown min-w-0 max-w-[var(--reading-width)]">
          <h4>Both columns resized</h4>
          <Markdown>{"<!-- fieldbook-table-widths:v1 [[192,384]] -->\n\n" + proseTable}</Markdown>
        </div>
        <div role="group" aria-label="Wide table example" className="markdown min-w-0 max-w-[var(--reading-width)]">
          <h4>Many columns</h4>
          <Markdown>{"| Topic | Owner | Status | Priority | Due | Next step |\n| --- | --- | --- | --- | --- | --- |\n| Guide | Support | Draft | Normal | Friday | Review |"}</Markdown>
        </div>
      </div>
    </Card>
  );
}

export function WritingExamples() {
  const [body, setBody] = useState(
    "## A clear place to write\n\n- [x] Review the lesson\n- [ ] Try a knowledge check\n\nWrite **formatted text**, add a [helpful link](https://example.com), and keep your work as a draft.\n\n- Explain the change\n- Make the next step clear\n\n> Keep guidance concise.\n\n| Area | Owner | Next step |\n| :--- | :--- | :--- |\n| **Documentation** | Enablement | Confirm the source |\n| | | |\n| Customer follow-up | Account team | Keep the next decision and its context visible |\n\n```text\nA code block with its own actions.\n```\n\n![A landscape illustration](https://example.com/landscape.png)\n\n[Video](https://www.youtube.com/watch?v=69V__a49xtw)\n\n---\n\nTriple-click this paragraph to select it and open the formatting menu.",
  );
  const [bodyDocument, setBodyDocument] = useState<BlockDocument | undefined>(() => {
    const document = importMarkdownDocument(body);
    const toggle = importMarkdownDocument("More context").blocks[0];
    toggle.type = "toggleListItem";
    toggle.children = importMarkdownDocument(
      "A collapsible explanation keeps optional detail close to the lesson.",
    ).blocks;
    document.blocks.push(toggle);
    return document;
  });
  const [title, setTitle] = useState("A lesson written in place");
  const [category, setCategory] = useState("");
  const [disabled, setDisabled] = useState(false);
  return (
    <section id="writing" className="grid gap-6">
      <SectionHeader
        title={<h2>Visual writing</h2>}
        description="Docs, Updates and course lessons share desktop block editing with Markdown export. Type / at the start of a line to add content, or select text to format it. Compact touch layouts show the desktop-editing notice. Web links such as example.com use HTTPS. Unsupported formatting falls back to source without discarding text."
      />
      <Field orientation="horizontal">
        <Checkbox
          checked={disabled}
          onCheckedChange={(value) => setDisabled(value === true)}
        />
        Read-only example
      </Field>
      <FormField
        label="Example category"
        description="Type to find a category, or add a new name. Changes save with the content."
      >
        <CreatableCombobox
          value={category}
          onValueChange={setCategory}
          options={["General", "Product news", "Company news"]}
          listLabel="Categories"
          placeholder="Choose or add category…"
          disabled={disabled}
        />
      </FormField>
      <WritingEditor
        title={
          <WritingTitle
            aria-label="Example lesson title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={disabled}
          />
        }
        value={body}
        bodyDocument={bodyDocument}
        onChange={(body, document) => {
          setBody(body);
          setBodyDocument(document);
        }}
        disabled={disabled}
      />
      <Card aria-label="Structured reading example">
        <h3>Structured reading</h3>
        <Markdown document={bodyDocument}>{body}</Markdown>
      </Card>
      <AuthoredTableExamples />
      <Card aria-label="Media upload feedback">
        <div className="grid gap-4">
          <h3>Media upload feedback</h3>
          <MediaUploadStatus
            progress={{ stage: "uploading", uploaded: 38, total: 100 }}
          />
          <MediaUploadStatus
            progress={{ stage: "verifying", uploaded: 100, total: 100 }}
          />
          <Alert variant="destructive">
            This file exceeds the upload size limit. Use a smaller file or
            contact an administrator.
          </Alert>
        </div>
      </Card>
      <FailureMessageExamples />
      <p className="text-copy text-muted-foreground">
        Saving a draft and publishing are separate actions in the authoring
        screen. The editor itself owns no persistence. The visual canvas
        displays media inline, with table and media controls available in place.
        The more menu downloads Markdown; unsupported content retains source
        recovery. This catalog does not upload files.
      </p>
    </section>
  );
}
