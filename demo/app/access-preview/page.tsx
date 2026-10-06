"use client";

import { useState } from "react";
import { AccountPage } from "@/components/patterns/layout";
import { InstallationIdentity } from "@/components/patterns/installation-identity";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import styles from "./preview.module.css";

type Screen = "public" | "private" | "missing" | "account-error" | "reader-error";

const exampleReference = "00000000-0000-4000-8000-000000000000";

const screens: { id: Screen; label: string }[] = [
  { id: "public", label: "Sign in · public" },
  { id: "private", label: "Sign in · private" },
  { id: "missing", label: "Unavailable page" },
  { id: "account-error", label: "Account error" },
  { id: "reader-error", label: "Reader error" },
];

function PageArtwork() {
  return (
    <div className={styles.artwork} aria-hidden="true">
      <div className={styles.artLabel}>Updates <span>·</span> Courses <span>·</span> Docs</div>
      <div className={styles.pages}>
        <div className={`${styles.paper} ${styles.paperBack}`} />
        <div className={`${styles.paper} ${styles.paperMiddle}`} />
        <div className={`${styles.paper} ${styles.paperFront}`}>
          <i /><i /><i /><i />
        </div>
      </div>
    </div>
  );
}

export default function AccessPreview() {
  const [screen, setScreen] = useState<Screen>("public");
  const signIn = screen === "public" || screen === "private";

  return (
    <div className={styles.preview}>
      <div className={styles.reviewTools}>
        <span className="eyebrow">Local design preview</span>
        <div className={styles.tabs} role="group" aria-label="Screen to preview">
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
      <AccountPage className={styles.card}>
        <div className={styles.content}>
          <InstallationIdentity name="Fieldbook" />
          <div className={styles.body}>
            {signIn ? (
              <>
                <div className={styles.copy}>
                  <h1>Sign in to Fieldbook</h1>
                  {screen === "public" && <p>Sign in to save course progress across devices.</p>}
                </div>
                <Button className="w-full" type="button">
                  Continue with Google
                </Button>
                <div className={styles.links}>
                  {screen === "public" && <a href="#preview">Back to browsing</a>}
                  <a href="#preview">Privacy policy</a>
                </div>
              </>
            ) : screen === "missing" ? (
              <>
                <div className={styles.copy}>
                  <h1>This page isn’t available</h1>
                  <p>It may have been removed or is not published.</p>
                </div>
                <Button type="button">Back to Fieldbook</Button>
              </>
            ) : screen === "account-error" ? (
              <>
                <div className={styles.copy}>
                  <h1>Account services are unavailable</h1>
                </div>
                <Alert variant="destructive" role="alert">
                  Please try again shortly. If this continues, share this reference with
                  your administrator: {exampleReference}
                </Alert>
                <Button type="button">Try again</Button>
              </>
            ) : (
              <>
                <div className={styles.copy}>
                  <h1>Unable to load this page</h1>
                </div>
                <Alert variant="destructive" role="alert">
                  Reading services are unavailable. Please try again shortly.
                </Alert>
                <Button type="button">Try again</Button>
              </>
            )}
          </div>
        </div>
        <PageArtwork />
      </AccountPage>
      <p className={styles.note} id="preview">
        Layout preview using Fieldbook components and current screen copy. Actions are inactive.
        The name and teal accent are sample Identity settings; a live installation uses its saved name and accent.
        The account-error reference is an example; a live error supplies its own ID.
      </p>
    </div>
  );
}
