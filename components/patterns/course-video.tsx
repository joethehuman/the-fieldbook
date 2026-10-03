"use client";
import { useRef, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import { videoSource } from "@/lib/video";
import { Button } from "../ui/button";
import { SelectField } from "../ui/select";
import { ActionGroup } from "../ui/action-group";
import { Note } from "../ui/note";
import { Field } from "../ui/field";

export function CourseVideo({ url, title, posterUrl, allowTheater = true }: { url: string; title: string; posterUrl?: string; allowTheater?: boolean }) {
  const source = videoSource(url);
  const ref = useRef<HTMLVideoElement>(null);
  const [theater, setTheater] = useState(false);
  const [speed, setSpeed] = useState("1.2");
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const position = useRef(0);
  if (!source) return <Note>This video URL is not supported. Ask an editor to update it.</Note>;
  return <span className={theater ? "course-video theater" : "course-video"}>
    {source.type === "file" && !ready && !failed && <span className="course-video-loading" role="status">Loading video…</span>}
    {source.type === "embed" ? <iframe
      src={source.url} title={title} loading="lazy" allowFullScreen
      allow="accelerometer; autoplay; encrypted-media; fullscreen; picture-in-picture"
      referrerPolicy="strict-origin-when-cross-origin"
    /> : <video
      key={retry} ref={ref} src={retry && source.url.startsWith("/api/media/") ? `${source.url}?renew=${retry}` : source.url} controls preload="metadata" playsInline poster={posterUrl}
      aria-label={title}
      onTimeUpdate={(event) => { position.current = event.currentTarget.currentTime; }}
      onError={() => { setFailed(true); setReady(false); }}
      onLoadedData={() => setReady(true)}
      onLoadedMetadata={(event) => {
        event.currentTarget.playbackRate = Number(speed);
        if (position.current) event.currentTarget.currentTime = position.current;
        setFailed(false);
      }}
    >Your browser does not support video playback.</video>}
    <ActionGroup asChild className="course-video-actions"><span>
      {failed && source.type === "file" && <Button type="button" variant="outline" size="sm" onClick={() => { setRetry((value) => value + 1); setFailed(false); setReady(false); }}>Retry video</Button>}
      {source.type === "file" && <Field orientation="horizontal" className="course-video-speed">
        <span>Speed</span>
        <SelectField value={speed} onValueChange={(value) => {
          setSpeed(value);
          if (ref.current) ref.current.playbackRate = Number(value);
        }}>
          {["0.75", "1", "1.2", "1.5", "2"].map((value) => <option key={value} value={value}>{value}×</option>)}
        </SelectField>
      </Field>}
      {allowTheater && <Button type="button" variant="outline" size="sm" onClick={() => setTheater(!theater)}>
        {theater ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        {theater ? "Exit theater" : "Theater view"}
      </Button>}
    </span></ActionGroup>
  </span>;
}
