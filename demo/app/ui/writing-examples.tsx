"use client";
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

export function WritingExamples() {
  const [body, setBody] = useState(
    "## A clear place to write\n\nWrite **formatted text**, add a [helpful link](https://example.com), and keep your work as a draft.\n\n- Explain the change\n- Make the next step clear\n\n> Keep guidance concise.\n\n| Area | Owner | Next step |\n| :--- | :--- | :--- |\n| **Documentation** | Enablement | Confirm the source |\n| | | |\n| Customer follow-up | Account team | Keep the next decision and its context visible |",
  );
  const [title, setTitle] = useState("A lesson written in place");
  const [category, setCategory] = useState("");
  const [disabled, setDisabled] = useState(false);
  return (
    <section id="writing" className="grid gap-6">
      <SectionHeader
        title={<h2>Visual writing</h2>}
        description="Docs, Updates and course lessons share visual Markdown editing. Use Commands or type / at the start of a line to add content. Select text for formatting; web links such as example.com use HTTPS. Unsupported formatting falls back to source without discarding text."
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
      <WritingEditor title={<WritingTitle aria-label="Example lesson title" value={title} onChange={(event) => setTitle(event.target.value)} disabled={disabled} />} value={body} onChange={setBody} disabled={disabled} />
      <Card aria-label="Media upload feedback">
        <div className="grid gap-4">
          <h3>Media upload feedback</h3>
          <MediaUploadStatus progress={{ stage: "uploading", uploaded: 38, total: 100 }} />
          <MediaUploadStatus progress={{ stage: "verifying", uploaded: 100, total: 100 }} />
          <Alert variant="destructive">Storage rejected this file because it exceeds the installation's file-size limit. Ask an administrator to check the storage limits.</Alert>
        </div>
      </Card>
      <p className="text-copy text-muted-foreground">
        Saving a draft and publishing are separate actions in the authoring
        screen. The editor itself owns no persistence. The visual canvas displays media inline, with table and media controls available in place. The more menu downloads Markdown; unsupported content retains source recovery. This catalog does not upload files.
      </p>
    </section>
  );
}
