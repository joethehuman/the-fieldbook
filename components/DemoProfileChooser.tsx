import type { ReactNode } from "react";
import type { Branding } from "@/lib/branding";
import { BrandedAccountFrame } from "./patterns/branded-account";
import { Badge } from "./ui/badge";

/** Demo introduction; profile selection and restoration stay with Fieldbook. */
export function DemoProfileChooser({
  branding,
  children,
}: {
  branding: Branding;
  children: ReactNode;
}) {
  return (
    <BrandedAccountFrame
      branding={branding}
      centered
      className="demo-picker max-w-[66rem] shrink-0 gap-0 overflow-hidden border-l-[6px] [border-left-color:var(--brand)] p-0 sm:p-0 max-[800px]:[&_h1]:text-4xl min-[801px]:grid-cols-[1.15fr_1fr] [&_h1]:text-[clamp(3rem,6vw,5.5rem)] [&_h1]:font-medium [&_p.demo-picker-tagline]:text-base [&_p.demo-picker-tagline]:text-foreground"
    >
      <div className="demo-picker-intro">
        <div className="demo-picker-formats hidden min-[801px]:flex">
          Updates <span aria-hidden="true">·</span> Courses{" "}
          <span aria-hidden="true">·</span> Docs
        </div>
        <div className="demo-picker-identity">
          <h1>{branding.name}</h1>
          <p className="demo-picker-tagline">
            Disrupting the disruption.
            <span className="hidden min-[801px]:inline">
              <br />
              Please complete your training.
            </span>
          </p>
        </div>
        <div className="demo-picker-about">
          <p>
            <span className="min-[801px]:hidden">
              A demo of The Fieldbook: free, source-available (ELv2) learning
              and knowledge management.
            </span>
            <span className="hidden min-[801px]:inline">
              A static, interactive demo of The Fieldbook, a free,
              source-available (ELv2) learning and knowledge management system.
            </span>
          </p>
          <nav aria-label="About The Fieldbook" className="demo-picker-links">
            <a href="https://thefieldbook.org" target="_blank" rel="noreferrer">
              thefieldbook.org
            </a>
            <a
              href="https://github.com/joethehuman/the-fieldbook"
              target="_blank"
              rel="noreferrer"
            >
              Public repository
            </a>
          </nav>
        </div>
      </div>
      <section
        className="demo-picker-profiles"
        aria-labelledby="demo-profiles-heading"
      >
        <div className="demo-picker-heading">
          <Badge variant="default" className="hidden min-[801px]:inline-flex">
            INTERACTIVE DEMO
          </Badge>
          <h2 id="demo-profiles-heading">Choose a demo profile</h2>
          <p className="hidden min-[801px]:block">
            Pick an account to explore learning, publishing, team reporting, or
            administration. Switch profiles anytime.
          </p>
        </div>
        {children}
        <div className="demo-note">
          <p>
            Changes stay in this browser.
            <span className="hidden min-[801px]:inline">
              {" "}
              Reset demo to start fresh.
            </span>
          </p>
        </div>
        {branding.privacyUrl && (
          <nav aria-label="Privacy">
            <a href={branding.privacyUrl}>Privacy policy</a>
          </nav>
        )}
      </section>
    </BrandedAccountFrame>
  );
}
