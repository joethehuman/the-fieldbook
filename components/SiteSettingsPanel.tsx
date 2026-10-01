"use client";
import { FormField } from "@/components/patterns/form-field";
import { TextField } from "./patterns/text-field";
import { SettingsSection as SettingsGroup } from "./patterns/settings-section";
import { Alert } from "./ui/alert";
import { useToast } from "./ui/toast";
import { useInteractionDialog } from "./ui/interaction-dialog";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldDescription } from "@/components/ui/field";
import { Button } from "./ui/button";
import { SelectField } from "./ui/select";
import { Switch } from "./ui/switch";
import { DocSectionsSettings } from "./DocSectionsSettings";
import { ActionGroup } from "./ui/action-group";
import { Plus } from "lucide-react";
import { lazy, useEffect, useLayoutEffect, useRef, useState } from "react";
const PrivacySettingsPanel = lazy(() => import("./PrivacySettingsPanel"));
import { CardPaletteSettings } from "./CardPaletteSettings";
import { availableDocSections } from "@/lib/docs-navigation";
import { groupPath } from "@/lib/group-hierarchy";
import { defaultSettings, privacyHref } from "@/lib/settings";
import { equalJson } from "@/lib/equal-json";
import type { RegisterNavigationGuard } from "@/lib/navigation-guard";
import type { Workspace } from "@/lib/store";
export type SettingsSection =
  "identity" | "docs" | "courses" | "access" | "privacy" | "mcp";
function settingsFromSnapshot(saved: Workspace["settings"]) {
  const { logoUrl: _legacyLogoUrl, ...withoutLogo } = (saved || {}) as
    Partial<typeof defaultSettings> & { logoUrl?: string };
  return { ...defaultSettings, ...withoutLogo };
}
export default function SiteSettingsPanel({
  data,
  onChange,
  production,
  section,
  registerNavigationGuard,
}: {
  data: Workspace;
  onChange: (next: Workspace) => void | Promise<void>;
  production: boolean;
  section: SettingsSection;
  registerNavigationGuard?: RegisterNavigationGuard;
}) {
  const notify = useToast();
  const { confirm, prompt } = useInteractionDialog();
  const [settings, setSettings] = useState(() => settingsFromSnapshot(data.settings)),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const savedSettings = useRef(settings);
  const receivedSettings = useRef(data.settings);
  const dirty = !equalJson(settings, savedSettings.current);
  useLayoutEffect(() => {
    // An acknowledged save can precede its refreshed props. Only a newly
    // received snapshot may replace a clean form; never replay the old props.
    if (dirty || busy || receivedSettings.current === data.settings) return;
    receivedSettings.current = data.settings;
    const next = settingsFromSnapshot(data.settings);
    savedSettings.current = next;
    setSettings(next);
  }, [data.settings, dirty, busy]);
  const guard = useRef(async () => true);
  guard.current = async () =>
    !busy &&
    (!dirty ||
      (await confirm("Leave this page? Unsaved changes will be discarded.")));
  useEffect(() => {
    registerNavigationGuard?.(() => guard.current(), { protected: dirty || busy });
    return () => registerNavigationGuard?.(null);
  }, [registerNavigationGuard, dirty, busy]);
  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty || busy) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => window.removeEventListener("beforeunload", beforeUnload);
  }, [dirty, busy]);
  const docSections = availableDocSections(
    data.content.filter((c) => c.kind === "doc"),
    settings.docCategoryOrder,
    settings.docSections,
  );
  const [nameError, setNameError] = useState("");
  const saveAction = (
    <ActionGroup>
      {dirty && <span role="status" className="text-caption text-muted-foreground">Unsaved changes</span>}
      {dirty && <Button type="button" variant="outline" disabled={busy} onClick={() => { setSettings(savedSettings.current); setNotice(""); }}>Discard changes</Button>}
      <Button type="submit" loading={busy}>{busy ? "Saving…" : "Save settings"}</Button>
    </ActionGroup>
  );
  return (
    <form
      className="settings-panel"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setNotice("");
        try {
          const next =
            section === "docs"
              ? { ...settings, docSections, docCategoryOrder: [] }
              : settings;
          await onChange({ ...data, settings: next });
          savedSettings.current = next;
          setSettings(next);
          notify("Settings saved.");
        } catch (e) {
          setNotice((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {section === "identity" && (
        <SettingsGroup
          tabIndex={-1}
          disabled={busy}
          id="settings-identity"
          actions={saveAction}
          title={<h3>Installation branding</h3>}
          guidance="The same identity appears in your workspace and on account pages. The saved name, welcome description and published privacy link are visible before sign-in, including on private installations."
        >
          <TextField
            id="installation-name"
            label="Installation name"
            description="Up to 60 characters."
            required
            maxLength={60}
            value={settings.name}
            error={nameError}
            onBlur={(e) =>
              setNameError(
                e.target.validity.valueMissing
                  ? "Installation name is required."
                  : "",
              )
            }
            onInvalid={() => setNameError("Installation name is required.")}
            onChange={(e) => {
              setSettings({ ...settings, name: e.target.value });
              if (nameError)
                setNameError(
                  e.target.value ? "" : "Installation name is required.",
                );
            }}
          />
          <TextField
            id="welcome-description"
            label="Welcome description (optional)"
            maxLength={180}
            value={settings.welcomeDescription || ""}
            description="A short welcome on the sign-in page. Authentication instructions are provided by Fieldbook."
            onChange={(e) =>
              setSettings({ ...settings, welcomeDescription: e.target.value })
            }
          />
          <FormField
            label="Home page"
            description="The page people open from your installation address. Docs opens the first published article in your Docs order."
          >
            <SelectField
              value={settings.homePage || "courses"}
              onValueChange={(value) =>
                setSettings({
                  ...settings,
                  homePage: value as "updates" | "courses" | "docs",
                })
              }
              disabled={busy}
              aria-label="Home page"
            >
              <option value="updates">Updates</option>
              <option value="courses">Courses</option>
              <option value="docs">Docs</option>
            </SelectField>
          </FormField>
          <TextField
            id="privacy-policy-link"
            label="Privacy-policy link"
            readOnly
            value={privacyHref(settings) || ""}
            placeholder="No published policy"
            description="Set or publish this link in Organization Settings → Privacy policy. Hosted and external policies use the same published setting across the application."
          />
          <FieldGroup className="brand-control">
            <legend>Accent color</legend>
            <FieldDescription>
              Used for links and highlights across your organization. Link text
              darkens when needed for readability.
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
          <CardPaletteSettings settings={settings} onChange={(cardPalette) => setSettings({ ...settings, cardPalette })} />
        </SettingsGroup>
      )}
      {section === "docs" && (
        <SettingsGroup
          measure="full"
          id="settings-docs"
          title={<h3>Document sections</h3>}
          description="Organize top-level sections and their subsections. Documents can sit at either level."
          guidance="Expand a section to see its subsections. Reorder within a level, or use Move to… to change a section’s parent. Move documents and subsections before deleting a section. Empty sections remain available in the editor; readers see sections with published documents."
          actions={saveAction}
        >
          <DocSectionsSettings
            sections={docSections}
            docs={[
              ...data.content.filter((item) => item.kind === "doc"),
              ...(data.publishedContent || []).filter(
                (item) => item.kind === "doc",
              ),
            ]}
            disabled={busy}
            onChange={(next) => {
              setSettings((current) => ({
                ...current,
                docSections: next,
                docCategoryOrder: [],
              }));
              setNotice("Save settings to apply the section changes.");
            }}
          />
        </SettingsGroup>
      )}
      {section === "courses" && (
        <SettingsGroup
          id="settings-courses"
          actions={saveAction}
          tabIndex={-1}
          disabled={busy}
          title={<h3>Timing windows</h3>}
          description="Set the number of days for new users and ongoing catch-up."
          guidance={
            <div id="due-dates-help">
              When off, learners see these courses as recommendations without
              deadlines. Turning due dates on uses the windows below to set
              targets. Changes recalculate targets for everyone.
            </div>
          }
        >
          <FormField label="Use due dates">
            <Switch
              checked={settings.dueDatesEnabled !== false}
              disabled={busy}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, dueDatesEnabled: checked === true })
              }
            />
          </FormField>
          <FormField label="New user onboarding window (days)">
            <Input
              aria-describedby="due-dates-help"
              type="number"
              required
              disabled={busy || settings.dueDatesEnabled === false}
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
          </FormField>
          <FormField label="Ongoing catch-up window (days)">
            <Input
              aria-describedby="due-dates-help"
              type="number"
              required
              disabled={busy || settings.dueDatesEnabled === false}
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
          </FormField>
        </SettingsGroup>
      )}
      {section === "access" && (
        <SettingsGroup
          id="settings-access"
          actions={saveAction}
          tabIndex={-1}
          disabled={busy}
          title={<h3>Access and accounts</h3>}
          guidance={
            production
              ? "Google is the sign-in provider. Provider credentials and the initial administrator are configured securely in the deployment settings."
              : "Access settings are illustrative in the demo. Profiles remain browser-local simulations."
          }
        >
          <FormField label="Who can browse?">
            <SelectField
              disabled={busy}
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
          </FormField>
          {settings.access === "public" && (
            <FieldGroup disabled={busy}>
              <legend>Guest recommendations</legend>
              <FieldDescription id="guest-recommendations-help">
                Choose a group to personalize For you in Updates and Courses for
                visitors who aren’t signed in.
              </FieldDescription>
              <FormField label="Learning group for guests">
                <SelectField
                  value={
                    settings.guestGroupId
                      ? `group:${settings.guestGroupId}`
                      : "none"
                  }
                  aria-describedby="guest-recommendations-help guest-recommendations-status"
                  onValueChange={(value) =>
                    setSettings({
                      ...settings,
                      guestGroupId: value === "none" ? null : value.slice(6),
                    })
                  }
                >
                  <option value="none">
                    None — no personalized recommendations.
                  </option>
                  {settings.guestGroupId &&
                    !data.groups.some(
                      (g) => g.id === settings.guestGroupId,
                    ) && (
                      <option value={`group:${settings.guestGroupId}`}>
                        Unavailable group — choose another
                      </option>
                    )}
                  {data.groups.map((g) => (
                    <option key={g.id} value={`group:${g.id}`}>
                      {groupPath(g.id, data.groups)}
                    </option>
                  ))}
                </SelectField>
              </FormField>
              <FieldDescription id="guest-recommendations-status">
                {!settings.guestGroupId
                  ? "Your library is public. Select a group to recommend content to guests."
                  : !data.groups.some((g) => g.id === settings.guestGroupId)
                    ? "The selected group is unavailable. Choose another group or None; guests currently have no personalized recommendations."
                    : "Save settings to apply this selection. Published content stays available to everyone."}
              </FieldDescription>
              <ActionGroup>
                <Button
                  type="button"
                  disabled={busy}
                  onClick={async () => {
                    const name = (
                      await prompt("Group name", "Guests", {
                        title: "Create guest group",
                        description:
                          "Create a learning group, then save settings to use it for guest recommendations.",
                        submitLabel: "Create group",
                      })
                    )?.trim();
                    if (!name) return;
                    if (
                      name.length > 80 ||
                      data.groups.some(
                        (g) => g.name.toLowerCase() === name.toLowerCase(),
                      )
                    ) {
                      setNotice(
                        "Use a unique group name of 80 characters or fewer.",
                      );
                      return;
                    }
                    setBusy(true);
                    setNotice("");
                    const id = crypto.randomUUID();
                    try {
                      await onChange({
                        ...data,
                        groups: [
                          ...data.groups,
                          { id, name, learningItems: [], teamIds: [] },
                        ],
                      });
                      setSettings((current) => ({
                        ...current,
                        guestGroupId: id,
                      }));
                      setNotice(
                        `${name} created and selected. Save settings to use it for guests. Add courses and updates in Learning groups.`,
                      );
                    } catch (error) {
                      setNotice((error as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Plus aria-hidden="true" />
                  Create guest group
                </Button>
              </ActionGroup>
            </FieldGroup>
          )}
          <FormField label="New learner accounts">
            <SelectField
              disabled={busy}
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
          </FormField>
        </SettingsGroup>
      )}
      {section === "privacy" && (
        <section
          className="settings-section"
          tabIndex={-1}
          id="settings-privacy"
        >
          {" "}
          <PrivacySettingsPanel
            actions={saveAction}
            settings={settings}
            onChange={setSettings}
            busy={busy}
            onPublish={async (next) => {
              setBusy(true);
              setNotice("");
              try {
                await onChange({ ...data, settings: next });
                savedSettings.current = next;
                setSettings(next);
                notify("Privacy policy published.");
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
      {section !== "mcp" && notice && (
        <div className="settings-save-bar">
          <Alert role="status">{notice}</Alert>
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
      <SettingsGroup
        id="mcp-demo"
        title={<h3>Connect an AI tool</h3>}
        guidance="Connections are available in an installed organization; this demo does not provide an MCP server."
      >
        <p>
          MCP lets administrators connect tools such as ChatGPT and Claude to
          their Fieldbook installation.
        </p>
      </SettingsGroup>
    );
  return (
    <SettingsGroup
      id="mcp-connection"
      title={<h3>Connect an AI tool</h3>}
      description="Add Fieldbook as a custom MCP server in ChatGPT, Claude, or another compatible tool."
      guidance="Review or revoke access from connected AI tools."
      actions={
        <Button asChild variant="outline">
          <a href="/connections">Manage connections →</a>
        </Button>
      }
    >
      <div className="grid gap-2">
        <Field htmlFor="mcp-server-address">Server address</Field>
        <div className="mcp-address">
          <Input
            id="mcp-server-address"
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
      </div>
      <FieldDescription role="status">{copied}</FieldDescription>
      <ol className="mcp-steps">
        <li>Add the server address in your AI tool’s connection settings.</li>
        <li>Sign in to Fieldbook as an administrator.</li>
        <li>Review and approve the requested connection.</li>
      </ol>
    </SettingsGroup>
  );
}
