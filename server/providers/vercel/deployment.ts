import "server-only";
import type { Deployment, DeploymentEnvironment } from "../../ports/deployment";

export function vercelClientAddress(request: Request) {
  return (
    request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || null
  );
}

export function vercelDeployment(
  environment: DeploymentEnvironment,
): Deployment {
  const preview = environment.VERCEL_ENV === "preview";
  return {
    host: "vercel",
    preview: preview || environment.FIELDBOOK_ENVIRONMENT === "preview",
    origin:
      preview && environment.VERCEL_BRANCH_URL
        ? `https://${environment.VERCEL_BRANCH_URL}`
        : environment.FIELDBOOK_URL,
    additionalOrigins:
      preview && environment.VERCEL_URL
        ? [`https://${environment.VERCEL_URL}`]
        : [],
  };
}
