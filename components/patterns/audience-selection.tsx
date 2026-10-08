"use client";
import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ChevronDown,
  ChevronRight,
  Layers,
  Network,
  Users,
  Globe,
  Info,
  Plus,
  X,
} from "lucide-react";
import type { Workspace } from "@/lib/store";
import { audienceTransfer } from "@/lib/audience-transfer";
import {
  audienceSummary,
  contentAudienceKey,
  type AudienceOption,
} from "@/lib/content-audiences";
import { cn } from "@/lib/utils";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { SelectionViewport } from "../ui/selection-viewport";
import { CountMetric } from "../ui/count-metric";
import { Tooltip } from "../ui/tooltip";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import { SearchField } from "./search-field";

const NO_SOURCES: Record<string, string[]> = {};

/** Assignment sources move between panes; their included teams are explanatory. */
export function AudienceSelection({
  data,
  selected,
  onChange,
  disabled,
  inherited = NO_SOURCES,
  showPeople = true,
  initialSelected = [],
  recommendationsOnly = false,
  existingAudienceKeys,
  bounded = false,
}: {
  data: Workspace;
  selected: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
  inherited?: Record<string, string[]>;
  showPeople?: boolean;
  initialSelected?: string[];
  recommendationsOnly?: boolean;
  /** A batch's existing sources contribute reach, but never disable additions. */
  existingAudienceKeys?: string[];
  bounded?: boolean;
}) {
  const model = useMemo(
    () => audienceTransfer(data, selected, inherited, showPeople),
    [data, selected, inherited, showPeople],
  );
  const [query, setQuery] = useState("");
  const [assignedQuery, setAssignedQuery] = useState("");
  const [pane, setPane] = useState<"available" | "assigned">(
    selected.length || Object.keys(inherited).length ? "assigned" : "available",
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [announcement, setAnnouncement] = useState("");
  const root = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<{
    pane: string;
    index: number;
    element: HTMLElement;
    key: string;
  } | null>(null);
  const id = useId();
  const additive = existingAudienceKeys !== undefined;
  const rightLabel = additive
    ? "To add"
    : recommendationsOnly
      ? "Selected"
      : "Assigned";
  const inheritedKeys = Object.keys(inherited);
  const rightCount = new Set([...selected, ...inheritedKeys]).size;
  const selectedOptions = model.options.filter(
    (option) =>
      selected.includes(contentAudienceKey(option)) &&
      !model.coveredBy.get(contentAudienceKey(option))?.length,
  );
  const missingKeys = selected.filter(
    (key) =>
      !model.options.some((option) => contentAudienceKey(option) === key),
  );
  const allKeys = [
    ...new Set([
      ...selected,
      ...inheritedKeys,
      ...(existingAudienceKeys || []),
    ]),
  ];
  const normalizedQuery = query.trim().toLowerCase();
  const available = model.available.filter((option) =>
    `${option.name} ${option.kind}`.toLowerCase().includes(normalizedQuery),
  );
  const children = (options: AudienceOption[], parent: AudienceOption) =>
    options.filter(
      (option) =>
        parent.kind === "team" &&
        option.kind === "team" &&
        data.teams?.find((team) => team.id === option.id)?.parentId ===
          parent.id,
    );
  const roots = (options: AudienceOption[]) =>
    options.filter(
      (option) =>
        option.kind !== "team" ||
        !options.some(
          (parent) =>
            parent.kind === "team" &&
            !parent.organization &&
            !("directMembersOnly" in parent && parent.directMembersOnly) &&
            parent.id ===
              data.teams?.find((team) => team.id === option.id)?.parentId,
        ),
    );
  const toggleExpanded = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const move = (key: string, add: boolean) => {
    const active = document.activeElement;
    const section = active?.closest<HTMLElement>("[data-audience-pane]");
    if (section && active) {
      const actions = [
        ...section.querySelectorAll<HTMLElement>("[data-transfer-action]"),
      ];
      pendingFocus.current = {
        pane: section.dataset.audiencePane!,
        index: actions.indexOf(active as HTMLElement),
        element: active as HTMLElement,
        key,
      };
    }
    const name =
      model.options.find((option) => contentAudienceKey(option) === key)
        ?.name || "Unavailable audience";
    onChange(
      add
        ? [...new Set([...selected, key])]
        : selected.filter((value) => value !== key),
    );
    setAnnouncement(
      `${name} ${add ? "added" : "removed"}.${!add && (inherited[key]?.length || model.coveredBy.get(key)?.length) ? " Still included through another assignment." : ""}`,
    );
  };
  useLayoutEffect(() => {
    const pending = pendingFocus.current;
    if (!pending) return;
    pendingFocus.current = null;
    if (
      pending.element.isConnected &&
      !pending.element.hasAttribute("disabled")
    ) {
      pending.element.focus({ preventScroll: true });
      return;
    }
    const section = root.current?.querySelector<HTMLElement>(
      `[data-audience-pane="${pending.pane}"]`,
    );
    const actions = [
      ...(section?.querySelectorAll<HTMLElement>("[data-transfer-action]") ||
        []),
    ];
    (
      actions.find((action) => action.dataset.transferAction === pending.key) ||
      (pending.index >= 0
        ? actions[Math.min(pending.index, actions.length - 1)]
        : undefined) ||
      section?.querySelector<HTMLElement>("[data-pane-heading]")
    )?.focus({ preventScroll: true });
  }, [selected]);

  const personCount = (option: AudienceOption) => {
    if (!showPeople) return undefined;
    const count = model.people.get(contentAudienceKey(option))?.size || 0;
    if (option.publicGuests && !count) return undefined;
    return count;
  };
  const audienceNote = (option: AudienceOption) =>
    option.organization
      ? "Everyone registered, now and in future"
      : option.publicGuests
        ? "Includes public guests"
        : undefined;
  const name = (option: AudienceOption) =>
    option.organization ? "Organization" : option.name;
  const assignedNeedle = assignedQuery.trim().toLowerCase();
  const matchesAssigned = (option: AudienceOption) =>
    `${name(option)} ${option.kind}`.toLowerCase().includes(assignedNeedle);
  const matchesSource = (option: AudienceOption) =>
    matchesAssigned(option) ||
    model.includedTeams(option).some(matchesAssigned) ||
    inherited[contentAudienceKey(option)]?.some((title) =>
      title.toLowerCase().includes(assignedNeedle),
    );
  const searchingSourceChildren = (option: AudienceOption) =>
    !!assignedNeedle &&
    !matchesAssigned(option) &&
    !inherited[contentAudienceKey(option)]?.some((title) =>
      title.toLowerCase().includes(assignedNeedle),
    );
  const audienceHeading = (
    option: AudienceOption,
    teamCount = 0,
    disclosure?: { key: string; open: boolean; label?: string },
    includePeople = true,
    note?: string,
  ) => {
    const Icon = option.kind === "group" ? Layers : Network;
    const count = includePeople ? personCount(option) : undefined;
    const teamLabel = `${teamCount} ${option.kind === "team" ? "subteams" : "included teams"}`;
    const teamMetric = (
      <CountMetric
        icon={<Network className="size-3.5" aria-hidden="true" />}
        value={teamCount}
        label={teamLabel}
        iconPosition="end"
      />
    );
    return (
      <div className="flex min-h-8 min-w-0 items-center gap-2">
        <span
          className="inline-flex min-w-0 items-center gap-2 text-sm font-medium"
          aria-label={[name(option), audienceNote(option), note]
            .filter(Boolean)
            .join(" · ")}
        >
          <Icon
            className="size-4 shrink-0 text-muted-foreground"
            role="img"
            aria-label={option.kind === "group" ? "Group" : "Team"}
          />
          <span className="truncate">{name(option)}</span>
        </span>
        {(option.publicGuests || note) && (
          <Tooltip
            content={[audienceNote(option), note].filter(Boolean).join(" · ")}
          >
            <span
              className="inline-flex shrink-0 text-muted-foreground"
              role="img"
              aria-label={[audienceNote(option), note]
                .filter(Boolean)
                .join(" · ")}
            >
              {option.publicGuests ? (
                <Globe className="size-3.5" aria-hidden="true" />
              ) : (
                <Info className="size-3.5" aria-hidden="true" />
              )}
            </span>
          </Tooltip>
        )}
        {count !== undefined && (
          <CountMetric
            icon={<Users className="size-3.5" aria-hidden="true" />}
            value={count}
            label={`${count} ${option.publicGuests ? "registered people" : "people"}`}
            iconPosition="end"
          />
        )}
        {teamCount > 0 &&
          (disclosure ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1 px-1"
              disabled={disabled}
              aria-label={
                disclosure.label ||
                `Includes ${teamCount} ${option.kind === "team" && !option.organization ? "subteams" : "teams"} in ${name(option)}`
              }
              aria-expanded={disclosure.open}
              aria-controls={`${id}-${disclosure.key}`}
              onClick={() => toggleExpanded(disclosure.key)}
            >
              {teamMetric}
              {disclosure.open ? <ChevronDown /> : <ChevronRight />}
            </Button>
          ) : (
            teamMetric
          ))}
      </div>
    );
  };
  const sourceChildren = (option: AudienceOption, inheritedSource = false) => {
    const key = contentAudienceKey(option);
    const fullIncluded = model.includedTeams(option);
    const searchingChildren = searchingSourceChildren(option);
    // Keep matching teams in their source hierarchy, including the path to each match.
    const matchingBranch = new Set<string>();
    if (searchingChildren) {
      const teams = new Map((data.teams || []).map((team) => [team.id, team]));
      for (const team of fullIncluded.filter(matchesAssigned)) {
        let current: string | undefined = team.id;
        while (current && !matchingBranch.has(current)) {
          matchingBranch.add(current);
          current = teams.get(current)?.parentId;
        }
      }
    }
    const included = searchingChildren
      ? fullIncluded.filter((team) => matchingBranch.has(team.id))
      : fullIncluded;
    if (!included.length) return null;
    const disclosureKey = `${inheritedSource ? "inherited" : "source"}:${key}`;
    const open = expanded.has(disclosureKey) || searchingChildren;
    const renderIncluded = (
      team: (typeof included)[number],
      visited: Set<string>,
    ): ReactNode => {
      if (visited.has(team.id)) return null;
      const branch = new Set([...visited, team.id]);
      const nested = team.directMembersOnly
        ? []
        : (children(included, team) as typeof included);
      const teamKey = contentAudienceKey(team);
      const nestedKey = `${disclosureKey}:${teamKey}`;
      const nestedOpen = expanded.has(nestedKey) || searchingChildren;
      return (
        <li key={teamKey} className="grid gap-1">
          <div className="flex min-w-0 items-center gap-2 py-0.5">
            <div className="min-w-0 flex-1 text-muted-foreground">
              {audienceHeading(
                team,
                nested.length,
                {
                  key: nestedKey,
                  open: nestedOpen,
                  label: `${nestedOpen ? "Collapse" : "Expand"} included ${team.name} in ${name(option)}`,
                },
                !team.directMembersOnly,
                team.directMembersOnly
                  ? "Direct members only · excludes subteams"
                  : selected.includes(teamKey)
                    ? "Also assigned directly"
                    : `Through ${name(option)}`,
              )}
            </div>
            <span
              title={`${recommendationsOnly ? "Included" : "Assigned"} through ${name(option)}. This inclusion cannot be removed individually.`}
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled
                aria-label={`${team.name} cannot be removed individually; included through ${name(option)}`}
              >
                <X /> Remove
              </Button>
            </span>
          </div>
          {nestedOpen && nested.length > 0 && (
            <ul
              id={`${id}-${nestedKey}`}
              className="grid border-l border-border pl-3"
            >
              {nested.map((child) => renderIncluded(child, branch))}
            </ul>
          )}
        </li>
      );
    };
    return (
      <div>
        {open && (
          <div id={`${id}-${disclosureKey}`}>
            <ul className="mt-2 grid border-l border-border pl-3">
              {(roots(included) as typeof included).map((team) =>
                renderIncluded(team, new Set()),
              )}
            </ul>
            {included.length > 0 && (
              <Collapsible className="mt-2">
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="text-xs [&[data-state=open]_svg]:rotate-90"
                    disabled={disabled}
                  >
                    <ChevronRight
                      className="size-3.5 transition-transform motion-reduce:transition-none"
                      aria-hidden="true"
                    />
                    {additive
                      ? "Manage direct selections"
                      : "Manage direct assignments"}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-2 grid gap-2">
                  <p className="text-xs text-muted-foreground">
                    {additive
                      ? "Remove a direct selection to cancel that addition."
                      : `A direct assignment stays if ${name(option)} is removed later.`}
                  </p>
                  {included.map((team) => (
                    <div
                      key={team.id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="truncate text-xs">
                        {team.name}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={disabled}
                        data-transfer-action={contentAudienceKey(team)}
                        aria-label={`${selected.includes(contentAudienceKey(team)) ? (additive ? "Remove selection for" : "Remove direct assignment for") : "Add direct assignment for"} ${team.name}`}
                        onClick={() =>
                          move(
                            contentAudienceKey(team),
                            !selected.includes(contentAudienceKey(team)),
                          )
                        }
                      >
                        {selected.includes(contentAudienceKey(team))
                          ? additive
                            ? "Remove selection"
                            : "Remove direct"
                          : "Add direct"}
                      </Button>
                    </div>
                  ))}
                </CollapsibleContent>
              </Collapsible>
            )}
          </div>
        )}
      </div>
    );
  };
  const sourceRow = (option: AudienceOption, inheritedSource = false) => {
    const key = contentAudienceKey(option);
    const otherSources = model.coveredBy.get(key) || [];
    const through = inherited[key] || [];
    const disclosureKey = `${inheritedSource ? "inherited" : "source"}:${key}`;
    return (
      <li
        key={key}
        className="border-b border-border px-3 py-1 last:border-b-0"
      >
        <div className="flex min-w-0 items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            {audienceHeading(
              option,
              model.includedTeams(option).length,
              {
                key: disclosureKey,
                open:
                  expanded.has(disclosureKey) ||
                  searchingSourceChildren(option),
              },
              true,
              inheritedSource
                ? `Through ${through.join(", ")}, edit the curriculum to remove`
                : through.length > 0 || otherSources.length > 0
                  ? `${initialSelected.includes(key) ? "Assigned directly" : "Selected directly"} · also included through ${[...through, ...otherSources.map(name)].join(" · ")}`
                  : undefined,
            )}
          </div>
          {inheritedSource ? (
            !selected.includes(key) && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                data-transfer-action={key}
                aria-label={`Add direct assignment for ${name(option)}`}
                onClick={() => move(key, true)}
              >
                Add direct
              </Button>
            )
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={disabled}
              data-transfer-action={key}
              aria-label={`Remove ${option.kind}: ${name(option)}`}
              onClick={() => move(key, false)}
            >
              <X /> Remove
            </Button>
          )}
        </div>
        {sourceChildren(option, inheritedSource)}
      </li>
    );
  };
  const renderAvailable = (
    option: AudienceOption,
    visited = new Set<string>(),
    directMembersOnly = false,
  ): ReactNode => {
    const key = contentAudienceKey(option);
    if (visited.has(key)) return null;
    const branch = new Set([...visited, key]);
    const nested =
      normalizedQuery || option.organization || directMembersOnly
        ? []
        : option.kind === "group"
          ? model
              .includedTeams(option)
              .filter((team) =>
                available.some(
                  (candidate) =>
                    contentAudienceKey(candidate) === contentAudienceKey(team),
                ),
              )
          : children(available, option);
    const disclosureKey = `available:${[...branch].join(":")}`;
    const open = expanded.has(disclosureKey);
    const parent =
      normalizedQuery && option.kind === "team"
        ? data.teams?.find(
            (team) =>
              team.id ===
              data.teams?.find((team) => team.id === option.id)?.parentId,
          )
        : undefined;
    return (
      <li key={key} className="border-b border-border last:border-b-0">
        <div className="flex min-w-0 items-center gap-2 px-3 py-1">
          <div className="min-w-0 flex-1">
            {audienceHeading(
              option,
              nested.length,
              {
                key: disclosureKey,
                open,
                label: `${open ? "Collapse" : "Expand"} ${name(option)}`,
              },
              !directMembersOnly,
              directMembersOnly
                ? "Direct members only · excludes subteams"
                : parent && !parent.system
                  ? `In ${parent.name}`
                  : undefined,
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={disabled}
            data-transfer-action={key}
            aria-label={`Add ${option.kind}: ${name(option)}`}
            onClick={() => move(key, true)}
          >
            <Plus /> Add
          </Button>
        </div>
        {open && nested.length > 0 && (
          <ul
            id={`${id}-${disclosureKey}`}
            className="ml-5 border-l border-border"
          >
            {roots(nested).map((child) =>
              renderAvailable(
                child,
                branch,
                "directMembersOnly" in child && !!child.directMembersOnly,
              ),
            )}
          </ul>
        )}
      </li>
    );
  };
  const availableRoots = normalizedQuery ? available : roots(available);
  const sections = [
    {
      label: "Everyone",
      options: availableRoots.filter((option) => option.organization),
    },
    {
      label: "Groups",
      options: availableRoots.filter((option) => option.kind === "group"),
    },
    {
      label: "Teams",
      options: availableRoots.filter(
        (option) => option.kind === "team" && !option.organization,
      ),
    },
  ];
  const throughOptions = model.options.filter(
    (option) =>
      inheritedKeys.includes(contentAudienceKey(option)) &&
      !selected.includes(contentAudienceKey(option)),
  );
  const visibleSelected = selectedOptions.filter(matchesSource);
  const visibleThrough = throughOptions.filter(matchesSource);
  const visibleMissing = missingKeys.filter(() =>
    "audience no longer exists".includes(assignedNeedle),
  );
  return (
    <div
      ref={root}
      className={cn(
        "flex min-h-0 flex-col gap-3",
        bounded ? "h-full flex-1" : "h-[min(36rem,70dvh)]",
      )}
    >
      <div
        className="flex shrink-0 gap-2 md:hidden"
        role="group"
        aria-label="Assignment lists"
      >
        <Button
          type="button"
          variant={pane === "available" ? "default" : "outline"}
          className="flex-1"
          aria-pressed={pane === "available"}
          aria-controls={`${id}-available`}
          onClick={() => setPane("available")}
        >
          Available
        </Button>
        <Button
          type="button"
          variant={pane === "assigned" ? "default" : "outline"}
          className="flex-1"
          aria-pressed={pane === "assigned"}
          aria-controls={`${id}-assigned`}
          onClick={() => setPane("assigned")}
        >
          {rightLabel} ({rightCount})
        </Button>
      </div>
      <div className="grid min-h-0 flex-1 gap-4 md:grid-cols-2">
        <section
          id={`${id}-available`}
          data-audience-pane="available"
          aria-label="Available audiences"
          className={cn(
            "min-h-0 flex-col rounded-lg border border-border",
            pane === "available" ? "flex" : "hidden md:flex",
          )}
        >
          <div className="flex shrink-0 items-center gap-3 border-b border-border p-3">
            <h3
              tabIndex={-1}
              data-pane-heading
              className="shrink-0 text-sm font-semibold outline-none"
            >
              Available{" "}
              <span className="font-normal text-muted-foreground">
                · {model.available.length}
              </span>
            </h3>
            <SearchField className="flex-1">
              <Input
                type="search"
                variant="metadata"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Find a team or group"
                aria-label="Find a team or group"
                disabled={disabled}
              />
            </SearchField>
          </div>
          <SelectionViewport
            fill
            className="min-h-0 border-t-0"
            aria-label="Available teams and groups"
          >
            {sections.map(
              (section) =>
                section.options.length > 0 && (
                  <div key={section.label}>
                    <h4 className="sticky top-0 z-10 bg-surface px-3 py-2 text-xs font-medium text-muted-foreground">
                      {section.label}
                    </h4>
                    <ul>
                      {section.options.map((option) => renderAvailable(option))}
                    </ul>
                  </div>
                ),
            )}
            {!available.length && (
              <p className="p-4 text-sm text-muted-foreground">
                {query
                  ? "No matching teams or groups."
                  : "All available audiences are included."}
              </p>
            )}
          </SelectionViewport>
        </section>
        <section
          id={`${id}-assigned`}
          data-audience-pane="assigned"
          aria-label={`${rightLabel} audiences`}
          className={cn(
            "min-h-0 flex-col rounded-lg border border-border",
            pane === "assigned" ? "flex" : "hidden md:flex",
          )}
        >
          <div className="flex shrink-0 items-center gap-3 border-b border-border p-3">
            <h3
              tabIndex={-1}
              data-pane-heading
              className="shrink-0 text-sm font-semibold outline-none"
            >
              {rightLabel}{" "}
              <span className="font-normal text-muted-foreground">
                · {rightCount}
              </span>
            </h3>
            <SearchField className="flex-1">
              <Input
                type="search"
                variant="metadata"
                value={assignedQuery}
                onChange={(event) => setAssignedQuery(event.target.value)}
                placeholder="Find a team or group"
                aria-label={`Find ${rightLabel.toLowerCase()} teams or groups`}
                disabled={disabled}
              />
            </SearchField>
          </div>
          <SelectionViewport
            fill
            className="min-h-0 border-t-0"
            aria-label="Assignment sources"
          >
            {(visibleSelected.length > 0 || visibleMissing.length > 0) && (
              <div>
                <h4 className="sticky top-0 z-10 bg-surface px-3 py-2 text-xs font-medium text-muted-foreground">
                  {additive || recommendationsOnly
                    ? "Direct selections"
                    : "Direct assignments"}
                </h4>
                <ul>
                  {visibleSelected.map((option) => sourceRow(option))}
                  {visibleMissing.map((key) => (
                    <li
                      key={key}
                      className="flex items-center justify-between gap-3 border-b border-border p-3"
                    >
                      <span className="text-sm">Audience no longer exists</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={disabled}
                        data-transfer-action={key}
                        aria-label={`Remove unavailable audience ${key}`}
                        onClick={() => move(key, false)}
                      >
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {assignedNeedle &&
              !visibleSelected.length &&
              !visibleThrough.length &&
              !visibleMissing.length && (
                <p className="p-4 text-sm text-muted-foreground">
                  No matching teams or groups.
                </p>
              )}
            {!assignedNeedle && !selected.length && !throughOptions.length && (
              <p className="p-4 text-sm text-muted-foreground">
                {additive
                  ? "Nothing to add yet. Choose teams or groups from Available."
                  : "No direct selections. Add teams or groups from Available."}
              </p>
            )}
            {visibleThrough.length > 0 && (
              <div>
                <h4 className="sticky top-0 z-10 border-y border-border bg-surface px-3 py-2 text-xs font-medium text-muted-foreground">
                  Through curricula
                </h4>
                <ul>
                  {visibleThrough.map((option) => sourceRow(option, true))}
                </ul>
              </div>
            )}
            {additive && (
              <div className="border-t border-border p-3">
                <p className="text-xs text-muted-foreground">
                  Existing assignments stay in place. Remove here only cancels a
                  pending addition.
                </p>
              </div>
            )}
          </SelectionViewport>
        </section>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {showPeople && (
          <span>
            {audienceSummary(data, allKeys, model.people)} included
            {additive ? " across selected learning" : ""}
          </span>
        )}
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
