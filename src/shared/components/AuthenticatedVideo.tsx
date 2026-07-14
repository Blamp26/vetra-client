import React, { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store";
import { useMediaVisibility } from "./MediaVisibilityContext";

export interface AuthenticatedVideoDiagnostics {
  naturalWidth: number;
  naturalHeight: number;
  renderedWidth: number;
  renderedHeight: number;
  devicePixelRatio: number;
  duration: number | null;
}

interface AuthenticatedVideoProps extends React.VideoHTMLAttributes<HTMLVideoElement> {
  src: string;
  onMediaDiagnostics?: (diagnostics: AuthenticatedVideoDiagnostics) => void;
  animatedSticker?: boolean;
}

const MEDIA_PRELOAD_MARGIN = 200;

function isWithinVisibilityMargin(target: HTMLElement, root: HTMLElement | null): boolean {
  const targetRect = target.getBoundingClientRect();
  const rootRect = root
    ? root.getBoundingClientRect()
    : { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight };
  return targetRect.bottom >= rootRect.top - MEDIA_PRELOAD_MARGIN
    && targetRect.top <= rootRect.bottom + MEDIA_PRELOAD_MARGIN
    && targetRect.right >= rootRect.left - MEDIA_PRELOAD_MARGIN
    && targetRect.left <= rootRect.right + MEDIA_PRELOAD_MARGIN;
}

export const AuthenticatedVideo: React.FC<AuthenticatedVideoProps> = ({
  src,
  onMediaDiagnostics,
  preload = "metadata",
  muted = true,
  playsInline = true,
  animatedSticker = false,
  ...props
}) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const authToken = useAppStore((s) => s.authToken);
  const { root: visibilityRoot, revision: visibilityRevision } = useMediaVisibility();
  const [playbackVisible, setPlaybackVisible] = useState(true);

  const notifyDiagnostics = React.useCallback((video: HTMLVideoElement) => {
    const diagnostics = {
      naturalWidth: video.videoWidth,
      naturalHeight: video.videoHeight,
      renderedWidth: video.clientWidth,
      renderedHeight: video.clientHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      duration:
        Number.isFinite(video.duration) && video.duration > 0
          ? video.duration
          : null,
    };

    onMediaDiagnostics?.(diagnostics);
  }, [onMediaDiagnostics]);

  useEffect(() => {
    if (objectUrl || error || isInView) return;

    if (typeof IntersectionObserver === "undefined") {
      setIsInView(true);
      return;
    }

    const target = containerRef.current;
    if (!target) return;

    if (isWithinVisibilityMargin(target, visibilityRoot)) {
      setIsInView(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { root: visibilityRoot, rootMargin: `${MEDIA_PRELOAD_MARGIN}px` },
    );

    observer.observe(target);

    return () => observer.disconnect();
  }, [error, isInView, objectUrl, visibilityRevision, visibilityRoot]);

  useEffect(() => {
    if (!animatedSticker || !objectUrl) return;
    const video = videoRef.current;
    if (!video) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const update = (visible: boolean) => { setPlaybackVisible(visible); if (reduced) return; if (visible && video.paused) void video.play().catch(() => undefined); else if (!visible && !video.paused) video.pause(); };
    if (typeof IntersectionObserver === "undefined") { update(true); return; }
    const observer = new IntersectionObserver(entries => update(Boolean(entries[0]?.isIntersecting)), { root: visibilityRoot, rootMargin: "0px" });
    observer.observe(video); return () => observer.disconnect();
  }, [animatedSticker, objectUrl, visibilityRoot, visibilityRevision]);

  useEffect(() => {
    if (!isInView || !src) return;

    let cancelled = false;
    let nextObjectUrl: string | null = null;

    const loadVideo = async () => {
      try {
        const response = await fetch(src, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });

        if (!response.ok) throw new Error("Failed to load video");

        const blob = await response.blob();
        if (cancelled) return;

        nextObjectUrl = URL.createObjectURL(blob);
        setObjectUrl(nextObjectUrl);
        setError(false);
      } catch (err) {
        console.error("[AuthenticatedVideo] Error:", err);
        if (!cancelled) setError(true);
      }
    };

    setObjectUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });

    loadVideo();

    return () => {
      cancelled = true;
      if (nextObjectUrl) {
        URL.revokeObjectURL(nextObjectUrl);
      }
    };
  }, [authToken, isInView, src]);

  useEffect(() => {
    if (!objectUrl || !videoRef.current) return;
    if (typeof ResizeObserver === "undefined") return;

    const video = videoRef.current;
    const observer = new ResizeObserver(() => {
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        notifyDiagnostics(video);
      }
    });

    observer.observe(video);
    return () => observer.disconnect();
  }, [notifyDiagnostics, objectUrl]);

  const handleLoadedMetadata: React.ReactEventHandler<HTMLVideoElement> = (event) => {
    notifyDiagnostics(event.currentTarget);
    props.onLoadedMetadata?.(event);
  };

  if (error) {
    return (
      <div
        aria-label={typeof props["aria-label"] === "string" ? props["aria-label"] : "Failed to load video"}
        className={props.className}
        style={{ display: "block", width: "100%", height: "100%", ...props.style }}
      />
    );
  }

  if (!objectUrl) {
    return (
      <div
        ref={containerRef}
        className={`${props.className ?? ""} bg-muted/50 animate-pulse`.trim()}
        style={{ display: "block", width: "100%", height: "100%", ...props.style }}
      />
    );
  }

  return (
    <video
      {...props}
      ref={videoRef}
      src={objectUrl}
      preload={preload}
      muted={muted}
      playsInline={playsInline}
      onLoadedMetadata={handleLoadedMetadata}
      autoPlay={animatedSticker && playbackVisible && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches}
      style={{ display: "block", width: "100%", height: "100%", ...props.style }}
    />
  );
};
