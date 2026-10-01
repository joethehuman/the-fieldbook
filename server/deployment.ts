import "server-only";
import { ServiceError } from "./errors";
import type { DeploymentEnvironment } from "./ports/deployment";
import {
  vercelDeployment,
  vercelClientAddress,
} from "./providers/vercel/deployment";
import { nodeDeployment } from "./providers/node/deployment";

export function deployment(environment: DeploymentEnvironment = process.env) {
  // Preserve existing installations without adding a required environment value.
  const onVercel = Boolean(environment.VERCEL || environment.VERCEL_ENV);
  const host = environment.FIELDBOOK_HOST || (onVercel ? "vercel" : "node");
  if (!["vercel", "node"].includes(host) || (onVercel && host !== "vercel"))
    throw new ServiceError(
      "Fieldbook hosting configuration is invalid. Check FIELDBOOK_HOST.",
      "configuration",
      "configuration_missing",
    );
  return host === "vercel"
    ? vercelDeployment(environment)
    : nodeDeployment(environment);
}

/** Only use address headers the selected host establishes as trusted. */
export function clientAddress(request: Request) {
  return deployment().host === "vercel" ? vercelClientAddress(request) : null;
}
