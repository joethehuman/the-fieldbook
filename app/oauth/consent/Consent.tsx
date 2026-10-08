"use client";
import { Button } from "@/components/ui/button";
import { ActionGroup } from "@/components/ui/action-group";
import { Alert } from "@/components/ui/alert";
import { BrandedAccount } from "@/components/patterns/branded-account";
import type { Branding } from "@/lib/branding";
import { request, RequestError } from "@/lib/workspace-save";
import { useEffect, useState } from "react";
import { Checkbox } from "@/components/ui/choice";
import { Field, FieldGroup } from "@/components/ui/field";
import type { McpCapability } from "@/lib/mcp-access";
export default function Consent({ branding }: { branding: Branding }) {
  const [details, setDetails] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [id, setId] = useState(""),
    [capabilities, setCapabilities] = useState<McpCapability[]>([]);
  useEffect(() => {
    const value =
      new URLSearchParams(window.location.search).get("authorization_id") || "";
    setId(value);
    request(`/api/consent?id=${encodeURIComponent(value)}`)
      .then((d) => {
        if (d.redirect_url) window.location.assign(d.redirect_url);
        else {
          setDetails(d);
          setCapabilities(d.capabilities);
        }
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
      const d = await request("/api/consent", { id, allow, capabilities });
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
          ? `Allow ${details.client.name} to use Fieldbook?`
          : "Connecting your AI…"}
      </h1>
      {error && (
        <div className="grid gap-3">
          <Alert variant="destructive" role="alert">
            {error}
          </Alert>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      )}
      {details && (
        <>
          <p>
            This connection acts as <strong>{details.user.email}</strong>.
          </p>
          <FieldGroup>
            <legend>Approve tool permissions</legend>
            {details.capabilities.map((capability: McpCapability) => (
              <Field key={capability} orientation="horizontal">
                <Checkbox
                  checked={capabilities.includes(capability)}
                  disabled={busy}
                  onCheckedChange={(checked) =>
                    setCapabilities((current) =>
                      checked === true
                        ? [...current, capability]
                        : current.filter((item) => item !== capability),
                    )
                  }
                />
                <span>{details.capabilityDescriptions[capability]}</span>
              </Field>
            ))}
          </FieldGroup>
          <p>
            Your current Fieldbook role and reporting teams limit every request.
            New privileges require approval again.
          </p>
          <p>
            You can revoke this connection in {branding.name} at any time. The
            client name is supplied by the connecting application; approve only
            a connection you initiated.
          </p>
          <p className="muted">Requested identity access: {details.scope}</p>
          <ActionGroup>
            <Button
              variant="default"
              disabled={busy || capabilities.length === 0}

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
