import { connection } from "next/server";
import { homePath } from "@/lib/navigation";
import { redirect } from "next/navigation";
import { publicBranding } from "@server/branding";

export const instant = false;

export default async function Page() {
  await connection();
  redirect(homePath(await publicBranding()));
}
