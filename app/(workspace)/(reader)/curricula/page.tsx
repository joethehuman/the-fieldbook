import { redirect } from "next/navigation";

export default function Page() {
  redirect("/courses");
}

// Preserve blocking rendering for this route during scoped PPR adoption.
export const instant = false;

// Retain fresh request-time reader content during scoped Cache Components adoption.
export const prefetch = "force-disabled";
