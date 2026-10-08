"use client";

import { useState } from "react";
import { BrandedAccount } from "@/components/patterns/branded-account";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { brandingFromSettings, type Branding } from "@/lib/branding";
import styles from "./preview.module.css";

type Screen = "public" | "private" | "missing" | "account-error" | "page-error";

const exampleReference = "00000000-0000-4000-8000-000000000000";
const screens: { id: Screen; label: string }[] = [
  { id: "public", label: "Sign in · public" },
  { id: "private", label: "Sign in · private" },
  { id: "missing", label: "Unavailable page" },
  { id: "account-error", label: "Account error" },
  { id: "page-error", label: "Page error" },
];

export default function AccessPreview() {
  const [screen, setScreen] = useState<Screen>("public");
  const signIn = screen === "public" || screen === "private";
  const branding: Branding =
    screen === "account-error" || screen === "page-error"
      ? brandingFromSettings({})
      : {
          name: "Fieldbook",
          accent: "#17847f",
          homePage: "courses",
          welcomeDescription: "",
          privacyUrl: "/privacy",
          access: screen === "private" ? "private" : "public",
        };

  return (
    <div className={styles.preview}>
      <div className={styles.reviewTools}>
        <span className="eyebrow">Local design preview</span>
        <div
          className={styles.tabs}
          role="group"
          aria-label="Screen to preview"
        >
          {screens.map((item) => (
            <Button
              key={item.id}
              size="sm"
              variant={screen === item.id ? "default" : "outline"}
              aria-pressed={screen === item.id}
              onClick={() => setScreen(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </div>
      <BrandedAccount
        branding={branding}
        illustrated
        footer={
          screen === "public" ? <a href="#preview">Back to browsing</a> : null
        }
      >
        {signIn ? (
          <>
            <header className="sign-in-heading">
              <h1>Sign in to {branding.name}</h1>
              {screen === "public" && (
                <p>Sign in to save course progress across devices.</p>
              )}
            </header>
            <Button className="w-full" type="button">
              Continue with Google
            </Button>
          </>
        ) : screen === "missing" ? (
          <>
            <h1>This page isn’t available</h1>
            <p>
              The link may be incorrect, or the page may no longer be available.
            </p>
            <Button type="button">Back to Fieldbook</Button>
          </>
        ) : screen === "account-error" ? (
          <>
            <h1>Account services are unavailable</h1>
            <Alert variant="destructive" role="alert">
              Try again shortly or contact your administrator. Reference: {exampleReference}
            </Alert>
            <Button type="button">Try again</Button>
          </>
        ) : (
          <>
            <h1>Unable to load this page</h1>
            <Alert variant="destructive" role="alert">
              Try again. If the problem continues, contact your administrator.
            </Alert>
            <Button type="button">Try again</Button>
          </>
        )}
      </BrandedAccount>
      <p className={styles.note} id="preview">
        Layout preview using the shared Fieldbook card. Actions are inactive.
        The sign-in and unavailable-page examples use sample Identity settings.
        Error screens show the safe fallback used when settings cannot be read.
        The account-error reference is an example; a live error supplies its own
        ID.
      </p>
    </div>
  );
}
