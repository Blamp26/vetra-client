import { useEffect, useRef, useState } from "react";
import type { VetraGif } from "@/api/giphy";
import { giphyApi } from "@/api/giphy";
import type { GifMosaicTile } from "./gifMosaicLayout";

export function ExternalGifTile({ gif, layout, root, onSend, onLoaded, onClick }: { gif: VetraGif; layout: GifMosaicTile; root?: HTMLElement | null; onSend?: () => Promise<void>; onLoaded?: () => void; onClick?: () => void }) {
  const containerRef = useRef<HTMLButtonElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);
  const [shouldPlay, setShouldPlay] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const playRequestRef = useRef(0);
  const videoUrl = gif.previewMp4Url || gif.messageMp4Url;
  const sourceKey = `${gif.providerId}:${videoUrl || gif.previewWebpUrl || gif.previewStillUrl || "fallback"}`;

  useEffect(() => {
    loadedRef.current = false;
    playRequestRef.current += 1;
    setShouldLoad(false);
    setShouldPlay(false);
    setIsPlaying(false);
  }, [sourceKey]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const isVisible = (margin: number) => {
      const target = element.getBoundingClientRect();
      const bounds = root?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth };
      return target.bottom >= bounds.top - margin && target.top <= bounds.bottom + margin && target.right >= bounds.left && target.left <= bounds.right;
    };
    const updateLoadVisibility = () => {
      if (isVisible(240)) setShouldLoad(true);
    };
    const updatePlayVisibility = () => {
      const visible = isVisible(0);
      setShouldPlay((previous) => previous === visible ? previous : visible);
    };
    updateLoadVisibility();
    updatePlayVisibility();
    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      setShouldPlay(true);
      return;
    }
    const loadObserver = new IntersectionObserver(
      (entries) => entries.forEach((entry) => { if (entry.isIntersecting) setShouldLoad(true); }),
      { root, rootMargin: "240px" },
    );
    const playObserver = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        const visible = entry.isIntersecting && entry.intersectionRatio > 0;
        setShouldPlay((previous) => previous === visible ? previous : visible);
      }),
      { root, rootMargin: "0px", threshold: 0.01 },
    );
    loadObserver.observe(element);
    playObserver.observe(element);
    return () => {
      loadObserver.disconnect();
      playObserver.disconnect();
    };
  }, [root]);

  useEffect(() => {
    if (!shouldLoad || loadedRef.current) return;
    loadedRef.current = true;
    void giphyApi.customerId().then((customerId) => giphyApi.analytics(gif.analytics.onload, customerId));
    onLoaded?.();
  }, [gif.analytics.onload, onLoaded, shouldLoad]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !shouldLoad) return;
    const requestId = ++playRequestRef.current;
    if (!shouldPlay || busy) {
      if (!video.paused) video.pause();
      return;
    }
    if (video.paused) {
      void video.play().catch(() => undefined).then(() => {
        if (requestId !== playRequestRef.current) return;
      });
    }
  }, [busy, shouldLoad, shouldPlay, videoUrl]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onError = () => setIsPlaying(false);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("error", onError);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("error", onError);
    };
  }, [shouldLoad, sourceKey]);

  const handleClick = async () => {
    if (busy || !onSend) return;
    setBusy(true);
    const customerId = await giphyApi.customerId();
    void giphyApi.analytics(gif.analytics.onclick, customerId);
    try {
      await onSend();
      const onsentCustomerId = await giphyApi.customerId();
      void giphyApi.analytics(gif.analytics.onsent, onsentCustomerId);
      setSendError(null);
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Unable to send GIF");
    } finally { setBusy(false); }
    onClick?.();
  };

  return <button ref={containerRef} type="button" aria-label={gif.title || "GIF"} disabled={busy} title={sendError || undefined} onClick={() => void handleClick()} className="absolute overflow-hidden rounded bg-muted/40 text-left [contain:layout_paint] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" style={{ left: layout.left, top: layout.top, width: layout.width, height: layout.height }}>
    {shouldLoad && videoUrl ? <video key={sourceKey} ref={videoRef} src={videoUrl} poster={gif.previewStillUrl || undefined} muted loop playsInline preload="metadata" className="h-full w-full object-cover" aria-label={gif.title || "GIF"} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} onError={() => setIsPlaying(false)} /> : shouldLoad && (gif.previewWebpUrl || gif.previewStillUrl) ? <img src={gif.previewWebpUrl || gif.previewStillUrl || undefined} alt={gif.title || "GIF"} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-xs text-muted-foreground">GIF</span>}
    {!isPlaying && shouldLoad && <span className="pointer-events-none absolute bottom-1 left-1 rounded bg-black/45 px-1 text-[10px] text-white">GIF</span>}
  </button>;
}
