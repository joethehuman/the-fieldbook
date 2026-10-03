"use client";

import { useState } from "react";
import { Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { CountBadge } from "@/components/ui/badge";
import { ActionGroup } from "@/components/ui/action-group";
import { FieldGroup } from "@/components/ui/field";
import { TextField } from "@/components/patterns/text-field";
import { SettingsSection } from "@/components/patterns/settings-section";
import { SectionHeader } from "@/components/patterns/layout";

const variants = [
  "default",
  "outline",
  "ghost",
  "destructive",
  "link",
] as const;

export function ControlExamples() {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  return (
    <section
      id="control-pilot"
      className="grid min-w-0 gap-6"
      aria-label="Control pilot"
    >
      <SectionHeader
        title={<h2>Foundations and controls</h2>}
        description="Live shared components. Hover or use Tab to compare focus; disabled and loading examples cannot activate."
      />
      <Card aria-label="Typography and tokens">
        <div className="grid gap-4">
          <p className="text-page font-semibold tracking-tight">
            Page heading · 32 / 40 · medium
          </p>
          <h3>Section heading · 16 / 24 · medium</h3>
          <div className="flex flex-wrap items-center gap-6" aria-label="Count badges">
            <h3 className="flex items-center gap-2">For you <CountBadge>4</CountBadge></h3>
            <h3 className="flex items-center gap-2">All courses <CountBadge>128</CountBadge></h3>
            <h3 className="flex items-center gap-2">Empty collection <CountBadge>0</CountBadge></h3>
          </div>
          <p className="text-label font-medium">Label · 14 / 20 · regular</p>
          <p className="text-copy">Supporting copy · 14 / 22 · regular</p>
          <p className="text-copy">Interface <strong>emphasis</strong> · medium</p>
          <div className="markdown">
            <p>Authored <strong>bold text</strong> stays strong within regular prose.</p>
          </div>
          <p className="text-compact text-muted-foreground">
            Compact action · 14 / 20
          </p>
          <div className="flex flex-wrap gap-2 text-copy">
            <span className="rounded-control border border-control-border bg-background px-3 py-2">
              Control border
            </span>
            <span className="rounded-control bg-muted px-3 py-2 text-muted-foreground">
              Muted surface
            </span>
            <span className="rounded-control bg-primary px-3 py-2 text-primary-foreground">
              Primary
            </span>
            <span className="rounded-control border border-ring px-3 py-2 text-link">
              Focus
            </span>
          </div>
          <p className="text-copy text-muted-foreground">
            Spacing: 4, 8, 12, 16, 24, 32, 48 px. Controls: 36 px, compact 32
            px. Control radius: 10 px; card/dialog radius: 18 px. White content,
            neutral grey secondary surfaces, subtle surface edges and shared
            floating-panel shadows. Field boundaries retain their stronger contrast.
          </p>
        </div>
      </Card>
      <Card aria-label="Button state comparison">
        <div className="grid gap-6">
          {variants.map((variant) => (
            <div
              key={variant}
              className="grid gap-2"
              aria-label={`${variant} buttons`}
            >
              <h3 className="capitalize">{variant}</h3>
              <ActionGroup>
                <Button
                  variant={variant}
                  onClick={() => setStatus(`${variant} action activated.`)}
                >
                  Default
                </Button>
                <Button variant={variant} size="sm">
                  Compact
                </Button>
                <Button
                  variant={variant}
                  size="icon"
                  aria-label={`${variant} settings`}
                >
                  <Settings />
                </Button>
                <Button variant={variant} disabled>
                  Disabled
                </Button>
                <Button variant={variant} loading>
                  Loading
                </Button>
                <Button variant={variant} size="sm" loading>
                  Loading compact
                </Button>
                <Button
                  variant={variant}
                  size="icon"
                  loading
                  aria-label={`${variant} loading settings`}
                />
              </ActionGroup>
            </div>
          ))}
          <Button asChild variant="outline">
            <a href="#input-pilot">Jump to input examples</a>
          </Button>
        </div>
      </Card>
      <SettingsSection
        id="input-pilot"
        title={<h3>Text input states</h3>}
        guidance="Labels, descriptions and errors are connected programmatically. Read-only values remain focusable and selectable."
      >
        <TextField
          id="catalog-empty"
          label="Empty input"
          placeholder="Example Academy"
          description="Use a name your learners recognize."
        />
        <TextField
          id="catalog-filled"
          label="Filled input"
          defaultValue="Example Academy"
        />
        <TextField
          id="catalog-readonly"
          label="Read-only input"
          readOnly
          value="https://example.com/privacy"
        />
        <TextField
          id="catalog-disabled"
          label="Disabled input"
          disabled
          defaultValue="Managed by your organization"
          description="This value is managed by your organization."
        />
        <TextField
          id="catalog-invalid"
          label="Invalid input"
          error="Installation name is required."
          required
        />
      </SettingsSection>
      <Card>
        <form
          className="grid gap-4"
          onSubmit={async (event) => {
            event.preventDefault();
            if (busy) return;
            setBusy(true);
            setStatus("Saving the local example…");
            await new Promise((resolve) => setTimeout(resolve, 1500));
            setBusy(false);
            setStatus("Example saved. No installation settings changed.");
          }}
        >
          <SectionHeader
            title={<h3>Try validation and loading</h3>}
            description="Leave the name empty and tab away or save; then enter a name and save again."
          />
          <FieldGroup>
            <TextField
              id="catalog-try-name"
              label="Example installation name"
              required
              value={name}
              error={error}
              onBlur={(event) =>
                setError(
                  event.target.validity.valueMissing
                    ? "Installation name is required."
                    : "",
                )
              }
              onInvalid={() => setError("Installation name is required.")}
              onChange={(event) => {
                setName(event.target.value);
                if (error)
                  setError(
                    event.target.value ? "" : "Installation name is required.",
                  );
              }}
            />
          </FieldGroup>
          <ActionGroup>
            <Button type="submit" loading={busy}>
              Save example
            </Button>
          </ActionGroup>
        </form>
      </Card>
      <p role="status" className="text-copy text-muted-foreground">
        {status}
      </p>
    </section>
  );
}
