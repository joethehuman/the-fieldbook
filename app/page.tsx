import { homePath } from "@/lib/navigation";
import { redirect } from "next/navigation";
import { publicBranding } from "@server/branding";

export const dynamic = "force-dynamic";

export default async function Page() {
  redirect(homePath(await publicBranding()));
}
