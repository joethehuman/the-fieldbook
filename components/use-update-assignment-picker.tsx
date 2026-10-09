"use client";
import { useEffect, useRef, useState } from "react";
import type { Workspace } from "@/lib/store";
import type { LearningAction } from "@/lib/learning";
import type { UpdateAssignmentTarget } from "@/lib/update-assignment-selection";
import type { RegisterNavigationGuard } from "@/lib/navigation-guard";
import { OrganizationChangeCanceledError } from "@/lib/organization-change";
import { UpdateAssignmentPicker } from "./UpdateAssignmentPicker";

export type OpenUpdateAssignment = (
  target: UpdateAssignmentTarget,
  title: string,
) => Promise<void>;
export function useUpdateAssignmentPicker({
  data,
  onLearningMany,
  onPrepare,
  registerNavigationGuard,
}: {
  data: Workspace;
  onLearningMany: (actions: LearningAction[]) => Promise<void>;
  onPrepare?: () => Promise<Workspace | null>;
  registerNavigationGuard?: RegisterNavigationGuard;
}) {
  const [request, setRequest] = useState<{
    target: UpdateAssignmentTarget;
    title: string;
  } | null>(null);
  const pending = useRef<{
    resolve: () => void;
    reject: (error: Error) => void;
  } | null>(null);
  useEffect(
    () => () => {
      pending.current?.reject(new OrganizationChangeCanceledError());
      pending.current = null;
    },
    [],
  );
  const open: OpenUpdateAssignment = (target, title) => {
    if (pending.current)
      return Promise.reject(
        new Error("Finish the current recommendation change first."),
      );
    return new Promise<void>((resolve, reject) => {
      pending.current = { resolve, reject };
      setRequest({ target: structuredClone(target), title });
    });
  };
  const picker = request && (
    <UpdateAssignmentPicker
      data={data}
      target={request.target}
      title={request.title}
      onLearningMany={onLearningMany}
      onPrepare={onPrepare}
      registerNavigationGuard={registerNavigationGuard}
      onFinish={(saved, error) => {
        const done = pending.current;
        pending.current = null;
        setRequest(null);
        if (saved) done?.resolve();
        else done?.reject(error || new OrganizationChangeCanceledError());
      }}
    />
  );
  return { open, picker };
}
