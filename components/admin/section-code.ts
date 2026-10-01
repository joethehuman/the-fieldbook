// The same imports are used for intent preparation and rendering. Rejections
// remain retryable; section data is fetched independently by the route/runtime.
const loaders = {
  editor: () => import("./ContentEditor"),
  settings: () => import("../SiteSettingsPanel"),
  privacy: () => import("../PrivacySettingsPanel"),
  feedback: () => import("../Feedback"),
  deleted: () => import("../RecentlyDeleted"),
  groups: () => import("../LearningGroups"),
  curricula: () => import("../Curricula"),
  teams: () => import("../TeamManagement"),
  progress: () => import("../Teams"),
  assignments: () => import("../Assignments"),
  people: () => import("../PendingPeople"),
};
export async function prepareAdminCode(tab: string) {
  const key =
    tab === "settings-privacy"
      ? "privacy"
      : tab.startsWith("settings-")
        ? "settings"
        : tab;
  const load = loaders[key as keyof typeof loaders];
  if (load) await load();
}
