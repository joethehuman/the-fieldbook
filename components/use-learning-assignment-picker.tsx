"use client";
import { useEffect, useRef, useState } from "react";
import type { Workspace } from "@/lib/store";
import type { LearningAssignmentTarget } from "@/lib/learning-assignment-selection";
import {
  OrganizationChangeCanceledError,
  type OrganizationChangeOptions,
} from "@/lib/organization-change";
import type { RegisterNavigationGuard } from "@/lib/navigation-guard";
import { LearningAssignmentPicker } from "./LearningAssignmentPicker";

export type OpenLearningAssignment = (
  target: LearningAssignmentTarget,
  title: string,
) => Promise<void>;
/** Existing buttons and bulk menus open the same picker without a second dialog. */
export function useLearningAssignmentPicker({
  data,
  onChange,
  onPrepare,
  registerNavigationGuard,
}: {
  data: Workspace;
  onChange: (
    next: Workspace,
    options?: OrganizationChangeOptions,
  ) => void | Promise<void>;
  onPrepare?: () => Promise<Workspace | null>;
  registerNavigationGuard?: RegisterNavigationGuard;
}) {
  const [request, setRequest] = useState<{
    target: LearningAssignmentTarget;
    title: string;
  } | null>(null);
  const done = useRef<{
    resolve: () => void;
    reject: (error: Error) => void;
  } | null>(null);
  useEffect(
    () => () => {
      done.current?.reject(new OrganizationChangeCanceledError());
      done.current = null;
    },
    [],
  );
  const open: OpenLearningAssignment = (target, title) => {
    if (done.current)
      return Promise.reject(
        new Error("Finish the current assignment change first."),
      );
    return new Promise<void>((resolve, reject) => {
      done.current = { resolve, reject };
      setRequest({ target, title });
    });
  };
  const picker = request && (
    <LearningAssignmentPicker
      data={data}
      target={request.target}
      title={request.title}
      compact
      onChange={onChange}
      onPrepare={onPrepare}
      registerNavigationGuard={registerNavigationGuard}
      onFinish={(saved, error) => {
        const pending = done.current;
        done.current = null;
        setRequest(null);
        if (saved) pending?.resolve();
        else pending?.reject(error || new OrganizationChangeCanceledError());
      }}
    />
  );
  return { open, picker };
}
