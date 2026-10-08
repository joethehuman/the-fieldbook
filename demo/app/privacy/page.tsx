"use client";
import { Alert } from "@/components/ui/alert";
import { ReadingPage } from "@/components/patterns/layout";
import Link from "next/link";
import { useEffect, useState } from "react";
import { loadWorkspace } from "@/lib/store";
import { defaultSettings, type SiteSettings } from "@/lib/settings";
import Markdown from "@/components/Markdown";
export default function DemoPrivacyPage() {
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    try {
      setSettings({ ...defaultSettings, ...loadWorkspace().settings });
    } catch {
      setError(true);
    }
  }, []);
  const policy = settings?.privacy?.published;
  return (
    <ReadingPage>
      <Link href="/">← Back to demo</Link>
      <h1>Privacy policy preview</h1>
      <p>
        This is a browser-local demonstration of the policy editor, not a policy
        for another installation.
      </p>
      {error ? (
        <Alert variant="destructive">Demo settings could not be loaded.</Alert>
      ) : !settings ? (
        <p>Loading…</p>
      ) : policy?.mode === "external" ? (
        <a href={policy.url}>View configured privacy policy</a>
      ) : policy ? (
        <article className="markdown">
          <Markdown>{policy.body}</Markdown>
        </article>
      ) : (
        <p>No policy has been published in this browser.</p>
      )}
    </ReadingPage>
  );
}
