import { organizationHomePath } from "@/lib/navigation";
import { redirect } from "next/navigation";

export default function Page() {
  redirect(organizationHomePath);
}
