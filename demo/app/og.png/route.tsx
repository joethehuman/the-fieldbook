import { installationOgImage } from "../../../server/og-image";
import { ogCardIdentity } from "../../../lib/og-card";
import { demoOgOrigin } from "../../og-card";

// Browser-local settings cannot change a static export's social image.
export const dynamic = "force-static";
export async function GET() {
  return installationOgImage(
    ogCardIdentity({ name: "The Fieldbook" }, demoOgOrigin()),
  );
}
