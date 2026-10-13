"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  defaultAskAiSettings,
  type AiRouter,
  type AiSetup,
  type AskAiSettings,
} from "@/lib/ai";
import { FormField } from "./patterns/form-field";
import { SettingsSection } from "./patterns/settings-section";
import { SettingsPageActions } from "./patterns/settings-page-actions";
import { Button } from "./ui/button";
import { ActionGroup } from "./ui/action-group";
import { Switch } from "./ui/switch";
import { SelectField } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Checkbox } from "./ui/checkbox";
import { Field, FieldDescription, FieldGroup } from "./ui/field";
import { Alert } from "./ui/alert";
import { Badge } from "./ui/badge";
import { Spinner } from "./ui/spinner";
import { ChevronDown } from "lucide-react";
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
const demoSetup: AiSetup = {
  router: { id: "demo", name: "Demo", supportsFallback: true },
  selectionRouter: "demo",
  checkedAt: "",
  catalog: { ready: true, message: "Illustrative models only." },
  connection: { configured: false, message: "Demo only." },
  retrieval: { ready: false, message: "Browser-local sample data only." },
  models: ["primary", "backup"].map((name) => ({
    id: `demo/${name}`,
    name:
      name === "primary" ? "Gavin’s XL MAXIMUS Demo" : "Example backup model",
    inputPerMillion: null,
    outputPerMillion: null,
    zeroRetention: "unknown",
    noTraining: "unknown",
  })),
};

export function AskAiSettingsPanel({
  initialRouter,
  value,
  onChange,
  production,
  busy,
  actions,
  belowActions,
}: {
  initialRouter?: AiRouter | null;
  value: AskAiSettings;
  onChange: (next: AskAiSettings) => void;
  production: boolean;
  busy: boolean;
  actions: ReactNode;
  belowActions?: ReactNode;
}) {
  const [setup, setSetup] = useState<AiSetup | null>(
    production ? null : demoSetup,
  );
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (!production || !value.enabled) return;
    const controller = new AbortController();
    setSetup(null);
    setNotice("");
    async function check() {
      try {
        const response = await fetch("/api/admin/ask-ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // Metadata must be readable before a primary model is chosen.
          body: JSON.stringify({
            action: "check",
            settings: { ...value, enabled: false },
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
            data.error ||
              "Ask AI settings couldn’t be checked. Reload this page to try again.",
          );
        if (!controller.signal.aborted) setSetup(data.setup);
      } catch (error) {
        if (!controller.signal.aborted)
          setNotice(
            error instanceof Error && error.name !== "TimeoutError"
              ? error.message
              : "The Ask AI settings check timed out. Reload this page to try again.",
          );
      }
    }
    void check();
    return () => controller.abort();
    // Model/source/guidance edits do not refetch metadata or modify the draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [production, value.enabled]);

  const router = setup
    ? setup.router
    : (initialRouter ?? (production ? null : demoSetup.router));
  const routerSelection = router?.routerSelection;
  const routingLoading = production && !setup && !notice;
  const primaryRequired = "Choose a primary model to enable AI.";
  const boundRouter = value.router ?? setup?.selectionRouter ?? "vercel";
  const routerChanged = Boolean(
    value.model && router && boundRouter !== router.id,
  );
  const model = setup?.models.find((entry) => entry.id === value.model);
  const fallback = setup?.models.find(
    (entry) => entry.id === value.fallbackModel,
  );
  const target = routerSelection?.target ?? "";
  const configuredTarget = setup?.models.find((entry) => entry.id === target);
  const needsRouterSelection = Boolean(
    routerSelection &&
    (boundRouter !== router?.id ||
      value.model !== target ||
      value.fallbackModel),
  );
  const problem =
    notice ||
    (production &&
      setup &&
      (!router
        ? setup.connection.message
        : !setup.connection.configured
          ? setup.connection.message
          : !setup.catalog.ready
            ? setup.catalog.message
            : !setup.retrieval.ready
              ? setup.retrieval.message
              : ""));
  const picker = (backup: boolean) => {
    const selected = routerChanged
      ? ""
      : backup
        ? value.fallbackModel
        : value.model;
    const entry = backup ? fallback : model;
    const supportsFallback = router?.supportsFallback;
    return (
      <FormField
        label={backup ? "Fallback model" : "Primary model"}
        errorPlaceholder={production && !backup ? primaryRequired : undefined}
        error={!backup && !selected ? primaryRequired : undefined}
        description={
          backup
            ? supportsFallback === false
              ? "This router does not support a fallback."
              : "Optional backup if the primary cannot respond."
            : "Required. Your choice stays saved while AI is off."
        }
      >
        <SelectField
          value={selected}
          disabled={
            busy ||
            !router ||
            !setup?.catalog.ready ||
            (backup &&
              (routerChanged ||
                !value.model ||
                (!supportsFallback && !value.fallbackModel)))
          }
          onValueChange={(id) =>
            onChange(
              backup
                ? { ...value, fallbackModel: id }
                : {
                    ...value,
                    router: router!.id,
                    model: id,
                    fallbackModel:
                      routerChanged ||
                      !supportsFallback ||
                      id === value.fallbackModel
                        ? ""
                        : value.fallbackModel,
                  },
            )
          }
        >
          <option value="">{backup ? "None" : "Choose a primary model"}</option>
          {selected && !entry && (
            <option value={selected}>
              {selected}
              {setup?.catalog.ready ? " — unavailable" : ""}
            </option>
          )}
          {setup?.models
            .filter(
              (entry) =>
                !backup || (supportsFallback && entry.id !== value.model),
            )
            .map((entry) => (
              <option
                key={entry.id}
                value={entry.id}
                disabled={entry.validation?.ready === false}
              >
                {entry.name}
              </option>
            ))}
        </SelectField>
      </FormField>
    );
  };

  return (
    <>
      <SettingsSection
        id="settings-ai"
        title={<h3>Availability</h3>}
        disabled={busy}
        description="Concise answers from your published Fieldbook content."
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
            Visitors with access to this Fieldbook can ask questions from
            Search, including guests on public sites. Off restores basic search.
          </FieldDescription>
        </FieldGroup>
        {value.enabled && (
          <FieldGroup className="gap-3 border-t border-border pt-5">
            <div
              className="flex flex-wrap items-center justify-between gap-2 text-copy"
              aria-label="Model router"
              aria-busy={production && !setup && !notice}
            >
              <div>
                <p className="font-medium">Model router</p>
                <p className="text-muted-foreground">
                  {router?.name ??
                    (setup || notice
                      ? "No router available"
                      : "Checking configuration…")}
                </p>
              </div>
              <Badge
                variant={
                  production &&
                  (setup || notice) &&
                  !setup?.connection.configured
                    ? "warning"
                    : "default"
                }
              >
                {!production
                  ? "Demo only"
                  : !setup && !notice
                    ? "Checking"
                    : setup?.connection.configured
                      ? "Configured"
                      : "Needs setup"}
              </Badge>
            </div>
            {problem && (
              <Alert role="status" dismissible>
                {problem}
              </Alert>
            )}
            {routerChanged && (
              <Alert dismissible>
                {routerSelection
                  ? "The model router changed. Use the configured inference router before saving."
                  : "The model router changed. Review the primary and fallback models before saving."}
              </Alert>
            )}
          </FieldGroup>
        )}
      </SettingsSection>
      {value.enabled && (
        <>
          <SettingsSection
            id="settings-ai-models"
            title={<h3>{routerSelection ? "Routing" : "Models"}</h3>}
            description={
              routerSelection?.description ??
              "Choose the primary model and an optional backup."
            }
            disabled={busy}
          >
            <FieldGroup>
              {routerSelection ? (
                <>
                  <div className="grid gap-2 text-copy">
                    <p className="font-medium">Router</p>
                    <p className="break-words">
                      {target || "No router configured"}
                    </p>
                  </div>
                  <p role="status" className="sr-only">
                    {routingLoading
                      ? "Loading router models…"
                      : configuredTarget?.validation?.ready
                        ? "Router models loaded."
                        : "Router models unavailable or incompatible."}
                  </p>
                  {configuredTarget?.validation?.ready === false && (
                    <Alert role="alert" variant="destructive">
                      {configuredTarget.validation.message}
                    </Alert>
                  )}
                  {needsRouterSelection && (
                    <FieldGroup className="gap-2">
                      <FieldDescription>
                        Use this router before saving.
                      </FieldDescription>
                      <ActionGroup>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={
                            busy ||
                            !target ||
                            !setup?.catalog.ready ||
                            !configuredTarget?.validation?.ready
                          }
                          onClick={() =>
                            onChange({
                              ...value,
                              router: router!.id,
                              model: target,
                              fallbackModel: "",
                            })
                          }
                        >
                          Use configured router
                        </Button>
                      </ActionGroup>
                    </FieldGroup>
                  )}
                  <Collapsible
                    className="overflow-hidden rounded-control border border-border"
                    aria-busy={routingLoading}
                    data-slot="ai-router-details"
                  >
                    <CollapsibleTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        className="group w-full justify-start rounded-none px-4 py-3 text-left focus-visible:ring-inset focus-visible:ring-offset-0 [&>span]:w-full [&>span]:justify-between"
                      >
                        <span className="min-w-0">
                          Model pools and fallback order
                        </span>
                        {routingLoading ? (
                          <Spinner />
                        ) : (
                          <ChevronDown
                            aria-hidden="true"
                            className="size-4 transition-transform group-data-[state=open]:rotate-180 motion-reduce:transition-none"
                          />
                        )}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="grid gap-5 border-t border-border p-4 text-copy @md/admin-surface:grid-cols-2">
                        {configuredTarget?.routing ? (
                          <>
                            <div className="grid gap-2">
                              <p className="font-medium">Model pools</p>
                              {configuredTarget.routing.pools.length ? (
                                configuredTarget.routing.pools.map(
                                  (pool, index) => (
                                    <div key={index} className="grid gap-1">
                                      <p className="break-words text-caption text-muted-foreground">
                                        {pool.label}
                                      </p>
                                      <ul className="list-disc space-y-1 pl-5">
                                        {pool.models.map((id, modelIndex) => (
                                          <li
                                            key={modelIndex}
                                            className="break-words"
                                          >
                                            {id}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  ),
                                )
                              ) : (
                                <p className="text-muted-foreground">
                                  No task-specific pools. Requests use the
                                  fallback order.
                                </p>
                              )}
                            </div>
                            <div className="grid gap-2">
                              <p className="font-medium">Fallback order</p>
                              <ol className="list-decimal space-y-1 pl-5">
                                {configuredTarget.routing.fallbacks.map(
                                  (id, index) => (
                                    <li key={index} className="break-words">
                                      {id}
                                    </li>
                                  ),
                                )}
                              </ol>
                            </div>
                          </>
                        ) : (
                          <FieldDescription>
                            {routingLoading
                              ? "Loading router models…"
                              : "Model pools and fallback order could not be loaded."}
                          </FieldDescription>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </>
              ) : (
                <div
                  data-slot="ai-model-fields"
                  className="grid items-start gap-4 md:grid-cols-2"
                >
                  {picker(false)}
                  {picker(true)}
                </div>
              )}
              {!routerChanged &&
                setup?.catalog.ready &&
                value.model &&
                !model && (
                  <Alert dismissible>
                    {routerSelection ? (
                      "The saved inference router is unavailable. Use the configured router to enable Ask AI."
                    ) : (
                      <>
                        The primary model is unavailable. Choose a replacement
                        {fallback
                          ? ". The fallback model can still answer questions."
                          : " to enable Ask AI."}
                      </>
                    )}
                  </Alert>
                )}
              {!routerSelection &&
                !routerChanged &&
                setup?.catalog.ready &&
                value.fallbackModel &&
                !fallback && (
                  <Alert dismissible>
                    The fallback model is unavailable. Choose a replacement or
                    select None.
                  </Alert>
                )}
            </FieldGroup>
          </SettingsSection>
          <SettingsSection
            id="settings-ai-content"
            title={<h3>Answer content</h3>}
            description="Choose the published material Ask AI can use and guide its response style."
            disabled={busy}
          >
            <FieldGroup
              className="gap-3"
              aria-describedby="ai-sources-description"
            >
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
                            : value.sources.filter(
                                (item) => item !== source.value,
                              ),
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
                  disabled={
                    busy || value.guidance === defaultAskAiSettings.guidance
                  }
                  onClick={() =>
                    onChange({
                      ...value,
                      guidance: defaultAskAiSettings.guidance,
                    })
                  }
                >
                  Reset to default
                </Button>
              </ActionGroup>
            </FieldGroup>
          </SettingsSection>
        </>
      )}
      <SettingsPageActions
        guidance={
          production
            ? "Save settings to apply changes across this page."
            : "Demo settings affect this browser only. AI answers are unavailable."
        }
        actions={actions}
        belowActions={belowActions}
      />
    </>
  );
}
