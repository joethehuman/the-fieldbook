"use client";
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
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.contactEmail);
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
        <select
          value={draft.mode}
          onChange={(e) => edit({ mode: e.target.value as typeof draft.mode })}
        >
          <option value="hosted">Write a policy in Fieldbook</option>
          <option value="external">Link to an existing policy</option>
        </select>
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
        Privacy contact email
        <input
          type="email"
          maxLength={254}
          value={draft.contactEmail}
          onChange={(e) => edit({ contactEmail: e.target.value })}
        />
      </label>
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
      <button
        type="button"
        className="secondary"
        disabled={busy || !valid}
        onClick={() => {
          if (
            window.confirm(
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
      </button>
    </section>
  );
}
