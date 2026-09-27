"use client";
import type { Workspace } from "@/lib/store";
import { BulkPicker } from "./patterns/bulk-selection";
import { ActionGroup } from "./ui/action-group";
import { useToast } from "./ui/toast";

export function PeopleBulkActions({
  data,
  selected,
  onChange,
  onComplete,
}: {
  data: Workspace;
  selected: string[];
  onChange: (data: Workspace) => void | Promise<void>;
  onComplete: () => void;
}) {
  const notify = useToast();
  if (!selected.length) return null;
  async function change(operation: "add" | "remove" | "team", ids: string[]) {
    await onChange({
      ...data,
      users: data.users.map((u) =>
        !selected.includes(u.id)
          ? u
          : operation === "team"
            ? { ...u, teamId: ids[0] === "none" ? undefined : ids[0] }
            : {
                ...u,
                groups:
                  operation === "add"
                    ? [...new Set([...u.groups, ...ids])]
                    : u.groups.filter((id) => !ids.includes(id)),
              },
      ),
    });
    onComplete();
    notify("Memberships updated. Saved learning history is preserved.");
  }
  return (
    <ActionGroup>
      <BulkPicker
        title="Add to learning groups"
        description={`Add direct group membership for ${selected.length} selected users. Overlapping assignments are deduplicated.`}
        options={data.groups.map((g) => ({ id: g.id, label: g.name }))}
        onApply={(ids) => change("add", ids)}
        actionLabel="Add to groups"
      />
      <BulkPicker
        title="Remove from learning groups"
        description={`Remove direct group membership for ${selected.length} selected users. Membership inherited through a team or child group remains. Saved learning history is preserved.`}
        options={data.groups.map((g) => ({ id: g.id, label: g.name }))}
        onApply={(ids) => change("remove", ids)}
        actionLabel="Remove from groups"
      />
      <BulkPicker
        title="Set reporting team"
        selectionMode="single"
        description={`Move ${selected.length} selected users to one reporting team, or remove their direct team. Manager visibility and team-linked assignments change. Saved learning history is preserved.`}
        options={[
          { id: "none", label: "No team — remove direct membership" },
          ...(data.teams || []).map((t) => ({ id: t.id, label: t.name })),
        ]}
        onApply={async (ids) => {
          if (ids.length !== 1)
            throw new Error("Choose exactly one reporting team, or No team.");
          await change("team", ids);
        }}
        actionLabel="Apply team"
      />
    </ActionGroup>
  );
}
