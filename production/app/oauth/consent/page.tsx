"use client";
import { useEffect, useState } from "react";
export default function Consent() {
  const [details, setDetails] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [id, setId] = useState("");
  useEffect(() => {
    const value =
      new URLSearchParams(window.location.search).get("authorization_id") || "";
    setId(value);
    fetch(`/api/consent?id=${encodeURIComponent(value)}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 401) {
          window.location.href = `/auth/sign-in?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
          return;
        }
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        if (d.redirect_url) window.location.assign(d.redirect_url);
        else setDetails(d);
      })
      .catch((e) => setError(e.message));
  }, []);
  async function decide(allow: boolean) {
    setBusy(true);
    try {
      const r = await fetch("/api/consent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, allow }),
        }),
        d = await r.json();
      if (!r.ok) throw new Error(d.error);
      window.location.assign(d.redirect_url);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <main className="auth-card">
      <span className="eyebrow">CONNECT TO FIELDBOOK</span>
      <h1>
        {details
          ? `Allow ${details.client.name} to manage content?`
          : "Connecting your AI…"}
      </h1>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
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
            You can revoke this connection in Fieldbook at any time. The client
            name is supplied by the connecting application; approve only a
            connection you initiated.
          </p>
          <p className="muted">Requested identity access: {details.scope}</p>
          <div className="button-group">
            <button
              disabled={busy}
              className="primary"
              onClick={() => decide(true)}
            >
              Allow connection
            </button>
            <button
              disabled={busy}
              className="secondary"
              onClick={() => decide(false)}
            >
              Deny
            </button>
          </div>
        </>
      )}
    </main>
  );
}
