"use client";
import { BulkActions } from "@/components/patterns/bulk-actions";
import {
  useBulkSelection,
  SelectRows,
} from "@/components/patterns/bulk-selection";
import { Checkbox } from "@/components/ui/choice";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/patterns/layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { BrandedAccount } from "@/components/patterns/branded-account";
import type { Branding } from "@/lib/branding";
import { request, RequestError } from "@/lib/workspace-save";
import { useEffect, useState } from "react";
import { Field, FieldGroup } from "@/components/ui/field";
import type { McpCapability } from "@/lib/mcp-access";
export default function Connections({ branding }: { branding: Branding }) {
  const [items, setItems] = useState<any[]>([]),
    [error, setError] = useState("");
  const selection = useBulkSelection(
    "connections",
    items.map((c) => c.client_id),
    items.filter((c) => c.enabled).map((c) => c.client_id),
  );
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<McpCapability[]>([]);
  async function load() {
    setLoading(true);
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
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, []);
  return (
    <BrandedAccount branding={branding}>
      <Button asChild variant="link">
        <a href="/">← Back to Fieldbook</a>
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
      {loading && (
        <div
          role="status"
          aria-label="Loading connections"
          className="grid gap-3"
        >
          <Skeleton className="h-24" />
          <span className="sr-only">Loading connections…</span>
        </div>
      )}
      <BulkActions
        collectionSize={selection.collectionSize}
        selected={selection.actionIds}
        onSelectionChange={selection.setSelected}
        noun="connections"
        commands={[
          {
            id: "revoke",
            label: "Revoke selected connections",
            description:
              "Immediately stop these AI tools’ access for your account. Reconnecting requires authorization again.",
            destructive: true,
            acknowledgment: "I understand these connections will lose access.",
            apply: async () => {
              const failed: string[] = [];
              for (const clientId of selection.actionIds) {
                try {
                  await request("/api/connections", { clientId });
                } catch {
                  failed.push(clientId);
                }
              }
              await load();
              return {
                failed,
                message: `${selection.actionIds.length - failed.length} connections revoked; ${failed.length} could not be fully confirmed. Review provider consent before reconnecting.`,
              };
            },
          },
        ]}
      />
      {selection.canSelect && (
        <div className="flex items-center gap-3">
          <SelectRows
            label="Select active connections"
            ids={items.filter((c) => c.enabled).map((c) => c.client_id)}
            value={selection.selected}
            onChange={selection.setSelected}
          />
          Select active connections
        </div>
      )}
      {items.map((c) => (
        <Card className="grid gap-4" key={c.client_id}>
          <div className="flex items-center gap-3">
            {selection.canSelect && (
              <Checkbox
                aria-label={`Select ${c.client_name}`}
                disabled={
                  !c.enabled && !selection.selected.includes(c.client_id)
                }
                checked={selection.selected.includes(c.client_id)}
                onCheckedChange={(v) =>
                  selection.toggle(c.client_id, v === true)
                }
              />
            )}
            <h2>{c.client_name}</h2>
          </div>
          <p>{c.enabled ? "Connected" : "Revoked"}</p>
          {c.enabled && (
            <>
              <ul>
                {c.access.capabilities.map((capability: McpCapability) => (
                  <li key={capability}>
                    {c.capabilityDescriptions[capability]}
                  </li>
                ))}
              </ul>
              {c.access.capabilities.length === 0 && (
                <p>
                  Your current role and approved permissions do not allow any
                  content or reporting tools.
                </p>
              )}
              {c.access.availableCapabilities.length > 0 &&
                reviewing !== c.client_id && (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setReviewing(c.client_id);
                      setPermissions(c.access.capabilities);
                    }}
                  >
                    Review permissions
                  </Button>
                )}
              {reviewing === c.client_id && (
                <>
                  <FieldGroup>
                    <legend>
                      Approve tool permissions for {c.client_name}
                    </legend>
                    {c.access.availableCapabilities.map(
                      (capability: McpCapability) => (
                        <Field key={capability} orientation="horizontal">
                          <Checkbox
                            checked={permissions.includes(capability)}
                            disabled={approving !== null}
                            onCheckedChange={(checked) =>
                              setPermissions((current) =>
                                checked === true
                                  ? [...current, capability]
                                  : current.filter(
                                      (item) => item !== capability,
                                    ),
                              )
                            }
                          />
                          <span>{c.capabilityDescriptions[capability]}</span>
                        </Field>
                      ),
                    )}
                  </FieldGroup>
                  <p>
                    Approve added access only for a client you trust. Refresh
                    its tools and start a new conversation after approval.
                  </p>
                  <Button
                    loading={approving === c.client_id}
                    disabled={approving !== null || permissions.length === 0}
                    onClick={async () => {
                      setApproving(c.client_id);
                      try {
                        await request("/api/connections", {
                          clientId: c.client_id,
                          capabilities: permissions,
                        });
                        setReviewing(null);
                        await load();
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setApproving(null);
                      }
                    }}
                  >
                    Approve selected permissions
                  </Button>
                  <Button
                    variant="outline"
                    disabled={approving !== null}
                    onClick={() => setReviewing(null)}
                  >
                    Cancel
                  </Button>
                </>
              )}
            </>
          )}
          {c.enabled && (
            <Button
              variant="outline"
              loading={revoking === c.client_id}
              disabled={revoking !== null}
              onClick={async () => {
                setRevoking(c.client_id);
                try {
                  await request("/api/connections", { clientId: c.client_id });
                  await load();
                } catch (e) {
                  setError((e as Error).message);
                } finally {
                  setRevoking(null);
                }
              }}
            >
              Revoke access
            </Button>
          )}
        </Card>
      ))}
      {!loading && !items.length && !error && (
        <EmptyState>
          <h2>No AI connections yet.</h2>
          <p>
            Connect an AI tool to this installation’s /api/mcp address when
            you’re ready.
          </p>
        </EmptyState>
      )}
    </BrandedAccount>
  );
}
