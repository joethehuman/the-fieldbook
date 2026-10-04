"use client";
import { useEffect, useRef, useState } from "react";
import { Maximize2, X } from "lucide-react";
import { videoSource } from "@/lib/video";
import { Button } from "../ui/button";
import { SelectField } from "../ui/select";
import { ActionGroup } from "../ui/action-group";
import { Note } from "../ui/note";
import { Field } from "../ui/field";

export function CourseVideo({
  url,
  title,
  posterUrl,
  allowFullscreen = true,
}: {
  url: string;
  title: string;
  posterUrl?: string;
  allowFullscreen?: boolean;
}) {
  const source = videoSource(url);
  const ref = useRef<HTMLVideoElement>(null);
  const frame = useRef<HTMLSpanElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const wasFullscreen = useRef(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenAvailable, setFullscreenAvailable] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const [speed, setSpeed] = useState("1.2");
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const position = useRef(0);
  useEffect(() => {
    setFullscreenAvailable(
      Boolean(document.fullscreenEnabled && frame.current?.requestFullscreen),
    );
    function syncFullscreen() {
      const active =
        document.fullscreenElement === frame.current && frame.current !== null;
      setFullscreen(active);
      if (wasFullscreen.current && !active)
        fullscreenButton.current?.focus({ preventScroll: true });
      wasFullscreen.current = active;
    }
    document.addEventListener("fullscreenchange", syncFullscreen);
    return () =>
      document.removeEventListener("fullscreenchange", syncFullscreen);
  }, [url]);

  async function toggleFullscreen() {
    setFullscreenError("");
    try {
      if (document.fullscreenElement === frame.current)
        await document.exitFullscreen();
      else await frame.current?.requestFullscreen();
    } catch {
      setFullscreenError(
        "Fullscreen is unavailable right now. Use the video player’s fullscreen control or try again.",
      );
    }
  }
  if (!source)
    return (
      <Note>This video URL is not supported. Ask an editor to update it.</Note>
    );
  return (
    <span className="course-video">
      <span ref={frame} className="course-video-frame">
        {source.type === "file" && !ready && !failed && (
          <span className="course-video-loading" role="status">
            Loading video…
          </span>
        )}
        {source.type === "embed" ? (
          <iframe
            src={source.url}
            title={title}
            loading="lazy"
            allowFullScreen
            allow="accelerometer; autoplay; encrypted-media; fullscreen; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : (
          <video
            key={retry}
            ref={ref}
            src={
              retry && source.url.startsWith("/api/media/")
                ? `${source.url}?renew=${retry}`
                : source.url
            }
            controls
            preload="metadata"
            playsInline
            poster={posterUrl}
            aria-label={title}
            onTimeUpdate={(event) => {
              position.current = event.currentTarget.currentTime;
            }}
            onError={() => {
              setFailed(true);
              setReady(false);
            }}
            onLoadedData={() => setReady(true)}
            onLoadedMetadata={(event) => {
              event.currentTarget.playbackRate = Number(speed);
              if (position.current)
                event.currentTarget.currentTime = position.current;
              setFailed(false);
            }}
          >
            Your browser does not support video playback.
          </video>
        )}
        {allowFullscreen && fullscreenAvailable && (
          <Button
            ref={fullscreenButton}
            type="button"
            variant="outline"
            size="icon"
            className="absolute top-3 right-3 z-10"
            aria-label={
              fullscreen
                ? "Close fullscreen video"
                : "Expand video to fullscreen"
            }
            title={
              fullscreen
                ? "Close fullscreen video"
                : "Expand video to fullscreen"
            }
            onClick={toggleFullscreen}
          >
            {fullscreen ? (
              <X aria-hidden="true" />
            ) : (
              <Maximize2 aria-hidden="true" />
            )}
          </Button>
        )}
      </span>
      {fullscreenError && <Note role="alert">{fullscreenError}</Note>}
      {source.type === "file" && (
        <ActionGroup asChild className="course-video-actions">
          <span>
            {failed && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setRetry((value) => value + 1);
                  setFailed(false);
                  setReady(false);
                }}
              >
                Retry video
              </Button>
            )}
            <Field orientation="horizontal" className="course-video-speed">
              <span>Speed</span>
              <SelectField
                value={speed}
                onValueChange={(value) => {
                  setSpeed(value);
                  if (ref.current) ref.current.playbackRate = Number(value);
                }}
              >
                {["0.75", "1", "1.2", "1.5", "2"].map((value) => (
                  <option key={value} value={value}>
                    {value}×
                  </option>
                ))}
              </SelectField>
            </Field>
          </span>
        </ActionGroup>
      )}
    </span>
  );
}
