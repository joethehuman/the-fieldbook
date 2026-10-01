export type NavigationGuard = () => Promise<boolean>;
export type RegisterNavigationGuard = (
  guard: NavigationGuard | null,
  options?: { protected: boolean },
) => void;
export type ContentNavigation = () => Promise<boolean>;
export type RegisterContentNavigation = (
  navigate: ContentNavigation | null,
) => void;
