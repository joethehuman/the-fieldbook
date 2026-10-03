import type {
  Content,
  Curriculum,
  Group,
  Progress,
  Team,
  User,
} from "@/lib/types";
import type { SiteSettings } from "@/lib/settings";
import type { SourcePassage } from "@/lib/search";
import type { AiSourceIdentity } from "@/lib/ai";
import type { SearchKind } from "@/lib/search";
import type { LearningAction } from "@/lib/learning";
import type { governanceSchema, pendingSchema } from "../governance-schema";
import type { McpDataStore } from "./mcp-data";
import type { McpReportingDataStore } from "./mcp-reporting";

export type GovernancePayload =
  typeof governanceSchema._output | typeof pendingSchema._output;

/** Plain Fieldbook persistence records. SDK clients and query syntax stay in adapters. */
export type DocumentRecord = {
  id: string;
  revision: number;
  draft: Content;
  published: Content | null;
  published_revision: number | null;
  updated_at: string;
  deleted_at?: string | null;
};
export type WorkspaceDocumentRecord = Pick<
  DocumentRecord,
  "id" | "revision" | "published" | "published_revision" | "updated_at"
> &
  Partial<Pick<DocumentRecord, "draft" | "deleted_at">>;
/** Assignment discovery loads published text without unpublished drafts. */
export type PublishedAssignmentRecord = Pick<
  DocumentRecord,
  "id" | "published" | "revision" | "published_revision" | "updated_at"
>;
export type ConfigurationRecord = {
  settings: SiteSettings;
  revision: number;
  governance_revision: number;
  groups: Group[];
  teams: Team[];
  curricula: Curriculum[];
};
export type ProfileRecord = {
  id: string;
  name: string;
  email: string;
  role: User["role"];
  active: boolean;
  groups: string[];
  team_id?: string | null;
  onboarding_start?: string | null;
  group_joined_at?: Record<string, string>;
  effective_group_joined_at?: Record<string, string>;
  deleted_at?: string | null;
};
export type ProgressRecord = Progress & {
  user_id: string;
  attempts: NonNullable<Progress["attempts"]>;
};
export type FeedbackRecord = {
  id: string;
  user_id: string | null;
  guest_key?: string | null;
  content_id: string | null;
  version: number | null;
  rating: "up" | "down";
  comment: string;
  updated_at: string;
};
export type PendingProfileRecord = Pick<
  ProfileRecord,
  "name" | "email" | "role" | "groups" | "team_id" | "onboarding_start"
>;
export type GovernanceRecord = {
  curricula?: Curriculum[];
  revision: number;
  users: ProfileRecord[];
  groups: Group[];
  teams: Team[];
  progress: ProgressRecord[];
  pending: PendingProfileRecord[];
};
export type ReaderIndexRecord = Pick<
  Content,
  | "id"
  | "kind"
  | "title"
  | "summary"
  | "category"
  | "folder"
  | "sectionId"
  | "sectionOrder"
  | "status"
  | "createdAt"
  | "updatedAt"
  | "cardArt"
  | "feedAt"
  | "groups"
>;
export type CourseIndexRecord = ReaderIndexRecord &
  Partial<
    Pick<Content, "assignments" | "coverImageUrl" | "lessons" | "questions">
  > & { duration?: number | string; version?: number | string };
export type DraftIndexRecord = Partial<
  Omit<Content, "version" | "duration">
> & {
  version?: number | string;
  duration?: number | string;
} & Pick<
    DocumentRecord,
    "id" | "revision" | "published_revision" | "updated_at"
  >;
export type PublicBrandingRecord = {
  name?: string;
  accent?: string;
  homePage?: string;
  welcomeDescription?: string;
  access?: string;
  policyMode?: string;
  policyUrl?: string;
};
export type DeletedItemRecord = {
  entity: "content" | "user";
  id: string;
  name: string;
  kind?: Content["kind"];
  revision: number;
  deleted_at: string;
  purge_after: string;
  deleted_by: string;
  purging: boolean;
  error?: string | null;
};
export type SavedFeedbackIdentity = { userId: string } | { guestKey: string };
export type DocumentWrite = {
  id: string;
  expected: number;
  draft: Omit<Content, "revision" | "publishedRevision">;
  publish: boolean;
  unpublish: boolean;
  actorId: string;
  source: string;
};

/** Task-level operations; implementations preserve atomic writes and complete reads. */
export interface DataStore extends McpDataStore, McpReportingDataStore {
  /** Nonsecret identifier used to partition cached published reads. */
  cacheNamespace(): string;
  readConfiguration(): Promise<ConfigurationRecord>;
  readSettings(): Promise<Pick<ConfigurationRecord, "settings"> | null>;
  readSettingsContext(): Promise<Pick<
    ConfigurationRecord,
    "settings" | "groups" | "teams" | "governance_revision"
  > | null>;
  readPublicBranding(): Promise<PublicBrandingRecord | null>;
  updateSettings(
    settings: SiteSettings,
    expected: number,
    governanceExpected: number,
  ): Promise<{ revision: number } | null>;
  findDocument(id: string): Promise<DocumentRecord | null>;
  readPublishedCourse(id: string): Promise<Content | null>;
  readPublishedBody(
    id: string,
  ): Promise<Pick<
    DocumentRecord,
    "id" | "published" | "published_revision"
  > | null>;
  saveDocument(write: DocumentWrite): Promise<DocumentRecord>;
  listWorkspaceDocuments(
    includeDrafts: boolean,
  ): Promise<WorkspaceDocumentRecord[]>;
  listDocumentPlacements(): Promise<
    Pick<DocumentRecord, "id" | "draft" | "published">[]
  >;
  listDraftIndex(): Promise<DraftIndexRecord[]>;
  listDraftCourses(): Promise<DocumentRecord[]>;
  listPublishedAssignmentContent(): Promise<PublishedAssignmentRecord[]>;
  listPublishedReaderIndex(): Promise<ReaderIndexRecord[]>;
  listPublishedCourseIndex(): Promise<CourseIndexRecord[]>;
  listRecentMcpDocuments(): Promise<DocumentRecord[]>;
  findReadyMedia(ids: string[]): Promise<{ id: string; mime: string }[]>;
  findCurriculumArtwork(ids: string[]): Promise<{ id: string; mime: string }[]>;
  listReadyMcpMedia(): Promise<
    {
      id: string;
      filename: string;
      mime: string;
      bytes: number;
      path: string;
    }[]
  >;
  reviewDeadlines(
    actorId: string,
    apply: boolean,
    token?: string,
  ): Promise<import("@/lib/assignment-episodes").DeadlineReview>;
  readGovernanceSnapshot(actorId: string): Promise<GovernanceRecord>;
  /** Complete account list, with progress restricted to a requested person. */
  readAdminPeopleSnapshot(
    actorId: string,
    userId?: string,
  ): Promise<GovernanceRecord>;
  listDeletedItems(entity?: "content" | "user"): Promise<DeletedItemRecord[]>;
  readCleanupStatus(): Promise<{
    endpoint: string | null;
    last_run: string | null;
  } | null>;
  listProfiles(): Promise<ProfileRecord[]>;
  readProfileNames(
    ids: string[],
  ): Promise<Pick<ProfileRecord, "id" | "name">[]>;
  findOwnerProfile(email: string): Promise<{ id: string } | null>;
  ensureLearningSetup(): Promise<void>;
  ensureOnboardingSetup(): Promise<void>;
  saveGovernance(
    actorId: string,
    expected: number,
    operation: "pending" | "save",
    payload: GovernancePayload,
  ): Promise<{ revision: number }>;
  manageLearning(
    actorId: string,
    payload: LearningAction,
  ): Promise<{ ok: true }>;
  listFeedback(userId?: string): Promise<FeedbackRecord[]>;
  readSavedFeedback(
    contentId: string,
    identity: SavedFeedbackIdentity,
  ): Promise<Pick<FeedbackRecord, "rating" | "comment"> | null>;
  saveFeedback(
    record: Omit<FeedbackRecord, "user_id" | "guest_key">,
    identity: SavedFeedbackIdentity,
  ): Promise<void>;
  consumeRateLimit(
    key: string,
    limit: number,
    seconds: number,
  ): Promise<boolean>;
  readCourseProgress(
    userId: string,
    contentId: string,
    version: number,
  ): Promise<Pick<ProgressRecord, "lessons" | "passed" | "attempts"> | null>;
  listUserProgress(userId: string): Promise<Progress[]>;
  readLatestCourseProgress(
    userId: string,
    contentId: string,
  ): Promise<Progress | null>;
  mergeProgress(
    userId: string,
    contentId: string,
    version: number,
    lessons: string[],
    passed: boolean,
    attempt: NonNullable<Progress["attempts"]>[number] | null,
  ): Promise<ProgressRecord>;
  readReportInputs(): Promise<{
    progress: ProgressRecord[];
    feedback: Pick<FeedbackRecord, "id" | "content_id" | "rating">[];
    documents: Pick<DocumentRecord, "id" | "published">[];
  }>;
  searchPublished(query: string, kind: string): Promise<SourcePassage[]>;
  /** Current safe published excerpts; empty queries verify setup without reading sources. */
  searchAiPassages(
    queries: string[],
    kinds: SearchKind[],
    signal?: AbortSignal,
  ): Promise<SourcePassage[]>;
  areAiSourcesCurrent(
    sources: AiSourceIdentity[],
    signal?: AbortSignal,
  ): Promise<boolean>;
}
