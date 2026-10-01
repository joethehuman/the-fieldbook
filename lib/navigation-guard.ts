export type NavigationGuard = () => Promise<boolean>;
// Local sections can share a URL while showing a detail screen or editor.
export type LandingNavigation = {
  isCurrent: boolean;
  open: () => void | Promise<void>;
};
export type RegisterLandingNavigation = (
  navigation: LandingNavigation | null,
) => void;
export type RegisterNavigationGuard = (
  guard: NavigationGuard | null,
  options?: { protected: boolean },
) => void;
