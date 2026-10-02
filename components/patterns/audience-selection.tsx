"use client";
import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import type { Workspace } from "@/lib/store";
import {
  audienceOptions,
  audienceCoverage,
  audiencePeople,
  audienceSummary,
  contentAudienceKey,
} from "@/lib/content-audiences";
import { Checkbox } from "../ui/choice";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Field, FieldDescription } from "../ui/field";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableContainer,
} from "../ui/table";
import { DataTable } from "./data-table";
import { SearchField } from "./search-field";
import { Pagination } from "./pagination";

/** Shared audience selection; callers own draft/publication or governance writes. */
export function AudienceSelection({
  data,
  selected,
  onChange,
  disabled,
  inherited = {},
  showPeople = true,
}: {
  data: Workspace;
  selected: string[];
  onChange: (keys: string[]) => void;
  disabled?: boolean;
  inherited?: Record<string, string[]>;
  showPeople?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const all = audienceOptions(data);
  const peopleByAudience = useMemo(
    () => audiencePeople(data),
    [data.users, data.groups, data.teams],
  );
  const guest = all.find((a) => a.publicGuests);
  const keys = [...new Set([...selected, ...Object.keys(inherited)])];
  const candidates = all.filter(
    (a) =>
      !a.publicGuests &&
      `${a.kind}: ${a.name}${a.organization ? " everyone in the organization" : ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(candidates.length / 10)),
  );
  const toggle = (key: string, checked: boolean) =>
    onChange(
      checked
        ? [...new Set([...selected, key])]
        : selected.filter((id) => id !== key),
    );
  return (
    <>
      <SearchField>
        <Input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Search teams or groups"
          aria-label="Find a team or group"
          disabled={disabled}
        />
      </SearchField>
      <TableContainer>
        <DataTable
          layout="assignmentGroups"
          aria-label="Team and group assignments"
        >
          <TableHeader>
            <TableRow>
              <TableHead>
                <span className="sr-only">Assign</span>
              </TableHead>
              <TableHead>Team or group</TableHead>
              <TableHead>{showPeople ? "People" : ""}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates
              .slice((currentPage - 1) * 10, currentPage * 10)
              .map((candidate) => {
                const key = contentAudienceKey(candidate);
                const label = `${candidate.kind === "team" ? "Team" : "Group"}: ${candidate.name}`;
                const direct = selected.includes(key);
                const through = inherited[key] || [];
                const coverage = showPeople
                  ? audienceCoverage(data, candidate, keys, peopleByAudience)
                  : [];
                const included = through.length > 0 || coverage.length > 0;
                const organization = coverage.find((a) => a.organization);
                const reason = through.length
                  ? `Included through ${through.join(", ")}.`
                  : organization
                    ? "Included through Organization."
                    : candidate.kind === "team"
                      ? `Included through ${coverage.map((a) => a.name).join(", ")}.`
                      : "Everyone currently in this group is already included.";
                const people = peopleByAudience.get(key)?.size || 0;
                return (
                  <TableRow key={key}>
                    <TableCell>
                      {included && !direct ? (
                        <span aria-label={`${label} included`}>
                          <Check className="size-4" aria-hidden="true" />
                        </span>
                      ) : (
                        <Checkbox
                          aria-label={`Assign directly to ${label}`}
                          aria-describedby={`audience-${candidate.kind}-${candidate.id}`}
                          checked={direct}
                          disabled={disabled}
                          onCheckedChange={(checked) =>
                            toggle(key, checked === true)
                          }
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <span>{label}</span>
                      <div
                        id={`audience-${candidate.kind}-${candidate.id}`}
                        className="text-xs text-muted-foreground"
                      >
                        {candidate.organization && (
                          <p>
                            Everyone in the organization, including future
                            members.
                          </p>
                        )}
                        {included && (
                          <p>
                            {reason}
                            {direct
                              ? " Separate assignment retained; uncheck to remove it."
                              : ""}
                          </p>
                        )}
                        {included && !direct && (
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            disabled={disabled}
                            onClick={() => toggle(key, true)}
                          >
                            Assign separately
                            <span className="sr-only"> to {label}</span>
                          </Button>
                        )}
                        {included &&
                          !direct &&
                          candidate.kind === "group" &&
                          !organization &&
                          !through.length && (
                            <p>
                              A separate assignment also covers future group
                              members.
                            </p>
                          )}
                      </div>
                    </TableCell>
                    <TableCell>{showPeople ? people : ""}</TableCell>
                  </TableRow>
                );
              })}
          </TableBody>
        </DataTable>
      </TableContainer>
      {showPeople &&
        selected
          .filter((key) => !all.some((a) => contentAudienceKey(a) === key))
          .map((key) => (
            <Field key={key} orientation="horizontal">
              <Checkbox
                checked
                disabled={disabled}
                onCheckedChange={() => toggle(key, false)}
                aria-label={`Keep unavailable audience ${key}`}
              />
              <div>
                Audience no longer exists
                <FieldDescription>
                  Uncheck to remove this saved audience.
                </FieldDescription>
              </div>
            </Field>
          ))}
      {!candidates.length && (
        <p className="text-copy text-muted-foreground">
          {all.length
            ? "No matching teams or groups."
            : "Create a team or group before assigning content."}
        </p>
      )}
      <Pagination
        page={currentPage}
        pageSize={10}
        total={candidates.length}
        onPageChange={setPage}
        label="Teams and groups"
      />
      {guest && (
        <Field orientation="horizontal">
          <Checkbox
            id="audience-public-guests"
            aria-label="Public guests"
            checked={selected.includes(contentAudienceKey(guest))}
            disabled={disabled}
            onCheckedChange={(checked) =>
              toggle(contentAudienceKey(guest), checked === true)
            }
            aria-describedby="audience-public-guests-help"
          />
          <div>
            <span>Public guests</span>
            <FieldDescription id="audience-public-guests-help">
              Use Group: {guest.name} for anonymous recommendations. Guests have
              no completion requirement or due date.
              {inherited[contentAudienceKey(guest)]?.length
                ? ` Already included through ${inherited[contentAudienceKey(guest)].join(", ")}; removing this selection keeps those recommendations.`
                : ""}
            </FieldDescription>
          </div>
        </Field>
      )}
      {showPeople && (
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {audienceSummary(data, keys, peopleByAudience)}
        </p>
      )}
    </>
  );
}
