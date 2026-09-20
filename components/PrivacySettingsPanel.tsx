"use client";
import { useInteractionDialog } from "./ui/interaction-dialog";
import { Button } from "./ui/button";
import { SelectField } from "./ui/select";
import MarkdownEditor from "./MarkdownEditor";
import { defaultPrivacy, type SiteSettings } from "@/lib/settings";
export default function PrivacySettingsPanel({
  settings,
  onChange,
  onPublish,
  busy,
}: {
  settings: SiteSettings;
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
    <section className="integration-card">
      <h2>Privacy policy</h2>
      <p>
        Describe this installation’s practices. Save settings to keep a draft;
        publish separately after review. The current published policy stays
        visible while you edit.
      </p>
      <label>
        Policy location
        <SelectField
          value={draft.mode}
          onValueChange={(value) => edit({ mode: value as typeof draft.mode })}
        >
          <option value="hosted">Write a policy in Fieldbook</option>
          <option value="external">Link to an existing policy</option>
        </SelectField>
      </label>
      <label>
        Operator name
        <input
          maxLength={160}
          value={draft.operatorName}
          onChange={(e) => edit({ operatorName: e.target.value })}
        />
      </label>
      <label>
        Privacy contact email (optional)
        <input
          type="email"
          maxLength={254}
          value={draft.contactEmail}
          onChange={(e) => edit({ contactEmail: e.target.value })}
        />
      </label>
      <label>
        Contact page URL (optional)
        <input
          type="url"
          maxLength={2000}
          placeholder="https://example.com/contact"
          value={draft.contactUrl || ""}
          onChange={(e) => edit({ contactUrl: e.target.value })}
        />
      </label>
      <p>
        Provide an email address, an HTTPS contact page, or both. A contact page
        can keep your email address private. Google sign-in has its own
        support-email requirement.
      </p>
      {draft.mode === "external" ? (
        <label>
          Privacy policy URL
          <input
            type="url"
            placeholder="https://example.com/privacy"
            value={draft.url}
            maxLength={2000}
            onChange={(e) => edit({ url: e.target.value })}
          />
        </label>
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
      <Button
        type="button"
        variant="outline"
        disabled={busy || !valid}
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
    </section>
  );
}
