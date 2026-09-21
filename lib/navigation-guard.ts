export type NavigationGuard = () => Promise<boolean>;
export type RegisterNavigationGuard = (guard: NavigationGuard | null) => void;
