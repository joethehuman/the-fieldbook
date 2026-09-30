export type NavigationGuard = () => Promise<boolean>;
export type RegisterNavigationGuard = (
  guard: NavigationGuard | null,
  options?: { protected: boolean },
) => void;
