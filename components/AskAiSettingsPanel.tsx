"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  defaultAskAiSettings,
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
  value,
  onChange,
  production,
  busy,
  actions,
  belowActions,
  sticky = false,
}: {
  value: AskAiSettings;
  onChange: (next: AskAiSettings) => void;
  production: boolean;
  busy: boolean;
  actions: ReactNode;
  belowActions?: ReactNode;
  sticky?: boolean;
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

  const router = setup?.router;
  const routerSelection = router?.routerSelection;
  const primaryRequired = routerSelection
    ? "Choose an inference router to enable AI."
    : "Choose a primary model to enable AI.";
  const boundRouter = value.router ?? setup?.selectionRouter;
  const routerChanged = Boolean(
    value.model && router && boundRouter !== router.id,
  );
  const model = setup?.models.find((entry) => entry.id === value.model);
  const fallback = setup?.models.find(
    (entry) => entry.id === value.fallbackModel,
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
        label={
          backup
            ? "Fallback model"
            : routerSelection
              ? "Inference router"
              : "Primary model"
        }
        errorPlaceholder={production && !backup ? primaryRequired : undefined}
        error={!backup && !selected ? primaryRequired : undefined}
        description={
          backup
            ? supportsFallback === false
              ? "This router does not support a fallback."
              : "Optional backup if the primary cannot respond."
            : routerSelection
              ? "The installation configuration controls which router is available."
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
          <option value="">
            {backup
              ? "None"
              : routerSelection
                ? "Choose an inference router"
                : "Choose a primary model"}
          </option>
          {selected && !entry && (
            <option value={selected}>{selected} — unavailable</option>
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
              {(setup || notice) && (
                <Badge
                  variant={
                    production && !setup?.connection.configured
                      ? "warning"
                      : "default"
                  }
                >
                  {!production
                    ? "Demo only"
                    : setup?.connection.configured
                      ? "Configured"
                      : "Needs setup"}
                </Badge>
              )}
            </div>
            {problem && (
              <Alert role="status" dismissible>
                {problem}
              </Alert>
            )}
            {routerChanged && (
              <Alert dismissible>
                {routerSelection
                  ? "The model router changed. Choose the configured inference router before saving."
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
              <div
                data-slot="ai-model-fields"
                className={
                  routerSelection
                    ? "grid items-start gap-4"
                    : "grid items-start gap-4 md:grid-cols-2"
                }
              >
                {picker(false)}
                {!routerSelection && picker(true)}
              </div>
              {routerSelection && (
                <>
                  <FieldDescription>{routerSelection.details}</FieldDescription>
                  {setup?.models.map(
                    (entry) =>
                      entry.validation && (
                        <FieldDescription key={entry.id} role="status">
                          {entry.validation.message}
                        </FieldDescription>
                      ),
                  )}
                  {value.fallbackModel && (
                    <Alert dismissible>
                      A previous fallback is still saved. Choose the inference
                      router again to clear it before saving.
                    </Alert>
                  )}
                </>
              )}
              {!routerChanged &&
                setup?.catalog.ready &&
                value.model &&
                !model && (
                  <Alert dismissible>
                    {routerSelection ? (
                      "The saved inference router is unavailable. Choose the configured router to enable Ask AI."
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
        sticky={sticky}
      />
    </>
  );
}
