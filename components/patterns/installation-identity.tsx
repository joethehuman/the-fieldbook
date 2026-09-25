import { defaultSettings } from "@/lib/settings";
export function InstallationIdentity({ name }: { name?: string }) {
  return (
    <div className="logo min-w-0 [overflow-wrap:anywhere]">
      {name?.trim() || defaultSettings.name}
    </div>
  );
}
