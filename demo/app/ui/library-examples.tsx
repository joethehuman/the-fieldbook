"use client";
import { useState } from "react";
import { HierarchyList } from "@/components/patterns/hierarchy-list";
import { HierarchyBrowser } from "@/components/patterns/hierarchy-browser";
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

export function LibraryExamples() {
  const [selectedTeam, setSelectedTeam] = useState<string[]>([]);
  const [browserBranch, setBrowserBranch] = useState("");
  const [browserQuery, setBrowserQuery] = useState("");
  const [browserSelection, setBrowserSelection] = useState<string[]>([]);
  const [selectBrowserTeams, setSelectBrowserTeams] = useState(false);
  const [selectedContent, setSelectedContent] = useState<string[]>([]);
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
        </ActionGroup>
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
          options={Array.from({ length: 100 }, (_, index) => ({
            id: `catalog-content-${index}`,
            label: `${["Discovery", "Security", "Customer success", "Product knowledge"][index % 4]} ${String(index + 1).padStart(3, "0")}`,
            type:
              index % 10 === 0 ? ("curriculum" as const) : ("course" as const),
            category:
              index % 10 === 0
                ? undefined
                : ["Sales", "Operations", "Customer success", "Product"][
                    index % 4
                  ],
            description:
              index % 10 === 0
                ? "A collection of related courses"
                : "A concise introduction for new and experienced learners",
            searchText: `Published lesson about product discovery scenario ${index + 1}`,
            updatedAt:
              index % 10 === 0
                ? undefined
                : new Date(Date.UTC(2026, 8, 1 + index)).toISOString(),
          }))}
        />
      </SettingsSection>
      <SettingsSection
        id="catalog-hierarchy"
        title={<h3>Reporting hierarchy</h3>}
        guidance="Browse subteams in bounded horizontal columns. A twelve-level branch keeps its ancestors in the path; Open and Edit are explicit row actions. Search finds teams across every branch. Selection uses one flat list without selecting descendants."
      >
        <HierarchyBrowser
          label="Example reporting teams"
          branchId={browserBranch}
          onBrowse={setBrowserBranch}
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
              meta: "120 people · 2 subteams",
            },
            {
              id: "success",
              label: "Customer success",
              description: "Manager: Sam Lee",
              meta: "45 people · No subteams",
            },
            {
              id: "emea",
              parentId: "revenue",
              label: "Europe, Middle East and Africa",
              description: "Manager: Jordan Lee",
              meta: "52 people · No subteams",
            },
            ...Array.from({ length: 12 }, (_, index) => ({
              id: `level-${index + 1}`,
              parentId: index ? `level-${index}` : "revenue",
              label:
                index === 0
                  ? "North America"
                  : `Level ${index + 1} regional team`,
              description: "Manager: Casey Rivera",
              meta:
                index === 11
                  ? "6 people · No subteams"
                  : "68 people · 1 subteam",
            })),
            ...Array.from({ length: 18 }, (_, index) => ({
              id: `sibling-${index}`,
              parentId: "level-2",
              label: `Enterprise territory ${index + 1}`,
              description: "Manager: Unassigned",
              meta: "4 people · No subteams",
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
        </div>
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
