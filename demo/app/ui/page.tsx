"use client";
import { EditorFrame, EditorDetailsGroup } from "@/components/patterns/editor-frame";
import { NavigationButton } from "@/components/patterns/navigation-button";
import { ResponsiveTabsNavigation } from "@/components/patterns/responsive-tabs-navigation";
import { Spinner } from "@/components/ui/spinner";
import { DetailNavigation } from "@/components/patterns/detail-navigation";
import { BulkExamples } from "./bulk-examples";
import { WritingExamples } from "./writing-examples";
import { ImageViewerExamples } from "./image-viewer-examples";
import { LibraryExamples } from "./library-examples";
import { ControlExamples } from "./control-examples";
import { DocumentTree } from "@/components/patterns/document-tree";
import { Article } from "@/components/patterns/reading";
import { Course } from "@/components/Course";
import { seedContent } from "@/lib/seed";
import { useToast } from "@/components/ui/toast";
import { useInteractionDialog } from "@/components/ui/interaction-dialog";
import { CsvExport } from "@/components/patterns/csv-export";
import { SearchPanel } from "@/components/patterns/search-panel";
import { SearchExperience } from "@/components/SearchExperience";
import {
  SearchResultCard,
  SearchResultSkeleton,
} from "@/components/patterns/search-result";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { InstallationIdentity } from "@/components/patterns/installation-identity";
import { LearningCard } from "@/components/patterns/learning-card";
import { CardArtwork } from "@/components/patterns/card-artwork";
import { BrowseToolbar } from "@/components/patterns/layout";
import { LaunchList } from "@/components/patterns/launch-list";
import { CourseRow } from "@/components/patterns/course-row";

import { DataTable } from "@/components/patterns/data-table";
import { AccountMenu } from "@/components/patterns/account-menu";
import { ArrowRight, Layers, Settings } from "lucide-react";
import {
  ContentCardFooter,
  StatusActions,
  CollectionToolbar,
} from "@/components/patterns/layout";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/patterns/search-field";
import { FilterOptions } from "@/components/patterns/filter-options";
import {
  CollectionControls,
  CollectionEmpty,
} from "@/components/patterns/collection-controls";
import { FormField } from "@/components/patterns/form-field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGroup, FieldDescription } from "@/components/ui/field";
import { Checkbox, Radio } from "@/components/ui/choice";
import { SelectField } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Progress, ProgressStatus } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ActionGroup } from "@/components/ui/action-group";
import {
  PageHeader,
  Stack,
  SectionHeader,
  EmptyState,
  ReadingPage,
  SplitPanel,
} from "@/components/patterns/layout";
import { OrderedLearning } from "@/components/patterns/ordered-learning";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
} from "@/components/ui/table";

const choices = (
  <>
    <option value="">No parent</option>
    <option value="company">Company</option>
    <option value="sales">
      Sales and customer success with a deliberately long group name
    </option>
    <option value="disabled" disabled>
      Unavailable group
    </option>
  </>
);
export default function ComponentCatalog() {
  const notify = useToast();
  const { prompt } = useInteractionDialog();
  const [navigationPending, setNavigationPending] = useState(false);
  const [catalogLesson, setCatalogLesson] = useState("welcome");
  const [catalogTitle, setCatalogTitle] = useState("Welcome to Fieldbook");
  const [catalogBody, setCatalogBody] = useState("Write a short introduction to your course.");
  const [catalogPlacement, setCatalogPlacement] = useState("essentials");
  const [canvasRequest, setCanvasRequest] = useState(0);
  const [emptyReport, setEmptyReport] = useState(false);
  const [group, setGroup] = useState("company");
  const [dialog, setDialog] = useState(false);
  const [catalogFilter, setCatalogFilter] = useState("all");
  const [catalogCategory, setCatalogCategory] = useState("all");
  const [catalogStatus, setCatalogStatus] = useState("all");
  const [catalogSort, setCatalogSort] = useState("newest");
  const [collectionQuery, setCollectionQuery] = useState("");
  const [collectionStatus, setCollectionStatus] = useState("all");
  const [collectionSort, setCollectionSort] = useState("newest");
  const [items, setItems] = useState([
    "Company essentials",
    "Customer conversations",
    "Product foundations",
  ]);
  return (
    <ReadingPage className="max-w-7xl">
      <PageHeader>
        <span className="eyebrow">Fieldbook component library</span>
        <h1>Interface reference</h1>
        <p>
          Shared components and patterns. This catalog uses synthetic data and
          is available only in the demo application.
        </p>
        <a href="/">Back to Fieldbook</a>
        <a href="/ui/workspace">Workspace frame example</a>
      </PageHeader>
      <ControlExamples />
      <section className="grid gap-4" aria-label="Admin collection filters">
        <SectionHeader
          title={<h2>Admin collection filters</h2>}
          description="Type tabs and search stay visible; related fields use named Filters and Sort controls."
        />
        <FilterOptions
          label="Example content type"
          variant="underline"
          value={catalogFilter}
          onValueChange={setCatalogFilter}
          options={[
            { value: "all", label: "All content" },
            { value: "doc", label: "Docs" },
            { value: "brief", label: "Updates" },
          ]}
        />
        <CollectionControls
          search={
            <FormField label="Search content" visuallyHiddenLabel>
              <Input type="search" placeholder="Search content by title" />
            </FormField>
          }
          sortLabel={catalogSort === "newest" ? "Newest created" : "Title A–Z"}
          sort={
            <FormField label="Sort content">
              <SelectField value={catalogSort} onValueChange={setCatalogSort}>
                <option value="newest">Newest created</option>
                <option value="title">Title A–Z</option>
              </SelectField>
            </FormField>
          }
          filters={[
            ...(catalogCategory === "all" ? [] : [{ id: "category", label: "Sales", onRemove: () => setCatalogCategory("all") }]),
            ...(catalogStatus === "all" ? [] : [{ id: "status", label: "Published", onRemove: () => setCatalogStatus("all") }]),
          ]}
          onClear={() => { setCatalogCategory("all"); setCatalogStatus("all"); }}
        >
          <FormField label="Category">
            <SelectField value={catalogCategory} onValueChange={setCatalogCategory}>
              <option value="all">All categories</option>
              <option value="sales">Sales</option>
            </SelectField>
          </FormField>
          <FormField label="Publication status">
            <SelectField value={catalogStatus} onValueChange={setCatalogStatus}>
              <option value="all">All statuses</option>
              <option value="published">Published</option>
            </SelectField>
          </FormField>
        </CollectionControls>
      </section>
      <section
        aria-label="Admin page and navigation context"
        className="grid gap-4"
      >
        <DetailNavigation
          items={[
            {
              label: "Back to teams",
              onSelect: () => notify("Returned to teams"),
            },
            {
              label: "Parent: Sales",
              onSelect: () => notify("Opened parent team"),
            },
          ]}
          current="Pacific accounts"
        />
        <SectionHeader
          variant="page"
          title={<h2>Pacific accounts</h2>}
          description="A consistent heading, return path and visible actions for a detail page."
        >
          <Button variant="outline" onClick={() => notify("Edit team details")}>
            Edit team details
          </Button>
          <Button variant="outline" onClick={() => notify("Move team")}>
            Move team
          </Button>
        </SectionHeader>
        <FormField label="Short description">
          <Textarea
            size="compact"
            rows={2}
            placeholder="A concise description"
          />
        </FormField>
      </section>
      <BulkExamples />
      <LibraryExamples />
      <section className="grid gap-4" aria-label="Content editor frame">
        <SectionHeader title={<h2>Content editor frame</h2>}
          description="Persistent Outline and Details controls reveal in-page panels. The writing canvas stays mounted when either panel changes." />
        <EditorFrame revealCanvas={canvasRequest}
          outlineContext={catalogLesson === "welcome" ? "Lesson 1 of 2" : "Lesson 2 of 2"}
          heading={<Input variant="lesson-title" aria-label="Example lesson title" placeholder="Untitled lesson" value={catalogTitle} onChange={(event) => setCatalogTitle(event.target.value)} />}
          outline={<nav className="grid gap-1" aria-label="Example course outline">
            {[{ id: "welcome", label: "Welcome" }, { id: "practice", label: "Practice" }].map((lesson) => (
              <NavigationButton key={lesson.id} type="button" aria-current={catalogLesson === lesson.id ? "step" : undefined}
                className={catalogLesson === lesson.id ? "selected" : undefined}
                onClick={() => { setCatalogLesson(lesson.id); setCanvasRequest((request) => request + 1); }}>
                {lesson.label}
              </NavigationButton>
            ))}
          </nav>}
          details={<EditorDetailsGroup id="catalog-editor-details" title="Content details">
            <FormField label="Category">
              <SelectField value={catalogPlacement} onValueChange={setCatalogPlacement}>
                <option value="essentials">Essentials</option><option value="practice">Practice</option>
              </SelectField>
            </FormField>
            <FieldDescription>Publication and saving belong to the editor’s owner.</FieldDescription>
          </EditorDetailsGroup>}>
          <div className="grid gap-4">
            <FormField label="Example draft text">
              <Textarea rows={6} value={catalogBody} onChange={(event) => setCatalogBody(event.target.value)} />
            </FormField>
          </div>
        </EditorFrame>
      </section>
      <WritingExamples />
      <ImageViewerExamples />
      <section className="grid gap-4" aria-label="Generated card artwork">
        <SectionHeader
          title={<h2>Generated card artwork</h2>}
          description="Thirty curated compositions use ten motif families. A saved seed keeps each design stable while the palette can recolor it."
        />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 30 }, (_, slot) => {
            const seed = slot + 300 * (slot % 3);
            return (
              <CardArtwork
                key={slot}
                id={`catalog-${slot}`}
                title={`Example design ${slot + 1}`}
                kind={
                  slot % 3 === 0
                    ? "brief"
                    : slot % 3 === 1
                      ? "course"
                      : "curriculum"
                }
                category={slot % 3 === 2 ? undefined : "Product"}
                art={{
                  source: "generated",
                  shortTitle: `Design ${slot + 1}`,
                  version: 2,
                  seed,
                }}
              />
            );
          })}
        </div>
      </section>
      <section className="grid gap-4" aria-label="Save confirmations">
        <SectionHeader
          title={<h2>Save confirmations</h2>}
          description="One quiet confirmation, outside the page layout. New saves replace it; it fades after four seconds."
        />
        <ActionGroup>
          <Button variant="outline" onClick={() => notify("Doc published.")}>
            Preview confirmation
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              notify(
                "Your changes to the installation guide have been published and are available to everyone who can browse this installation.",
              )
            }
          >
            Preview long confirmation
          </Button>
        </ActionGroup>
      </section>
      <section className="grid gap-4">
        <h2>Named creation dialog</h2>
        <Button
          variant="outline"
          onClick={() =>
            void prompt("Group name", "Guests", {
              title: "Create guest group",
              description: "Name the group before explicitly creating it.",
              submitLabel: "Create group",
            })
          }
        >
          Preview creation dialog
        </Button>
      </section>
      <section className="grid gap-4">
        <SectionHeader
          title={<h2>Report exports</h2>}
          description="CSV uses the current report rows. Timestamps and filename dates use UTC."
        >
          <CsvExport
            filename="example-report"
            report={() => ({
              headings: ["Person", "Completed courses"],
              rows: [["Alex Example", 2]],
            })}
          />
        </SectionHeader>
        <CsvExport
          filename="unavailable-report"
          disabledReason="Report data is unavailable. Reload and try again."
          report={() => ({ headings: ["Person"], rows: [] })}
        />
      </section>
      <section className="grid gap-4">
        <h2>Search results</h2>
        <p>
          Contained search keeps the current page in place. Loading placeholders
          respect reduced motion.
        </p>
        <SearchPanelExample />
        <SearchExperience id="catalog-ask-ai" content={seedContent} aiMode="demo" signedIn onOpen={() => {}} />
        <SearchResultSkeleton />
        <SearchResultCard
          result={{
            contentId: "example",
            passageId: "lesson:one",
            kind: "course",
            title: "Service recovery",
            lessonId: "one",
            lessonTitle: "Restore a backup",
            excerpt:
              "Restore a backup and verify the service before reopening traffic.",
            highlights: ["backup"],
            href: "#",
            contentDate: null,
            publishedRevision: 1,
          }}
        />
      </section>
      <section className="grid min-w-0 gap-4">
        <h2>Initials avatars</h2>
        <Card>
          <div className="flex items-center gap-4">
            <InitialsAvatar initials="AE" />
            <span>Alex Edwards</span>
          </div>
          <div className="flex items-center gap-4">
            <InitialsAvatar initials="FB" size="sm" />
            <span>Fieldbook · compact</span>
          </div>
          <p>
            Use beside a visible name. The circular marker is decorative and is
            not repeated by screen readers.
          </p>
        </Card>
      </section>
      <section className="grid min-w-0 gap-4">
        <h2>Installation identity</h2>
        <Card>
          <InstallationIdentity name="Example Academy" />
          <p>
            Shared by the workspace, sign-in, consent and connection pages. The
            installation name appears without an icon.
          </p>
        </Card>
      </section>
      <section className="grid min-w-0 gap-4">
        <CourseRow
          title="Example"
          heading={<h2>Learning cards and progress</h2>}
          description="Courses and curricula share their layout. Controls appear only when the row overflows."
        >
          {[0, 33, 100].map((value) => (
            <LearningCard
              key={value}
              title={
                value === 33
                  ? "A longer curriculum title that wraps naturally"
                  : "Example course"
              }
              description="Shared spacing, readable descriptions and aligned actions."
              metadata={
                value === 33 ? "1 of 3 courses complete" : "2 lessons · Quiz"
              }
              status={{
                percent: value,
                complete: value === 100,
                started: value > 0,
              }}
              artwork={
                <CardArtwork
                  id={`catalog-learning-${value}`}
                  title="Example course"
                  kind={value === 33 ? "curriculum" : "course"}
                  category={value === 33 ? undefined : "Product"}
                />
              }
              action={value === 33 ? "View curriculum" : "Start course"}
              onClick={() => {}}
            />
          ))}
        </CourseRow>
        <BrowseToolbar>
          <Field>
            Search
            <SearchField>
              <Input placeholder="Find a course…" />
            </SearchField>
          </Field>
          <Field>
            Category
            <SelectField value="all" onValueChange={() => {}}>
              <option value="all">All categories</option>
            </SelectField>
          </Field>
          <Field>
            Sort
            <SelectField value="recommended" onValueChange={() => {}}>
              <option value="recommended">Recommended order</option>
            </SelectField>
          </Field>
        </BrowseToolbar>
        <LaunchList
          items={[
            {
              id: "example",
              title: "A course in a curriculum",
              description: "2 lessons · 10 min",
              status: (
                <ProgressStatus value={0} started={false} complete={false} />
              ),
              action: "Start course",
              onClick: () => {},
            },
          ]}
        />
      </section>
      <Card>
        <Stack>
          <SectionHeader title={<h2>Actions and feedback</h2>}></SectionHeader>
          <ActionGroup>
            <Button>Save changes</Button>
            <Button variant="outline">Cancel</Button>
            <Button variant="ghost">More</Button>
            <Button variant="destructive">Delete group</Button>
            <Button loading>Saving…</Button>
            <Button asChild variant="link">
              <a href="#fields">Jump to fields</a>
            </Button>
          </ActionGroup>
          <ActionGroup>
            <Badge>Published</Badge>
            <Badge variant="success">Completed</Badge>
            <Badge variant="warning">In progress</Badge>
            <Badge>Draft</Badge>
          </ActionGroup>
          <Alert variant="success">Your changes have been saved.</Alert>
          <Alert variant="destructive">
            We couldn’t save. Your changes are still here.
          </Alert>
          <Progress value={75} aria-label="Assigned learning complete" />
          <div className="flex flex-wrap gap-4">
            <ProgressStatus value={0} complete={false} started={false} />
            <ProgressStatus value={33} complete={false} started={true} />
            <ProgressStatus value={100} complete={true} started={true} />
          </div>
        </Stack>
      </Card>
      <Card id="fields">
        <Stack>
          <SectionHeader title={<h2>Fields and choices</h2>}></SectionHeader>
          <SearchField>
            <Input
              aria-label="Find library content"
              placeholder="Find a course…"
            />
          </SearchField>
          <FieldGroup>
            <Field>
              Group name
              <Input defaultValue="Sales" />
            </Field>
            <Field>
              Description
              <Textarea placeholder="Who is this group for?" />
            </Field>
            <Field>
              Parent learning group
              <SelectField value={group} onValueChange={setGroup}>
                {choices}
              </SelectField>
            </Field>
            <FieldDescription>
              All published content remains visible to everyone.
            </FieldDescription>
            <Field>
              Disabled field
              <Input disabled value="Managed by your organization" readOnly />
            </Field>
            <Field>
              Invalid field
              <Input
                aria-invalid
                aria-describedby="example-error"
                defaultValue=""
              />
            </Field>
            <FieldDescription id="example-error">
              Enter a group name.
            </FieldDescription>
            <Field orientation="horizontal">
              <Checkbox defaultChecked />
              Include direct team members
            </Field>
            <Field orientation="horizontal">
              <Radio name="catalog-radio" defaultChecked />
              New user
            </Field>
            <Field orientation="horizontal">
              <Radio name="catalog-radio" />
              Existing user
            </Field>
          </FieldGroup>
        </Stack>
      </Card>
      <Card>
        <Stack>
          <SectionHeader title={<h2>Pending section navigation</h2>} description="The current panel stays visible while a section opens." />
          <Button variant="outline" onClick={() => setNavigationPending((value) => !value)}>Toggle pending section</Button>
          <Tabs value="content" orientation="vertical">
            <ResponsiveTabsNavigation label="Example section" value="content" onValueChange={() => {}} options={[{ id: "content", name: "Content" }, { id: "people", name: "People" }]} pendingValue={navigationPending ? "people" : null}>
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="people">{navigationPending && <Spinner />}People</TabsTrigger>
            </ResponsiveTabsNavigation>
          </Tabs>
        </Stack>
      </Card>
      <Card>
        <Tabs defaultValue="members">
          <TabsList aria-label="Example group sections">
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="learning">Learning</TabsTrigger>
            <TabsTrigger value="updates">Updates</TabsTrigger>
          </TabsList>
          <TabsContent value="members">
            <FieldGroup>
              <Field>
                Parent learning group
                <SelectField value={group} onValueChange={setGroup}>
                  {choices}
                </SelectField>
              </Field>
              <FieldDescription>
                The tab panel owns spacing before its first field.
              </FieldDescription>
            </FieldGroup>
          </TabsContent>
          <TabsContent value="learning">
            <OrderedLearning
              items={items.map((id) => ({ id, label: id }))}
              onReorder={setItems}
              onRemove={(id) => setItems(items.filter((item) => item !== id))}
            />
          </TabsContent>
          <TabsContent value="updates">
            <EmptyState>
              <h3>No updates yet</h3>
              <p>Updates designated for this group will appear here.</p>
            </EmptyState>
          </TabsContent>
        </Tabs>
      </Card>
      <Card>
        <Stack>
          <SectionHeader title={<h2>Dialog and table</h2>}>
            <Button variant="outline" onClick={() => setDialog(true)}>
              Edit example group
            </Button>
          </SectionHeader>
          <TableContainer>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead>Learning complete</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Example learner</TableCell>
                  <TableCell>75%</TableCell>
                  <TableCell>
                    <ActionGroup>
                      <Button variant="link">Edit</Button>
                      <Button variant="link">Courses &amp; progress</Button>
                    </ActionGroup>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      </Card>
      <Card>
        <Stack>
          <SectionHeader
            title={<h2>Composition and long labels</h2>}
            description="Descriptions stay under their headings. Actions, icons and wrapped labels have dedicated space."
          >
            <Button variant="outline">Manage examples</Button>
          </SectionHeader>
          <CollectionToolbar filters={<Badge>All content</Badge>}>
            <Button>Create content</Button>
          </CollectionToolbar>
          <CollectionControls
            search={
              <Input
                aria-label="Search collection examples"
                placeholder="Search content"
                value={collectionQuery}
                onChange={(event) => setCollectionQuery(event.target.value)}
              />
            }
            sortLabel={
              collectionSort === "newest" ? "Newest created" : "Title A–Z"
            }
            sort={
              <FormField label="Sort content">
                <SelectField
                  value={collectionSort}
                  onValueChange={setCollectionSort}
                >
                  <option value="newest">Newest created</option>
                  <option value="title">Title A–Z</option>
                </SelectField>
              </FormField>
            }
            filters={
              collectionStatus === "all"
                ? []
                : [
                    {
                      id: "status",
                      label: "Draft",
                      onRemove: () => setCollectionStatus("all"),
                    },
                  ]
            }
            onClear={() => setCollectionStatus("all")}
          >
            <FormField label="Publication">
              <SelectField
                value={collectionStatus}
                onValueChange={setCollectionStatus}
              >
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
              </SelectField>
            </FormField>
          </CollectionControls>
          <CollectionEmpty
            count={collectionQuery ? 0 : 1}
            total={1}
            noun="content items"
            onClear={() => setCollectionQuery("")}
          />
          <ActionGroup variant="text">
            <Button variant="link">Edit example</Button>
            <Button variant="link">Unpublish example</Button>
          </ActionGroup>
          <div className="grid min-w-0 gap-6 sm:grid-cols-2">
            <Tabs defaultValue="assignment" orientation="vertical">
              <TabsList
                variant="sidebar"
                aria-label="Sidebar alignment examples"
              >
                <TabsTrigger value="identity">
                  <Settings />
                  Identity
                </TabsTrigger>
                <TabsTrigger value="assignment">
                  <Layers />
                  Due dates with a longer label
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="grid gap-4">
              <AccountMenu
                initials="OA"
                name="Organization Administrator with a long name"
                email="admin@example.com"
                description="Administrator"
                onManageOrganization={() => {}}
                onTeamProgress={() => {}}
                onSignOut={() => {}}
                externalLinks={[{ id: "00000000-0000-4000-8000-000000000001", label: "Product documentation", url: "https://example.test/docs" }]}
                onFeedback={async () => {}}
              />
              <AccountMenu
                initials="G"
                name="Guest"
                guest
                externalLinks={[{ id: "00000000-0000-4000-8000-000000000001", label: "Product documentation", url: "https://example.test/docs" }]}
                onSignIn={() => {}}
                onFeedback={async () => {}}
              />
            </div>
          </div>
          <StatusActions
            actions={<Button variant="link">Review saved changes</Button>}
          >
            Your changes are saved.
          </StatusActions>
          <ContentCardFooter
            action={
              <>
                Read the update <ArrowRight size={16} />
              </>
            }
          >
            Sep 18, 2026
          </ContentCardFooter>
        </Stack>
      </Card>
      <Card>
        <Stack>
          <SectionHeader
            title={<h2>Stable table columns</h2>}
            description="Changing the result set preserves column positions. Narrow layouts scroll within the table."
          >
            <Button
              variant="outline"
              onClick={() => setEmptyReport(!emptyReport)}
            >
              {emptyReport ? "Show example rows" : "Show empty results"}
            </Button>
          </SectionHeader>
          <TableContainer>
            <DataTable
              layout="progress"
              aria-label="Example stable progress table"
            >
              <TableHeader>
                <TableRow>
                  <TableHead>Team member</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead align="right">Assigned</TableHead>
                  <TableHead align="right">Completed</TableHead>
                  <TableHead align="right">Complete</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {!emptyReport &&
                  ["Example learner", "Example learner with a longer name"].map(
                    (name) => (
                      <TableRow key={name}>
                        <TableCell>
                          <strong>{name}</strong>
                          <small>learner@example.com</small>
                        </TableCell>
                        <TableCell>Customer success</TableCell>
                        <TableCell align="right">4</TableCell>
                        <TableCell align="right">3</TableCell>
                        <TableCell align="right">75%</TableCell>
                        <TableCell>
                          <Button variant="link">View courses</Button>
                        </TableCell>
                      </TableRow>
                    ),
                  )}
              </TableBody>
            </DataTable>
          </TableContainer>
          {emptyReport && (
            <EmptyState>No team members match this view.</EmptyState>
          )}
        </Stack>
      </Card>
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogTitle>Edit example group</DialogTitle>
          <DialogDescription>
            Check that the dropdown opens above the dialog and returns focus
            correctly.
          </DialogDescription>
          <Field>
            Dialog parent group
            <SelectField value={group} onValueChange={setGroup}>
              {choices}
            </SelectField>
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => setDialog(false)}>Save example</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <section className="grid gap-8" aria-label="Reading presentation">
        <SectionHeader title={<h2>Reading presentation</h2>} />
        <SplitPanel>
          <DocumentTree
            docs={seedContent}
            selected={seedContent.find((item) => item.kind === "doc")!.id}
            href={(id) => `#docs/${id}`}
            onOpen={() => {}}
          />
          <Article
            documents={seedContent}
            item={{
              ...seedContent.find((item) => item.kind === "doc")!,
              body: "## Start here\n\nA readable article with a shared heading outline.\n\n### A useful detail\n\nSubheadings retain their hierarchy.\n\n## Start here\n\nRepeated headings have unique links.",
            }}
          />
        </SplitPanel>
        <Course
          course={seedContent.find((item) => item.kind === "course")!}
          progress={[]}
          initialLessonId={
            seedContent.find((item) => item.kind === "course")!.lessons[0]?.id
          }
          backLabel="Back to courses"
          onBack={() => {}}
          onDemoProgress={() => true}
        />
      </section>
    </ReadingPage>
  );
}

function SearchPanelExample() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex justify-end">
      <SearchPanel
        id="catalog-search-results"
        open={open}
        onDismiss={() => setOpen(false)}
        trigger={
          <SearchField>
            <Input
              aria-label="Example contained search"
              aria-expanded={open}
              aria-controls={open ? "catalog-search-results" : undefined}
              placeholder="Focus to preview loading…"
              onFocus={() => setOpen(true)}
            />
          </SearchField>
        }
      >
        <div
          className="grid gap-4 p-4"
          role="region"
          aria-label="Example search loading"
          aria-busy="true"
        >
          <p role="status">Searching…</p>
          <SearchResultSkeleton />
          <SearchResultSkeleton />
        </div>
      </SearchPanel>
    </div>
  );
}
