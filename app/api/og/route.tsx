import { installationOgIdentity } from "@server/og-card";
import { installationOgImage } from "@server/og-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Request parameters, cookies and content IDs never influence this public card.
export async function GET() {
  return installationOgImage(await installationOgIdentity());
}
