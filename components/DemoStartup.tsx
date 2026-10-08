import type { ReactNode } from "react";
import { BookOpen, GraduationCap, Menu, Newspaper } from "lucide-react";
import { WorkspaceFrame } from "./patterns/workspace-frame";
import {
  SidebarHeading,
  sidebarPrimaryLinkClassName,
} from "./patterns/desktop-sidebar";
import { NavigationButton } from "./patterns/navigation-button";
import { Button } from "./ui/button";

const ignore = () => {};

// Both variants have identical server/client markup. The early session hint
// chooses their visibility; neither the hint nor this shell grants account access.
export function DemoStartup({
  name,
  accent,
  picker,
}: {
  name: string;
  accent: string;
  picker: ReactNode;
}) {
  return (
    <>
      <div data-demo-startup-shell aria-hidden="true" inert>
        <WorkspaceFrame
          accent={accent}
          collapsed={false}
          menu={false}
          pending={false}
          onDismiss={ignore}
          sidebar={
            <>
              <SidebarHeading
                name={name}
                collapsed={false}
                onToggle={ignore}
                onClose={ignore}
              />
              <nav className="primary-navigation">
                {[
                  { title: "Updates", icon: Newspaper },
                  { title: "Courses", icon: GraduationCap },
                  { title: "Docs", icon: BookOpen },
                ].map(({ title, icon: Icon }) => (
                  <NavigationButton
                    key={title}
                    className={sidebarPrimaryLinkClassName}
                    tabIndex={-1}
                  >
                    <Icon size={19} />
                    <span className="sidebar-nav-text">{title}</span>
                  </NavigationButton>
                ))}
              </nav>
            </>
          }
          header={
            <>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
                <Menu />
              </Button>
            </>
          }
        >
          {null}
        </WorkspaceFrame>
      </div>
      <div data-demo-startup-picker>{picker}</div>
    </>
  );
}
