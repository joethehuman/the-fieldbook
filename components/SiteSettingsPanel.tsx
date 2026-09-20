"use client";
import { ReorderRow } from "./patterns/reorder-row";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldDescription } from "@/components/ui/field";
import { Button } from "./ui/button";
import { SelectField } from "./ui/select";
import DocSectionCreate from "./DocSectionCreate";
import {
  Upload,
  ImageIcon,
  GripVertical,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { ActionGroup } from "./ui/action-group";
import { useEffect, useRef, useState } from "react";
import PrivacySettingsPanel from "./PrivacySettingsPanel";
import {
  availableDocSections,
  reorderDocSections,
} from "@/lib/docs-navigation";
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
  const docSections = availableDocSections(
    data.content.filter((c) => c.kind === "doc"),
    settings.docCategoryOrder,
  );
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  function moveDocSection(index: number, target: number) {
    if (target < 0 || target >= docSections.length || index === target) return;
    const next = reorderDocSections(docSections, index, target);
    setSettings((current) => ({ ...current, docCategoryOrder: next }));
    setNotice(
      `${next[target]} moved to position ${target + 1}. Save settings to apply the order.`,
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
          <Field>
            Site name
            <Input
              required
              maxLength={60}
              value={settings.name}
              onChange={(e) =>
                setSettings({ ...settings, name: e.target.value })
              }
            />
          </Field>
          <Field>
            Footer tagline
            <Input
              maxLength={180}
              value={settings.tagline}
              onChange={(e) =>
                setSettings({ ...settings, tagline: e.target.value })
              }
            />
          </Field>
          <FieldGroup className="brand-control">
            <legend>Accent color</legend>
            <FieldDescription>
              Used for links and highlights across your organization.
            </FieldDescription>
            <div className="color-control">
              <Input
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
              <Input
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
          </FieldGroup>
          {(onUpload || settings.logoUrl) && (
            <FieldGroup className="brand-control">
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
                  <FieldDescription>
                    PNG, JPG, or WebP. Your logo is scaled to fit.
                  </FieldDescription>
                </div>
              </div>
              {onUpload && (
                <Input
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
            </FieldGroup>
          )}
        </section>
      )}
      {section === "docs" && (
        <section className="settings-section" id="settings-docs">
          <p>
            Create sections and drag them into order for the Docs sidebar and
            overview. You can also use the arrow buttons or focus a drag handle
            and press the up and down arrow keys.
          </p>
          {docSections.length ? (
            <ol className="doc-order-list">
              {docSections.map((name, index) => (
                <ReorderRow
                  key={name}
                  data-doc-section={name}
                  className={
                    dropTarget === name ? "ring-2 ring-ring" : undefined
                  }
                  handle={
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="doc-section-drag"
                      aria-label={`Reorder ${name}`}
                      disabled={busy}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                          e.preventDefault();
                          moveDocSection(
                            index,
                            index + (e.key === "ArrowUp" ? -1 : 1),
                          );
                        }
                      }}
                      onPointerDown={(e) => {
                        if (e.button !== 0) return;
                        e.currentTarget.setPointerCapture(e.pointerId);
                        setDragging(name);
                      }}
                      onPointerMove={(e) => {
                        if (dragging !== name) return;
                        const row = document
                          .elementFromPoint(e.clientX, e.clientY)
                          ?.closest("[data-doc-section]");
                        setDropTarget(
                          row?.getAttribute("data-doc-section") ?? null,
                        );
                        if (e.clientY < 70) window.scrollBy(0, -18);
                        else if (e.clientY > window.innerHeight - 70)
                          window.scrollBy(0, 18);
                      }}
                      onPointerUp={(e) => {
                        if (dragging === name) {
                          const target = document
                            .elementFromPoint(e.clientX, e.clientY)
                            ?.closest("[data-doc-section]")
                            ?.getAttribute("data-doc-section");
                          moveDocSection(
                            index,
                            target ? docSections.indexOf(target) : -1,
                          );
                        }
                        setDragging(null);
                        setDropTarget(null);
                      }}
                      onPointerCancel={() => {
                        setDragging(null);
                        setDropTarget(null);
                      }}
                      onLostPointerCapture={() => {
                        setDragging(null);
                        setDropTarget(null);
                      }}
                    >
                      <GripVertical size={18} aria-hidden="true" />
                    </Button>
                  }
                  title={name}
                  actions={
                    <>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Move ${name} up`}
                        disabled={busy || index === 0}
                        onClick={() => moveDocSection(index, index - 1)}
                      >
                        <ArrowUp size={16} aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Move ${name} down`}
                        disabled={busy || index === docSections.length - 1}
                        onClick={() => moveDocSection(index, index + 1)}
                      >
                        <ArrowDown size={16} aria-hidden="true" />
                      </Button>
                    </>
                  }
                />
              ))}
            </ol>
          ) : (
            <p>No sections yet. Create one below.</p>
          )}
          <DocSectionCreate
            sections={docSections}
            disabled={busy}
            onCreate={(name) => {
              setSettings((current) => ({
                ...current,
                docCategoryOrder: [...docSections, name],
              }));
              setNotice(`${name} created. Save settings to keep it.`);
            }}
          />
          <FieldDescription>
            Empty sections stay available here and in the editor. Only sections
            with published documents are shown to readers.
          </FieldDescription>
        </section>
      )}
      {section === "courses" && (
        <FieldGroup
          className="settings-section"
          tabIndex={-1}
          id="settings-courses"
        >
          <legend>Course completion windows</legend>
          <p>
            Publishing adds to the library. Only courses selected for a group
            join that group’s assigned learning list.
          </p>
          <Field>
            New user onboarding window (days)
            <Input
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
          </Field>
          <Field>
            Ongoing catch-up window (days)
            <Input
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
          </Field>
          <small>
            Newly assigned courses get a full catch-up window, even near the end
            of onboarding. Changes recalculate targets for everyone.
          </small>
        </FieldGroup>
      )}
      {section === "access" && (
        <section
          className="settings-section"
          tabIndex={-1}
          id="settings-access"
        >
          <h3>Access and accounts</h3>
          <Field>
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
          </Field>
          <Field>
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
          </Field>
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
      <Field>
        Server address
        <div className="mcp-address">
          <Input
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
      </Field>
      <FieldDescription role="status">{copied}</FieldDescription>
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
