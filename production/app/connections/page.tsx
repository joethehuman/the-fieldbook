"use client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { AccountPage } from "@/components/patterns/layout";
import { useEffect, useState } from "react";
export default function Connections() {
  const [items, setItems] = useState<any[]>([]),
    [error, setError] = useState("");
  async function load() {
    const r = await fetch("/api/connections", { cache: "no-store" }),
      d = await r.json();
    if (!r.ok) throw new Error(d.error);
    setItems(d);
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  return (
    <AccountPage>
      <Button asChild variant="link">
        <a href="/admin">← Back to administration</a>
      </Button>
      <h1>AI connections</h1>
      <p>Revoke a connection to immediately stop its Fieldbook tools.</p>
      {error && (
        <Alert variant="destructive" role="alert">
          {error}
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
                  const r = await fetch("/api/connections", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ clientId: c.client_id }),
                  });
                  if (!r.ok) throw new Error("Could not revoke connection.");
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
    </AccountPage>
  );
}
