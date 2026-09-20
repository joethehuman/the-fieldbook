"use client";
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
      <h2>Make it yours</h2>
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
          onChange={(e) => setSettings({ ...settings, accent: e.target.value })}
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
      <h2>Access and accounts</h2>
      <label>
        Who can browse?
        <select
          value={settings.access}
          onChange={(e) =>
            setSettings({
              ...settings,
              access: e.target.value as "public" | "private",
            })
          }
        >
          <option value="public">Anyone — accounts are optional</option>
          <option value="private">Signed-in members only</option>
        </select>
      </label>
      <label>
        New learner accounts
        <select
          value={settings.registration}
          onChange={(e) =>
            setSettings({
              ...settings,
              registration: e.target.value as "open" | "closed",
            })
          }
        >
          <option value="open">Allow registration with Google</option>
          <option value="closed">Existing members only</option>
        </select>
      </label>
      <p className="muted">
        {production
          ? "Google is the sign-in provider. Provider credentials and the initial administrator are configured securely in the deployment settings."
          : "Access settings are illustrative in the demo. Profiles remain browser-local simulations."}
      </p>
      <button className="primary" disabled={busy}>
        {busy ? "Saving…" : "Save settings"}
      </button>
      <p role="status">{notice}</p>
      {production && (
        <section className="integration-card">
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
