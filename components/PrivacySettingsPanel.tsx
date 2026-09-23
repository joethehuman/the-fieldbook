"use client";
import type { ReactNode } from "react";
import { FormField } from "@/components/patterns/form-field";
import { Input } from "@/components/ui/input";

import { SettingsSection } from "./patterns/settings-section";
import { useInteractionDialog } from "./ui/interaction-dialog";
import { Button } from "./ui/button";
import { SelectField } from "./ui/select";
import MarkdownEditor from "./MarkdownEditor";
import { defaultPrivacy, type SiteSettings } from "@/lib/settings";
export default function PrivacySettingsPanel({
  settings,
  actions,
  onChange,
  onPublish,
  busy,
}: {
  settings: SiteSettings;
  actions?: ReactNode;
  onChange: (s: SiteSettings) => void;
  onPublish: (s: SiteSettings) => Promise<void>;
  busy: boolean;
}) {
  const { confirm } = useInteractionDialog();
  const privacy = settings.privacy || defaultPrivacy;
  const draft = privacy.draft;
  const edit = (patch: Partial<typeof draft>) =>
    onChange({
      ...settings,
      privacy: {
        ...privacy,
        draft: { ...draft, ...patch },
      },
    });
  const valid =
    draft.mode === "external"
      ? /^https:\/\//.test(draft.url)
      : !!draft.body.trim() &&
        !!draft.operatorName.trim() &&
        (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.contactEmail) ||
          /^https:\/\//.test(draft.contactUrl || ""));
  return (
    <SettingsSection
      id="privacy-policy-fields"
      disabled={busy}
      title={<h3>Policy content</h3>}
      guidance="Save settings to keep a draft; publish separately after review. The current published policy stays visible while you edit."
      actions={
        <>
          {actions}{" "}
          <Button
            type="button"
            variant="outline"
            disabled={!valid}
            loading={busy}
            aria-describedby={!valid ? "privacy-publish-help" : undefined}
            onClick={async () => {
              if (
                await confirm(
                  "Publish this privacy policy for all visitors? This also saves your current settings.",
                )
              )
                void onPublish({
                  ...settings,
                  privacy: {
                    ...privacy,
                    published: { ...draft },
                    publishedAt: new Date().toISOString(),
                  },
                });
            }}
          >
            Publish privacy policy
          </Button>
        </>
      }
    >
      <FormField label="Policy location">
        <SelectField
          value={draft.mode}
          onValueChange={(value) => edit({ mode: value as typeof draft.mode })}
        >
          <option value="hosted">Write a policy in Fieldbook</option>
          <option value="external">Link to an existing policy</option>
        </SelectField>
      </FormField>
      <FormField label="Operator name">
        <Input
          maxLength={160}
          value={draft.operatorName}
          onChange={(e) => edit({ operatorName: e.target.value })}
        />
      </FormField>
      <FormField
        label="Privacy contact email (optional)"
        description="Provide an email address, an HTTPS contact page, or both."
      >
        <Input
          type="email"
          maxLength={254}
          value={draft.contactEmail}
          onChange={(e) => edit({ contactEmail: e.target.value })}
        />
      </FormField>
      <FormField
        label="Contact page URL (optional)"
        description="An HTTPS contact page can keep your email address private."
      >
        <Input
          type="url"
          maxLength={2000}
          placeholder="https://example.com/contact"
          value={draft.contactUrl || ""}
          onChange={(e) => edit({ contactUrl: e.target.value })}
        />
      </FormField>
      <p className="text-copy text-muted-foreground">
        Google sign-in has its own support-email requirement.
      </p>
      {draft.mode === "external" ? (
        <FormField label="Privacy policy URL">
          <Input
            type="url"
            placeholder="https://example.com/privacy"
            value={draft.url}
            maxLength={2000}
            onChange={(e) => edit({ url: e.target.value })}
          />
        </FormField>
      ) : (
        <MarkdownEditor
          label="Privacy policy draft"
          value={draft.body}
          onChange={(body) => edit({ body })}
        />
      )}
      <p>
        {privacy.published
          ? `Published ${privacy.publishedAt?.slice(0, 10) || "previously"}.`
          : "No policy has been published yet."}
      </p>
      {!valid && (
        <p
          id="privacy-publish-help"
          className="text-copy text-muted-foreground"
        >
          {draft.mode === "external"
            ? "Enter an HTTPS policy URL before publishing."
            : "Add an operator name, a valid contact email or HTTPS contact page, and policy text before publishing."}
        </p>
      )}
    </SettingsSection>
  );
}
