import "server-only";
import { deployment } from "../../deployment";
import { ServiceError } from "../../errors";

export function supabaseEnvironment() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key || !secret)
    throw new ServiceError(
      "Fieldbook configuration is incomplete. Ask the operator to check the required environment variables.",
      "configuration",
      "configuration_missing",
    );
  if (deployment().preview) {
    const previewUrl = process.env.FIELDBOOK_PREVIEW_SUPABASE_URL;
    const previewRef = process.env.FIELDBOOK_PREVIEW_SUPABASE_REF;
    let matches = false;
    if (previewUrl) {
      try {
        const expected = new URL(previewUrl);
        const actual = new URL(url);
        matches =
          expected.protocol === "https:" &&
          !expected.username &&
          !expected.password &&
          !expected.search &&
          !expected.hash &&
          expected.href.replace(/\/$/, "") === actual.href.replace(/\/$/, "");
      } catch {
        // Invalid declared isolation must fail closed, never fall back to a ref.
      }
    } else {
      matches = Boolean(
        previewRef && new URL(url).hostname === `${previewRef}.supabase.co`,
      );
    }
    if (!matches)
      throw new ServiceError(
        "Preview must use its explicitly configured isolated Supabase backend.",
        "configuration",
        "preview_backend",
      );
  }
  return { url, key, secret };
}
