"use client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { BrandedAccount } from "@/components/patterns/branded-account";
import type { Branding } from "@/lib/branding";
import { request, RequestError } from "@/lib/workspace-save";
import { useEffect, useState } from "react";
export default function Connections({ branding }: { branding: Branding }) {
  const [items, setItems] = useState<any[]>([]),
    [error, setError] = useState("");
  async function load() {
    setError("");
    try {
      setItems(await request("/api/connections"));
    } catch (e) {
      if (e instanceof RequestError && e.status === 401) {
        window.location.replace(
          `/auth/sign-in?next=${encodeURIComponent(window.location.pathname + window.location.search + window.location.hash)}`,
        );
        return;
      }
      throw e;
    }
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  return (
    <BrandedAccount branding={branding}>
      <Button asChild variant="link">
        <a href="/admin">← Back to administration</a>
      </Button>
      <h1>AI connections</h1>
      <p>
        Revoke a connection to immediately stop its tools in {branding.name}.
      </p>
      {error && (
        <Alert variant="destructive" role="alert">
          {error}
          <Button
            variant="outline"
            onClick={() => load().catch((e) => setError(e.message))}
          >
            Try again
          </Button>
        </Alert>
      )}
      {items.map((c) => (
        <Card className="grid gap-4" key={c.client_id}>
          <h2>{c.client_name}</h2>
          <p>{c.enabled ? "Connected" : "Revoked"}</p>
          {c.enabled && (
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await request("/api/connections", { clientId: c.client_id });
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              Revoke access
            </Button>
          )}
        </Card>
      ))}
      {!items.length && !error && <p>No AI connections yet.</p>}
    </BrandedAccount>
  );
}
