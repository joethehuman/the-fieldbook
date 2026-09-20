"use client";
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
import { Progress } from "@/components/ui/progress";
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
    </ReadingPage>
  );
}
