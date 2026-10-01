import { AdminRouteShell } from "@/components/admin/AdminRouteShell";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <AdminRouteShell>{children}</AdminRouteShell>;
}
