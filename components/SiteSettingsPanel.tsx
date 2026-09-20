"use client";
import { Button } from "./ui/button";
import { SelectField } from "./ui/select";
import { Upload, ImageIcon } from "lucide-react";
import { ActionGroup } from "./ui/action-group";
import { useEffect, useRef, useState } from "react";
import PrivacySettingsPanel from "./PrivacySettingsPanel";
import { orderedDocCategories } from "@/lib/docs-navigation";
import { defaultSettings } from "@/lib/settings";
import type { Workspace } from "@/lib/store";
import type { UploadMedia } from "./MarkdownEditor";
export type SettingsSection =
  "identity" | "docs" | "courses" | "access" | "privacy" | "mcp";
export default function SiteSettingsPanel({
  data,
  onChange,
  onUpload,
  production,
  section,
  onPendingChange,
}: {
  data: Workspace;
  onChange: (next: Workspace) => void | Promise<void>;
  onUpload?: UploadMedia;
  production: boolean;
  section: SettingsSection;
  onPendingChange: (pending: boolean) => void;
}) {
  const [settings, setSettings] = useState({
      ...defaultSettings,
      ...data.settings,
    }),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    onPendingChange(
      busy ||
        JSON.stringify(settings) !==
          JSON.stringify({ ...defaultSettings, ...data.settings }),
    );
  }, [busy, settings, data.settings, onPendingChange]);
  const docSections = orderedDocCategories(
    data.content.filter((c) => c.kind === "doc"),
    settings.docCategoryOrder,
  );
  function moveDocSection(index: number, offset: number) {
    const next = [...docSections];
    const target = index + offset;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setSettings((current) => ({ ...current, docCategoryOrder: next }));
    setNotice(
      `${next[target]} moved ${offset < 0 ? "up" : "down"}. Save settings to apply the order.`,
    );
  }
  const logoInput = useRef<HTMLInputElement>(null);
  return (
    <form
      className="settings-panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setNotice("");
        try {
          const next =
            section === "docs"
              ? { ...settings, docCategoryOrder: docSections }
              : settings;
          await onChange({ ...data, settings: next });
          setSettings(next);
          setNotice("Settings saved.");
        } catch (e) {
          setNotice((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {section === "identity" && (
        <section
          className="settings-section"
          tabIndex={-1}
          id="settings-identity"
        >
          <h3>Organization identity</h3>
          <p className="muted">
            Your identity, with the same simple home for docs and courses.
          </p>
          <label>
            Site name
            <input
              required
              maxLength={60}
              value={settings.name}
              onChange={(e) =>
                setSettings({ ...settings, name: e.target.value })
              }
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
          <fieldset className="brand-control">
            <legend>Accent color</legend>
            <p className="field-help">
              Used for links and highlights across your organization.
            </p>
            <div className="color-control">
              <input
                aria-label="Choose accent color"
                type="color"
                value={
                  /^#[0-9a-f]{6}$/i.test(settings.accent)
                    ? settings.accent
                    : "#0069ff"
                }
                onChange={(e) =>
                  setSettings({ ...settings, accent: e.target.value })
                }
              />
              <input
                aria-label="Accent color hex value"
                type="text"
                required
                pattern="#[0-9a-fA-F]{6}"
                maxLength={7}
                spellCheck={false}
                placeholder="#0069ff"
                value={settings.accent}
                onChange={(e) =>
                  setSettings({ ...settings, accent: e.target.value })
                }
              />
            </div>
          </fieldset>
          {(onUpload || settings.logoUrl) && (
            <fieldset className="brand-control">
              <legend>Organization logo</legend>
              <div className="logo-control">
                <div className="logo-preview">
                  {settings.logoUrl ? (
                    <img
                      src={settings.logoUrl}
                      alt="Organization logo preview"
                    />
                  ) : (
                    <ImageIcon aria-hidden="true" size={26} />
                  )}
                </div>
                <div className="logo-controls">
                  <ActionGroup>
                    {onUpload && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => logoInput.current?.click()}
                      >
                        <Upload size={14} />
                        {settings.logoUrl ? "Replace logo" : "Upload logo"}
                      </Button>
                    )}
                    {settings.logoUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          setSettings({ ...settings, logoUrl: "" })
                        }
                      >
                        Remove
                      </Button>
                    )}
                  </ActionGroup>
                  <p className="field-help">
                    PNG, JPG, or WebP. Your logo is scaled to fit.
                  </p>
                </div>
              </div>
              {onUpload && (
                <input
                  ref={logoInput}
                  hidden
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busy}
                  aria-label="Upload organization logo"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) return;
                    setBusy(true);
                    setNotice("");
                    try {
                      const url = await onUpload(file);
                      setSettings((current) => ({ ...current, logoUrl: url }));
                      setNotice("Logo uploaded. Save settings to apply it.");
                    } catch (error) {
                      setNotice((error as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                />
              )}
            </fieldset>
          )}
        </section>
      )}
      {section === "docs" && (
        <section className="settings-section" id="settings-docs">
          <h3>Docs navigation</h3>
          <p>
            Choose the section order for the Docs sidebar and overview. New
            sections appear at the end, alphabetically. This does not change
            article or folder order.
          </p>
          {docSections.length ? (
            <ol className="doc-order-list">
              {docSections.map((name, index) => (
                <li key={name}>
                  <span>{name}</span>
                  <ActionGroup>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Move ${name} up`}
                      disabled={busy || index === 0}
                      onClick={() => moveDocSection(index, -1)}
                    >
                      Move up
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Move ${name} down`}
                      disabled={busy || index === docSections.length - 1}
                      onClick={() => moveDocSection(index, 1)}
                    >
                      Move down
                    </Button>
                  </ActionGroup>
                </li>
              ))}
            </ol>
          ) : (
            <p>Create a document to add a section here.</p>
          )}
          <p className="field-help">
            Only sections with published documents are shown to readers.
          </p>
        </section>
      )}
      {section === "courses" && (
        <fieldset
          className="settings-section"
          tabIndex={-1}
          id="settings-courses"
        >
          <legend>Course completion windows</legend>
          <p>
            Publishing adds to the library. Only courses selected for a group
            become required courses.
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
                setSettings({
                  ...settings,
                  catchUpDays: Number(e.target.value),
                })
              }
            />
          </label>
          <small>
            Newly required courses get a full catch-up window, even near the end
            of onboarding. Changes recalculate targets for everyone.
          </small>
        </fieldset>
      )}
      {section === "access" && (
        <section
          className="settings-section"
          tabIndex={-1}
          id="settings-access"
        >
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
      )}
      {section === "privacy" && (
        <section
          className="settings-section"
          tabIndex={-1}
          id="settings-privacy"
        >
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
      )}
      {section === "mcp" && <McpSettings production={production} />}
      {section !== "mcp" && (
        <div className="settings-save-bar">
          <Button variant="default" disabled={busy}>
            {busy ? "Saving…" : "Save settings"}
          </Button>
          <p role="status">{notice}</p>
        </div>
      )}
    </form>
  );
}

function McpSettings({ production }: { production: boolean }) {
  const [copied, setCopied] = useState("");
  const [address, setAddress] = useState("");
  useEffect(() => {
    setAddress(`${window.location.origin}/api/mcp`);
  }, []);
  if (!production)
    return (
      <section className="settings-section">
        <h3>Connect an AI tool</h3>
        <p>
          MCP lets administrators connect tools such as ChatGPT and Claude to
          their Fieldbook installation. Connections are available in an
          installed organization; this demo does not provide an MCP server.
        </p>
      </section>
    );
  return (
    <section className="settings-section mcp-settings">
      <h3>Connect an AI tool</h3>
      <p>
        Add Fieldbook as a custom MCP server in ChatGPT, Claude, or another
        compatible tool.
      </p>
      <label>
        Server address
        <div className="mcp-address">
          <input
            readOnly
            value={address}
            aria-label="MCP server address"
            onFocus={(event) => event.target.select()}
          />
          <Button
            type="button"
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(address);
                setCopied("Address copied.");
              } catch {
                setCopied("Select the address and copy it manually.");
              }
            }}
          >
            Copy
          </Button>
        </div>
      </label>
      <p role="status" className="field-help">
        {copied}
      </p>
      <ol className="mcp-steps">
        <li>Add the server address in your AI tool’s connection settings.</li>
        <li>Sign in to Fieldbook as an administrator.</li>
        <li>Review and approve the requested connection.</li>
      </ol>
      <div className="mcp-manage">
        <div>
          <h3>Connected tools</h3>
          <p>Review or revoke access from connected AI tools.</p>
        </div>
        <Button asChild variant="outline">
          <a href="/connections">Manage connections →</a>
        </Button>
      </div>
    </section>
  );
}
