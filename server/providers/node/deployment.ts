import "server-only";
import type { Deployment, DeploymentEnvironment } from "../../ports/deployment";

/** Standard Next.js Node runtime; a managed host still needs a verified recipe. */
export function nodeDeployment(environment: DeploymentEnvironment): Deployment {
  return {
    host: "node",
    preview: environment.FIELDBOOK_ENVIRONMENT === "preview",
    origin: environment.FIELDBOOK_URL,
    additionalOrigins: [],
  };
}
