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
  onMenuOpen,
  onManageOrganizationIntent,
  onTeamProgressIntent,
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
  onMenuOpen?: () => void;
  onManageOrganizationIntent?: () => void;
  onTeamProgressIntent?: () => void;
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  return (
    <div className="@container">
      <div
        data-slot="account-button"
        className="grid w-full min-w-0 grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] items-center gap-3 border-t border-border px-2 py-4 text-left @max-[13rem]:grid-cols-[minmax(0,1fr)_auto]"
      >
        <InitialsAvatar
          initials={initials}
          className="sidebar-account-avatar"
        />
        <span className="sidebar-account-identity min-w-0 @max-[13rem]:col-span-full">
          <span className="block break-words text-sm font-semibold leading-snug">
            {name}
          </span>
          {description && (
            <span className="mt-1 block break-words text-xs font-normal leading-snug text-muted-foreground">
              {description}
            </span>
          )}
        </span>
        <DropdownMenu
          open={menuOpen}
          onOpenChange={(open) => {
            setMenuOpen(open);
            if (open) onMenuOpen?.();
          }}
        >
          <DropdownMenuTrigger asChild>
            <Button
              ref={trigger}
              type="button"
              variant="ghost"
              size="icon"
              className="sidebar-account-trigger rounded-full transition-[transform,background-color,color] duration-[180ms] hover:bg-muted-hover focus-visible:bg-muted-hover @max-[13rem]:col-start-2 @max-[13rem]:row-start-1"
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
              <DropdownMenuItem
                onSelect={onTeamProgress}
                onPointerEnter={onTeamProgressIntent}
                onFocus={onTeamProgressIntent}
              >
                My team’s progress{" "}
                <GraduationCap className="ml-auto size-4" aria-hidden="true" />
              </DropdownMenuItem>
            )}
            {onManageOrganization && (
              <DropdownMenuItem
                onSelect={onManageOrganization}
                onPointerEnter={onManageOrganizationIntent}
                onFocus={onManageOrganizationIntent}
              >
                Manage organization{" "}
                <Settings className="ml-auto size-4" aria-hidden="true" />
              </DropdownMenuItem>
            )}
            {privacyHref && (
              <DropdownMenuItem asChild>
                {privacyHref.startsWith("/") ? (
                  <Link
                    href={privacyHref}
                    onClickCapture={() => setMenuOpen(false)}
                    onClick={onPrivacyOpen}
                  >
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
            className="sidebar-account-secondary col-span-full justify-start"
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
