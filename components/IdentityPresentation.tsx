"use client";
import { createContext, useContext } from "react";
import type { SignInPresentation } from "@/lib/identity";

const genericPresentation: SignInPresentation = {
  options: [],
  signInLabel: "Sign in",
  progressDescription:
    "Sign in to save course progress across devices and browsers.",
  accessDeniedDescription:
    "This account doesn’t have access. Use an approved account or contact an administrator.",
  registration: {
    emailLabel: "Login email",
    description:
      "Add someone before they sign in. Their verified login email activates this roster entry. No email is sent.",
    pendingDescription:
      "This preregistered user can activate their account with a verified sign-in. Email is read-only.",
  },
};
const IdentityPresentationContext = createContext(genericPresentation);

export function IdentityPresentation({
  value,
  children,
}: {
  value: SignInPresentation;
  children: React.ReactNode;
}) {
  return (
    <IdentityPresentationContext.Provider value={value}>
      {children}
    </IdentityPresentationContext.Provider>
  );
}
export function useIdentityPresentation() {
  return useContext(IdentityPresentationContext);
}
