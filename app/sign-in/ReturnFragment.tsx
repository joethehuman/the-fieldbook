"use client";
import { useEffect } from "react";
export function ReturnFragment({ destination }: { destination: string }) {
  useEffect(() => {
    if (window.location.hash && !destination.includes("#")) {
      window.location.replace(
        `/auth/sign-in?next=${encodeURIComponent(destination + window.location.hash)}`,
      );
    }
  }, [destination]);
  return null;
}
