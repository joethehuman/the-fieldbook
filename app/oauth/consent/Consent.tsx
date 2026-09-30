"use client";
import { Button } from "@/components/ui/button";
import { ActionGroup } from "@/components/ui/action-group";
import { Alert } from "@/components/ui/alert";
import { BrandedAccount } from "@/components/patterns/branded-account";
import type { Branding } from "@/lib/branding";
import { request, RequestError } from "@/lib/workspace-save";
import { useEffect, useState } from "react";
export default function Consent({ branding }: { branding: Branding }) {
  const [details, setDetails] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [id, setId] = useState("");
  useEffect(() => {
    const value =
      new URLSearchParams(window.location.search).get("authorization_id") || "";
    setId(value);
    request(`/api/consent?id=${encodeURIComponent(value)}`)
      .then((d) => {
        if (d.redirect_url) window.location.assign(d.redirect_url);
        else setDetails(d);
      })
      .catch((e) => {
        if (e instanceof RequestError && e.status === 401) {
          window.location.replace(
            `/auth/sign-in?next=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`,
          );
          return;
        }
        setError(e.message);
      });
  }, []);
  async function decide(allow: boolean) {
    setBusy(true);
    try {
      const d = await request("/api/consent", { id, allow });
      window.location.assign(d.redirect_url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <BrandedAccount branding={branding}>
      <span className="eyebrow">CONNECT TO {branding.name}</span>
      <h1>
        {details
          ? `Allow ${details.client.name} to manage content?`
          : "Connecting your AI…"}
      </h1>
      {error && (
        <Alert variant="destructive" role="alert">
          {error}
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </Alert>
      )}
      {details && (
        <>
          <p>
            This connection acts as <strong>{details.user.email}</strong>.
          </p>
          <ul>
            <li>Read published content and drafts.</li>
            <li>Create and edit articles, notes, lessons, and quizzes.</li>
            <li>Publish or unpublish content when you request it.</li>
            <li>Read course progress and feedback summaries.</li>
          </ul>
          <p>
            You can revoke this connection in {branding.name} at any time. The
            client name is supplied by the connecting application; approve only
            a connection you initiated.
          </p>
          <p className="muted">Requested identity access: {details.scope}</p>
          <ActionGroup>
            <Button
              variant="default"
              disabled={busy}

              onClick={() => decide(true)}
            >
              Allow connection
            </Button>
            <Button
              variant="outline"
              disabled={busy}

              onClick={() => decide(false)}
            >
              Deny
            </Button>
          </ActionGroup>
        </>
      )}
    </BrandedAccount>
  );
}
