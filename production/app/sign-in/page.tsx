import { privacySettings } from "@production/lib/privacy";
import { privacyHref } from "@/lib/settings";
export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const q = await searchParams;
  const policyLink = privacyHref(await privacySettings());
  return (
    <main className="auth-card">
      <span className="eyebrow">WELCOME TO FIELDBOOK</span>
      <h1>Keep your learning with you.</h1>
      <p>Sign in with Google to save your progress across devices.</p>
      {q.error && (
        <p className="error">
          Sign-in could not be completed. Check that Google is configured and
          your account is allowed to join.
        </p>
      )}
      <a
        className="primary"
        href={`/auth/login?next=${encodeURIComponent(q.next || "/")}`}
      >
        Continue with Google
      </a>
      {policyLink && <a href={policyLink}>Privacy policy</a>}
      <a className="text-button" href="/">
        Back to Fieldbook
      </a>
    </main>
  );
}
