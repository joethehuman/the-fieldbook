import { Button } from "@/components/ui/button";

import { Alert } from "@/components/ui/alert";
import { AccountPage } from "@/components/patterns/layout";
import { redirect } from "next/navigation";
import { privacySettings } from "@production/lib/privacy";
import { privacyHref } from "@/lib/settings";
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const q = await searchParams;
  if (q.next !== undefined) {
    redirect(`/auth/sign-in?next=${encodeURIComponent(q.next)}`);
  }
  const policyLink = privacyHref(await privacySettings());
  return (
    <AccountPage>
      <header className="sign-in-heading">
        <span className="eyebrow">WELCOME TO FIELDBOOK</span>
        <h1>Keep your learning with you.</h1>
        <p>Sign in with Google to save your progress across devices.</p>
      </header>
      {q.error && (
        <Alert variant="destructive" role="alert">
          Sign-in could not be completed. Check that Google is configured and
          your account is allowed to join.
        </Alert>
      )}
      <Button asChild variant="default" className="w-full">
        <a href="/auth/login">Continue with Google</a>
      </Button>
      <nav className="sign-in-footer" aria-label="Sign-in links">
        <a href="/">Back to Fieldbook</a>
        {policyLink && <a href={policyLink}>Privacy policy</a>}
      </nav>
    </AccountPage>
  );
}
