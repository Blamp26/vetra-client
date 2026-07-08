import React, { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store";

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
}

export const AuthenticatedVideo: React.FC<AuthenticatedVideoProps> = ({
  src,
  onMediaDiagnostics,
  preload = "metadata",
  muted = true,
  playsInline = true,
  ...props
}) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const authToken = useAppStore((s) => s.authToken);

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

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, [error, isInView, objectUrl]);

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
      style={{ display: "block", width: "100%", height: "100%", ...props.style }}
    />
  );
};
