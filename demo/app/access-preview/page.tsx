"use client";

import { useState } from "react";
import { AccountPage } from "@/components/patterns/layout";
import { InstallationIdentity } from "@/components/patterns/installation-identity";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import styles from "./preview.module.css";

type Screen = "public" | "private" | "missing" | "error";

const screens: { id: Screen; label: string }[] = [
  { id: "public", label: "Sign in · public" },
  { id: "private", label: "Sign in · private" },
  { id: "missing", label: "Unavailable page" },
  { id: "error", label: "Service error" },
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
      <div className={styles.artRule} />
      <div className={styles.artFooter}>A place to keep learning.</div>
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
          <div className={styles.identity}>
            <InstallationIdentity name="Fieldbook" />
            <span className={styles.context}>{signIn ? "YOUR LEARNING SPACE" : "FIELD GUIDE"}</span>
          </div>
          <div className={styles.body}>
            {signIn ? (
              <>
                <div className={styles.copy}>
                  <h1>Welcome to Fieldbook.</h1>
                  <p>
                    {screen === "public"
                      ? "Keep your course progress and pick up where you left off."
                      : "Sign in with your approved Google account to continue."}
                  </p>
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
                  <h1>This page isn’t available.</h1>
                  <p>It may have moved, been removed, or is not published yet.</p>
                </div>
                <Button type="button">Back to Fieldbook</Button>
              </>
            ) : (
              <>
                <div className={styles.copy}>
                  <h1>We couldn’t load this page.</h1>
                  <p>Something interrupted the connection. Please try again shortly.</p>
                </div>
                <Alert variant="destructive" role="alert">
                  If this keeps happening, share the reference with your administrator.
                </Alert>
                <Button type="button">Try again</Button>
              </>
            )}
          </div>
        </div>
        <PageArtwork />
      </AccountPage>
      <p className={styles.note} id="preview">
        Layout preview using Fieldbook components and styles. Actions on this page are inactive.
      </p>
    </div>
  );
}
