"use client";
import { useRef, useState } from "react";
import { videoSource } from "@/lib/video";
import { Button } from "../ui/button";
import { ActionGroup } from "../ui/action-group";
import { Note } from "../ui/note";

function EmbeddedVideo({ url, title, posterUrl, eager }: { url: string; title: string; posterUrl?: string; eager: boolean }) {
  const [ready, setReady] = useState(false);
  const [posterIndex, setPosterIndex] = useState(0);
  const youtubeId = url.match(/^https:\/\/www\.youtube-nocookie\.com\/embed\/([\w-]{11})$/)?.[1];
  const posters = youtubeId
    ? [
        `https://i.ytimg.com/vi/${youtubeId}/maxresdefault.jpg`,
        `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
        posterUrl,
      ]
    : [posterUrl];
  const poster = posters[posterIndex];

  return <span className="course-video-embed">
    {!ready && <span className="course-video-poster">
      {poster && <img src={poster} alt="" loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} onError={() => setPosterIndex((index) => index + 1)} />}
    </span>}
    <iframe
      src={url} title={title} loading={eager ? "eager" : "lazy"} allowFullScreen
      allow="accelerometer; autoplay; encrypted-media; fullscreen; picture-in-picture"
      referrerPolicy="strict-origin-when-cross-origin"
      aria-hidden={!ready} tabIndex={ready ? undefined : -1}
      onLoad={() => setReady(true)}
    />
  </span>;
}

export function CourseVideo({ url, title, posterUrl, eager = false }: { url: string; title: string; posterUrl?: string; eager?: boolean }) {
  const source = videoSource(url);
  const playbackRate = useRef(1);
  const [retry, setRetry] = useState(0);
  const [failed, setFailed] = useState(false);
  const position = useRef(0);
  if (!source) return <Note>This video URL is not supported. Ask an editor to update it.</Note>;
  return <span className="course-video">
    {source.type === "embed" ? <EmbeddedVideo key={source.url} url={source.url} title={title} posterUrl={posterUrl} eager={eager} /> : <video
      key={retry} src={retry && source.url.startsWith("/api/media/") ? `${source.url}?renew=${retry}` : source.url} controls preload="metadata" playsInline poster={posterUrl}
      aria-label={title}
      onRateChange={(event) => { playbackRate.current = event.currentTarget.playbackRate; }}
      onTimeUpdate={(event) => { position.current = event.currentTarget.currentTime; }}
      onError={() => setFailed(true)}
      onLoadedMetadata={(event) => {
        event.currentTarget.playbackRate = playbackRate.current;
        if (position.current) event.currentTarget.currentTime = position.current;
        setFailed(false);
      }}
    >Your browser does not support video playback.</video>}
    {source.type === "file" && failed && <ActionGroup asChild className="course-video-actions"><span>
      <Button type="button" variant="outline" size="sm" onClick={() => { setRetry((value) => value + 1); setFailed(false); }}>Retry video</Button>
    </span></ActionGroup>}
  </span>;
}
