import type { BulkOperation, BulkResult } from "@/lib/bulk-actions";
import type { Content } from "@/lib/types";

export type DeletionEntity = "content" | "user";
export type ClaimedDeletion = {
  entity: DeletionEntity;
  id: string;
  claim: string;
  purging: boolean;
};
export type RecoveryState = {
  authLocked: boolean;
  purging: boolean;
  purgeAfter: string;
};

/** Recovery mutations must preserve revision checks and claiming in one DB operation. */
export interface CleanupDataPort {
  deleteUsers(input: {
    actor: string;
    expected: number;
    ids: string[];
    owner: string;
  }): Promise<BulkResult[]>;
  recordIdentityLock(
    id: string,
    locked: boolean,
    error: string | null,
    claim?: string,
  ): Promise<void>;
  recoveryState(id: string): Promise<RecoveryState | null>;
  restore(input: {
    actor: string;
    entity: DeletionEntity;
    id: string;
    expected: number;
  }): Promise<BulkResult["status"]>;
  mutateContent(input: {
    actor: string;
    id: string;
    expected: number;
    operation: BulkOperation | "metadata";
    patch: Partial<Content>;
    settingsExpected: number | null;
  }): Promise<BulkResult["status"]>;
  claimDeletions(secret: string): Promise<ClaimedDeletion[]>;
  finishDeletion(item: ClaimedDeletion): Promise<void>;
  recordFailure(item: ClaimedDeletion, message: string): Promise<void>;
  collectMedia(): Promise<{ id: string; path: string }[]>;
  finishMedia(id: string): Promise<void>;
}
