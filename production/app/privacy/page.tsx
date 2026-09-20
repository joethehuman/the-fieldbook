import { ReadingPage } from "@/components/patterns/layout";
import { redirect } from "next/navigation";
import Markdown from "@/components/Markdown";
import { privacySettings } from "@production/lib/privacy";
export const dynamic = "force-dynamic";
export const metadata = { title: "Privacy policy" };
export default async function PrivacyPage() {
  const settings = await privacySettings();
  const policy = settings.privacy?.published;
  if (policy?.mode === "external") redirect(policy.url);
  return (
    <ReadingPage>
      <a href="/">← {settings.name}</a>
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
    </ReadingPage>
  );
}
