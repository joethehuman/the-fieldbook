/** Public, serializable interface copy supplied by the selected sign-in module.
 * Option IDs select server-owned flows; providers never supply arbitrary login URLs. */
export type SignInPresentation = {
  options: readonly { id: string; label: string }[];
  instructions?: string;
  signInLabel: string;
  progressDescription: string;
  accessDeniedDescription: string;
  registration: {
    emailLabel: string;
    description: string;
    pendingDescription: string;
  };
};
