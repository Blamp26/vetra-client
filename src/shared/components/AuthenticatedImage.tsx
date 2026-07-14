import React, { useEffect, useState, useRef } from 'react';
import { useAppStore } from '@/store';
import { useMediaVisibility } from './MediaVisibilityContext';

export interface AuthenticatedImageDiagnostics {
  naturalWidth: number;
  naturalHeight: number;
  renderedWidth: number;
  renderedHeight: number;
  devicePixelRatio: number;
}

interface AuthenticatedImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  onMediaDiagnostics?: (diagnostics: AuthenticatedImageDiagnostics) => void;
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

/**
 * Component for loading images with a Bearer token.
 * Implements manual lazy loading via IntersectionObserver.
 */
export const AuthenticatedImage: React.FC<AuthenticatedImageProps> = ({
  src,
  onMediaDiagnostics,
  ...props
}) => {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<boolean>(false);
  const [isInView, setIsInView] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const authToken = useAppStore((s) => s.authToken);
  const { root: visibilityRoot, revision: visibilityRevision } = useMediaVisibility();
  const objectUrlRef = useRef<string | null>(null);
  const requestKeyRef = useRef({ src, authToken });

  const revokeObjectUrl = React.useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setObjectUrl(null);
  }, []);

  const notifyDiagnostics = React.useCallback((image: HTMLImageElement) => {
    const diagnostics = {
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      renderedWidth: image.clientWidth,
      renderedHeight: image.clientHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
    };

    onMediaDiagnostics?.(diagnostics);

    if (
      import.meta.env.DEV &&
      diagnostics.renderedWidth > 0 &&
      diagnostics.renderedHeight > 0 &&
      (
        diagnostics.naturalWidth < diagnostics.renderedWidth * diagnostics.devicePixelRatio * 0.9 ||
        diagnostics.naturalHeight < diagnostics.renderedHeight * diagnostics.devicePixelRatio * 0.9
      )
    ) {
      console.warn('[AuthenticatedImage] Rendered image source may be too small for the current tile.', {
        src,
        ...diagnostics,
      });
    }
  }, [onMediaDiagnostics, src]);

  // Intersection Observer for lazy loading. The explicit MessageList root and
  // the geometry check cover WebViews that miss the first post-scroll update.
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
        if (entries[0].isIntersecting) {
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
    if (!isInView || !src) return;

    let cancelled = false;

    const loadImage = async () => {
      try {
        const response = await fetch(src, {
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });

        if (!response.ok) throw new Error('Failed to load image');

        const blob = await response.blob();
        if (!cancelled) {
          revokeObjectUrl();
          const url = URL.createObjectURL(blob);
          objectUrlRef.current = url;
          setObjectUrl(url);
          setError(false);
        }
      } catch (err) {
        console.error('[AuthenticatedImage] Error:', err);
        if (!cancelled) setError(true);
      }
    };

    loadImage();

    return () => {
      cancelled = true;
    };
  }, [src, authToken, isInView, revokeObjectUrl]);

  useEffect(() => {
    if (requestKeyRef.current.src === src && requestKeyRef.current.authToken === authToken) {
      return;
    }

    requestKeyRef.current = { src, authToken };
    setError(false);
    setIsInView(false);
    revokeObjectUrl();
  }, [src, authToken, revokeObjectUrl]);

  useEffect(() => () => revokeObjectUrl(), [revokeObjectUrl]);

  useEffect(() => {
    if (!objectUrl || !imageRef.current) return;
    if (typeof ResizeObserver === 'undefined') return;

    const image = imageRef.current;
    const observer = new ResizeObserver(() => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        notifyDiagnostics(image);
      }
    });

    observer.observe(image);
    return () => observer.disconnect();
  }, [notifyDiagnostics, objectUrl]);

  const handleLoad: React.ReactEventHandler<HTMLImageElement> = (event) => {
    notifyDiagnostics(event.currentTarget);
    props.onLoad?.(event);
  };

  if (error) {
    return (
      <div
        aria-label={typeof props.alt === "string" ? props.alt : "Failed to load image"}
        className={props.className}
        style={{ display: "block", width: "100%", height: "100%", ...props.style }}
      />
    );
  }

  if (!objectUrl) {
    return (
      <div 
        ref={containerRef}
        className={`${props.className ?? ""} bg-muted animate-pulse`.trim()} 
        style={{ display: "block", width: "100%", height: "100%", ...props.style }} 
      />
    );
  }

  return (
    <img
      {...props}
      ref={imageRef}
      src={objectUrl}
      onLoad={handleLoad}
      style={{ display: "block", width: "100%", height: "100%", ...props.style }}
    />
  );
};
