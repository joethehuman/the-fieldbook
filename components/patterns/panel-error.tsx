"use client";
import { Alert } from "../ui/alert";
import { Button } from "../ui/button";
import { SectionHeader } from "./layout";
import { useRouter } from "next/navigation";
import { startTransition } from "react";

export function PanelError({ reset }: { reset: () => void }) {
  const router = useRouter();
  return (
    <div className="grid min-h-64 content-start gap-4">
      <SectionHeader
        variant="page"
        title={<h2>Unable to load this section</h2>}
      />
      <Alert variant="destructive" role="alert">
        The data could not be read completely. Try again shortly.
      </Alert>
      <div>
        <Button
          onClick={() =>
            startTransition(() => {
              router.refresh();
              reset();
            })
          }
        >
          Try again
        </Button>
      </div>
    </div>
  );
}
