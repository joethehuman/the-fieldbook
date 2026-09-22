"use client";
import { Article, CourseOverview } from "@/components/patterns/reading";
import { seedContent } from "@/lib/seed";
import { useToast } from "@/components/ui/toast";
import { useInteractionDialog } from "@/components/ui/interaction-dialog";
import { CsvExport } from "@/components/patterns/csv-export";
import { SearchPanel } from "@/components/patterns/search-panel";
import {
  SearchResultCard,
  SearchResultSkeleton,
} from "@/components/patterns/search-result";
import { InitialsAvatar } from "@/components/ui/initials-avatar";
import { InstallationIdentity } from "@/components/patterns/installation-identity";
import { LearningCard } from "@/components/patterns/learning-card";
import { BrowseToolbar } from "@/components/patterns/layout";
import { LaunchList } from "@/components/patterns/launch-list";
import { CourseRow } from "@/components/patterns/course-row";
import { ContentAction } from "@/components/patterns/content-action";
import { DataTable } from "@/components/patterns/data-table";
import { AccountButton } from "@/components/patterns/account-button";
import { ArrowRight, Layers, LogOut, Settings } from "lucide-react";
import {
  CardFooter,
  StatusActions,
  CollectionToolbar,
} from "@/components/patterns/layout";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SearchField } from "@/components/patterns/search-field";
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
  const [emptyReport, setEmptyReport] = useState(false);
  const [group, setGroup] = useState("company");
  const [dialog, setDialog] = useState(false);
  const [items, setItems] = useState([
    "Company essentials",
    "Customer conversations",
    "Product foundations",
  ]);
  return (
    <ReadingPage>
      <PageHeader>
        <span className="eyebrow">Fieldbook component library</span>
        <h1>Interface reference</h1>
        <p>
          Shared components and patterns. This catalog uses synthetic data and
          is available only in the demo application.
        </p>
        <a href="/">Back to Fieldbook</a>
      </PageHeader>
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
            Shared by the workspace, sign-in, consent and connection pages.
            Missing or failed logos use the book mark.
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
                <div className="course-art art-1">
                  <span className="art-label">
                    {value === 33 ? "Curriculum" : "Course"}
                  </span>
                </div>
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
            Channel
            <SelectField value="all" onValueChange={() => {}}>
              <option value="all">All channels</option>
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
            <Button disabled>Saving…</Button>
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
                  Assignment window with a longer label
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <AccountButton
              actionLabel="Sign out"
              initials="OA"
              name="Organization Administrator with a long name"
              description="Administrator"
              icon={<LogOut />}
            />
          </div>
          <StatusActions
            actions={<Button variant="link">Edit example comment</Button>}
          >
            Thanks—your rating is saved.
          </StatusActions>
          <CardFooter
            action={
              <>
                Read the update <ArrowRight size={16} />
              </>
            }
          >
            Sep 18, 2026
          </CardFooter>
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
          <ActionGroup>
            <Button onClick={() => setDialog(false)}>Save example</Button>
            <Button variant="outline" onClick={() => setDialog(false)}>
              Cancel
            </Button>
          </ActionGroup>
        </DialogContent>
      </Dialog>
      <section className="grid gap-8" aria-label="Reading presentation">
        <SectionHeader title={<h2>Reading presentation</h2>} />
        <Article
          item={seedContent.find((item) => item.kind === "doc")!}
          name="Sample Fieldbook"
          back={<Button variant="link">← Back to docs</Button>}
        />
        <CourseOverview
          item={seedContent.find((item) => item.kind === "course")!}
          back={<Button variant="link">← Back to courses</Button>}
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
