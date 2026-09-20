"use client";
import { Button } from "./ui/button";
import { SelectField } from "./ui/select";
import { useState } from "react";
import PrivacySettingsPanel from "./PrivacySettingsPanel";
import { defaultSettings } from "@/lib/settings";
import type { Workspace } from "@/lib/store";
import type { UploadMedia } from "./MarkdownEditor";
export default function SiteSettingsPanel({
  data,
  onChange,
  onUpload,
  production,
}: {
  data: Workspace;
  onChange: (next: Workspace) => void | Promise<void>;
  onUpload?: UploadMedia;
  production: boolean;
}) {
  const [settings, setSettings] = useState({
      ...defaultSettings,
      ...data.settings,
    }),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <form
      className="settings-panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setNotice("");
        try {
          await onChange({ ...data, settings });
          setNotice("Settings saved.");
        } catch (e) {
          setNotice((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      <nav className="settings-index" aria-label="Settings sections">
        {[
          "Identity",
          "Learning",
          "Access",
          "Privacy",
          ...(production ? ["Connections"] : []),
        ].map((section) => (
          <button
            type="button"
            key={section}
            onClick={() => {
              const target = document.getElementById(
                `settings-${section.toLowerCase()}`,
              );
              target?.scrollIntoView({ block: "start" });
              target?.focus({ preventScroll: true });
            }}
          >
            {section}
          </button>
        ))}
      </nav>
      <section
        className="settings-section"
        tabIndex={-1}
        id="settings-identity"
      >
        <h3>Workspace identity</h3>
        <p className="muted">
          Your identity, with the same simple home for knowledge and learning.
        </p>
        <label>
          Site name
          <input
            required
            maxLength={60}
            value={settings.name}
            onChange={(e) => setSettings({ ...settings, name: e.target.value })}
          />
        </label>
        <label>
          Footer tagline
          <input
            maxLength={180}
            value={settings.tagline}
            onChange={(e) =>
              setSettings({ ...settings, tagline: e.target.value })
            }
          />
        </label>
        <label>
          Accent color
          <input
            type="color"
            value={settings.accent}
            onChange={(e) =>
              setSettings({ ...settings, accent: e.target.value })
            }
          />
        </label>
        {onUpload && (
          <label>
            Logo
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              disabled={busy}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setBusy(true);
                try {
                  const url = await onUpload(f);
                  setSettings({ ...settings, logoUrl: url });
                } catch (error) {
                  setNotice((error as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            />
          </label>
        )}
        {settings.logoUrl && (
          <div>
            <img
              className="branding-preview"
              src={settings.logoUrl}
              alt="Current logo"
            />
            <button
              type="button"
              onClick={() => setSettings({ ...settings, logoUrl: "" })}
            >
              Remove logo
            </button>
          </div>
        )}
      </section>
      <fieldset
        className="settings-section"
        tabIndex={-1}
        id="settings-learning"
      >
        <legend>Learning windows</legend>
        <p>
          Publishing adds to the library. Only courses selected for a group
          become required learning.
        </p>
        <label>
          New user onboarding window (days)
          <input
            type="number"
            required
            min={1}
            max={365}
            value={settings.onboardingDays ?? 90}
            onChange={(e) =>
              setSettings({
                ...settings,
                onboardingDays: Number(e.target.value),
              })
            }
          />
        </label>
        <label>
          Ongoing catch-up window (days)
          <input
            type="number"
            required
            min={1}
            max={365}
            value={settings.catchUpDays ?? 30}
            onChange={(e) =>
              setSettings({ ...settings, catchUpDays: Number(e.target.value) })
            }
          />
        </label>
        <small>
          New learning gets a full catch-up window, even near the end of
          onboarding. Changes recalculate targets for everyone.
        </small>
      </fieldset>
      <section className="settings-section" tabIndex={-1} id="settings-access">
        <h3>Access and accounts</h3>
        <label>
          Who can browse?
          <SelectField
            value={settings.access}
            onValueChange={(value) =>
              setSettings({
                ...settings,
                access: value as "public" | "private",
              })
            }
          >
            <option value="public">Anyone — accounts are optional</option>
            <option value="private">Signed-in members only</option>
          </SelectField>
        </label>
        <label>
          New learner accounts
          <SelectField
            value={settings.registration}
            onValueChange={(value) =>
              setSettings({
                ...settings,
                registration: value as "open" | "closed",
              })
            }
          >
            <option value="open">Allow registration with Google</option>
            <option value="closed">Existing members only</option>
          </SelectField>
        </label>
        <p className="muted">
          {production
            ? "Google is the sign-in provider. Provider credentials and the initial administrator are configured securely in the deployment settings."
            : "Access settings are illustrative in the demo. Profiles remain browser-local simulations."}
        </p>
      </section>
      <section className="settings-section" tabIndex={-1} id="settings-privacy">
        {" "}
        <PrivacySettingsPanel
          settings={settings}
          onChange={setSettings}
          busy={busy}
          onPublish={async (next) => {
            setBusy(true);
            setNotice("");
            try {
              await onChange({ ...data, settings: next });
              setSettings(next);
              setNotice("Privacy policy published.");
            } catch (e) {
              setNotice((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        />
      </section>
      <div className="settings-save-bar">
        <Button variant="default" disabled={busy}>
          {busy ? "Saving…" : "Save settings"}
        </Button>
        <p role="status">{notice}</p>
      </div>
      {production && (
        <section
          className="settings-section integration-card"
          tabIndex={-1}
          id="settings-connections"
        >
          <h2>Connect your AI</h2>
          <p>
            Use{" "}
            <code>
              {typeof window !== "undefined" ? window.location.origin : ""}
              /api/mcp
            </code>{" "}
            as a custom MCP server in ChatGPT or Claude. Sign in as an
            administrator and approve the connection.
          </p>
          <a className="text-button" href="/connections">
            Manage AI connections →
          </a>
        </section>
      )}
    </form>
  );
}
