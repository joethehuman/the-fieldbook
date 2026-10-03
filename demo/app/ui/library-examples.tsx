"use client";
import { GroupedSearch } from "@/components/patterns/grouped-search";
import { ProgressOverview } from "@/components/patterns/progress-overview";
import { AudienceSelection } from "@/components/patterns/audience-selection";
import { freshWorkspace } from "@/lib/store";
import { RosterReviewPanel } from "@/components/RosterImport";
import { reviewRosterCsv, rosterExample } from "@/lib/roster-import";
import { serializeCsv } from "@/lib/csv";
import { useState } from "react";
import { HierarchyList } from "@/components/patterns/hierarchy-list";
import { HierarchyPicker } from "@/components/patterns/hierarchy-picker";
import { HierarchyBrowser } from "@/components/patterns/hierarchy-browser";
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { BulkActions } from "@/components/patterns/bulk-actions";
import {
  SelectRows,
  useBulkSelection,
} from "@/components/patterns/bulk-selection";
import { DataTable } from "@/components/patterns/data-table";
import {
  TableContainer,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ContentSelectionList } from "@/components/patterns/content-selection-list";
import { SearchableSelectionList } from "@/components/patterns/searchable-selection-list";
import { useRevealTarget } from "@/components/patterns/use-reveal-target";
import { ContentFeedback } from "@/components/patterns/content-feedback";
import { Settings, Plus } from "lucide-react";
import { CollectionControls } from "@/components/patterns/collection-controls";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/patterns/form-field";
import { SettingsSection } from "@/components/patterns/settings-section";
import { LoadMore } from "@/components/patterns/load-more";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select";
import { Checkbox, Radio } from "@/components/ui/choice";
import { Field, FieldGroup } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Tooltip } from "@/components/ui/tooltip";
import { Note } from "@/components/ui/note";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { PublicationStatus } from "@/components/patterns/publication-status";
import { EditorSaveStatus } from "@/components/patterns/editor-save-status";
import {
  Progress,
  ProgressRing,
  ProgressStatus,
} from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ActionGroup } from "@/components/ui/action-group";

function AudienceSelectionExample() {
  const [selected, setSelected] = useState<string[]>(["team:organization"]);
  const [data] = useState(() => ({
    ...freshWorkspace(),
    settings: {
      ...freshWorkspace().settings!,
      access: "public" as const,
      guestGroupId: "visitors",
    },
    groups: [
      { id: "visitors", name: "Visitors" },
      { id: "sales", name: "Account executives" },
    ],
    teams: [
      {
        id: "organization",
        name: "Organization",
        system: "organization" as const,
      },
      { id: "sales", name: "Sales", parentId: "organization" },
    ],
    users: freshWorkspace().users.map((user) => ({
      ...user,
      teamId: "sales",
      groups: ["sales"],
    })),
  }));
  return (
    <section>
      <h3>Content audiences</h3>
      <AudienceSelection
        data={data}
        selected={selected}
        initialSelected={["team:sales"]}
        onChange={setSelected}
      />
    </section>
  );
}

export function LibraryExamples() {
  const [progressStatus, setProgressStatus] = useState("all");
  const [selectedTeam, setSelectedTeam] = useState<string[]>([]);
  const [browserBranch, setBrowserBranch] = useState("");
  const [browserQuery, setBrowserQuery] = useState("");
  const [browserSelection, setBrowserSelection] = useState<string[]>([]);
  const [selectBrowserTeams, setSelectBrowserTeams] = useState(false);
  const [selectedContent, setSelectedContent] = useState<string[]>([]);
  const [contentPickerOpen, setContentPickerOpen] = useState(false);
  const [contentDraft, setContentDraft] = useState<string[]>([]);
  const contentOptions = Array.from({ length: 100 }, (_, index) => ({
    id: `catalog-content-${index}`,
    label: `${["Discovery", "Security", "Customer success", "Product knowledge"][index % 4]} ${String(index + 1).padStart(3, "0")}`,
    type: index % 10 === 0 ? ("curriculum" as const) : ("course" as const),
    category:
      index % 10 === 0
        ? undefined
        : ["Sales", "Operations", "Customer success", "Product"][index % 4],
    description:
      index % 10 === 0
        ? "A collection of related courses"
        : "A concise introduction for new and experienced learners",
    searchText: `Published lesson about product discovery scenario ${index + 1}`,
    updatedAt:
      index % 10 === 0
        ? undefined
        : new Date(Date.UTC(2026, 8, 1 + index)).toISOString(),
  }));
  const [selectedPeople, setSelectedPeople] = useState<string[]>([]);
  const progressTarget = useRevealTarget<HTMLElement>();
  const [feedback, setFeedback] = useState<{
    rating: "up" | "down";
    comment: string;
  }>();
  const [failFeedback, setFailFeedback] = useState(false);
  const [choice, setChoice] = useState("long");
  const [enabled, setEnabled] = useState(false);
  const [count, setCount] = useState(10);
  const [message, setMessage] = useState("");
  return (
    <section
      id="shared-library"
      aria-label="Shared library states"
      className="grid min-w-0 gap-6"
    >
      <h2>Shared library states and usage</h2>
      <AudienceSelectionExample />
      <div>
        <Button variant="outline" onClick={() => progressTarget.reveal()}>
          View progress examples
        </Button>
        <p className="mt-2 text-copy text-muted-foreground">
          Drill-ins bring their destination into view and move focus; reduced
          motion skips the animation.
        </p>
      </div>
      <SettingsSection
        id="catalog-settings"
        title={<h3>Fields and choices</h3>}
        guidance="Keep persistent guidance next to the control. Use a switch for immediate on/off behavior; use checkboxes for form choices saved together."
      >
        <FormField
          label="Long selection"
          description="Selected labels wrap; arrow keys and typeahead remain available."
        >
          <SelectField value={choice} onValueChange={setChoice}>
            <option value="short">Short label</option>
            <option value="long">
              Customer experience and technical enablement across all regions
            </option>
            <option value="disabled" disabled>
              Unavailable selection
            </option>
          </SelectField>
        </FormField>
        <FormField
          label="Disabled selection"
          description="An unavailable control retains its value."
        >
          <SelectField disabled value="short" onValueChange={() => {}}>
            <option value="short">Saved selection</option>
          </SelectField>
        </FormField>
        <FormField
          label="Description"
          description="Explain the purpose in one or two sentences."
        >
          <Textarea defaultValue="A clear introduction to the course." />
        </FormField>
        <FormField
          label="Invalid description"
          description="Required before publishing."
          error="Enter a description."
        >
          <Textarea defaultValue="" />
        </FormField>
        <FormField label="Disabled description">
          <Textarea disabled defaultValue="Saved description" />
        </FormField>
        <FieldGroup>
          <legend>Form choices</legend>
          <Field orientation="horizontal">
            <Checkbox defaultChecked />
            Include this course in the selected group
          </Field>
          <Field orientation="horizontal">
            <Checkbox checked="indeterminate" />
            Some choices selected
          </Field>
          <Field orientation="horizontal">
            <Checkbox disabled />
            Unavailable choice
          </Field>
        </FieldGroup>
        <FieldGroup>
          <legend>Single choice</legend>
          <Field orientation="horizontal">
            <Radio name="catalog-choice" value="one" defaultChecked />
            First option
          </Field>
          <Field orientation="horizontal">
            <Radio name="catalog-choice" value="two" />
            Second option with a longer label that can wrap onto another line
          </Field>
        </FieldGroup>
        <Field orientation="horizontal">
          <Switch
            checked={enabled}
            onCheckedChange={(checked) => setEnabled(checked === true)}
          />
          Hide completed example
        </Field>
        <Field orientation="horizontal">
          <Switch disabled checked />
          Unavailable switch
        </Field>
      </SettingsSection>
      <SettingsSection
        id="catalog-feedback"
        title={<h3>Information and actions</h3>}
        guidance="Notes provide context. Alerts announce new errors or results. Tooltips supplement an already named action; they never hide required instructions."
      >
        <Note>
          Published content is available to everyone allowed into the
          installation.
        </Note>
        <Note tone="warning">
          Changing a completion window recalculates targets for everyone.
        </Note>
        <Alert variant="destructive">
          The example could not be saved. Review the fields and try again.
        </Alert>
        <Alert variant="success">Example changes saved.</Alert>
        <ActionGroup>
          <Badge>Draft</Badge>
          <Badge variant="success">Published</Badge>
          <Badge variant="warning">Needs attention</Badge>
          <Badge variant="destructive">Failed</Badge>
        </ActionGroup>
        <ActionGroup aria-label="Publication status examples">
          <PublicationStatus published={false} />
          <PublicationStatus published />
          <PublicationStatus published hasUnpublishedChanges />
          <PublicationStatus published hasUnpublishedChanges layout="inline" />
        </ActionGroup>
        <div className="grid gap-3" aria-label="Editor save status examples">
          <EditorSaveStatus status="Not saved" published={false} />
          <EditorSaveStatus status="Saved" published={false} />
          <EditorSaveStatus status="Saved" published />
          <EditorSaveStatus status="Saved" published hasUnpublishedChanges />
          <EditorSaveStatus status="Saving…" published hasUnpublishedChanges />
          <EditorSaveStatus status="Changes not saved" published failed />
        </div>
        <p className="text-copy text-muted-foreground">
          Badges hold a short, single-line status. Keep details such as draft
          changes outside the pill.
        </p>
        <ActionGroup>
          <Tooltip content="Open example settings">
            <Button aria-label="Example settings" size="icon" variant="outline">
              <Settings aria-hidden="true" />
            </Button>
          </Tooltip>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">Example actions</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onSelect={() => setMessage("Example renamed.")}>
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem disabled>Unavailable action</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setMessage("Example archived.")}
              >
                Archive example
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </ActionGroup>
        <p role="status">{message}</p>
      </SettingsSection>
      <SettingsSection
        id="catalog-member-selection"
        title={<h3>Searchable member selection</h3>}
        guidance="Use for selecting existing people. Search and pagination retain selections; the feature reviews team moves before applying them."
      >
        <SearchableSelectionList
          label="Find example people"
          value={selectedPeople}
          onChange={setSelectedPeople}
          options={Array.from({ length: 32 }, (_, index) => ({
            id: String(index),
            label: `Example person ${index + 1}`,
            description: `person${index + 1}@example.test · Sample team`,
          }))}
        />
      </SettingsSection>
      <SettingsSection
        id="catalog-content-selection"
        title={<h3>Content assignment picker</h3>}
        guidance="Browse 100 items by recent updates, category and content type, or search across published content. Selections stay checked across filters, sorting and pages."
      >
        <ContentSelectionList
          value={selectedContent}
          onChange={setSelectedContent}
          showTypeFilter
          options={contentOptions}
        />
        <Button
          variant="outline"
          onClick={() => {
            setContentDraft(selectedContent);
            setContentPickerOpen(true);
          }}
        >
          Open assignment picker
        </Button>
        <Dialog open={contentPickerOpen} onOpenChange={setContentPickerOpen}>
          <DialogContent size="workflow-list">
            <DialogTitle>Assign example content</DialogTitle>
            <DialogDescription>
              Search published content. The result area scrolls while controls
              and actions stay in place.
            </DialogDescription>
            <DialogBody>
              <ContentSelectionList
                bounded
                showTypeFilter
                options={contentOptions}
                value={contentDraft}
                onChange={setContentDraft}
              />
            </DialogBody>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setContentPickerOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setSelectedContent(contentDraft);
                  setContentPickerOpen(false);
                }}
              >
                Apply selection
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SettingsSection>
      <GroupIndexExample />
      <GroupRosterExample />
      <FilterRowsExample />
      <HierarchyPickerExample />
      <RosterReviewExample />
      <SettingsSection
        id="catalog-hierarchy"
        title={<h3>Reporting hierarchy</h3>}
        guidance="Compact teams form one horizontal chart across every explored level. Choose a sibling to replace the downstream branch; scroll back to any earlier level. Open and Edit are explicit actions. Search and bulk selection use a flat list."
      >
        <HierarchyBrowser
          label="Example reporting teams"
          branchId={browserBranch}
          onBrowse={(id) => {
            setBrowserBranch(id);
            setBrowserQuery("");
            setSelectBrowserTeams(false);
            setBrowserSelection([]);
          }}
          onOpen={(id) => setMessage(`Open team roster: ${id}`)}
          onEdit={(id) => setMessage(`Edit team: ${id}`)}
          query={browserQuery}
          onQueryChange={setBrowserQuery}
          primaryAction={
            <Button
              onClick={() => setMessage("Create a team in this example.")}
            >
              <Plus aria-hidden="true" /> Add team
            </Button>
          }
          secondaryActions={
            <Button
              variant="ghost"
              onClick={() => setSelectBrowserTeams(!selectBrowserTeams)}
            >
              {selectBrowserTeams ? "Done selecting" : "Select teams"}
            </Button>
          }
          selected={selectBrowserTeams ? browserSelection : undefined}
          onSelectionChange={setBrowserSelection}
          selectionActions={
            selectBrowserTeams ? (
              <p role="status">{browserSelection.length} selected</p>
            ) : undefined
          }
          items={[
            {
              id: "revenue",
              label: "Revenue",
              description: "Manager: Alex Morgan",
              directMemberCount: 120,
            },
            {
              id: "success",
              label: "Customer success",
              description: "Manager: Sam Lee",
              directMemberCount: 45,
            },
            {
              id: "emea",
              parentId: "revenue",
              label: "Europe, Middle East and Africa",
              description: "Manager: Jordan Lee",
              directMemberCount: 52,
            },
            {
              id: "emea-enterprise",
              parentId: "emea",
              label: "Enterprise customer teams across Europe",
              description: "Manager: Jordan Lee",
              directMemberCount: 18,
            },
            ...Array.from({ length: 12 }, (_, index) => ({
              id: `level-${index + 1}`,
              parentId: index ? `level-${index}` : "revenue",
              label:
                index === 0
                  ? "North America"
                  : `Level ${index + 1} regional team`,
              description: "Manager: Casey Rivera",
              directMemberCount: index === 11 ? 6 : 68,
            })),
            ...Array.from({ length: 18 }, (_, index) => ({
              id: `sibling-${index}`,
              parentId: "level-2",
              label: `Enterprise territory ${index + 1}`,
              description: "Manager: Unassigned",
              directMemberCount: 4,
            })),
          ]}
        />
        <CollectionControls
          search={
            <FormField
              label="Find a person in the example team"
              visuallyHiddenLabel
            >
              <Input type="search" placeholder="Find a person in this team" />
            </FormField>
          }
          primaryAction={
            <Button
              onClick={() => setMessage("Add members to this example team.")}
            >
              <Plus aria-hidden="true" /> Add Members
            </Button>
          }
          sortLabel="Name A–Z"
          sort={
            <FormField label="Example member order">
              <SelectField value="name" onValueChange={() => {}}>
                <option value="name">Name A–Z</option>
              </SelectField>
            </FormField>
          }
        />
        <HierarchyList
          label="Example teams"
          onOpen={(id) => setMessage(`Open example team: ${id}`)}
          items={[
            {
              id: "company",
              label: "Commercial",
              description: "Manager: Alex Morgan",
              meta: "5 direct members · 1 subteam",
            },
            {
              id: "regional",
              parentId: "company",
              label: "Regional account executives with a longer team name",
              description: "Manager: Sam Lee",
              meta: "50 direct members",
            },
            {
              id: "success",
              label: "Customer success",
              description: "Manager: Unassigned",
              meta: "12 direct members",
            },
          ]}
        />
        <SearchableSelectionList
          label="Choose an example parent"
          selectionMode="single"
          placeholder="Team name"
          emptyMessage="No matching teams."
          value={selectedTeam}
          onChange={setSelectedTeam}
          options={[
            {
              id: "top",
              label: "Top-level team",
              description: "Keep the branch; remove its parent.",
            },
            {
              id: "company",
              label: "Commercial",
              description: "Organization / Commercial",
            },
          ]}
        />
      </SettingsSection>
      <SettingsSection
        id="catalog-content-feedback"
        title={<h3>Content feedback</h3>}
        guidance="Use at the end of an article or course. Ratings save immediately. Send saves the optional plain-text comment. The compact form uses a desktop popover or expands on phones; a no-quiz finish screen can show the full form inline."
      >
        <Field orientation="horizontal">
          <Switch checked={failFeedback} onCheckedChange={setFailFeedback} />
          Simulate feedback save failure
        </Field>
        <ContentFeedback
          saved={feedback}
          onSave={async (rating, comment) => {
            await new Promise((resolve) => setTimeout(resolve, 700));
            if (failFeedback)
              throw new Error(
                "Could not save feedback. Turn off the simulated failure and try again.",
              );
            setFeedback({ rating, comment });
          }}
        />
        <p className="text-copy text-muted-foreground">
          Expanded course finish example
        </p>
        <ContentFeedback expanded onSave={async () => {}} />
        <p className="text-copy text-muted-foreground">Disabled example</p>
        <ContentFeedback disabled onSave={() => {}} />
      </SettingsSection>
      <SettingsSection
        {...progressTarget.targetProps}
        id="catalog-progress"
        title={<h3>Progress and loading</h3>}
        guidance="Progress measures known completion. Spinners and skeletons indicate activity, never an invented percentage."
      >
        <div className="flex flex-wrap gap-6">
          <ProgressRing value={0} label="Not started example" />
          <ProgressRing value={67} label="Assigned example" />
          <ProgressRing value={100} label="Completed example" />
          <ProgressRing
            value={64}
            label="People up to date example"
            caption="up to date"
          />
          <ProgressRing value={null} label="No assigned people example" />
        </div>
        <FormField label="Search teams or people">
          <GroupedSearch
            placeholder="Search teams or people"
            options={[
              { id: "example-org", group: "Teams", label: "Organization" },
              {
                id: "example-sales",
                group: "Teams",
                label: "Sales",
                description: "Organization / Commercial / Sales",
              },
              ...Array.from({ length: 20 }, (_, index) => ({
                id: `example-person-${index}`,
                group: "People",
                label: `Example person ${index + 1}`,
                description: `person-${index + 1}@example.test · Sales`,
              })),
            ]}
            onSelect={() => {}}
          />
        </FormField>
        <ProgressOverview
          summary={{
            people: 54,
            assignedPeople: 50,
            current: 32,
            within: 12,
            overdue: 6,
            incomplete: 0,
            unassigned: 4,
            assignments: 150,
            completed: 120,
          }}
          deadlines
          status={progressStatus}
          onStatus={(value) =>
            setProgressStatus(value === progressStatus ? "all" : value)
          }
        />
        <Progress value={50} aria-label="Lesson example" />
        <ActionGroup>
          <ProgressStatus value={0} started={false} complete={false} />
          <ProgressStatus value={40} started complete={false} />
          <ProgressStatus value={100} started complete />
        </ActionGroup>
        <div role="status" className="flex items-center gap-2 text-copy">
          <Spinner />
          Loading example…
        </div>
        <Skeleton className="h-16" />
        <LoadMore
          shown={count}
          total={30}
          noun="examples"
          onLoadMore={() => setCount(Math.min(30, count + 10))}
        />
      </SettingsSection>
    </section>
  );
}

function FilterRowsExample() {
  const [filters, setFilters] = useState<number[]>([]);
  return (
    <SettingsSection
      id="catalog-filter-rows"
      title={<h3>Wrapping applied filters</h3>}
      guidance="Applied filters sit below search. The row grows with its contents, respects reduced motion and disappears when cleared. These synthetic filters demonstrate wrapping."
    >
      <CollectionControls
        animateFilterChanges
        search={
          <Input
            aria-label="Find example items"
            placeholder="Find example items"
          />
        }
        primaryAction={
          <Button
            onClick={() =>
              setFilters(Array.from({ length: 15 }, (_, index) => index + 1))
            }
          >
            Add example filters
          </Button>
        }
        filters={filters.map((id) => ({
          id: String(id),
          label: `Example filter ${id}`,
          onRemove: () =>
            setFilters((current) => current.filter((value) => value !== id)),
        }))}
        onClear={() => setFilters([])}
      />
      <h4>Example results</h4>
    </SettingsSection>
  );
}

/** Synthetic relationship roster: direct removal preserves linked-team inclusion. */
function GroupRosterExample() {
  const [rows, setRows] = useState([
    { id: "one", name: "Alex Example", direct: true, team: true },
    { id: "two", name: "Blair Example", direct: true, team: false },
    { id: "three", name: "Casey Example", direct: false, team: true },
  ]);
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("");
  const [reverse, setReverse] = useState(false);
  const matches = rows
    .filter(
      (row) =>
        row.name.toLowerCase().includes(query.toLowerCase()) &&
        (!source || (source === "direct" ? row.direct : row.team)),
    )
    .sort((a, b) =>
      reverse ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name),
    );
  const selection = useBulkSelection(
    JSON.stringify([query, source]),
    matches.map((row) => row.id),
  );
  return (
    <SettingsSection
      id="catalog-group-roster"
      title={<h3>Group People selection</h3>}
      guidance="Filter before paging. Only direct membership can be removed; linked-team inclusion remains. The feature owns its final consequence review."
    >
      <CollectionControls
        animateFilterChanges
        search={
          <FormField label="Find example group members">
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </FormField>
        }
        sortLabel={reverse ? "Name Z–A" : "Name A–Z"}
        sort={
          <FormField label="Sort example members">
            <SelectField
              value={reverse ? "reverse" : "name"}
              onValueChange={(value) => setReverse(value === "reverse")}
            >
              <option value="name">Name A–Z</option>
              <option value="reverse">Name Z–A</option>
            </SelectField>
          </FormField>
        }
        filters={
          source
            ? [
                {
                  id: "source",
                  label: source === "direct" ? "Direct" : "Team",
                  onRemove: () => setSource(""),
                },
              ]
            : []
        }
        onClear={() => {
          setQuery("");
          setSource("");
        }}
      >
        <FormField label="Example membership source">
          <SelectField value={source} onValueChange={setSource}>
            <option value="">All sources</option>
            <option value="direct">Direct</option>
            <option value="team">Team</option>
          </SelectField>
        </FormField>
      </CollectionControls>
      <BulkActions
        selected={selection.actionIds}
        collectionSize={matches.length}
        singleItemActions={false}
        noun="people"
        onSelectionChange={selection.setSelected}
        commands={[
          {
            id: "remove",
            label: "Remove direct members",
            description:
              "Linked-team inclusion remains after removing a direct link.",
            destructive: true,
            disabledReason: selection.actionIds.some(
              (id) => !rows.find((row) => row.id === id)?.direct,
            )
              ? "Select only people with Direct membership."
              : undefined,
            apply: (_, ids = []) =>
              setRows((current) =>
                current.flatMap((row) =>
                  !ids.includes(row.id)
                    ? [row]
                    : row.team
                      ? [{ ...row, direct: false }]
                      : [],
                ),
              ),
          },
        ]}
      />
      <TableContainer>
        <DataTable
          layout="groupMembersSelectable"
          aria-label="Example group members"
        >
          <TableHeader>
            <TableRow>
              <TableHead>
                {selection.canSelect && (
                  <SelectRows
                    ids={matches.map((row) => row.id)}
                    value={selection.selected}
                    onChange={selection.setSelected}
                  />
                )}
              </TableHead>
              <TableHead>Person</TableHead>
              <TableHead>Reporting team</TableHead>
              <TableHead>Included through</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matches.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  {selection.canSelect && (
                    <Checkbox
                      aria-label={`Select ${row.name}`}
                      checked={selection.selected.includes(row.id)}
                      onCheckedChange={(checked) =>
                        selection.toggle(row.id, checked === true)
                      }
                    />
                  )}
                </TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell>
                  {row.team ? "Example team" : "No reporting team"}
                </TableCell>
                <TableCell>
                  {[row.direct ? "Direct" : "", row.team ? "Team" : ""]
                    .filter(Boolean)
                    .join(" · ")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      </TableContainer>
    </SettingsSection>
  );
}

function HierarchyPickerExample() {
  const [parent, setParent] = useState("territory");
  const path = [
    "Organization",
    "Revenue",
    "Sales",
    "North America",
    "Enterprise",
    "West",
    "Pacific",
    "Territory",
  ];
  return (
    <SettingsSection
      id="catalog-hierarchy-picker"
      title={<h3>Searchable parent team</h3>}
      guidance="Search team names and every ancestor. Long paths keep the root and final segments; the complete hierarchy can be read in the picker or expanded below the selected parent."
    >
      <FormField label="Example parent team">
        <HierarchyPicker
          value={parent}
          onValueChange={setParent}
          searchLabel="Find an example parent team"
          options={[
            {
              id: "organization",
              label: "Organization",
              path: ["Organization"],
            },
            {
              id: "revenue",
              label: "Revenue",
              path: ["Organization", "Revenue"],
            },
            { id: "territory", label: "Territory", path },
            {
              id: "success",
              label: "Customer success",
              path: ["Organization", "Customer success"],
            },
          ]}
        />
      </FormField>
    </SettingsSection>
  );
}

function GroupIndexExample() {
  const [rows, setRows] = useState([
    { id: "ae", name: "Account executives", people: 120, courses: 8 },
    { id: "segment", name: "Startup segment", people: 45, courses: 4 },
    { id: "draft-audience", name: "New audience", people: 0, courses: 0 },
  ]);
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState("");
  const [sort, setSort] = useState("name");
  const matches = rows
    .filter(
      (row) =>
        row.name.toLowerCase().includes(query.toLowerCase()) &&
        (!people || (people === "with" ? row.people > 0 : row.people === 0)),
    )
    .sort(
      (a, b) =>
        (sort === "people" ? b.people - a.people : 0) ||
        a.name.localeCompare(b.name),
    );
  const selection = useBulkSelection(
    query + people,
    matches.map((row) => row.id),
  );
  return (
    <SettingsSection
      id="catalog-group-index"
      title={<h3>Learning-group directory</h3>}
      guidance="Filter and sort real audience counts before paging. Selection survives sort and page changes; discovery changes clear it. Deletion uses one consequence review, with saved learning history retained by the owner."
    >
      <CollectionControls
        search={
          <FormField label="Find an example group" visuallyHiddenLabel>
            <Input
              type="search"
              placeholder="Find a group"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </FormField>
        }
        sortLabel={sort === "people" ? "People: most first" : "Name A–Z"}
        sort={
          <FormField label="Sort example groups">
            <SelectField value={sort} onValueChange={setSort}>
              <option value="name">Name A–Z</option>
              <option value="people">People: most first</option>
            </SelectField>
          </FormField>
        }
        filters={
          people
            ? [
                {
                  id: "people",
                  label: people === "with" ? "With people" : "No people",
                  onRemove: () => setPeople(""),
                },
              ]
            : []
        }
        onClear={() => {
          setQuery("");
          setPeople("");
        }}
      >
        <FormField label="Example group membership">
          <SelectField value={people} onValueChange={setPeople}>
            <option value="">Any membership</option>
            <option value="with">With people</option>
            <option value="without">No people</option>
          </SelectField>
        </FormField>
      </CollectionControls>
      <BulkActions
        selected={selection.actionIds}
        collectionSize={matches.length}
        singleItemActions={false}
        noun="groups"
        onSelectionChange={selection.setSelected}
        commands={[
          {
            id: "delete",
            label: "Delete example groups",
            description: "Remove selected example audiences.",
            destructive: true,
            apply: (_, ids = []) =>
              setRows((current) =>
                current.filter((row) => !ids.includes(row.id)),
              ),
          },
        ]}
      />
      <TableContainer>
        <DataTable
          layout="learningGroupsSelectable"
          aria-label="Example learning groups"
        >
          <TableHeader>
            <TableRow>
              <TableHead>
                {selection.canSelect && (
                  <SelectRows
                    ids={matches.map((row) => row.id)}
                    value={selection.selected}
                    onChange={selection.setSelected}
                  />
                )}
              </TableHead>
              <TableHead>Group</TableHead>
              <TableHead align="right">People</TableHead>
              <TableHead align="right">Courses</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {matches.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  {selection.canSelect && (
                    <Checkbox
                      aria-label={`Select example ${row.name}`}
                      checked={selection.selected.includes(row.id)}
                      onCheckedChange={(checked) =>
                        selection.toggle(row.id, checked === true)
                      }
                    />
                  )}
                </TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell align="right">{row.people}</TableCell>
                <TableCell align="right">{row.courses}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </DataTable>
      </TableContainer>
    </SettingsSection>
  );
}

function RosterReviewExample() {
  const [open, setOpen] = useState(false);
  const [review] = useState(() =>
    reviewRosterCsv(serializeCsv(rosterExample()), freshWorkspace()),
  );
  return (
    <SettingsSection
      title={<h3>Roster review</h3>}
      description="Whole-file counts, stable discovery, paginated rows and inline consequences."
    >
      <Button variant="outline" onClick={() => setOpen(true)}>
        Open roster review example
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="workflow-list">
          <DialogTitle>Roster review example</DialogTitle>
          <DialogDescription>
            Synthetic read-only example. Nothing is saved.
          </DialogDescription>
          <DialogBody>
            <RosterReviewPanel review={review} />
          </DialogBody>
          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Close example</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}
