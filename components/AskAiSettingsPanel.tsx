"use client";

import { useEffect, useRef, useState } from "react";
import {
  defaultAskAiSettings,
  type AiSetup,
  type AskAiSettings,
} from "@/lib/ai";
import { FormField } from "./patterns/form-field";
import { SettingsSection } from "./patterns/settings-section";
import { Button } from "./ui/button";
import { ActionGroup } from "./ui/action-group";
import { Switch } from "./ui/switch";
import { SelectField } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Checkbox } from "./ui/checkbox";
import { Field, FieldDescription, FieldGroup } from "./ui/field";
import { Alert } from "./ui/alert";
import type { ReactNode } from "react";

const sourceChoices = [
  { value: "doc", label: "Docs" },
  { value: "brief", label: "Updates" },
  { value: "course", label: "Courses and lessons" },
] as const;
const demoSetup: AiSetup = {
  provider: "Vercel AI Gateway",
  checkedAt: "",
  catalog: {
    ready: true,
    message: "Illustrative model only. No connection is made in the demo.",
  },
  connection: {
    configured: false,
    message: "Connections are available in your own installation.",
  },
  retrieval: {
    ready: false,
    message: "The demo uses browser-local sample data.",
  },
  models: [
    {
      id: defaultAskAiSettings.model,
      name: "Ling 3.1 Flash (Free)",
      inputPerMillion: 0,
      outputPerMillion: 0,
      zeroRetention: "none",
      noTraining: "none",
      expiresOn: "2026-10-13",
    },
  ],
};
function cost(amount: number | null) {
  return amount === null
    ? "Not reported"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 4,
      }).format(amount);
}
function privacy(value: "all" | "some" | "none" | "unknown") {
  return value === "all"
    ? "All routes advertise this"
    : value === "some"
      ? "Some routes advertise this; not guaranteed"
      : value === "none"
        ? "No guarantee advertised"
        : "Not reported";
}

export function AskAiSettingsPanel({
  value,
  onChange,
  production,
  busy,
  actions,
}: {
  value: AskAiSettings;
  onChange: (next: AskAiSettings) => void;
  production: boolean;
  busy: boolean;
  actions: ReactNode;
}) {
  const initial = useRef(value);
  const pending = useRef<AbortController | null>(null);
  const [setup, setSetup] = useState<AiSetup | null>(
    production ? null : demoSetup,
  );
  const [working, setWorking] = useState<"check" | "test" | null>(null);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<{ answer: string; key: string } | null>(
    null,
  );
  const model = setup?.models.find((entry) => entry.id === value.model);
  const configKey = JSON.stringify(value);

  async function run(action: "check" | "test", settings = value) {
    if (!production) {
      setNotice(
        action === "test"
          ? "This feature is not available in the demo site."
          : "Demo only: no accounts, credentials or AI requests are used.",
      );
      return;
    }
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setWorking(action);
    setNotice("");
    setResult(null);
    try {
      const response = await fetch("/api/admin/ask-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, settings }),
        cache: "no-store",
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(45_000),
        ]),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.error || "Ask AI setup could not be checked. Try again.",
        );
      if (controller.signal.aborted) return;
      setSetup(data.setup);
      if (action === "test")
        setResult({ answer: data.answer, key: JSON.stringify(settings) });
    } catch (error) {
      if (!controller.signal.aborted)
        setNotice(
          error instanceof Error && error.name !== "TimeoutError"
            ? error.message
            : "The setup check timed out. Try again.",
        );
    } finally {
      if (pending.current === controller && !controller.signal.aborted)
        setWorking(null);
    }
  }
  useEffect(() => {
    // Only metadata and empty retrieval checks on entry; generation is explicit.
    void run("check", initial.current);
    return () => pending.current?.abort();
    // Initial settings are captured once; edits never trigger model generation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [production]);

  return (
    <SettingsSection
      id="settings-ai"
      title={<h3>Ask AI</h3>}
      disabled={busy}
      actions={actions}
      description="Short answers from your published Fieldbook content. Conversations stay in the current tab and clear on reload or sign-out."
      guidance={
        production
          ? "Save settings to apply changes. Keep credentials in your deployment settings."
          : "Demo settings affect this browser only. AI answers are unavailable."
      }
    >
      <Field orientation="horizontal">
        <Switch
          checked={value.enabled}
          disabled={busy}
          onCheckedChange={(enabled) => onChange({ ...value, enabled })}
        />
        Enable Ask AI
      </Field>
      <FieldDescription>
        Off restores basic search. When enabled, signed-in readers can ask
        questions from the search bar.
      </FieldDescription>
      <FormField
        label="Model"
        description={
          production
            ? "A short list of the lowest-priced compatible models, plus your saved selection. Prices are per million tokens in USD and can change."
            : "Illustrative selection; prices are not fetched in the demo."
        }
      >
        <SelectField
          value={value.model}
          disabled={busy || working !== null || !setup?.catalog.ready}
          onValueChange={(selected) => onChange({ ...value, model: selected })}
        >
          {!model && (
            <option value={value.model}>
              {value.model} —{" "}
              {setup?.catalog.ready
                ? "unavailable"
                : "availability not confirmed"}
            </option>
          )}
          {setup?.models.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name} · {cost(entry.inputPerMillion)} in /{" "}
              {cost(entry.outputPerMillion)} out
            </option>
          ))}
        </SelectField>
      </FormField>
      {!model && setup?.catalog.ready && (
        <Alert>
          The selected model is unavailable. Choose another before enabling Ask
          AI.
        </Alert>
      )}
      {model && (
        <div
          className="grid gap-2 text-copy text-muted-foreground"
          aria-label="Selected model details"
        >
          <p className="[overflow-wrap:anywhere]">{model.id}</p>
          <p>
            Input {cost(model.inputPerMillion)} · Output{" "}
            {cost(model.outputPerMillion)} per million tokens.
          </p>
          {model.expiresOn && (
            <Alert>
              This free model stops serving after {model.expiresOn}. Select
              another model before then; Fieldbook will not switch
              automatically.
            </Alert>
          )}
          {!model.expiresOn && (
            <p>
              Expiry date: not reported. Review availability before changing
              models.
            </p>
          )}
          <p>
            <a
              href="https://vercel.com/ai-gateway/models"
              target="_blank"
              rel="noopener noreferrer"
            >
              Review Gateway models and data policies ↗
            </a>
          </p>
          <p>
            Zero data retention: {privacy(model.zeroRetention)}. No prompt
            training: {privacy(model.noTraining)}.
          </p>
          <p>
            Questions and relevant published text are sent to Gateway and its
            upstream provider. Review their data policies before enabling AI.
          </p>
        </div>
      )}
      <FieldGroup aria-describedby="ai-sources-description">
        <legend>Published sources</legend>
        <FieldDescription id="ai-sources-description">
          Choose at least one. Drafts, quizzes, media files and private account
          data are excluded.
        </FieldDescription>
        {sourceChoices.map((source) => (
          <Field key={source.value} orientation="horizontal">
            <Checkbox
              checked={value.sources.includes(source.value)}
              disabled={
                busy ||
                (value.sources.length === 1 &&
                  value.sources.includes(source.value))
              }
              onCheckedChange={(checked) =>
                onChange({
                  ...value,
                  sources: checked
                    ? [...value.sources, source.value]
                    : value.sources.filter((item) => item !== source.value),
                })
              }
            />
            {source.label}
          </Field>
        ))}
      </FieldGroup>
      <FormField
        label="Answer guidance"
        description={`${value.guidance.length.toLocaleString()} / 2,000 characters. Supplements Fieldbook’s fixed access, evidence and citation rules.`}
      >
        <Textarea
          value={value.guidance}
          disabled={busy}
          maxLength={2_000}
          rows={5}
          onChange={(event) =>
            onChange({ ...value, guidance: event.target.value })
          }
        />
      </FormField>
      <ActionGroup>
        <Button
          type="button"
          variant="outline"
          disabled={busy || value.guidance === defaultAskAiSettings.guidance}
          onClick={() =>
            onChange({ ...value, guidance: defaultAskAiSettings.guidance })
          }
        >
          Reset to default
        </Button>
      </ActionGroup>
      <FieldGroup>
        <legend>Setup</legend>
        <ol className="list-decimal pl-5 space-y-2 text-copy">
          <li>
            In the Vercel team that hosts Fieldbook, open AI Gateway and review
            available credits. Project authentication is used automatically.
          </li>
          <li>
            Apply the Ask AI migration to your installation’s Supabase database.
            Follow the installation guide included with the source.
          </li>
          <li>
            Check setup, then test an answer with the selected model. Save
            settings when you are ready to enable it.
          </li>
        </ol>
        <FieldDescription>
          Outside Vercel or for local development, configure a server-only
          Gateway API key and restart or redeploy. Never enter a key here.{" "}
          <a
            href="https://vercel.com/docs/ai-gateway/getting-started"
            target="_blank"
            rel="noopener noreferrer"
          >
            Gateway setup ↗
          </a>
        </FieldDescription>
        <ActionGroup>
          <Button
            type="button"
            variant="outline"
            loading={working === "check"}
            disabled={busy || working !== null}
            onClick={() => void run("check")}
          >
            Check setup
          </Button>
          <Button
            type="button"
            variant="outline"
            loading={working === "test"}
            disabled={busy || working !== null || (production && !model)}
            onClick={() => void run("test")}
          >
            Test answer
          </Button>
        </ActionGroup>
        <FieldDescription>
          {production
            ? "Check setup makes no AI generation. Test answer makes up to two small model calls using synthetic text and your current guidance. It may incur token charges and does not save settings."
            : "Check setup and Test answer are illustrative here. They make no network or model calls and do not save settings."}
        </FieldDescription>
        {setup && (
          <div className="grid gap-2 text-copy" aria-label="Setup status">
            <p>
              {setup.provider}: {setup.connection.message}
            </p>
            <p>{setup.catalog.message}</p>
            <p>{setup.retrieval.message}</p>
            {production && (
              <FieldDescription>
                Model metadata may be cached for up to five minutes. Only Test
                answer confirms model access.
              </FieldDescription>
            )}
          </div>
        )}
        {notice && <Alert role="status">{notice}</Alert>}
        {result?.key === configKey && (
          <Alert role="status">
            <p>Test answer received. Model access and tool use worked.</p>
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
              {result.answer}
            </p>
            <p>Test citation [S1] refers only to synthetic setup data.</p>
          </Alert>
        )}
        <FieldDescription>
          No question quota or monthly cap is enforced by Fieldbook. Manage
          credits, refill settings and spend alerts in your Gateway account. No
          automatic model fallback is configured.
        </FieldDescription>
      </FieldGroup>
    </SettingsSection>
  );
}
