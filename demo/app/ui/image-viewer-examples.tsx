"use client";

import { useState } from "react";
import { ImageViewer } from "@/components/patterns/image-viewer";
import { SectionHeader } from "@/components/patterns/layout";
import { ActionGroup } from "@/components/ui/action-group";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function ImageViewerExamples() {
  const [image, setImage] = useState<{ src: string; alt: string } | null>(null);
  return (
    <section id="image-viewer" className="grid min-w-0 gap-6">
      <SectionHeader
        title={<h2>Image viewer</h2>}
        description="Images fit the available screen space. Close, Escape and clicking outside return focus to the opening control."
      />
      <Card>
        <ActionGroup>
          <Button
            variant="outline"
            onClick={() =>
              setImage({
                src: "/ui/image-viewer-landscape.svg",
                alt: "Landscape illustration",
              })
            }
          >
            View landscape image
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              setImage({
                src: "/ui/image-viewer-portrait.svg",
                alt: "Portrait illustration",
              })
            }
          >
            View portrait image
          </Button>
        </ActionGroup>
      </Card>
      <ImageViewer image={image} onClose={() => setImage(null)} />
    </section>
  );
}
