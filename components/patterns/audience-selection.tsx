"use client";
import { useMemo, useRef, useState } from "react";
import { Check } from "lucide-react";
import type { Workspace } from "@/lib/store";
import {
  audienceOptions,
  audienceCoverage,
  audienceMemberCoverage,
  audiencePeople,
  audienceSummary,
  contentAudienceKey,
} from "@/lib/content-audiences";
import { Checkbox, Radio } from "../ui/choice";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Field, FieldDescription } from "../ui/field";
import { SelectionViewport } from "../ui/selection-viewport";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../ui/collapsible";
import { SearchField } from "./search-field";

/** Shared presentation; callers retain permissions, sources, publication and governance writes. */
export function AudienceSelection({
  data,
  selected,
  onChange,
  disabled,
  inherited = {},
  showPeople = true,
  initialSelected = [],
  recommendationsOnly = false,
  existingAudienceKeys,
}: {
  data: Workspace;
  selected: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
  inherited?: Record<string, string[]>;
  showPeople?: boolean;
  initialSelected?: string[];
  recommendationsOnly?: boolean;
  /** Additive batches keep existing sources; they contribute reach without disabling new choices. */
  existingAudienceKeys?: string[];
}) {
  const [query, setQuery] = useState("");
  const parked = useRef<string[] | null>(null);
  const coveredTeams = useRef(new Set<string>());
  const independentTeams = useRef(new Set<string>());
  const all = audienceOptions(data).filter(
    (a) => showPeople || a.kind === "group",
  );
  const people = useMemo(
    () => audiencePeople(data),
    [data.users, data.groups, data.teams],
  );
  const organization = all.find((a) => a.organization),
    guest = all.find((a) => a.publicGuests);
  const orgKey = organization && contentAudienceKey(organization),
    guestKey = guest && contentAudienceKey(guest);
  const org = !!orgKey && selected.includes(orgKey);
  const keys = [...new Set([...selected, ...Object.keys(inherited)])];
  const members = (audienceKeys: string[]) =>
    new Set(audienceKeys.flatMap((k) => [...(people.get(k) || [])]));
  const directPeople = members(selected),
    existingPeople = members(
      existingAudienceKeys || [...initialSelected, ...Object.keys(inherited)],
    ),
    totalPeople = members([...keys, ...(existingAudienceKeys || [])]);
  const newPeople = [...totalPeople].filter(
    (id) => !existingPeople.has(id),
  ).length;
  const curricula = [...new Set(Object.values(inherited).flat())];
  const specific = all.filter((a) => !a.organization && !a.publicGuests);
  const candidates = specific.filter((a) =>
    `${a.name} ${a.kind}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const changeSelection = (next: string[]) => {
    const proposed = [...new Set([...next, ...coveredTeams.current])];
    const coverageKeys = [...proposed, ...Object.keys(inherited)];
    const result = new Set(next);
    for (const a of all) {
      const key = contentAudienceKey(a);
      if (
        a.kind !== "team" ||
        a.organization ||
        !proposed.includes(key) ||
        initialSelected.includes(key) ||
        independentTeams.current.has(key)
      )
        continue;
      if (
        inherited[key]?.length ||
        audienceCoverage(data, a, coverageKeys, people).length
      ) {
        coveredTeams.current.add(key);
        result.delete(key);
      } else {
        coveredTeams.current.delete(key);
        result.add(key);
      }
    }
    onChange([...result]);
  };
  const toggle = (key: string, checked: boolean, independent = false) => {
    if (!checked) {
      coveredTeams.current.delete(key);
      independentTeams.current.delete(key);
    } else if (independent) independentTeams.current.add(key);
    if (parked.current)
      parked.current = checked
        ? [...new Set([...parked.current, key])]
        : parked.current.filter((k) => k !== key);
    changeSelection(
      checked
        ? [...new Set([...selected, key])]
        : selected.filter((k) => k !== key),
    );
  };
  const saved = initialSelected.filter((k) => k !== orgKey && k !== guestKey);
  const independent = specific.filter(
    (a) =>
      audienceCoverage(data, a, keys, people).length ||
      inherited[contentAudienceKey(a)]?.length,
  );
  return (
    <div className="grid gap-4">
      {organization && (
        <div
          className="grid gap-3 sm:grid-cols-2"
          role="group"
          aria-label="Audience scope"
        >
          <Field
            orientation="horizontal"
            variant="choice"
            className="items-start"
          >
            <Radio
              name="audience-scope"
              value="organization"
              aria-label="Organization"
              checked={org}
              disabled={disabled}
              onChange={() => {
                parked.current = selected.filter((k) => k !== orgKey);
                changeSelection([
                  ...selected.filter(
                    (k) => initialSelected.includes(k) || k === guestKey,
                  ),
                  orgKey!,
                ]);
              }}
            />
            <span>
              Organization
              <FieldDescription>
                Everyone registered, now and in future.
              </FieldDescription>
            </span>
          </Field>
          <Field
            orientation="horizontal"
            variant="choice"
            className="items-start"
          >
            <Radio
              name="audience-scope"
              value="specific"
              aria-label="Specific teams or groups"
              checked={!org}
              disabled={disabled}
              onChange={() =>
                changeSelection(
                  [
                    ...new Set([
                      ...(parked.current || selected),
                      ...selected.filter((k) => k !== orgKey),
                    ]),
                  ].filter((k) => k !== orgKey),
                )
              }
            />
            <span>
              Specific teams or groups
              <FieldDescription>Choose one or more audiences.</FieldDescription>
            </span>
          </Field>
        </div>
      )}
      {guest ? (
        <Field
          orientation="horizontal"
          className="items-start border-b border-border pb-4"
        >
          <Checkbox
            id="audience-public-guests"
            aria-label="Also include public guests"
            checked={selected.includes(guestKey!)}
            disabled={disabled}
            onCheckedChange={(checked) => toggle(guestKey!, checked === true)}
            aria-describedby="audience-public-guests-help"
          />
          <span>
            Also include public guests
            <FieldDescription id="audience-public-guests-help">
              Uses {guest.name}.
              {showPeople && people.get(guestKey!)?.size
                ? ` Also includes ${people.get(guestKey!)!.size} registered ${people.get(guestKey!)!.size === 1 ? "person" : "people"}.`
                : ""}{" "}
              Guests have no due dates or tracked completion.
              {inherited[guestKey!]?.length
                ? ` Already included through ${inherited[guestKey!].join(", ")}; removing this direct choice keeps those recommendations.`
                : ""}
            </FieldDescription>
          </span>
        </Field>
      ) : (
        data.settings?.access === "public" && (
          <p className="text-sm text-muted-foreground">
            Guest recommendations aren’t configured. Choose a group in Access
            settings.
          </p>
        )
      )}
      {org ? (
        <div className="grid gap-1 rounded-md bg-surface p-4">
          <p>All {directPeople.size} registered people</p>
          <p className="text-sm text-muted-foreground">
            Includes every team, people without a team, and future members. You
            don’t need to select smaller audiences.
          </p>
        </div>
      ) : (
        <section className="grid gap-3" aria-label="Teams and groups">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-sm font-medium">Teams and groups</h3>
            {showPeople && (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {totalPeople.size}{" "}
                {totalPeople.size === 1 ? "person" : "people"}{" "}
                {newPeople === 0 && existingPeople.size > 0
                  ? recommendationsOnly
                    ? "already included"
                    : "already assigned"
                  : "in audience"}
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {existingPeople.size}{" "}
            {existingPeople.size === 1 ? "person" : "people"}{" "}
            {recommendationsOnly ? "already included" : "already assigned"}
            {existingAudienceKeys ? " across selected learning" : ""} ·{" "}
            {newPeople} newly included
          </p>
          <SearchField>
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a team or group"
              aria-label="Find a team or group"
              disabled={disabled}
            />
          </SearchField>
          <SelectionViewport aria-label="Matching audiences">
            {candidates.map((candidate) => {
              const key = contentAudienceKey(candidate),
                label = `${candidate.kind === "team" ? "Team" : "Group"}: ${candidate.name}`;
              const direct = selected.includes(key),
                coverage = showPeople
                  ? audienceCoverage(data, candidate, keys, people)
                  : [];
              const through = inherited[key] || [];
              const coverageCurricula = [
                ...new Set(
                  coverage.flatMap(
                    (a) => inherited[contentAudienceKey(a)] || [],
                  ),
                ),
              ];
              const overlap =
                showPeople && !coverage.length
                  ? audienceMemberCoverage(data, candidate, keys, people)
                  : [];
              const included =
                !direct &&
                (through.length > 0 ||
                  (candidate.kind === "team" && coverage.length > 0));
              return (
                <Field
                  key={key}
                  orientation="horizontal"
                  className={`border-b border-border py-3 font-normal${included ? " text-muted-foreground" : ""}`}
                >
                  {included ? (
                    <span aria-label={`${label} included`}>
                      <Check className="size-4" aria-hidden="true" />
                    </span>
                  ) : (
                    <Checkbox
                      aria-label={`Assign directly to ${label}`}
                      checked={direct}
                      disabled={disabled}
                      onCheckedChange={(checked) =>
                        toggle(key, checked === true)
                      }
                    />
                  )}
                  <span className="min-w-0 flex-1">
                    <span>
                      {candidate.name}{" "}
                      <span className="text-xs text-muted-foreground">
                        {candidate.kind === "team" ? "Team" : "Group"}
                        {included && " · Included"}
                      </span>
                    </span>
                    {through.length > 0 && (
                      <FieldDescription>
                        Assigned through{" "}
                        {through.length === 1 ? "curriculum" : "curricula"}:{" "}
                        {through.join(", ")}
                      </FieldDescription>
                    )}
                    {coverage.length > 0 && candidate.kind === "team" && (
                      <FieldDescription>
                        {coverage
                          .map((a) =>
                            a.kind === "group"
                              ? `Included in group: ${a.name}`
                              : `Included through team: ${a.name}`,
                          )
                          .join(" · ")}
                      </FieldDescription>
                    )}
                    {coverageCurricula.length > 0 &&
                      candidate.kind === "team" && (
                        <FieldDescription>
                          Course assigned through{" "}
                          {coverageCurricula.length === 1
                            ? "curriculum"
                            : "curricula"}
                          : {coverageCurricula.join(", ")}
                        </FieldDescription>
                      )}
                    {!included &&
                      !direct &&
                      (candidate.kind === "group"
                        ? coverage.length > 0
                        : overlap.length > 0) && (
                        <FieldDescription>
                          Current members already included · select to include
                          future members.
                        </FieldDescription>
                      )}
                    {direct && (through.length > 0 || coverage.length > 0) && (
                      <FieldDescription>
                        {initialSelected.includes(key)
                          ? "Saved separately"
                          : "Selected independently"}{" "}
                        · removing this choice keeps other assignments.
                      </FieldDescription>
                    )}
                  </span>
                  {showPeople && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {people.get(key)?.size || 0}{" "}
                      {people.get(key)?.size === 1 ? "person" : "people"}
                    </span>
                  )}
                </Field>
              );
            })}
            {!candidates.length && (
              <p className="py-4 text-sm text-muted-foreground">
                {query
                  ? "No matching teams or groups."
                  : "No teams or groups available."}
              </p>
            )}
          </SelectionViewport>
          <div
            className="flex h-8 items-center justify-between gap-3 text-xs text-muted-foreground"
            aria-label="Selected audiences"
          >
            <span
              className="truncate"
              title={selected
                .map(
                  (k) =>
                    all.find((a) => contentAudienceKey(a) === k)?.name || k,
                )
                .join(", ")}
            >
              {selected.length
                ? `Selected: ${selected.map((k) => all.find((a) => contentAudienceKey(a) === k)?.name || "Unavailable audience").join(", ")}`
                : existingPeople.size > 0
                  ? "No additional audiences selected"
                  : "No teams or groups selected"}
            </span>
            <Button
              type="button"
              variant="link"
              size="sm"
              className={query ? "shrink-0" : "invisible shrink-0"}
              tabIndex={query ? 0 : -1}
              disabled={disabled}
              onClick={() => setQuery("")}
            >
              Clear search
            </Button>
          </div>
        </section>
      )}
      {org && saved.length > 0 && (
        <section className="grid gap-3 border-t border-border pt-4">
          <h3 className="text-sm font-medium">Separately saved audiences</h3>
          <p className="text-xs text-muted-foreground">
            These were saved before this edit. They stay selected alongside
            Organization until you remove them.
          </p>
          {saved.map((key) => (
            <div className="flex items-center justify-between gap-3" key={key}>
              <span className="text-sm">
                {all.find((a) => contentAudienceKey(a) === key)?.name ||
                  "Unavailable audience"}
              </span>
              <Button
                type="button"
                variant="link"
                size="sm"
                disabled={disabled}
                onClick={() => toggle(key, !selected.includes(key))}
              >
                {selected.includes(key) ? "Remove" : "Undo removal"}
                <span className="sr-only">
                  {" "}
                  {all.find((a) => contentAudienceKey(a) === key)?.name}
                </span>
              </Button>
            </div>
          ))}
        </section>
      )}
      {curricula.length > 0 && (
        <section className="grid gap-2 border-t border-border pt-4">
          <h3 className="text-sm font-medium">
            Assigned through{" "}
            {curricula.length === 1 ? "curriculum" : "curricula"}:{" "}
            {curricula.join(", ")}
          </h3>
          <p className="text-xs text-muted-foreground">
            These assignments stay in place. To change them, edit the curriculum
            in Curricula.
          </p>
        </section>
      )}
      {showPeople && independent.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="link" size="sm" disabled={disabled}>
              Keep an audience independently
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="grid gap-3 pt-3">
            <p className="text-xs text-muted-foreground">
              An independent audience continues if its covering group, team or
              curriculum is removed later.
            </p>
            {independent.map((a) => (
              <Field orientation="horizontal" key={contentAudienceKey(a)}>
                <Checkbox
                  disabled={disabled}
                  checked={selected.includes(contentAudienceKey(a))}
                  onCheckedChange={(checked) =>
                    toggle(contentAudienceKey(a), checked === true, true)
                  }
                  aria-label={`Keep ${a.name} independently`}
                />
                <span>{a.name}</span>
              </Field>
            ))}
          </CollapsibleContent>
        </Collapsible>
      )}
      {selected
        .filter((k) => !all.some((a) => contentAudienceKey(a) === k))
        .map((key) => (
          <Field key={key} orientation="horizontal">
            <Checkbox
              checked
              disabled={disabled}
              onCheckedChange={() => toggle(key, false)}
              aria-label={`Keep unavailable audience ${key}`}
            />
            <span>
              Audience no longer exists
              <FieldDescription>
                Uncheck to remove this saved audience.
              </FieldDescription>
            </span>
          </Field>
        ))}
      <p className="text-xs text-muted-foreground">
        Everyone allowed into this installation can still read published
        content.
      </p>
      {showPeople && (
        <p className="sr-only" aria-live="polite">
          {audienceSummary(data, keys, people)}
        </p>
      )}
    </div>
  );
}
