"use client";

import { useRef, useState, type RefObject } from "react";
import Link from "next/link";
import {
  ArrowLeftRight,
  BookOpen,
  GraduationCap,
  Info,
  LogIn,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Settings,
} from "lucide-react";
import { Button } from "../ui/button";
import { InitialsAvatar } from "../ui/initials-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { GeneralFeedbackDialog } from "./general-feedback-dialog";

export function AccountMenu({
  initials,
  name,
  email,
  description,
  guest = false,
  onManageOrganization,
  onTeamProgress,
  onSignOut,
  onSignIn,
  onSwitchDemoProfile,
  privacyHref,
  onPrivacyOpen,
  onAboutDemo,
  onFeedback,
  onFeedbackOpen,
  onFeedbackClose,
}: {
  initials: string;
  name: string;
  email?: string;
  description?: string;
  guest?: boolean;
  onManageOrganization?: () => void;
  onTeamProgress?: () => void;
  onSignOut?: () => void;
  onSignIn?: () => void;
  onSwitchDemoProfile?: () => void;
  privacyHref?: string | null;
  onPrivacyOpen?: () => void;
  onAboutDemo?: (trigger: RefObject<HTMLButtonElement | null>) => void;
  onFeedback: (rating: "up" | "down", comment: string) => Promise<void>;
  onFeedbackOpen?: () => void;
  onFeedbackClose?: () => void;
}) {
  const trigger = useRef<HTMLButtonElement>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  return (
    <div className="@container">
      <div
        data-slot="account-button"
        className="grid w-full min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-3 border-t border-border px-2 py-4 text-left @max-[13rem]:grid-cols-[minmax(0,1fr)_auto]"
      >
        <InitialsAvatar initials={initials} />
        <span className="min-w-0 @max-[13rem]:col-span-full">
          <span className="block break-words text-sm font-semibold leading-snug">
            {name}
          </span>
          {description && (
            <span className="mt-1 block break-words text-xs font-normal leading-snug text-muted-foreground">
              {description}
            </span>
          )}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ref={trigger}
              type="button"
              variant="ghost"
              size="icon"
              className="rounded-full hover:bg-muted-hover focus-visible:bg-muted-hover @max-[13rem]:col-start-2 @max-[13rem]:row-start-1"
              aria-label="Account menu"
              title="Account menu"
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="end"
            className="w-64"
            onEscapeKeyDown={(event) => event.stopPropagation()}
          >
            <div className="min-w-0 px-3 py-2">
              <p className="break-words text-sm font-semibold">{name}</p>
              {email && (
                <p className="break-all text-xs text-muted-foreground">
                  {email}
                </p>
              )}
              {guest && (
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Sign in with Google to save course progress across devices and
                  browsers.
                </p>
              )}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                onFeedbackOpen?.();
                setFeedbackOpen(true);
              }}
            >
              Feedback{" "}
              <MessageSquare className="ml-auto size-4" aria-hidden="true" />
            </DropdownMenuItem>
            {onTeamProgress && (
              <DropdownMenuItem onSelect={onTeamProgress}>
                My team’s progress{" "}
                <GraduationCap className="ml-auto size-4" aria-hidden="true" />
              </DropdownMenuItem>
            )}
            {onManageOrganization && (
              <DropdownMenuItem onSelect={onManageOrganization}>
                Manage organization{" "}
                <Settings className="ml-auto size-4" aria-hidden="true" />
              </DropdownMenuItem>
            )}
            {privacyHref && (
              <DropdownMenuItem asChild>
                {privacyHref.startsWith("/") ? (
                  <Link href={privacyHref} onClick={onPrivacyOpen}>
                    Privacy policy{" "}
                    <BookOpen className="ml-auto size-4" aria-hidden="true" />
                  </Link>
                ) : (
                  <a href={privacyHref} onClick={onPrivacyOpen}>
                    Privacy policy{" "}
                    <BookOpen className="ml-auto size-4" aria-hidden="true" />
                  </a>
                )}
              </DropdownMenuItem>
            )}
            {onAboutDemo && (
              <DropdownMenuItem onSelect={() => onAboutDemo(trigger)}>
                About this demo{" "}
                <Info className="ml-auto size-4" aria-hidden="true" />
              </DropdownMenuItem>
            )}
            {(onSignOut || onSignIn) && <DropdownMenuSeparator />}
            {onSignOut && (
              <DropdownMenuItem onSelect={onSignOut}>
                Sign out{" "}
                <LogOut className="ml-auto size-4" aria-hidden="true" />
              </DropdownMenuItem>
            )}
            {onSignIn && (
              <DropdownMenuItem onSelect={onSignIn}>
                Sign in with Google{" "}
                <LogIn className="ml-auto size-4" aria-hidden="true" />
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {onSwitchDemoProfile && (
          <Button
            type="button"
            variant="ghost"
            className="col-span-full justify-start"
            onClick={onSwitchDemoProfile}
          >
            <ArrowLeftRight className="size-4" aria-hidden="true" />
            Switch demo profile
          </Button>
        )}
      </div>
      <GeneralFeedbackDialog
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        onSave={onFeedback}
        returnFocus={() => {
          onFeedbackClose?.();
          if (
            !onFeedbackClose ||
            !window.matchMedia("(max-width: 767px)").matches
          )
            trigger.current?.focus();
        }}
      />
    </div>
  );
}
