"use client";
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
    <main className="auth-card">
      <a className="text-button" href="/admin">
        ← Back to administration
      </a>
      <h1>AI connections</h1>
      <p>Revoke a connection to immediately stop its Fieldbook tools.</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {items.map((c) => (
        <div className="integration-card" key={c.client_id}>
          <h2>{c.client_name}</h2>
          <p>{c.enabled ? "Connected" : "Revoked"}</p>
          {c.enabled && (
            <button
              className="secondary"
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
            </button>
          )}
        </div>
      ))}
      {!items.length && !error && <p>No AI connections yet.</p>}
    </main>
  );
}
