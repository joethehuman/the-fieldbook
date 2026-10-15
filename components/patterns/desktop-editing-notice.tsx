"use client";

import { Monitor } from "lucide-react";
import { Button } from "../ui/button";
import { EmptyState } from "./layout";

export function DesktopEditingNotice({ onBack }: { onBack?: () => void | Promise<void> }) {
  return (
    <EmptyState role="note" aria-label="Desktop editing required">
      <Monitor aria-hidden="true" className="size-6" />
      <h2>Editing is available on desktop</h2>
      <p>Open Fieldbook on a desktop browser to create or edit content.</p>
      {onBack && <Button type="button" variant="outline" onClick={() => void onBack()}>Back to content</Button>}
    </EmptyState>
  );
}
