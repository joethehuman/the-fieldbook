"use client";
import type { Workspace } from "@/lib/store";
import type { BulkHandler } from "@/lib/bulk-actions";
import type { BulkCommand } from "./patterns/bulk-actions";
import { AdminBulkActions } from "./AdminBulkActions";
export function peopleCommands(
  data: Workspace,
  selected: string[],
  onChange: (d: Workspace) => void | Promise<void>,
  pending = false,
  currentUserId?: string,
): BulkCommand[] {
  const users = pending ? data.pendingUsers || [] : data.users;
  const selectedUsers = users.filter((u) =>
    selected.includes("id" in u ? String(u.id) : u.email),
  );
  const apply = async (operation: string, ids: string[]) => {
    if (
      operation === "inactive" &&
      currentUserId &&
      selected.includes(currentUserId)
    )
      throw new Error("You cannot deactivate your own administrator account.");
    const next = users.map((u) =>
      !selected.includes("id" in u ? String(u.id) : u.email)
        ? u
        : operation === "team"
          ? { ...u, teamId: ids[0] === "none" ? undefined : ids[0] }
          : operation === "date"
            ? { ...u, onboardingStart: ids[0] }
            : operation === "active" || operation === "inactive"
              ? { ...u, active: operation === "active" }
              : {
                  ...u,
                  groups:
                    operation === "add"
                      ? [...new Set([...u.groups, ...ids])]
                      : u.groups.filter((id) => !ids.includes(id)),
                },
    );
    if (
      !pending &&
      operation === "inactive" &&
      !next.some((u) => u.role === "admin" && "active" in u && u.active)
    )
      throw new Error("Keep at least one active administrator.");
    await onChange(
      pending
        ? { ...data, pendingUsers: next as Workspace["pendingUsers"] }
        : { ...data, users: next as Workspace["users"] },
    );
  };
  return [
    ...(["add", "remove"] as const).map((op) => ({
      id: op,
      label:
        op === "add" ? "Add to learning groups" : "Remove from learning groups",
      description:
        op === "add"
          ? "Add direct memberships. Overlapping assignments count once."
          : "Remove direct memberships. Inclusion through teams or child groups and saved history remain.",
      options: data.groups.map((g) => ({ id: g.id, label: g.name })),
      apply: (ids: string[]) => apply(op, ids),
    })),
    {
      id: "team",
      label: "Set reporting team",
      description:
        "Choose one direct team, or No team. Manager reporting and team-linked assignments change; history is preserved.",
      selectionMode: "single",
      options: [
        { id: "none", label: "No team" },
        ...(data.teams || []).map((t) => ({ id: t.id, label: t.name })),
      ],
      apply: (ids) => apply("team", ids),
    },
    ...(!pending
      ? ([true, false] as const).map((active) => ({
          id: active ? "active" : "inactive",
          label: active ? "Activate selected" : "Deactivate selected",
          disabledReason:
            !active && currentUserId && selected.includes(currentUserId)
              ? "Deselect your own account before deactivating people."
              : undefined,
          description: active
            ? "Restore sign-in access for these existing accounts. Deleted accounts must be restored and reviewed first."
            : "End access while preserving accounts and history. This does not start a deletion timer. Owner and current-administrator safeguards apply.",
          apply: () => apply(active ? "active" : "inactive", []),
        }))
      : []),
    {
      id: "date",
      label: "Set onboarding start date",
      description:
        "Recalculate onboarding targets from this date. Existing course completion history is preserved.",
      field: "date",
      apply: (ids) => apply("date", ids),
    },
    ...(pending
      ? [
          {
            id: "revoke",
            label: "Revoke preregistration",
            description: `Remove ${selectedUsers.length} pending registrations. This does not delete an existing account or learning history. No email is sent.`,
            destructive: true,
            acknowledgment:
              "I understand that these preregistrations will be removed.",
            apply: async () => {
              await onChange({
                ...data,
                pendingUsers: (data.pendingUsers || []).filter(
                  (u) => !selected.includes(u.email),
                ),
              });
            },
          },
        ]
      : []),
  ];
}
export function PeopleBulkActions({
  data,
  selected,
  onChange,
  onSelectionChange,
  onBulk,
  currentUserId,
}: {
  data: Workspace;
  selected: string[];
  onChange: (data: Workspace) => void | Promise<void>;
  onSelectionChange: (ids: string[]) => void;
  onBulk: BulkHandler;
  currentUserId?: string;
}) {
  return (
    <AdminBulkActions
      data={data}
      selected={selected}
      onSelectionChange={onSelectionChange}
      onBulk={onBulk}
      entity="user"
      extraCommands={peopleCommands(
        data,
        selected,
        onChange,
        false,
        currentUserId,
      )}
    />
  );
}
