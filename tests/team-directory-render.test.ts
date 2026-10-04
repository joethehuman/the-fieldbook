import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TooltipProvider } from "../components/ui/tooltip";
import {
  HierarchyBrowser,
  type HierarchyBrowserItem,
} from "../components/patterns/hierarchy-browser";

const items: HierarchyBrowserItem[] = Array.from(
  { length: 49 },
  (_, index) => ({
    id: `team-${index}`,
    label: `Team ${String(index).padStart(2, "0")}`,
    description: "Manager: Example manager",
    managerName: "Example manager",
    directMemberCount: index,
  }),
);
function render(rows: HierarchyBrowserItem[], selected?: string[], query = "") {
  return renderToStaticMarkup(
    createElement(
      TooltipProvider,
      null,
      createElement(HierarchyBrowser, {
        items: rows,
        label: "Teams",
        branchId: "",
        onBrowse: () => {},
        onOpen: () => {},
        onEdit: () => {},
        query,
        onQueryChange: () => {},
        selected,
        onSelectionChange: selected ? () => {} : undefined,
      }),
    ),
  );
}
test("team selection uses the standard table and a bounded first page", () => {
  const html = render(items, []);
  assert.match(html, /data-layout="teamDirectory"/);
  assert.match(html, /data-density="compact"/);
  assert.match(html, /data-pin-actions="true"/);
  for (const label of ["Team", "Manager", "Members", "Subteams"])
    assert.match(html, new RegExp(`>${label}<`));
  assert.equal((html.match(/data-hierarchy-id=/g) || []).length, 25);
  assert.match(html, /Select page \(25\)/);
  assert.match(html, /1–25 of 49 shown/);
  assert.match(html, /Page 1 of 2/);
  assert.doesNotMatch(
    html,
    /Choose two or more teams|record-list-row|All teams/,
  );
});
test("search and singleton results retain the table without bulk checkboxes", () => {
  const html = render(items, [], "Team 00");
  assert.match(html, /data-layout="teamDirectory"/);
  assert.equal((html.match(/data-hierarchy-id=/g) || []).length, 1);
  assert.match(html, /1–1 of 1 shown/);
  assert.doesNotMatch(html, /role="checkbox"/);
});
test("empty search has a visible zero range and browsing retains the chart", () => {
  const empty = render(items, [], "Missing team");
  assert.match(empty, /0 results/);
  assert.doesNotMatch(empty, /data-layout="teamDirectory"/);
  const chart = render(items);
  assert.match(chart, /data-slot="hierarchy-chart"/);
  assert.doesNotMatch(chart, /data-layout="teamDirectory"/);
});
