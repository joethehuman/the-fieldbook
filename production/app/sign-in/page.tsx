import { cookies } from "next/headers";
import { SIGN_IN_RETURN_COOKIE } from "@production/lib/sign-in";
import { safeNext } from "@production/lib/redirect";
import { ReturnFragment } from "./ReturnFragment";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { BrandedAccount } from "@/components/patterns/branded-account";
import { redirect } from "next/navigation";
import { publicBranding } from "@production/lib/branding";
import { errorResponse } from "@production/lib/errors";
import { AccountUnavailable } from "../AccountUnavailable";
import Link from "next/link";
import { homePath } from "@/lib/navigation";
export const dynamic = "force-dynamic";
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; reference?: string }>;
}) {
  const q = await searchParams;
  if (q.next !== undefined)
    redirect(`/auth/sign-in?next=${encodeURIComponent(q.next)}`);
  let branding;
  try {
    branding = await publicBranding();
  } catch (e) {
    const response = errorResponse(e, "sign-in/branding");
    return (
      <AccountUnavailable
        reference={response.headers.get("X-Request-Id")!}
        retry="/sign-in"
      />
    );
  }
  const reference =
    q.reference && /^[a-f0-9-]{36}$/.test(q.reference) ? q.reference : null;
  return (
    <BrandedAccount branding={branding}>
      <ReturnFragment
        destination={safeNext(
          (await cookies()).get(SIGN_IN_RETURN_COOKIE)?.value,
          homePath(branding),
        )}
      />
      <header className="sign-in-heading">
        <h1>Sign in to {branding.name}</h1>
        {branding.access === "public" && (
          <p>Sign in to save course progress across devices.</p>
        )}
        {branding.welcomeDescription && <p>{branding.welcomeDescription}</p>}
      </header>
      {q.error && (
        <Alert variant="destructive" role="alert">
          {q.error === "access"
            ? "This account is not allowed to join. Use an approved Google account or contact your administrator."
            : q.error === "service"
              ? "Sign-in services are unavailable. Try again shortly; contact your administrator if this continues."
              : "Sign-in was cancelled or could not be completed. Please try again."}
          {reference && <> Reference: {reference}.</>}
        </Alert>
      )}
      <Button asChild variant="default" className="w-full">
        <a href="/auth/login">Continue with Google</a>
      </Button>
      {branding.access === "public" && (
        <nav className="sign-in-footer" aria-label="Sign-in links">
          <Link href={homePath(branding)}>Back to browsing</Link>
        </nav>
      )}
    </BrandedAccount>
  );
}
