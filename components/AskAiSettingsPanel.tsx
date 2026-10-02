"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ExternalLink } from "lucide-react";
import {
  defaultAskAiSettings,
  type AiModel,
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
import { Badge } from "./ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";

const sourceChoices = [
  { value: "doc", label: "Docs" },
  { value: "brief", label: "Updates" },
  { value: "course", label: "Courses and lessons" },
] as const;
const primaryRequired = "Choose a primary model to enable AI.";
// Illustrative catalog only; no model is selected automatically in the demo.
const demoSetup: AiSetup = {
  provider: "Vercel AI Gateway",
  checkedAt: "",
  catalog: {
    ready: true,
    message: "Illustrative models. No connection is made in the demo.",
  },
  connection: {
    configured: false,
    message: "Connect Gateway in your own installation.",
  },
  retrieval: {
    ready: false,
    message: "The demo uses browser-local sample data.",
  },
  models: ["primary", "backup"].map((name) => ({
    id: `demo/${name}`,
    name: name === "primary" ? "Example primary model" : "Example backup model",
    inputPerMillion: null,
    outputPerMillion: null,
    zeroRetention: "unknown",
    noTraining: "unknown",
  })),
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
function privacy(value: AiModel["zeroRetention"]) {
  return value === "all"
    ? "Advertised on all routes"
    : value === "some"
      ? "Advertised on some routes; not guaranteed"
      : value === "none"
        ? "No guarantee advertised"
        : "Not reported";
}
function ModelDetails({ title, model }: { title: string; model: AiModel }) {
  return (
    <div className="grid gap-2 text-copy" aria-label={`${title} details`}>
      <p className="font-medium">{title}</p>
      <p className="text-muted-foreground [overflow-wrap:anywhere]">
        {model.id}
      </p>
      <FieldDescription>
        Zero data retention: {privacy(model.zeroRetention)}.
      </FieldDescription>
      <FieldDescription>
        No prompt training: {privacy(model.noTraining)}.
      </FieldDescription>
    </div>
  );
}
type SetupAction = "check" | "test" | "test-fallback";

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
  const [working, setWorking] = useState<SetupAction | null>(null);
  const [notice, setNotice] = useState("");
  const [result, setResult] = useState<{
    answer: string;
    key: string;
    model: string;
  } | null>(null);
  const model = setup?.models.find((entry) => entry.id === value.model);
  const fallback = setup?.models.find(
    (entry) => entry.id === value.fallbackModel,
  );
  const configKey = JSON.stringify(value);

  async function run(action: SetupAction, settings = value) {
    if (!production) {
      setNotice(
        action === "check"
          ? "Demo only: no accounts, credentials or AI requests are used."
          : "This feature is not available in the demo site.",
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
        // Checking a draft must work before the administrator chooses a model.
        body: JSON.stringify({
          action,
          settings:
            action === "check" ? { ...settings, enabled: false } : settings,
        }),
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
      if (action !== "check")
        setResult({
          answer: data.answer,
          key: JSON.stringify(settings),
          model: data.model,
        });
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [production]);

  const picker = (backup: boolean) => {
    const selected = backup ? value.fallbackModel : value.model;
    const entry = backup ? fallback : model;
    return (
      <FormField
        label={backup ? "Fallback model" : "Primary model"}
        errorPlaceholder={!backup ? primaryRequired : undefined}
        error={
          !backup && value.enabled && !selected ? primaryRequired : undefined
        }
        description={
          <>
            {backup
              ? "Optional. Saved while AI is off."
              : "Required. Saved while AI is off."}
            <span className="block">
              Input {entry ? cost(entry.inputPerMillion) : "—"}
            </span>
            <span className="block">
              Output {entry ? cost(entry.outputPerMillion) : "—"}
            </span>
          </>
        }
      >
        <SelectField
          value={selected}
          disabled={busy || working !== null || !setup?.catalog.ready}
          onValueChange={(id) =>
            onChange(
              backup
                ? { ...value, fallbackModel: id }
                : {
                    ...value,
                    model: id,
                    fallbackModel:
                      id === value.fallbackModel ? "" : value.fallbackModel,
                  },
            )
          }
        >
          <option value="">{backup ? "None" : "Choose a primary model"}</option>
          {selected && !entry && (
            <option value={selected}>
              {selected} —{" "}
              {setup?.catalog.ready ? "unavailable" : "checking availability"}
            </option>
          )}
          {setup?.models
            .filter((entry) => !backup || entry.id !== value.model)
            .map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
        </SelectField>
      </FormField>
    );
  };

  return (
    <SettingsSection
      id="settings-ai"
      title={<h3>Configuration</h3>}
      disabled={busy}
      actions={actions}
      description="Concise answers from your published Fieldbook content."
      guidance={
        production
          ? "Save settings to apply changes. Model choices and guidance are shared across this installation."
          : "Demo settings affect this browser only. AI answers are unavailable."
      }
    >
      <FieldGroup className="gap-2">
        <Field orientation="horizontal">
          <Switch
            checked={value.enabled}
            disabled={busy}
            onCheckedChange={(enabled) => onChange({ ...value, enabled })}
          />
          Enable Ask AI
        </Field>
        <FieldDescription>
          Signed-in readers can ask questions from Search. Off restores basic
          search.
        </FieldDescription>
      </FieldGroup>
      <FieldGroup>
        <legend>Models</legend>
        <div className="grid items-start gap-4 md:grid-cols-2">
          {picker(false)}
          {picker(true)}
        </div>
        {production && setup?.catalog.ready && value.model && !model && (
          <Alert>
            {fallback
              ? "The primary is unavailable. The saved fallback can serve questions; choose a replacement primary."
              : "The primary is unavailable. Choose an available model before enabling Ask AI."}
          </Alert>
        )}
        {production &&
          setup?.catalog.ready &&
          value.fallbackModel &&
          !fallback && (
            <Alert>
              The fallback is unavailable. Choose a replacement or select None.
            </Alert>
          )}
        <FieldDescription>
          {production
            ? "Live Gateway catalog. Prices are per million tokens and may change. Only your selected models are used."
            : "Illustrative models only. Prices are per million tokens; the demo does not connect to Gateway."}
        </FieldDescription>
        <Collapsible>
          <Button
            asChild
            variant="ghost"
            className="group w-full justify-between"
          >
            <CollapsibleTrigger disabled={!model && !fallback}>
              Model details and data policies
              <ChevronDown
                aria-hidden="true"
                className="group-data-[state=open]:rotate-180"
              />
            </CollapsibleTrigger>
          </Button>
          <CollapsibleContent className="grid gap-3 pt-3">
            <div className="grid items-start gap-4 md:grid-cols-2">
              {model && <ModelDetails title="Primary model" model={model} />}
              {fallback && (
                <ModelDetails title="Fallback model" model={fallback} />
              )}
            </div>
            <FieldDescription>
              These are Gateway’s advertised assurances, not a routing policy
              enforced by Fieldbook. Questions and relevant published text go to
              Gateway and the model provider.
            </FieldDescription>
            <Button type="button" variant="link" asChild>
              <a
                href="https://vercel.com/ai-gateway/models"
                target="_blank"
                rel="noopener noreferrer"
              >
                Review Gateway models and policies
                <ExternalLink aria-hidden="true" />
              </a>
            </Button>
          </CollapsibleContent>
        </Collapsible>
      </FieldGroup>
      <FieldGroup className="gap-3" aria-describedby="ai-sources-description">
        <legend>Published sources</legend>
        <FieldDescription id="ai-sources-description">
          Choose at least one. Drafts, quizzes, media and account data are
          excluded.
        </FieldDescription>
        <div className="flex flex-wrap gap-4">
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
        </div>
      </FieldGroup>
      <FieldGroup className="gap-3">
        <FormField
          label="Answer guidance"
          description={`${value.guidance.length.toLocaleString()} / 2,000 characters. Adds to the fixed access, evidence and citation rules.`}
        >
          <Textarea
            value={value.guidance}
            disabled={busy}
            maxLength={2_000}
            rows={4}
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
      </FieldGroup>
      <FieldGroup className="gap-3">
        <legend>Connection</legend>
        <div
          className="grid gap-2"
          aria-label="Setup status"
          aria-busy={!setup}
        >
          {[
            {
              label: "Gateway catalog",
              ready: setup?.catalog.ready,
              status: "Loaded",
              message: setup?.catalog.message,
            },
            {
              label: "Credentials",
              ready: setup?.connection.configured,
              status: "Present",
              message: setup?.connection.message,
            },
            {
              label: "Published-content retrieval",
              ready: setup?.retrieval.ready,
              status: "Ready",
              message: setup?.retrieval.message,
            },
          ].map((item) => (
            <div key={item.label} className="grid gap-1">
              <div className="flex flex-wrap items-center justify-between gap-2 text-copy">
                <span>{item.label}</span>
                <Badge
                  variant={
                    !setup || item.ready || !production ? "default" : "warning"
                  }
                >
                  {!setup
                    ? "Checking"
                    : item.ready
                      ? item.status
                      : production
                        ? "Needs setup"
                        : "Demo only"}
                </Badge>
              </div>
              {!item.ready && item.message && (
                <FieldDescription>{item.message}</FieldDescription>
              )}
            </div>
          ))}
        </div>
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
            Test primary
          </Button>
          <Button
            type="button"
            variant="outline"
            loading={working === "test-fallback"}
            disabled={
              busy ||
              working !== null ||
              !value.fallbackModel ||
              (production && !fallback)
            }
            onClick={() => void run("test-fallback")}
          >
            Test fallback
          </Button>
        </ActionGroup>
        <FieldDescription>
          {production
            ? "Check setup uses no AI tokens. Each model test makes up to two small calls using synthetic text, may incur charges and does not save settings. Test each selected model to confirm access."
            : "Setup checks and model tests stay local. No network or AI calls are made."}
        </FieldDescription>
        {notice && <Alert role="status">{notice}</Alert>}
        {result?.key === configKey && (
          <Alert role="status">
            <p>Test answer received. Model access and tool use worked.</p>
            <p className="text-muted-foreground [overflow-wrap:anywhere]">
              {result.model}
            </p>
            <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
              {result.answer}
            </p>
            <p>Test citation [S1] refers only to synthetic setup data.</p>
          </Alert>
        )}
        <Collapsible>
          <Button
            asChild
            variant="ghost"
            className="group w-full justify-between"
          >
            <CollapsibleTrigger>
              Setup instructions
              <ChevronDown
                aria-hidden="true"
                className="group-data-[state=open]:rotate-180"
              />
            </CollapsibleTrigger>
          </Button>
          <CollapsibleContent className="grid gap-4 pt-4">
            <ol className="list-decimal pl-5 space-y-2 text-copy">
              <li>
                Open AI Gateway in your Vercel account and review credits and
                billing.
              </li>
              <li>
                On Vercel, project authentication is automatic. Elsewhere or
                locally, add a server-only Gateway API key in deployment
                settings and restart or redeploy. Never enter a key here.
              </li>
              <li>
                Apply the Ask AI migration to your installation’s Supabase
                database, following the source’s installation guide.
              </li>
              <li>
                Choose a primary and optional fallback, test each, then save
                settings with Ask AI enabled.
              </li>
            </ol>
            <Button type="button" variant="link" asChild>
              <a
                href="https://vercel.com/docs/ai-gateway/getting-started"
                target="_blank"
                rel="noopener noreferrer"
              >
                Gateway setup
                <ExternalLink aria-hidden="true" />
              </a>
            </Button>
          </CollapsibleContent>
        </Collapsible>
        <FieldDescription>
          Chats stay in this tab and clear on reload or sign-out. Fieldbook
          enforces no monthly cap or question quota. Manage credits and spending
          in Gateway; a fallback uses its own model price.
        </FieldDescription>
      </FieldGroup>
    </SettingsSection>
  );
}
