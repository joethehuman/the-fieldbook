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

/** Next's standalone server can construct request.url from its internal bind
 * address. Host is used only to compare with the configured public authority;
 * it never supplies a redirect destination, and forwarded headers are ignored. */
export function nodeRequestMatchesOrigin(request: Request, origin: string) {
  const actual = new URL(request.url);
  const expected = new URL(origin);
  return (
    actual.origin === expected.origin ||
    (actual.protocol === expected.protocol &&
      request.headers.get("host")?.toLowerCase() ===
        expected.host.toLowerCase())
  );
}
