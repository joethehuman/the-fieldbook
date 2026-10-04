import test from "node:test";
import assert from "node:assert/strict";
import { createElement as h, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DataTable } from "../components/patterns/data-table";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import { RecordName, RecordMeta } from "../components/patterns/record-row";

function row(values: string[], header = false) {
  return h(
    TableRow,
    null,
    values.map((value, i) =>
      h(
        header ? TableHead : TableCell,
        { key: i, align: i === 3 ? "right" : undefined },
        value,
      ),
    ),
  );
}
test("table surplus follows data and precedes actions without adding an accessible header", () => {
  const html = renderToStaticMarkup(
    h(
      DataTable,
      { layout: "teamDirectory" },
      h(
        TableHeader,
        null,
        row(["", "Team", "Manager", "Members", "Subteams", "Actions"], true),
      ),
      h(TableBody, null, row(["", "Support", "Noah Reed", "12", "0", "Menu"])),
    ),
  );
  assert.match(html, /data-sizing="content"/);
  assert.match(html, /data-pin-actions="true"/);
  assert.doesNotMatch(html, /table-fixed|min-w-208|w-\[/);
  assert.match(
    html,
    /Subteams[\s\S]*data-slot="table-space" aria-hidden="true" role="presentation"[\s\S]*Actions/,
  );
  assert.match(html, /data-column="count" class="[^"]*ml-auto[^"]*">12/);
  assert.equal((html.match(/data-slot="table-space"/g) || []).length, 2);
});
test("unusual names and metadata use bounded wrapping content, retaining complete text", () => {
  const name =
    "An unusually long international customer success leadership team ".repeat(
      12,
    );
  const email = "long-address-".repeat(20) + "@example.test";
  const html = renderToStaticMarkup(
    h(
      DataTable,
      { layout: "teamMembers" },
      h(
        TableBody,
        null,
        h(
          TableRow,
          null,
          h(
            TableCell,
            null,
            h(RecordName, null, name),
            h(RecordMeta, null, email),
          ),
          h(TableCell, null, "Manager"),
          h(TableCell, null, "Menu"),
        ),
      ),
    ),
  );
  assert.ok(html.includes(name));
  assert.ok(html.includes(email));
  assert.match(
    html,
    /data-column="record" class="[^"]*w-max whitespace-normal \[overflow-wrap:anywhere\] max-w-96/,
  );
  assert.match(html, /group-data-\[sizing=content\]\/table:line-clamp-none/);
  assert.match(html, /group-data-\[sizing=content\]\/table:whitespace-normal/);
});
test("read-only review tables leave slack after data and never pin the last data field", () => {
  const html = renderToStaticMarkup(
    h(
      DataTable,
      { layout: "deadlineReview" },
      h(
        TableHeader,
        null,
        row(["User", "Course", "Current", "Proposed"], true),
      ),
      h(TableBody, null, row(["Alex", "Security", "2026-10-03", "2026-11-03"])),
    ),
  );
  assert.match(html, /data-pin-actions="false"/);
  assert.match(html, /2026-11-03[\s\S]*data-slot="table-space"[\s\S]*<\/tr>/);
});
test("fragment rows and expanded import details retain the full table span", () => {
  const html = renderToStaticMarkup(
    h(
      DataTable,
      { layout: "rosterReviewPeople" },
      h(
        TableBody,
        null,
        h(
          Fragment,
          null,
          row(["Alex", "alex@example.test", "Support", "Changed", "Details"]),
          h(
            TableRow,
            null,
            h(TableCell, { colSpan: 5 }, "Full proposed record"),
          ),
        ),
      ),
    ),
  );
  assert.match(html, /colSpan="6"/i);
  assert.equal((html.match(/data-slot="table-space"/g) || []).length, 1);
  assert.match(html, /Full proposed record/);
});
