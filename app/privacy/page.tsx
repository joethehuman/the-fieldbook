"use client";
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
    <main style={{ maxWidth: 800, margin: "48px auto", padding: "0 24px" }}>
      <a href="/">← Back to demo</a>
      <h1>Privacy policy preview</h1>
      <p>
        This is a browser-local demonstration of the policy editor, not a policy
        for another installation.
      </p>
      {error ? (
        <p>Demo settings could not be loaded.</p>
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
    </main>
  );
}
