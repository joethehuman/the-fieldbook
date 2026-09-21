"use client";
import { useEffect, useRef, useState } from "react";
import { BookOpen } from "lucide-react";
import { defaultSettings } from "@/lib/settings";
export function InstallationLogo({ logoUrl }: { logoUrl?: string }) {
  const [failed, setFailed] = useState<string>();
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    // A cached/broken image can finish before hydration attaches onError.
    if (logoUrl && image.current?.complete && !image.current.naturalWidth)
      setFailed(logoUrl);
  }, [logoUrl]);
  return logoUrl && failed !== logoUrl ? (
    <img ref={image} src={logoUrl} alt="" onError={() => setFailed(logoUrl)} />
  ) : (
    <BookOpen size={22} strokeWidth={2.3} aria-hidden="true" />
  );
}
export function InstallationIdentity({
  name,
  logoUrl,
}: {
  name?: string;
  logoUrl?: string;
}) {
  return (
    <div className="logo flex-wrap">
      <span>
        <InstallationLogo logoUrl={logoUrl} />
      </span>
      <strong className="min-w-0 flex-1 basis-40 [overflow-wrap:anywhere]">
        {name?.trim() || defaultSettings.name}
      </strong>
    </div>
  );
}
