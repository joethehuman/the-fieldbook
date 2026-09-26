import Link from "next/link";
import { redirect } from "next/navigation";
import Markdown from "@/components/Markdown";
import { privacySettings } from "@production/lib/privacy";
import { actor } from "@production/lib/auth";
import { readConfig } from "@production/lib/content";
import { brandingFromSettings } from "@/lib/branding";
import { ReaderShell } from "@/components/reader/ReaderShell";
import { organizationHomePath } from "@/lib/navigation";
export const dynamic = "force-dynamic";
export const metadata = { title: "Privacy policy" };
export default async function PrivacyPage() {
  const [settings, user] = await Promise.all([
    privacySettings(),
    actor(undefined, true),
  ]);
  const policy = settings.privacy?.published;
  const config = user ? await readConfig() : null;
  if (policy?.mode === "external") redirect(policy.url);
  const branding = brandingFromSettings(settings);
  return (
    <ReaderShell
      context={{
        user: user
          ? {
              id: user.id,
              name: user.name,
              email: user.email,
              role: user.role,
              managesTeam: (config?.teams || []).some(
                (team: { managerId?: string }) => team.managerId === user.id,
              ),
            }
          : null,
        branding: {
          name: branding.name,
          accent: settings.accent,
          privacyUrl: branding.privacyUrl,
        },
        docs: [],
        docCategoryOrder: [],
        docSections: [],
      }}
    >
      <div className="mx-auto grid w-full max-w-3xl gap-6">
        <Link href={organizationHomePath}>← {settings.name}</Link>
        <h1>Privacy policy</h1>
        {policy ? (
          <>
            <p>
              Operated by {policy.operatorName}. Contact:{" "}
              {policy.contactEmail && (
                <a href={`mailto:${policy.contactEmail}`}>
                  {policy.contactEmail}
                </a>
              )}
              {policy.contactEmail && policy.contactUrl && " · "}
              {policy.contactUrl && (
                <a href={policy.contactUrl}>Contact the operator</a>
              )}
            </p>
            <p>Last published: {settings.privacy?.publishedAt?.slice(0, 10)}</p>
            <article className="markdown">
              <Markdown>{policy.body}</Markdown>
            </article>
          </>
        ) : (
          <p>The operator has not published a privacy policy yet.</p>
        )}
      </div>
    </ReaderShell>
  );
}
